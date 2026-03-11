#!/usr/bin/env node
/**
 * Pre-processing pipeline for token-efficient translation.
 *
 * Parses source markdown, checks Translation Memory, masks untranslatable
 * tokens, and generates a skeleton target file with <!-- i18n:todo --> markers
 * for segments that need translation.
 *
 * Usage:
 *   node scripts/prepare.js <source> <target> --lang <tgt_locale> [options]
 *
 * Options:
 *   --lang          Target locale (required, e.g. zh-CN, ja, ko)
 *   --src-lang      Source locale (default: auto-detect from path or "en")
 *   --seed-tm       Seed TM from existing translation pair (no skeleton output)
 *   --project-dir   Project root for .i18n/ lookup (default: cwd)
 *
 * Single file:  prepare.js docs/en/guide.md docs/zh/guide.md --lang zh-CN
 * Directory:    prepare.js docs/en/ docs/zh/ --lang zh-CN
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { TranslationMemory, cacheKey, textHash, tmPath } from './tm.js';
import { extractSegments, splitFrontmatter, joinFrontmatter } from './segments.js';
import { maskMarkdown, maskCodeBlocks, PlaceholderState } from './masking.js';
import { findI18nDir, readNoTranslateConfig, shouldNotTranslate, getFmTranslateKeys } from './read-no-translate.js';
import { loadPlan, findPlanFile, createRunDir, getRunDir } from './plan.js';
import { saveTaskMeta, targetKeyFor } from './task-meta.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveSourceDir(explicit, projectDir) {
  if (explicit) return explicit;
  try {
    const plan = await loadPlan(findPlanFile(projectDir));
    if (plan?.meta?.source_dir) return plan.meta.source_dir;
  } catch { /* no plan file */ }
  return undefined;
}

async function resolveCurrentRunDir(projectDir, i18nDir) {
  try {
    const plan = await loadPlan(findPlanFile(projectDir));
    return getRunDir(plan, i18nDir);
  } catch {
    return null;
  }
}

async function resolveOrCreateRunDir(projectDir, i18nDir) {
  const existingRunDir = await resolveCurrentRunDir(projectDir, i18nDir);
  if (existingRunDir) return existingRunDir;
  const { runDir } = await createRunDir(i18nDir);
  return runDir;
}

function fileRelPath(filePath, sourceDir, fallbackBaseDir) {
  const baseDir = sourceDir || fallbackBaseDir;
  if (!baseDir) return path.basename(filePath);
  const rel = path.relative(baseDir, filePath);
  if (rel.startsWith('..')) return path.basename(filePath);
  return rel;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

async function loadConsistencyConfig(i18nDir) {
  if (!i18nDir) return null;
  try {
    const raw = await fs.readFile(path.join(i18nDir, 'translation-consistency.yaml'), 'utf-8');
    return yaml.load(raw);
  } catch {
    return null;
  }
}

function detectLocaleFromPath(p) {
  const match = p.match(/\/([a-z]{2}(?:-[A-Z]{2})?)\//);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Frontmatter handling
// ---------------------------------------------------------------------------

function prepareFrontmatter(fmYaml, tm, segments, relPath, srcLang, tgtLang, state, noTranslateConfig) {
  if (!fmYaml) return { translated: null, todoCount: 0, cachedCount: 0, fieldCount: 0, todoEntries: [] };

  let data;
  try {
    data = yaml.load(fmYaml);
  } catch {
    return { translated: fmYaml, todoCount: 0, cachedCount: 0, fieldCount: 0, todoEntries: [] };
  }
  if (!data || typeof data !== 'object') return { translated: fmYaml, todoCount: 0, cachedCount: 0, fieldCount: 0, todoEntries: [] };

  let todoCount = 0;
  let cachedCount = 0;
  let fieldCount = 0;
  const todoEntries = [];
  const fmKeys = getFmTranslateKeys(noTranslateConfig);

  for (const key of fmKeys) {
    const val = data[key];
    if (typeof val !== 'string' || !val.trim()) continue;
    fieldCount++;

    const hash = textHash(val.trim());
    const segId = `${relPath}:fm:${key}`;
    const ck = cacheKey(srcLang, tgtLang, segId, hash);

    const cached = tm.get(ck);
    if (cached) {
      data[key] = cached.translated;
      cachedCount++;
    } else {
      const { masked } = maskMarkdown(val, { state });
      data[key] = `<!-- i18n:todo -->${masked}<!-- /i18n:todo -->`;
      todoCount++;
      todoEntries.push({
        kind: 'frontmatter',
        segment_id: segId,
        text_hash: hash,
        text: val.trim(),
        source_path: relPath,
        field: key,
      });
    }
  }

  const result = yaml.dump(data, { indent: 2, lineWidth: -1, quotingType: '"', forceQuotes: true });
  return { translated: result.trimEnd(), todoCount, cachedCount, fieldCount, todoEntries };
}

function extractFrontmatterEntries(content, noTranslateConfig) {
  const { frontmatter } = splitFrontmatter(content);
  if (!frontmatter) return new Map();

  let data;
  try {
    data = yaml.load(frontmatter);
  } catch {
    return new Map();
  }

  if (!data || typeof data !== 'object') return new Map();

  const entries = new Map();
  for (const key of getFmTranslateKeys(noTranslateConfig)) {
    const value = data[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    entries.set(key, trimmed);
  }
  return entries;
}

function seedFrontmatterTM(sourceContent, targetContent, tm, srcLang, tgtLang, relPath, noTranslateConfig) {
  const sourceEntries = extractFrontmatterEntries(sourceContent, noTranslateConfig);
  const targetEntries = extractFrontmatterEntries(targetContent, noTranslateConfig);
  let seeded = 0;

  for (const [key, sourceText] of sourceEntries) {
    const targetText = targetEntries.get(key);
    if (!targetText) continue;

    const hash = textHash(sourceText);
    const segId = `${relPath}:fm:${key}`;
    const ck = cacheKey(srcLang, tgtLang, segId, hash);
    if (tm.get(ck)) continue;

    tm.put({
      cache_key: ck,
      segment_id: segId,
      source_path: relPath,
      text_hash: hash,
      text: sourceText,
      translated: targetText,
      updated_at: new Date().toISOString(),
    });
    seeded++;
  }

  return seeded;
}

// ---------------------------------------------------------------------------
// Skeleton generation for a single file
// ---------------------------------------------------------------------------

export async function prepareFile(sourcePath, targetPath, tm, noTranslateConfig, srcLang, tgtLang, relPath, sharedState) {
  const sourceContent = await fs.readFile(sourcePath, 'utf-8');
  const { frontmatter, body, hasFrontmatter } = splitFrontmatter(sourceContent);

  const state = sharedState || new PlaceholderState(body);
  const segments = extractSegments(body, relPath);

  // Prepare frontmatter
  const fmResult = prepareFrontmatter(frontmatter, tm, segments, relPath, srcLang, tgtLang, state, noTranslateConfig);

  // Build translation map: segmentId → translated text or TODO marker
  const translations = new Map();
  let todoCount = fmResult.todoCount;
  let cachedCount = fmResult.cachedCount;
  const todoEntries = [...fmResult.todoEntries];

  for (const seg of segments) {
    const ck = cacheKey(srcLang, tgtLang, seg.segmentId, seg.textHash);
    const cached = tm.get(ck);

    if (cached) {
      translations.set(seg.segmentId, cached.translated);
      cachedCount++;
      continue;
    }

    // Check no-translate rules for headings
    if (seg.type === 'heading' && noTranslateConfig) {
      const headingText = seg.text.replace(/^#+\s*/, '');
      const result = shouldNotTranslate(headingText, 'heading', noTranslateConfig);
      if (result.shouldSkip) {
        translations.set(seg.segmentId, seg.text);
        cachedCount++;
        continue;
      }
    }

    // Mask the segment for translation
    const { masked } = maskMarkdown(seg.text, { state });

    translations.set(seg.segmentId, `<!-- i18n:todo -->\n${masked}\n<!-- /i18n:todo -->`);
    todoCount++;
    todoEntries.push({
      kind: 'segment',
      segment_id: seg.segmentId,
      text_hash: seg.textHash,
      text: seg.text,
      source_path: relPath,
      type: seg.type,
    });
  }

  // Reconstruct the document using the original source structure
  const translatedBody = applySkeletonTranslations(body, segments, translations);
  const rawSkeleton = joinFrontmatter(fmResult.translated, translatedBody);

  // Mask fenced code blocks so the AI never sees their content
  const skeleton = maskCodeBlocks(rawSkeleton, state);

  return {
    skeleton,
    placeholders: state.toJSON(),
    todoCount,
    cachedCount,
    totalSegments: segments.length + fmResult.fieldCount,
    todoEntries,
  };
}

/**
 * Like applyTranslations but works on the original source layout.
 * Replaces each segment span with its translation (or TODO marker).
 */
function applySkeletonTranslations(source, segments, translations) {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const parts = [];
  let cursor = 0;

  for (const seg of sorted) {
    if (seg.start < cursor) continue;
    parts.push(source.slice(cursor, seg.start));
    const translated = translations.get(seg.segmentId);
    parts.push(translated != null ? translated : seg.text);
    cursor = seg.end;
  }

  parts.push(source.slice(cursor));
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Directory handling
// ---------------------------------------------------------------------------

export async function findMarkdownFiles(dir) {
  const files = [];

  async function walk(d) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
        files.push(full);
      }
    }
  }

  await walk(dir);
  return files.sort();
}

// ---------------------------------------------------------------------------
// Chunk splitting for large files
// ---------------------------------------------------------------------------

const TODO_OPEN_RE = /<!--\s*i18n:todo\s*-->/;
const TODO_CLOSE_RE = /<!--\s*\/i18n:todo\s*-->/;
const TODO_MARKER_RE = /<!--\s*i18n:todo\s*-->/g;

const DEFAULT_MAX_CHUNK_CHARS = 3000;

/**
 * Split a skeleton into chunks based on character count.
 * Splits only on segment boundaries (blank lines outside TODO blocks)
 * to ensure each chunk is self-contained and translatable in one pass.
 *
 * @param {string} skeleton - The full skeleton content
 * @param {number} maxChars - Max characters per chunk (default 6000)
 * @returns {string[]|null} Array of chunk strings, or null if no splitting needed
 */
export function splitIntoChunks(skeleton, maxChars = DEFAULT_MAX_CHUNK_CHARS) {
  if (skeleton.length <= maxChars) return null;

  const lines = skeleton.split('\n');

  let hasTodos = false;
  for (const line of lines) {
    if (TODO_OPEN_RE.test(line)) { hasTodos = true; break; }
  }
  if (!hasTodos) return null;

  const chunks = [];
  let chunkStart = 0;
  let chunkCharCount = 0;
  let insideTodo = false;

  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length + 1; // +1 for newline
    chunkCharCount += lineLen;

    if (TODO_OPEN_RE.test(lines[i])) insideTodo = true;
    if (TODO_CLOSE_RE.test(lines[i])) insideTodo = false;

    const isBlank = lines[i].trim() === '';
    const atSoftLimit = chunkCharCount >= maxChars;
    const atHardLimit = chunkCharCount >= maxChars * 2;
    const hasMore = i < lines.length - 1;

    const canSplit = !insideTodo && isBlank && hasMore;
    if ((atSoftLimit && canSplit) || (atHardLimit && hasMore && !insideTodo)) {
      chunks.push(lines.slice(chunkStart, i + 1).join('\n'));
      chunkStart = i + 1;
      chunkCharCount = 0;
    }
  }

  if (chunkStart < lines.length) {
    chunks.push(lines.slice(chunkStart).join('\n'));
  }

  return chunks.length > 1 ? chunks : null;
}

export async function writeChunks(chunks, relPath, fileDir, opts = {}) {
  await fs.mkdir(fileDir, { recursive: true });

  const overwrite = opts.overwrite === true;
  const existing = (await fs.readdir(fileDir))
    .filter(name => /^chunk-\d{3}\.md$/.test(name))
    .sort();

  if (existing.length > 0) {
    const existingPaths = existing.map(name => path.join(fileDir, name));
    const existingContents = await Promise.all(existingPaths.map(file => fs.readFile(file, 'utf-8')));
    const matchesFresh =
      existingContents.length === chunks.length &&
      existingContents.every((content, index) => content === chunks[index]);

    if (matchesFresh) {
      return existingPaths;
    }

    if (!overwrite) {
      throw new Error(
        `Existing chunk files found for ${relPath} in ${fileDir}. ` +
        `Refusing to overwrite possible translation progress. ` +
        `Merge/apply the existing chunks first, or rerun prepare with --overwrite-chunks.`,
      );
    }
  }

  const todoEntries = Array.isArray(opts.todoEntries) ? opts.todoEntries : [];
  let todoCursor = 0;
  const paths = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkFile = path.join(fileDir, `chunk-${String(i + 1).padStart(3, '0')}.md`);
    await fs.writeFile(chunkFile, chunks[i], 'utf-8');
    const todoCount = (chunks[i].match(/<!--\s*i18n:todo\s*-->/g) || []).length;
    const entriesForChunk = todoEntries.slice(todoCursor, todoCursor + todoCount);
    if (entriesForChunk.length !== todoCount) {
      throw new Error(`Chunk metadata mismatch for ${relPath}: expected ${todoCount} TODO entr${todoCount === 1 ? 'y' : 'ies'}, got ${entriesForChunk.length}.`);
    }
    todoCursor += todoCount;

    const metaPath = chunkFile.replace(/\.md$/, '.meta.json');
    await fs.writeFile(metaPath, JSON.stringify({
      version: 1,
      rel_path: relPath,
      source_locale: opts.srcLang || '',
      target_locale: opts.tgtLang || '',
      task_meta_path: opts.taskMetaPath || '',
      todo_count: todoCount,
      entries: entriesForChunk,
    }, null, 2), 'utf-8');
    paths.push(chunkFile);
  }

  if (todoCursor !== todoEntries.length) {
    throw new Error(`Chunk metadata mismatch for ${relPath}: ${todoEntries.length - todoCursor} TODO entr${todoEntries.length - todoCursor === 1 ? 'y was' : 'ies were'} not assigned to any chunk.`);
  }
  return paths;
}

export async function listTranslatableChunks(chunkPaths) {
  const chunks = [];
  for (const chunkPath of chunkPaths) {
    const content = await fs.readFile(chunkPath, 'utf-8');
    const todoCount = (content.match(TODO_MARKER_RE) || []).length;
    chunks.push({
      path: chunkPath,
      todoCount,
      needsTranslation: todoCount > 0,
    });
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// TM seeding from existing translations
// ---------------------------------------------------------------------------

export async function seedTM(sourcePath, targetPath, tm, srcLang, tgtLang, relPath, noTranslateConfig) {
  const sourceContent = await fs.readFile(sourcePath, 'utf-8');
  const targetContent = await fs.readFile(targetPath, 'utf-8');

  const { body: srcBody } = splitFrontmatter(sourceContent);
  const { body: tgtBody } = splitFrontmatter(targetContent);

  if (!relPath) relPath = sourcePath;
  const srcSegments = extractSegments(srcBody, relPath);
  const tgtSegments = extractSegments(tgtBody, relPath);

  let seeded = 0;
  const minLen = Math.min(srcSegments.length, tgtSegments.length);

  for (let i = 0; i < minLen; i++) {
    const src = srcSegments[i];
    const tgt = tgtSegments[i];
    if (src.type !== tgt.type) continue;

    const ck = cacheKey(srcLang, tgtLang, src.segmentId, src.textHash);
    if (!tm.get(ck)) {
      tm.put({
        cache_key: ck,
        segment_id: src.segmentId,
        source_path: relPath,
        text_hash: src.textHash,
        text: src.text,
        translated: tgt.text,
        updated_at: new Date().toISOString(),
      });
      seeded++;
    }
  }

  return seeded + seedFrontmatterTM(sourceContent, targetContent, tm, srcLang, tgtLang, relPath, noTranslateConfig);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  let source, target, tgtLang = null, srcLang = null;
  let projectDir = process.cwd();
  let isSeedMode = false;
  let maxChunkChars = DEFAULT_MAX_CHUNK_CHARS;
  let explicitSourceDir = null;
  let overwriteChunks = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang') { tgtLang = args[++i]; }
    else if (args[i] === '--src-lang') { srcLang = args[++i]; }
    else if (args[i] === '--project-dir') { projectDir = args[++i]; }
    else if (args[i] === '--source-dir') { explicitSourceDir = args[++i]; }
    else if (args[i] === '--seed-tm') { isSeedMode = true; }
    else if (args[i] === '--max-chunk-chars') { maxChunkChars = parseInt(args[++i], 10); }
    else if (args[i] === '--overwrite-chunks') { overwriteChunks = true; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node scripts/prepare.js <source> <target> --lang <locale> [options]');
      console.log('');
      console.log('Options:');
      console.log('  --lang               Target locale (e.g. zh-CN, ja, ko)');
      console.log('  --src-lang           Source locale (default: auto-detect or "en")');
      console.log('  --source-dir         Source root dir (for TM source_path; auto-read from plan)');
      console.log('  --seed-tm            Seed TM from existing source/target pairs');
      console.log('  --max-chunk-chars N  Max characters per chunk (default: 3000)');
      console.log('  --overwrite-chunks   Overwrite existing chunk files for the same target');
      console.log('  --project-dir        Project root for .i18n/ config lookup');
      process.exit(0);
    }
    else if (!source) { source = args[i]; }
    else if (!target) { target = args[i]; }
  }

  if (!source || !target) {
    console.error('Error: source and target paths required. Use --help for usage.');
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

  if (!srcLang) {
    srcLang = detectLocaleFromPath(source) || 'en';
  }

  // Load i18n config
  const i18nDir = await findI18nDir(projectDir);
  const noTranslateConfig = i18nDir ? await readNoTranslateConfig(i18nDir) : null;
  const consistencyConfig = await loadConsistencyConfig(i18nDir);
  const effectiveI18nDir = i18nDir || path.join(projectDir, '.i18n');

  // Load TM
  const tmFile = tmPath(effectiveI18nDir, tgtLang);
  const tm = await TranslationMemory.load(tmFile);
  console.log(`Translation Memory: ${tm.size} entries loaded from ${tmFile}`);

  // Check if source/target are directories
  const sourceStat = await fs.stat(source);
  const isDir = sourceStat.isDirectory();
  const sourceDir = isDir ? source : await resolveSourceDir(explicitSourceDir, projectDir);

  if (isSeedMode) {
    return await runSeedMode(source, target, tm, tmFile, srcLang, tgtLang, isDir, sourceDir, noTranslateConfig);
  }

  const runDir = await resolveOrCreateRunDir(projectDir, effectiveI18nDir);
  const summary = {
    created: new Date().toISOString(),
    source_locale: srcLang,
    target_locale: tgtLang,
    source_dir: sourceDir || (isDir ? source : undefined),
    files: [],
  };

  // Shared placeholder state across all files to avoid ID collisions
  const sharedState = new PlaceholderState('');

  async function processFile(srcFile, tgtFile, relPath) {
    const result = await prepareFile(srcFile, tgtFile, tm, noTranslateConfig, srcLang, tgtLang, relPath, sharedState);

    await fs.mkdir(path.dirname(tgtFile), { recursive: true });
    await fs.writeFile(tgtFile, result.skeleton, 'utf-8');

    const fileDir = path.join(runDir, targetKeyFor(relPath, tgtFile));
    const fileMeta = {
      source: srcFile,
      target: tgtFile,
      rel_path: relPath,
      todo: result.todoCount,
      cached: result.cachedCount,
      total: result.totalSegments,
      chunks: 0,
      work_dir: fileDir,
      chunks_to_translate: [],
    };

    if (result.todoCount > 0) {
      const chunks = splitIntoChunks(result.skeleton, maxChunkChars) || [result.skeleton];
      const chunkPaths = await writeChunks(chunks, relPath, fileDir, {
        overwrite: overwriteChunks,
        todoEntries: result.todoEntries,
        srcLang,
        tgtLang,
        taskMetaPath: path.join(fileDir, 'task-meta.json'),
      });
      const chunkDetails = await listTranslatableChunks(chunkPaths);
      fileMeta.chunks = chunkPaths.length;
      fileMeta.chunk_dir = fileDir;
      fileMeta.chunk_files = chunkPaths;
      fileMeta.chunks_to_translate = chunkDetails
        .filter(chunk => chunk.needsTranslation)
        .map(chunk => ({ path: chunk.path, todo: chunk.todoCount }));
    }

    await saveTaskMeta(fileDir, {
      created: summary.created,
      source_locale: srcLang,
      target_locale: tgtLang,
      source_dir: sourceDir || (isDir ? source : undefined),
      source: srcFile,
      target: tgtFile,
      rel_path: relPath,
      placeholders: result.placeholders,
      consistency: consistencyConfig,
      file: fileMeta,
    });

    summary.files.push(fileMeta);

    const status = result.todoCount === 0 ? '✓' : '●';
    const chunkNote = fileMeta.chunks > 0 ? ` → ${fileMeta.chunks} chunk(s)` : '';
    console.log(`  ${status} ${relPath}: ${result.todoCount} to translate, ${result.cachedCount} cached (${result.totalSegments} total)${chunkNote}`);
    console.log(`    work dir: ${fileDir}`);
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
    const relPath = fileRelPath(source, sourceDir, projectDir);
    console.log('');
    await processFile(source, target, relPath);
  }

  // Summary
  const totalTodo = summary.files.reduce((sum, f) => sum + f.todo, 0);
  const totalCached = summary.files.reduce((sum, f) => sum + f.cached, 0);
  const totalSegs = summary.files.reduce((sum, f) => sum + f.total, 0);
  const pendingChunks = summary.files.flatMap(file =>
    (file.chunks_to_translate || []).map(chunk => ({
      relPath: file.rel_path,
      path: chunk.path,
      todo: chunk.todo,
    })),
  );

  console.log(`\n✓ Prepared ${summary.files.length} file(s)`);
  console.log(`  Segments: ${totalTodo} to translate, ${totalCached} cached (${totalSegs} total)`);
  console.log(`  Run directory: ${runDir}`);

  if (totalTodo === 0) {
    console.log('\n  All segments cached — no translation needed.');
    console.log(`  Next: node scripts/apply.js ${source} ${target}${tgtLang ? ' --lang ' + tgtLang : ''}`);
  } else if (pendingChunks.length > 0) {
    console.log(`\n  Chunks to translate:`);
    for (const chunk of pendingChunks) {
      console.log(`    ${chunk.relPath}: ${chunk.path} (${chunk.todo} TODO)`);
    }
    console.log('  Workflow: translate each chunk → merge → apply');
    console.log(`\nNext:`);
    console.log(`  1. Translate only the chunk files listed above`);
    console.log(`  2. node scripts/translate-cli.js checkpoint <chunk-file>${tgtLang ? ' --lang ' + tgtLang : ''}`);
    console.log(`  3. Repeat for remaining chunks, then node scripts/merge-chunks.js ${target}${tgtLang ? ' --lang ' + tgtLang : ''}`);
    console.log(`  4. node scripts/apply.js ${source} ${target}${tgtLang ? ' --lang ' + tgtLang : ''}`);
  }
}

async function runSeedMode(source, target, tm, tmFile, srcLang, tgtLang, isDir, sourceDir, noTranslateConfig) {
  let totalSeeded = 0;

  if (isDir) {
    const sourceFiles = await findMarkdownFiles(source);
    console.log(`\nSeeding TM from ${sourceFiles.length} file pair(s)...`);

    for (const srcFile of sourceFiles) {
      const relPath = path.relative(source, srcFile);
      const tgtFile = path.join(target, relPath);
      try {
        await fs.access(tgtFile);
        const n = await seedTM(srcFile, tgtFile, tm, srcLang, tgtLang, relPath, noTranslateConfig);
        if (n > 0) console.log(`  ${relPath}: ${n} segment(s) seeded`);
        totalSeeded += n;
      } catch {
        // target doesn't exist, skip
      }
    }
  } else {
    const relPath = fileRelPath(source, sourceDir, projectDir);
    totalSeeded = await seedTM(source, target, tm, srcLang, tgtLang, relPath, noTranslateConfig);
  }

  await tm.save();
  console.log(`\n✓ TM seeded: ${totalSeeded} new entries (${tm.size} total)`);
  console.log(`  Saved to: ${tmFile}`);
}

const isDirectRun = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1].endsWith('/prepare.js')
);
if (isDirectRun) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
