#!/usr/bin/env node
/**
 * translate-cli.js — Unified translation pipeline CLI.
 *
 * Consolidates prepare, apply, merge, seed, fix, and tm commands.
 *
 * Usage:
 *   node scripts/translate-cli.js <command> [options]
 *
 * Commands:
 *   prepare           Generate skeleton target with TM caching & masking
 *   apply             Validate, unmask placeholders, update TM
 *   merge             Merge translated chunks into target
 *   seed              Seed TM from existing translation pairs
 *   fix codeblocks    Replace target code blocks with source (positional)
 *   fix links         Replace target link URLs with source (positional)
 *   fix placeholders  Fix mangled %%Pn%%/%%CB_hash%% placeholders
 *   fix markers       Strip remaining <!-- i18n:todo --> markers
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { TranslationMemory, cacheKey, textHash, tmPath } from './lib/tm.js';
import { extractSegments, splitFrontmatter } from './lib/segments.js';
import { PlaceholderState, unmaskMarkdown, fixMangledPlaceholders } from './lib/masking.js';
import { runAllChecks } from './lib/quality.js';
import { findI18nDir, readNoTranslateConfig } from './lib/read-no-translate.js';
import {
  prepareFile, splitIntoChunks, writeChunks, seedTM, findMarkdownFiles,
} from './lib/prepare.js';
import { applyFile, stripTodoMarkers } from './lib/apply.js';
import { mergeChunks } from './lib/merge-chunks.js';
import { fixCodeBlocks, fixLinks, fixPlaceholdersInFile, fixMarkers } from './lib/fix.js';
import { loadPlan, findPlanFile } from './lib/plan.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function detectLocaleFromPath(p) {
  const match = p.match(/\/([a-z]{2}(?:-[A-Za-z]{2,})?)\//);
  return match ? match[1] : null;
}

/**
 * Resolve source_dir from explicit flag, plan config, or task-meta.
 * Returns undefined if not found.
 */
async function resolveSourceDir(explicit, projectDir, taskMeta) {
  if (explicit) return explicit;
  if (taskMeta?.source_dir) return taskMeta.source_dir;
  try {
    const plan = await loadPlan(findPlanFile(projectDir));
    if (plan?.meta?.source_dir) return plan.meta.source_dir;
  } catch { /* no plan file */ }
  return undefined;
}

/**
 * Compute relPath for a file. In directory mode the caller already
 * has path.relative(sourceDir, file). In single-file mode we try to
 * make it relative to sourceDir; if unknown, fall back to the raw path.
 */
function fileRelPath(filePath, sourceDir) {
  if (!sourceDir) return filePath;
  const rel = path.relative(sourceDir, filePath);
  if (rel.startsWith('..')) return filePath;
  return rel;
}

async function loadConsistencyConfig(i18nDir) {
  if (!i18nDir) return null;
  try {
    const raw = await fs.readFile(path.join(i18nDir, 'translation-consistency.yaml'), 'utf-8');
    return yaml.load(raw);
  } catch { return null; }
}

function parseGlobalOpts(args) {
  const opts = { projectDir: process.cwd() };
  const remaining = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-dir') { opts.projectDir = args[++i]; }
    else { remaining.push(args[i]); }
  }
  return { opts, remaining };
}

// ---------------------------------------------------------------------------
// prepare command
// ---------------------------------------------------------------------------

async function cmdPrepare(args) {
  let source, target, tgtLang = null, srcLang = null;
  let projectDir = process.cwd();
  let maxChunkChars = 3000;
  let explicitSourceDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang') { tgtLang = args[++i]; }
    else if (args[i] === '--src-lang') { srcLang = args[++i]; }
    else if (args[i] === '--project-dir') { projectDir = args[++i]; }
    else if (args[i] === '--source-dir') { explicitSourceDir = args[++i]; }
    else if (args[i] === '--max-chunk-chars') { maxChunkChars = parseInt(args[++i], 10); }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: node translate-cli.js prepare <source> <target> --lang <locale> [options]

Options:
  --lang               Target locale (e.g. zh-CN, ja, ko)
  --src-lang           Source locale (default: auto-detect or "en")
  --source-dir         Source root dir (for TM source_path; auto-read from plan)
  --max-chunk-chars N  Max characters per chunk (default: 3000)
  --project-dir        Project root for .i18n/ config lookup`);
      process.exit(0);
    }
    else if (!source) { source = args[i]; }
    else if (!target) { target = args[i]; }
  }

  if (!source || !target) {
    console.error('Error: source and target paths required.');
    process.exit(1);
  }

  if (!tgtLang) {
    tgtLang = detectLocaleFromPath(target);
    if (!tgtLang) {
      console.error('Error: --lang is required (could not auto-detect from target path).');
      process.exit(1);
    }
    console.log(`  Auto-detected target locale: ${tgtLang}`);
  }
  if (!srcLang) srcLang = detectLocaleFromPath(source) || 'en';

  const i18nDir = await findI18nDir(projectDir);
  const noTranslateConfig = i18nDir ? await readNoTranslateConfig(i18nDir) : null;
  const consistencyConfig = await loadConsistencyConfig(i18nDir);
  const effectiveI18nDir = i18nDir || path.join(projectDir, '.i18n');

  const tmFile = tmPath(effectiveI18nDir, tgtLang);
  const tm = await TranslationMemory.load(tmFile);
  console.log(`Translation Memory: ${tm.size} entries loaded from ${tmFile}`);

  const sourceStat = await fs.stat(source);
  const isDir = sourceStat.isDirectory();
  const sourceDir = isDir ? source : await resolveSourceDir(explicitSourceDir, projectDir);

  const taskMeta = {
    created: new Date().toISOString(),
    source_locale: srcLang,
    target_locale: tgtLang,
    source_dir: sourceDir || (isDir ? source : undefined),
    files: [],
    placeholders: {},
    consistency: consistencyConfig,
  };

  const sharedState = new PlaceholderState('');
  const chunksDir = path.join(effectiveI18nDir, 'chunks');

  async function processFile(srcFile, tgtFile, relPath) {
    const result = await prepareFile(srcFile, tgtFile, tm, noTranslateConfig, srcLang, tgtLang, relPath, sharedState);
    await fs.mkdir(path.dirname(tgtFile), { recursive: true });
    await fs.writeFile(tgtFile, result.skeleton, 'utf-8');

    const fileMeta = {
      source: srcFile, target: tgtFile, rel_path: relPath,
      todo: result.todoCount, cached: result.cachedCount,
      total: result.totalSegments, chunks: 0,
    };
    Object.assign(taskMeta.placeholders, result.placeholders);

    if (result.skeleton.length > maxChunkChars && result.todoCount > 0) {
      const chunks = splitIntoChunks(result.skeleton, maxChunkChars);
      if (chunks) {
        const chunkPaths = await writeChunks(chunks, relPath, chunksDir);
        fileMeta.chunks = chunkPaths.length;
        fileMeta.chunk_dir = chunksDir;
      }
    }

    taskMeta.files.push(fileMeta);
    const status = result.todoCount === 0 ? '✓' : '●';
    const chunkNote = fileMeta.chunks > 0 ? ` → ${fileMeta.chunks} chunk(s)` : '';
    console.log(`  ${status} ${relPath}: ${result.todoCount} to translate, ${result.cachedCount} cached (${result.totalSegments} total)${chunkNote}`);
  }

  if (isDir) {
    const sourceFiles = await findMarkdownFiles(source);
    console.log(`\nFound ${sourceFiles.length} markdown file(s) in ${source}`);
    for (const srcFile of sourceFiles) {
      const relPath = path.relative(source, srcFile);
      const tgtFile = path.join(target, relPath);
      await processFile(srcFile, tgtFile, relPath);
    }
  } else {
    const relPath = fileRelPath(source, sourceDir);
    console.log('');
    await processFile(source, target, relPath);
  }

  const taskMetaPath = path.join(effectiveI18nDir, 'task-meta.json');
  await fs.mkdir(path.dirname(taskMetaPath), { recursive: true });
  await fs.writeFile(taskMetaPath, JSON.stringify(taskMeta, null, 2), 'utf-8');

  const totalTodo = taskMeta.files.reduce((s, f) => s + f.todo, 0);
  const totalCached = taskMeta.files.reduce((s, f) => s + f.cached, 0);
  const totalSegs = taskMeta.files.reduce((s, f) => s + f.total, 0);

  console.log(`\n✓ Prepared ${taskMeta.files.length} file(s)`);
  console.log(`  Segments: ${totalTodo} to translate, ${totalCached} cached (${totalSegs} total)`);
  console.log(`  Task metadata: ${taskMetaPath}`);

  const chunkedFiles = taskMeta.files.filter(f => f.chunks > 0);
  if (totalTodo === 0) {
    console.log('\n  All segments cached — no translation needed.');
  } else if (chunkedFiles.length > 0) {
    console.log(`\n  Large file(s) split into chunks in: ${chunksDir}`);
    for (const f of chunkedFiles) console.log(`    ${f.rel_path}: ${f.chunks} chunk(s)`);
    console.log(`\nNext:`);
    console.log(`  1. Translate chunk files in ${chunksDir}`);
    console.log(`  2. node translate-cli.js merge ${target}`);
    console.log(`  3. node translate-cli.js apply ${source} ${target}`);
  } else {
    console.log(`\nNext: translate <!-- i18n:todo --> sections, then run:`);
    console.log(`  node translate-cli.js apply ${source} ${target}`);
  }
}

// ---------------------------------------------------------------------------
// apply command
// ---------------------------------------------------------------------------

async function cmdApply(args) {
  let source, target, tgtLang = null, srcLang = null;
  let projectDir = process.cwd();
  let explicitSourceDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang') { tgtLang = args[++i]; }
    else if (args[i] === '--src-lang') { srcLang = args[++i]; }
    else if (args[i] === '--project-dir') { projectDir = args[++i]; }
    else if (args[i] === '--source-dir') { explicitSourceDir = args[++i]; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: node translate-cli.js apply <source> <target> [options]

Options:
  --lang          Target locale (auto-detected from task-meta or path)
  --src-lang      Source locale (default: auto-detect or "en")
  --source-dir    Source root dir (for TM source_path; auto-read from task-meta/plan)
  --project-dir   Project root for .i18n/ config lookup`);
      process.exit(0);
    }
    else if (!source) { source = args[i]; }
    else if (!target) { target = args[i]; }
  }

  if (!source || !target) {
    console.error('Error: source and target paths required.');
    process.exit(1);
  }

  const i18nDir = await findI18nDir(projectDir);
  const effectiveI18nDir = i18nDir || path.join(projectDir, '.i18n');
  const taskMetaPath = path.join(effectiveI18nDir, 'task-meta.json');
  let taskMeta = null;

  try {
    taskMeta = JSON.parse(await fs.readFile(taskMetaPath, 'utf-8'));
  } catch {
    console.log('Warning: task-meta.json not found. Running without placeholder info.');
  }

  if (taskMeta) {
    tgtLang = tgtLang || taskMeta.target_locale;
    srcLang = srcLang || taskMeta.source_locale;
  }
  if (!tgtLang) tgtLang = detectLocaleFromPath(target);
  if (!srcLang) srcLang = detectLocaleFromPath(source) || 'en';

  if (!tgtLang) {
    console.error('Error: --lang is required (could not auto-detect target locale).');
    process.exit(1);
  }

  const placeholders = taskMeta?.placeholders || {};
  const tmFile = tmPath(effectiveI18nDir, tgtLang);
  const tm = await TranslationMemory.load(tmFile);

  const sourceStat = await fs.stat(source);
  const isDir = sourceStat.isDirectory();
  const sourceDir = isDir ? source : await resolveSourceDir(explicitSourceDir, projectDir, taskMeta);
  let allPassed = true, totalNew = 0, totalCached = 0;

  function printResult(relPath, result) {
    const icon = result.passed ? '✓' : '✗';
    const summary = `${result.newEntries} new, ${result.cachedEntries} cached`;
    if (result.passed && result.warnings.length === 0 && result.autoFixes.length === 0) {
      console.log(`  ${icon} ${relPath}: PASS (${summary})`);
    } else {
      console.log(`  ${icon} ${relPath}: ${result.passed ? 'PASS' : 'FAIL'} (${summary})`);
      for (const f of result.autoFixes) console.log(`    FIX: ${f}`);
      for (const e of result.errors) console.log(`    ERROR: ${e}`);
      for (const w of result.warnings) console.log(`    WARN: ${w}`);
    }
  }

  if (isDir) {
    const sourceFiles = await findMarkdownFiles(source);
    for (const srcFile of sourceFiles) {
      const relPath = path.relative(source, srcFile);
      const tgtFile = path.join(target, relPath);
      try { await fs.access(tgtFile); } catch { console.log(`  SKIP ${relPath}: target not found`); continue; }
      const result = await applyFile(srcFile, tgtFile, tm, placeholders, srcLang, tgtLang, relPath);
      totalNew += result.newEntries; totalCached += result.cachedEntries;
      printResult(relPath, result);
      if (!result.passed) allPassed = false;
    }
  } else {
    const relPath = fileRelPath(source, sourceDir);
    const result = await applyFile(source, target, tm, placeholders, srcLang, tgtLang, relPath);
    totalNew += result.newEntries; totalCached += result.cachedEntries;
    printResult(relPath, result);
    if (!result.passed) allPassed = false;
  }

  await tm.save();
  console.log(`\nTranslation Memory: ${totalNew} new, ${totalCached} existing (${tm.size} total)`);
  console.log(`  Saved to: ${tmFile}`);

  if (allPassed) {
    console.log('\n✓ All files passed validation.');
  } else {
    console.log('\n✗ Some files failed validation. Fix errors above and re-run.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// merge command
// ---------------------------------------------------------------------------

async function cmdMerge(args) {
  let target = null, projectDir = process.cwd(), dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-dir') { projectDir = args[++i]; }
    else if (args[i] === '--dry-run') { dryRun = true; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: node translate-cli.js merge <target> [options]

Options:
  --project-dir   Project root for .i18n/ config lookup
  --dry-run       Show what would be merged without writing`);
      process.exit(0);
    }
    else if (!target) { target = args[i]; }
  }

  if (!target) {
    console.error('Error: target path required.');
    process.exit(1);
  }

  await mergeChunks(target, { projectDir, dryRun });
}

// ---------------------------------------------------------------------------
// seed command
// ---------------------------------------------------------------------------

async function cmdSeed(args) {
  let source, target, tgtLang = null, srcLang = null;
  let projectDir = process.cwd();
  let explicitSourceDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang') { tgtLang = args[++i]; }
    else if (args[i] === '--src-lang') { srcLang = args[++i]; }
    else if (args[i] === '--project-dir') { projectDir = args[++i]; }
    else if (args[i] === '--source-dir') { explicitSourceDir = args[++i]; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: node translate-cli.js seed <source> <target> --lang <locale> [options]

Options:
  --lang          Target locale (required)
  --src-lang      Source locale (default: auto-detect or "en")
  --source-dir    Source root dir (for TM source_path; auto-read from plan)
  --project-dir   Project root for .i18n/ config lookup`);
      process.exit(0);
    }
    else if (!source) { source = args[i]; }
    else if (!target) { target = args[i]; }
  }

  if (!source || !target) {
    console.error('Error: source and target paths required.');
    process.exit(1);
  }

  if (!tgtLang) {
    tgtLang = detectLocaleFromPath(target);
    if (!tgtLang) {
      console.error('Error: --lang is required.');
      process.exit(1);
    }
  }
  if (!srcLang) srcLang = detectLocaleFromPath(source) || 'en';

  const i18nDir = await findI18nDir(projectDir);
  const effectiveI18nDir = i18nDir || path.join(projectDir, '.i18n');
  const tmFile = tmPath(effectiveI18nDir, tgtLang);
  const tm = await TranslationMemory.load(tmFile);
  console.log(`Translation Memory: ${tm.size} entries loaded from ${tmFile}`);

  const sourceStat = await fs.stat(source);
  const isDir = sourceStat.isDirectory();
  const sourceDir = isDir ? source : await resolveSourceDir(explicitSourceDir, projectDir);
  let totalSeeded = 0;

  if (isDir) {
    const sourceFiles = await findMarkdownFiles(source);
    console.log(`\nSeeding TM from ${sourceFiles.length} file pair(s)...`);
    for (const srcFile of sourceFiles) {
      const relPath = path.relative(source, srcFile);
      const tgtFile = path.join(target, relPath);
      try {
        await fs.access(tgtFile);
        const n = await seedTM(srcFile, tgtFile, tm, srcLang, tgtLang, relPath);
        if (n > 0) console.log(`  ${relPath}: ${n} segment(s) seeded`);
        totalSeeded += n;
      } catch { /* target doesn't exist */ }
    }
  } else {
    const relPath = fileRelPath(source, sourceDir);
    totalSeeded = await seedTM(source, target, tm, srcLang, tgtLang, relPath);
  }

  await tm.save();
  console.log(`\n✓ TM seeded: ${totalSeeded} new entries (${tm.size} total)`);
  console.log(`  Saved to: ${tmFile}`);
}

// ---------------------------------------------------------------------------
// fix command
// ---------------------------------------------------------------------------

async function cmdFix(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`Usage: node translate-cli.js fix <subcommand> [options]

Subcommands:
  codeblocks <source> <target>   Replace target code blocks with source (positional)
  links <source> <target>        Replace target link URLs with source (positional)
  placeholders <target>          Fix mangled %%Pn%%/%%CB_hash%% placeholders
  markers <target>               Strip remaining <!-- i18n:todo --> markers`);
    process.exit(0);
  }

  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case 'codeblocks': return await cmdFixCodeblocks(subArgs);
    case 'links':      return await cmdFixLinks(subArgs);
    case 'placeholders': return await cmdFixPlaceholders(subArgs);
    case 'markers':    return await cmdFixMarkers(subArgs);
    default:
      console.error(`Unknown fix subcommand: ${sub}. Use --help for usage.`);
      process.exit(1);
  }
}

async function cmdFixCodeblocks(args) {
  if (args.length < 2 || args[0] === '--help') {
    console.log('Usage: node translate-cli.js fix codeblocks <source> <target>');
    process.exit(args[0] === '--help' ? 0 : 1);
  }
  const [source, target] = args;
  const srcContent = await fs.readFile(source, 'utf-8');
  const tgtContent = await fs.readFile(target, 'utf-8');

  const result = fixCodeBlocks(srcContent, tgtContent);
  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  if (result.replaced === 0) {
    console.log('✓ All code blocks already match source. No changes needed.');
  } else {
    await fs.writeFile(target, result.text, 'utf-8');
    console.log(`✓ Fixed ${result.replaced} code block(s) in ${target}`);
  }
}

async function cmdFixLinks(args) {
  if (args.length < 2 || args[0] === '--help') {
    console.log('Usage: node translate-cli.js fix links <source> <target>');
    process.exit(args[0] === '--help' ? 0 : 1);
  }
  const [source, target] = args;
  const srcContent = await fs.readFile(source, 'utf-8');
  const tgtContent = await fs.readFile(target, 'utf-8');

  const result = fixLinks(srcContent, tgtContent);
  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  if (result.replaced === 0) {
    console.log('✓ All link URLs already match source. No changes needed.');
  } else {
    await fs.writeFile(target, result.text, 'utf-8');
    console.log(`✓ Fixed ${result.replaced} link URL(s) in ${target}:`);
    for (const c of result.changes) {
      console.log(`  #${c.pos}: "${c.from}" → "${c.to}"`);
    }
  }
}

async function cmdFixPlaceholders(args) {
  if (args.length < 1 || args[0] === '--help') {
    console.log('Usage: node translate-cli.js fix placeholders <target>');
    process.exit(args[0] === '--help' ? 0 : 1);
  }
  const target = args[0];
  const content = await fs.readFile(target, 'utf-8');

  const result = fixPlaceholdersInFile(content);
  if (result.fixCount === 0) {
    console.log('✓ No mangled placeholders found. No changes needed.');
  } else {
    await fs.writeFile(target, result.text, 'utf-8');
    console.log(`✓ Fixed ${result.fixCount} mangled placeholder(s) in ${target}`);
  }
}

async function cmdFixMarkers(args) {
  if (args.length < 1 || args[0] === '--help') {
    console.log('Usage: node translate-cli.js fix markers <target>');
    process.exit(args[0] === '--help' ? 0 : 1);
  }
  const target = args[0];
  const content = await fs.readFile(target, 'utf-8');

  const result = fixMarkers(content);
  if (result.strippedCount === 0) {
    console.log('✓ No i18n:todo markers found. No changes needed.');
  } else {
    await fs.writeFile(target, result.text, 'utf-8');
    console.log(`✓ Stripped ${result.strippedCount} i18n:todo marker(s) from ${target}`);
  }
}

// ---------------------------------------------------------------------------
// tm command — TM CRUD operations
// ---------------------------------------------------------------------------

async function cmdTm(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`Usage: node translate-cli.js tm <subcommand> [options]

Subcommands:
  stats                            Show TM statistics
  search <query> --lang <locale>   Search TM entries by source/translated text
  get <key> --lang <locale>        Get entry by cache_key
  add --lang <locale> --source <text> --translated <text> [--segment-id <id>] [--src-lang en]
                                   Add a new TM entry
  update <key> --lang <locale> --translated <text>
                                   Update translation of an existing entry
  delete <key> --lang <locale>     Delete entry by cache_key
  delete --file <path> --lang <locale> [--dry-run]
                                   Delete all entries for a file
  delete --match <query> --lang <locale> [--dry-run]
                                   Delete entries matching query
  export --lang <locale> [--format jsonl|json]
                                   Export TM entries
  compact --lang <locale>          Remove duplicates, re-sort and compact TM file
  prune <source_dir> --lang <locale> [--src-lang en] [--dry-run]
                                   Remove stale entries whose source text no longer exists

Common options:
  --lang          Target locale (required for all subcommands)
  --project-dir   Project root for .i18n/ config lookup (default: cwd)`);
    process.exit(0);
  }

  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case 'stats':   return await tmStats(subArgs);
    case 'search':  return await tmSearch(subArgs);
    case 'get':     return await tmGet(subArgs);
    case 'add':     return await tmAdd(subArgs);
    case 'update':  return await tmUpdate(subArgs);
    case 'delete':  return await tmDelete(subArgs);
    case 'export':  return await tmExport(subArgs);
    case 'compact': return await tmCompact(subArgs);
    case 'prune':   return await tmPrune(subArgs);
    default:
      console.error(`Unknown tm subcommand: ${sub}`);
      process.exit(1);
  }
}

function parseTmArgs(args) {
  let lang = null, projectDir = process.cwd();
  const positional = [];
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang') opts.lang = lang = args[++i];
    else if (args[i] === '--project-dir') opts.projectDir = projectDir = args[++i];
    else if (args[i] === '--source') opts.source = args[++i];
    else if (args[i] === '--translated') opts.translated = args[++i];
    else if (args[i] === '--segment-id') opts.segmentId = args[++i];
    else if (args[i] === '--src-lang') opts.srcLang = args[++i];
    else if (args[i] === '--match') opts.match = args[++i];
    else if (args[i] === '--file') opts.file = args[++i];
    else if (args[i] === '--format') opts.format = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--limit') opts.limit = parseInt(args[++i], 10);
    else positional.push(args[i]);
  }
  opts.lang = lang;
  opts.projectDir = projectDir;
  opts.positional = positional;
  return opts;
}

async function loadTmFromOpts(opts) {
  if (!opts.lang) {
    console.error('Error: --lang is required.');
    process.exit(1);
  }
  const i18nDir = await findI18nDir(opts.projectDir);
  const dir = i18nDir || path.join(opts.projectDir, '.i18n');
  const file = tmPath(dir, opts.lang);
  const tm = await TranslationMemory.load(file);
  return { tm, file };
}

async function tmStats(args) {
  const opts = parseTmArgs(args);
  if (!opts.lang) {
    const i18nDir = await findI18nDir(opts.projectDir);
    const dir = i18nDir || path.join(opts.projectDir, '.i18n');
    try {
      const files = await fs.readdir(dir);
      const tmFiles = files.filter(f => f.endsWith('.tm.jsonl'));
      if (tmFiles.length === 0) {
        console.log('No TM files found.');
        return;
      }
      for (const f of tmFiles) {
        const lang = f.replace('.tm.jsonl', '');
        const tm = await TranslationMemory.load(path.join(dir, f));
        console.log(`${lang}: ${tm.size} entries`);
      }
    } catch { console.log('No .i18n/ directory found.'); }
    return;
  }
  const { tm, file } = await loadTmFromOpts(opts);
  console.log(`TM file: ${file}`);
  console.log(`Entries: ${tm.size}`);
}

async function tmSearch(args) {
  const opts = parseTmArgs(args);
  const query = opts.positional[0];
  if (!query) { console.error('Error: search query required.'); process.exit(1); }
  const { tm } = await loadTmFromOpts(opts);
  const limit = opts.limit || 20;
  const q = query.toLowerCase();
  let count = 0;

  for (const [key, entry] of tm.entries) {
    const srcMatch = entry.text?.toLowerCase().includes(q);
    const tgtMatch = entry.translated?.toLowerCase().includes(q);
    if (srcMatch || tgtMatch) {
      console.log(`\n[${key}]`);
      if (entry.segment_id) console.log(`  segment: ${entry.segment_id}`);
      console.log(`  source:     ${entry.text}`);
      console.log(`  translated: ${entry.translated}`);
      count++;
      if (count >= limit) {
        console.log(`\n... (showing first ${limit} matches, use --limit N for more)`);
        break;
      }
    }
  }

  if (count === 0) console.log('No matching entries found.');
  else console.log(`\n${count} match(es) found.`);
}

async function tmGet(args) {
  const opts = parseTmArgs(args);
  const key = opts.positional[0];
  if (!key) { console.error('Error: cache_key required.'); process.exit(1); }
  const { tm } = await loadTmFromOpts(opts);
  const entry = tm.entries.get(key);
  if (!entry) { console.error('Entry not found.'); process.exit(1); }
  console.log(JSON.stringify(entry, null, 2));
}

async function tmAdd(args) {
  const opts = parseTmArgs(args);
  if (!opts.source || !opts.translated) {
    console.error('Error: --source and --translated are required.');
    process.exit(1);
  }
  const { tm, file } = await loadTmFromOpts(opts);
  const srcLang = opts.srcLang || 'en';
  const hash = textHash(opts.source);
  const segId = opts.segmentId || `manual:${hash}`;
  const key = cacheKey(srcLang, opts.lang, segId, hash);

  const entry = {
    cache_key: key,
    segment_id: segId,
    text_hash: hash,
    text: opts.source,
    translated: opts.translated,
  };

  const existing = tm.entries.get(key);
  if (existing) {
    console.log(`Entry already exists with key ${key}. Use 'tm update' to modify.`);
    console.log(`  current translation: ${existing.translated}`);
    process.exit(1);
  }

  tm.put(entry);
  await tm.save();
  console.log(`✓ Added entry [${key}]`);
  console.log(`  source:     ${opts.source}`);
  console.log(`  translated: ${opts.translated}`);
  console.log(`  Saved to: ${file}`);
}

async function tmUpdate(args) {
  const opts = parseTmArgs(args);
  const key = opts.positional[0];
  if (!key) { console.error('Error: cache_key required.'); process.exit(1); }
  if (!opts.translated) { console.error('Error: --translated is required.'); process.exit(1); }
  const { tm, file } = await loadTmFromOpts(opts);
  const entry = tm.entries.get(key);
  if (!entry) { console.error(`Entry not found: ${key}`); process.exit(1); }

  const oldTranslation = entry.translated;
  entry.translated = opts.translated;
  tm.put(entry);
  await tm.save();
  console.log(`✓ Updated entry [${key}]`);
  console.log(`  source:         ${entry.text}`);
  console.log(`  old translation: ${oldTranslation}`);
  console.log(`  new translation: ${opts.translated}`);
  console.log(`  Saved to: ${file}`);
}

async function tmDelete(args) {
  const opts = parseTmArgs(args);
  const key = opts.positional[0];
  const { tm, file } = await loadTmFromOpts(opts);

  if (opts.file) {
    const prefix = opts.file.replace(/\\/g, '/');
    const toDelete = [];
    for (const [k, entry] of tm.entries) {
      if (entry.segment_id?.startsWith(prefix + ':') || entry.segment_id === prefix) {
        toDelete.push({ key: k, entry });
      }
    }
    if (toDelete.length === 0) {
      console.log(`No entries found for file: ${opts.file}`);
      return;
    }

    console.log(`Found ${toDelete.length} entr${toDelete.length === 1 ? 'y' : 'ies'} for file: ${opts.file}`);
    for (const { key: k, entry } of toDelete.slice(0, 5)) {
      console.log(`  [${k}] ${entry.text?.slice(0, 60)}...`);
    }
    if (toDelete.length > 5) console.log(`  ... and ${toDelete.length - 5} more`);

    if (opts.dryRun) { console.log('\n(dry-run, no changes made)'); return; }

    for (const { key: k } of toDelete) tm.entries.delete(k);
    await tm.save();
    console.log(`\n✓ Deleted ${toDelete.length} entries for ${opts.file}. Saved to: ${file}`);
    return;
  }

  if (opts.match) {
    const q = opts.match.toLowerCase();
    const toDelete = [];
    for (const [k, entry] of tm.entries) {
      if (entry.text?.toLowerCase().includes(q) || entry.translated?.toLowerCase().includes(q)) {
        toDelete.push({ key: k, entry });
      }
    }
    if (toDelete.length === 0) { console.log('No matching entries found.'); return; }

    console.log(`Found ${toDelete.length} matching entr${toDelete.length === 1 ? 'y' : 'ies'}:`);
    for (const { key: k, entry } of toDelete.slice(0, 10)) {
      console.log(`  [${k}] ${entry.text} → ${entry.translated}`);
    }
    if (toDelete.length > 10) console.log(`  ... and ${toDelete.length - 10} more`);

    if (opts.dryRun) { console.log('\n(dry-run, no changes made)'); return; }

    for (const { key: k } of toDelete) tm.entries.delete(k);
    await tm.save();
    console.log(`\n✓ Deleted ${toDelete.length} entries. Saved to: ${file}`);
    return;
  }

  if (!key) { console.error('Error: cache_key, --file, or --match required.'); process.exit(1); }
  const entry = tm.entries.get(key);
  if (!entry) { console.error(`Entry not found: ${key}`); process.exit(1); }

  console.log(`Deleting: ${entry.text} → ${entry.translated}`);
  tm.entries.delete(key);
  await tm.save();
  console.log(`✓ Deleted entry [${key}]. Saved to: ${file}`);
}

async function tmExport(args) {
  const opts = parseTmArgs(args);
  const { tm } = await loadTmFromOpts(opts);
  const format = opts.format || 'jsonl';

  if (format === 'json') {
    const entries = [...tm.entries.values()];
    console.log(JSON.stringify(entries, null, 2));
  } else {
    for (const entry of tm.entries.values()) {
      console.log(JSON.stringify(entry));
    }
  }
}

async function tmCompact(args) {
  const opts = parseTmArgs(args);
  const { tm, file } = await loadTmFromOpts(opts);
  const before = tm.size;
  await tm.save();
  console.log(`✓ Compacted TM: ${before} entries, saved to ${file}`);
}

async function tmPrune(args) {
  const opts = parseTmArgs(args);
  const sourceDir = opts.positional[0];

  if (!sourceDir || opts.positional.includes('--help') || opts.positional.includes('-h')) {
    console.log(`Usage: node translate-cli.js tm prune <source_dir> --lang <locale> [options]

Scans current source files and removes TM entries whose source text
no longer exists. This cleans up stale entries left behind when source
content is updated or segments are removed.

Options:
  --lang          Target locale (required)
  --src-lang      Source locale (default: auto-detect or "en")
  --dry-run       Show what would be removed without deleting
  --project-dir   Project root for .i18n/ config lookup`);
    process.exit(0);
  }

  const { tm, file } = await loadTmFromOpts(opts);
  const srcLang = opts.srcLang || detectLocaleFromPath(sourceDir) || 'en';
  const dryRun = opts.dryRun || false;

  const sourceFiles = await findMarkdownFiles(sourceDir);
  console.log(`Scanning ${sourceFiles.length} source file(s) in ${sourceDir}...`);

  const currentHashes = new Map();
  for (const srcFile of sourceFiles) {
    const relPath = path.relative(sourceDir, srcFile);
    const content = await fs.readFile(srcFile, 'utf-8');
    const { body } = splitFrontmatter(content);
    const segments = extractSegments(body, relPath);
    const hashes = new Set(segments.map(s => s.textHash));
    currentHashes.set(relPath, hashes);
  }

  const knownPaths = new Set(currentHashes.keys());
  const staleKeys = [];

  for (const [key, entry] of tm.entries) {
    const sp = entry.source_path;
    if (!sp) continue;
    if (!knownPaths.has(sp)) continue;
    const fileHashes = currentHashes.get(sp);
    if (!fileHashes.has(entry.text_hash)) {
      staleKeys.push({ key, entry });
    }
  }

  if (staleKeys.length === 0) {
    console.log(`\n✓ No stale entries found. TM is clean (${tm.size} entries).`);
    return;
  }

  console.log(`\nFound ${staleKeys.length} stale entries (out of ${tm.size} total):`);
  for (const { entry } of staleKeys) {
    const preview = (entry.text || '').slice(0, 60).replace(/\n/g, ' ');
    console.log(`  ${entry.source_path}: "${preview}${entry.text?.length > 60 ? '…' : ''}"`);
  }

  if (dryRun) {
    console.log(`\n(dry-run) Would remove ${staleKeys.length} entries.`);
    return;
  }

  for (const { key } of staleKeys) {
    tm.entries.delete(key);
  }
  await tm.save();
  console.log(`\n✓ Pruned ${staleKeys.length} stale entries. ${tm.size} entries remaining.`);
  console.log(`  Saved to: ${file}`);
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`translate-cli.js — Unified translation pipeline CLI

Usage: node scripts/translate-cli.js <command> [options]

Commands:
  prepare     Generate skeleton target with TM caching & masking
  apply       Validate, unmask placeholders, update TM
  merge       Merge translated chunks into target
  seed        Seed TM from existing translation pairs
  fix         Quick-fix common translation issues
  tm          Translation Memory CRUD operations

Fix subcommands:
  fix codeblocks <source> <target>   Replace code blocks from source
  fix links <source> <target>        Replace link URLs from source
  fix placeholders <target>          Fix mangled placeholders
  fix markers <target>               Strip i18n:todo markers

TM subcommands:
  tm stats [--lang <locale>]                        Show TM statistics
  tm search <query> --lang <locale>                 Search entries
  tm get <key> --lang <locale>                      Get entry by key
  tm add --lang <locale> --source <text> --translated <text>  Add entry
  tm update <key> --lang <locale> --translated <text>         Update entry
  tm delete <key> --lang <locale>                   Delete entry by key
  tm delete --file <path> --lang <locale>           Delete all entries for a file
  tm delete --match <query> --lang <locale>         Batch delete by text match
  tm export --lang <locale> [--format jsonl|json]   Export entries
  tm compact --lang <locale>                        Compact TM file
  tm prune <source_dir> --lang <locale> [--dry-run] Remove stale entries

Run any command with --help for detailed usage.`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  switch (command) {
    case 'prepare':  return await cmdPrepare(commandArgs);
    case 'apply':    return await cmdApply(commandArgs);
    case 'merge':    return await cmdMerge(commandArgs);
    case 'seed':     return await cmdSeed(commandArgs);
    case 'fix':      return await cmdFix(commandArgs);
    case 'tm':       return await cmdTm(commandArgs);
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
