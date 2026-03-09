#!/usr/bin/env node
/**
 * Post-processing pipeline: validate translations, unmask placeholders,
 * update Translation Memory, and report results.
 *
 * Run after the AI has translated all <!-- i18n:todo --> sections.
 *
 * Usage:
 *   node scripts/apply.js <source> <target> [options]
 *
 * Options:
 *   --lang            Target locale (auto-detected from task-meta or path)
 *   --src-lang        Source locale (auto-detected or "en")
 *   --project-dir     Project root for .i18n/ lookup (default: cwd)
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { TranslationMemory, cacheKey, textHash, tmPath } from './tm.js';
import { extractSegments, splitFrontmatter } from './segments.js';
import { unmaskMarkdown, validatePlaceholders, fixMangledPlaceholders } from './masking.js';
import { runAllChecks } from './quality.js';
import { findI18nDir, readNoTranslateConfig } from './read-no-translate.js';
import { loadPlan, findPlanFile } from './plan.js';

const TODO_RE = /<!--\s*i18n:todo\s*-->/g;
const TODO_BLOCK_RE = /<!--\s*i18n:todo\s*-->\n?([\s\S]*?)\n?<!--\s*\/i18n:todo\s*-->/g;

// ---------------------------------------------------------------------------
// Auto-strip TODO markers
// ---------------------------------------------------------------------------

export function stripTodoMarkers(text) {
  let strippedCount = 0;
  const cleaned = text.replace(TODO_BLOCK_RE, (_match, content) => {
    strippedCount++;
    return content.trim();
  });
  return { text: cleaned, strippedCount };
}

// ---------------------------------------------------------------------------
// Apply pipeline for a single file
// ---------------------------------------------------------------------------

export async function applyFile(sourcePath, targetPath, tm, placeholders, srcLang, tgtLang, relPath) {
  if (!relPath) relPath = sourcePath;
  const sourceContent = await fs.readFile(sourcePath, 'utf-8');
  let targetContent = await fs.readFile(targetPath, 'utf-8');
  const autoFixes = [];

  // 1. Auto-strip remaining TODO markers (AI no longer needs to remove them)
  const { text: stripped, strippedCount } = stripTodoMarkers(targetContent);
  if (strippedCount > 0) {
    autoFixes.push(`auto-stripped ${strippedCount} <!-- i18n:todo --> marker(s)`);
  }
  targetContent = stripped;

  // 2. Fix mangled placeholders (common AI errors: spacing, casing)
  const { text: fixed, fixCount } = fixMangledPlaceholders(targetContent);
  if (fixCount > 0) {
    autoFixes.push(`auto-fixed ${fixCount} mangled placeholder(s)`);
  }
  targetContent = fixed;

  // 3. Unmask placeholders (%%Pn%% → original inline code/URLs, %%CB_<hash>%% → code blocks)
  if (placeholders && Object.keys(placeholders).length > 0) {
    targetContent = unmaskMarkdown(targetContent, placeholders);
  }

  // 4. Write unmasked content back
  await fs.writeFile(targetPath, targetContent, 'utf-8');

  // 5. Run core quality checks (structure, codeBlocks, variables, links)
  const result = runAllChecks(sourceContent, targetContent, {
    only: ['structure', 'codeBlocks', 'variables', 'links'],
  });

  // 5b. Check for malformed TODO markers that survived auto-strip
  const remaining = (targetContent.match(TODO_RE) || []).length;
  if (remaining > 0) {
    result.warnings.push(`${remaining} malformed <!-- i18n:todo --> marker(s) found (auto-strip missed them)`);
  }

  // 6. Update TM with new translations
  const { body: srcBody } = splitFrontmatter(sourceContent);
  const { body: tgtBody } = splitFrontmatter(targetContent);
  const srcSegments = extractSegments(srcBody, relPath);
  const tgtSegments = extractSegments(tgtBody, relPath);

  let newEntries = 0;
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
      newEntries++;
    }
  }

  return {
    passed: result.errors.length === 0,
    errors: result.errors,
    warnings: result.warnings,
    autoFixes,
    newEntries,
    cachedEntries: minLen - newEntries,
  };
}

// ---------------------------------------------------------------------------
// Directory handling
// ---------------------------------------------------------------------------

async function findMarkdownFiles(dir) {
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
// CLI
// ---------------------------------------------------------------------------

function detectLocaleFromPath(p) {
  const match = p.match(/\/([a-z]{2}(?:-[A-Z]{2})?)\//);
  return match ? match[1] : null;
}

async function resolveSourceDir(explicit, projectDir, taskMeta) {
  if (explicit) return explicit;
  if (taskMeta?.source_dir) return taskMeta.source_dir;
  try {
    const plan = await loadPlan(findPlanFile(projectDir));
    if (plan?.meta?.source_dir) return plan.meta.source_dir;
  } catch { /* no plan file */ }
  return undefined;
}

function fileRelPath(filePath, sourceDir) {
  if (!sourceDir) return filePath;
  const rel = path.relative(sourceDir, filePath);
  if (rel.startsWith('..')) return filePath;
  return rel;
}

async function main() {
  const args = process.argv.slice(2);
  let source, target, tgtLang = null, srcLang = null;
  let projectDir = process.cwd();
  let explicitSourceDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang') { tgtLang = args[++i]; }
    else if (args[i] === '--src-lang') { srcLang = args[++i]; }
    else if (args[i] === '--project-dir') { projectDir = args[++i]; }
    else if (args[i] === '--source-dir') { explicitSourceDir = args[++i]; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node scripts/apply.js <source> <target> [options]');
      console.log('');
      console.log('Options:');
      console.log('  --lang          Target locale (auto-detected from task-meta or path)');
      console.log('  --src-lang      Source locale (default: auto-detect or "en")');
      console.log('  --source-dir    Source root dir (for TM source_path; auto-read from task-meta/plan)');
      console.log('  --project-dir   Project root for .i18n/ config lookup');
      process.exit(0);
    }
    else if (!source) { source = args[i]; }
    else if (!target) { target = args[i]; }
  }

  if (!source || !target) {
    console.error('Error: source and target paths required. Use --help for usage.');
    process.exit(1);
  }

  // Load task metadata
  const i18nDir = await findI18nDir(projectDir);
  const effectiveI18nDir = i18nDir || path.join(projectDir, '.i18n');
  const taskMetaPath = path.join(effectiveI18nDir, 'task-meta.json');
  let taskMeta = null;

  try {
    taskMeta = JSON.parse(await fs.readFile(taskMetaPath, 'utf-8'));
  } catch {
    console.log('Warning: task-meta.json not found. Running without placeholder info.');
  }

  // Resolve locales
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

  // Load TM
  const tmFile = tmPath(effectiveI18nDir, tgtLang);
  const tm = await TranslationMemory.load(tmFile);

  const sourceStat = await fs.stat(source);
  const isDir = sourceStat.isDirectory();
  const sourceDir = isDir ? source : await resolveSourceDir(explicitSourceDir, projectDir, taskMeta);

  let allPassed = true;
  let totalNew = 0;
  let totalCached = 0;

  if (isDir) {
    const sourceFiles = await findMarkdownFiles(source);

    for (const srcFile of sourceFiles) {
      const relPath = path.relative(source, srcFile);
      const tgtFile = path.join(target, relPath);

      try {
        await fs.access(tgtFile);
      } catch {
        console.log(`  SKIP ${relPath}: target file not found`);
        continue;
      }

      const result = await applyFile(srcFile, tgtFile, tm, placeholders, srcLang, tgtLang, relPath);
      totalNew += result.newEntries;
      totalCached += result.cachedEntries;
      printFileResult(relPath, result);
      if (!result.passed) allPassed = false;
    }
  } else {
    const relPath = fileRelPath(source, sourceDir);
    const result = await applyFile(source, target, tm, placeholders, srcLang, tgtLang, relPath);
    totalNew += result.newEntries;
    totalCached += result.cachedEntries;
    printFileResult(relPath, result);
    if (!result.passed) allPassed = false;
  }

  // Save TM
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

function printFileResult(relPath, result) {
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

const isDirectRun = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1].endsWith('/apply.js')
);
if (isDirectRun) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
