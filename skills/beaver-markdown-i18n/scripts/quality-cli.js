#!/usr/bin/env node
/**
 * quality-cli.js — Translation quality check CLI.
 *
 * Usage:
 *   node scripts/quality-cli.js <source> <target> [options]
 *   node scripts/quality-cli.js --dir <source_dir> <target_dir> [options]
 *
 * Options:
 *   --source-locale <code>  Source locale (auto-detected from path)
 *   --target-locale <code>  Target locale (auto-detected from path)
 *   --check <ids>           Only run these checks (comma-separated)
 *   --skip <ids>            Skip these checks (comma-separated)
 *   --json                  Output as JSON
 *   --help                  Show help
 *
 * Check IDs:
 *   structure, codeBlocks, variables, placeholders, links,
 *   terminology, untranslated, sections, frontmatterTranslated
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { runAllChecks, ALL_CHECK_IDS } from './lib/quality.js';
import { findI18nDir, readNoTranslateConfig } from './lib/read-no-translate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectLocaleFromPath(filePath) {
  const match = filePath.match(/\/([a-z]{2}(?:-[A-Za-z]{2,})?)\//);
  return match ? match[1] : null;
}

async function loadTerminologyConfig(cwd) {
  const i18nDir = await findI18nDir(cwd);
  if (!i18nDir) return { noTranslate: null, consistency: null };

  const noTranslate = await readNoTranslateConfig(i18nDir);
  let consistency = null;
  try {
    const raw = await fs.readFile(path.join(i18nDir, 'translation-consistency.yaml'), 'utf-8');
    consistency = yaml.load(raw);
  } catch { /* not found */ }

  return { noTranslate, consistency };
}

async function findMarkdownFiles(dir, baseDir = dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findMarkdownFiles(full, baseDir));
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      files.push(path.relative(baseDir, full));
    }
  }
  return files.sort();
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function formatSection(id, sec) {
  const status = sec.pass ? '[PASS]' : (sec.errors.length > 0 ? '[FAIL]' : '[WARN]');
  const d = sec.details || {};
  let summary = '';

  switch (id) {
    case 'structure':
      summary = `headings: ${d.headingCount?.tgt ?? '?'}/${d.headingCount?.src ?? '?'}, ` +
                `code blocks: ${d.codeBlockCount?.tgt ?? '?'}/${d.codeBlockCount?.src ?? '?'}, ` +
                `list items: ${d.listItemCount?.tgt ?? '?'}/${d.listItemCount?.src ?? '?'}`;
      break;
    case 'codeBlocks':
      summary = `${d.total ?? '?'} block(s)` +
                (d.langMismatch ? `, ${d.langMismatch} lang mismatch` : '') +
                (d.contentChanged ? `, ${d.contentChanged} content changed` : '');
      if (!d.langMismatch && !d.contentChanged) summary += ', all identical';
      break;
    case 'variables':
      summary = `{{var}}: ${d.mustache?.tgt ?? 0}/${d.mustache?.src ?? 0}, ` +
                `$ENV: ${d.dollar?.tgt ?? 0}/${d.dollar?.src ?? 0}, ` +
                `%fmt: ${d.format?.tgt ?? 0}/${d.format?.src ?? 0}`;
      break;
    case 'placeholders':
      summary = d.count ? `${d.count} leaked placeholder(s)` : 'clean';
      break;
    case 'links':
      summary = `external: ${d.external?.total - (d.external?.mismatched || 0)}/${d.external?.total}, ` +
                `relative: ${d.relative?.total - (d.relative?.mismatched || 0)}/${d.relative?.total}, ` +
                `anchors: ${d.anchors?.total - (d.anchors?.missing || 0)}/${d.anchors?.total}`;
      break;
    case 'terminology':
      summary = sec.errors.length === 0 && sec.warnings.length === 0
        ? 'compliant' : `${sec.errors.length} error(s), ${sec.warnings.length} warning(s)`;
      break;
    case 'untranslated':
      summary = sec.warnings.length === 0 ? 'no suspect regions' : `${sec.warnings.length} suspect region(s)`;
      break;
    case 'sections':
      summary = `heading sequence: ${d.tgtSequence ?? '?'}/${d.srcSequence ?? '?'}`;
      break;
    case 'frontmatterTranslated': {
      const checked = d.checked?.length ?? 0;
      const bad = d.untranslated?.length ?? 0;
      summary = checked === 0 ? 'no translatable fields' : `${checked - bad}/${checked} translated`;
      break;
    }
    default:
      summary = '';
  }

  const lines = [`${status} ${id} (${summary})`];
  for (const e of sec.errors) lines.push(`  ERROR: ${e}`);
  for (const w of sec.warnings) lines.push(`  WARN: ${w}`);
  return lines.join('\n');
}

export function formatReport(filePath, result) {
  const lines = [`=== Quality Report: ${filePath} ===`];
  for (const [id, sec] of Object.entries(result.sections)) {
    lines.push(formatSection(id, sec));
  }
  const verdict = result.passed ? 'PASSED' : 'FAILED';
  lines.push(`RESULT: ${verdict} (${result.errors.length} error(s), ${result.warnings.length} warning(s))`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

export async function validateFile(srcPath, tgtPath, opts) {
  const srcContent = await fs.readFile(srcPath, 'utf-8');
  const tgtContent = await fs.readFile(tgtPath, 'utf-8');

  let { sourceLocale, targetLocale } = opts;
  if (!sourceLocale) sourceLocale = detectLocaleFromPath(srcPath);
  if (!targetLocale) targetLocale = detectLocaleFromPath(tgtPath);

  const { noTranslate, consistency } = await loadTerminologyConfig(opts.cwd || process.cwd());

  return runAllChecks(srcContent, tgtContent, {
    targetLocale,
    noTranslateConfig: noTranslate,
    consistencyConfig: consistency,
    only: opts.only,
    skip: opts.skip,
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`Usage:
  node scripts/quality-cli.js <source> <target> [options]
  node scripts/quality-cli.js --dir <source_dir> <target_dir> [options]

Options:
  --source-locale <code>  Source locale (auto-detected from path)
  --target-locale <code>  Target locale (auto-detected from path)
  --check <ids>           Only run these checks (comma-separated)
  --skip <ids>            Skip these checks (comma-separated)
  --json                  Output as JSON
  --help, -h              Show this help

Check IDs:
  ${ALL_CHECK_IDS.join(', ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  let isDir = false, jsonOutput = false;
  let sourceLocale = null, targetLocale = null;
  let only = null, skip = null;
  const paths = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dir':            isDir = true; break;
      case '--json':           jsonOutput = true; break;
      case '--source-locale':  sourceLocale = args[++i]; break;
      case '--target-locale':  targetLocale = args[++i]; break;
      case '--check':          only = args[++i].split(','); break;
      case '--skip':           skip = args[++i].split(','); break;
      case '--help': case '-h': printHelp(); process.exit(0); break;
      default: paths.push(args[i]);
    }
  }

  if (paths.length < 2) {
    console.error('Error: source and target paths required. Use --help for usage.');
    process.exit(1);
  }

  const [source, target] = paths;
  const opts = { sourceLocale, targetLocale, only, skip, cwd: process.cwd() };

  if (isDir) {
    const sourceFiles = await findMarkdownFiles(source);
    const results = {};
    let allPassed = true;

    for (const relPath of sourceFiles) {
      const srcFile = path.join(source, relPath);
      const tgtFile = path.join(target, relPath);

      try {
        await fs.access(tgtFile);
        results[relPath] = await validateFile(srcFile, tgtFile, opts);
      } catch {
        results[relPath] = {
          passed: false,
          errors: [`Target file missing: ${tgtFile}`],
          warnings: [],
          sections: {},
        };
      }
      if (!results[relPath].passed) allPassed = false;
    }

    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const [fp, result] of Object.entries(results)) {
        console.log(formatReport(fp, result));
        console.log('');
      }
      console.log(allPassed ? 'ALL PASSED' : 'SOME FAILED');
    }

    process.exit(allPassed ? 0 : 1);
  } else {
    const result = await validateFile(source, target, opts);

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatReport(path.basename(target), result));
    }

    process.exit(result.passed ? 0 : 1);
  }
}

const isDirectRun = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1] === fileURLToPath(import.meta.url)
);

if (isDirectRun) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
