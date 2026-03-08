#!/usr/bin/env node
/**
 * @deprecated Use `npx i18n-quality` (quality-cli.js) instead.
 *
 * This script is kept for backward compatibility. It delegates all checks
 * to lib/quality.js via quality-cli.js's shared infrastructure.
 *
 * Usage:
 *   node validate.js <source.md> <target.md> [--source-locale en] [--target-locale zh]
 *   node validate.js --dir <source_dir> <target_dir> [--source-locale en] [--target-locale zh]
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { runAllChecks } from './lib/quality.js';
import { findI18nDir, readNoTranslateConfig } from './read-no-translate.js';

function detectLocaleFromPath(filePath) {
  const match = filePath.match(/\/([a-z]{2})\//);
  return match ? match[1] : null;
}

function resolveLocales(sourcePath, targetPath, opts) {
  return {
    sourceLocale: opts.sourceLocale || detectLocaleFromPath(sourcePath),
    targetLocale: opts.targetLocale || detectLocaleFromPath(targetPath)
  };
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

async function validatePair(sourceContent, targetContent, sourceLocale, targetLocale, cwd) {
  const { noTranslate, consistency } = await loadTerminologyConfig(cwd || process.cwd());

  const result = runAllChecks(sourceContent, targetContent, {
    targetLocale,
    noTranslateConfig: noTranslate,
    consistencyConfig: consistency,
  });

  return { ...result, localeInfo: { sourceLocale, targetLocale } };
}

function formatReport(filePath, result) {
  const lines = [`=== Quality Report: ${filePath} ===`];
  for (const [name, sec] of Object.entries(result.sections)) {
    const status = sec.pass ? 'PASS' : 'FAIL';
    lines.push(`${status}: ${name}`);
  }
  for (const e of result.errors) lines.push(`  ERROR: ${e}`);
  for (const w of result.warnings) lines.push(`  WARN: ${w}`);
  const verdict = result.passed ? 'PASSED' : 'FAILED';
  lines.push(`RESULT: ${verdict} (${result.errors.length} error(s), ${result.warnings.length} warning(s))`);
  return lines.join('\n');
}

async function validateFiles(sourcePath, targetPath, sourceLocale, targetLocale) {
  const source = await fs.readFile(sourcePath, 'utf-8');
  const target = await fs.readFile(targetPath, 'utf-8');
  if (!sourceLocale || !targetLocale) {
    const detected = resolveLocales(sourcePath, targetPath, { sourceLocale, targetLocale });
    sourceLocale = detected.sourceLocale || sourceLocale;
    targetLocale = detected.targetLocale || targetLocale;
  }
  return validatePair(source, target, sourceLocale, targetLocale);
}

async function findMarkdownFiles(dir, baseDir = dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findMarkdownFiles(fullPath, baseDir));
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      files.push(path.relative(baseDir, fullPath));
    }
  }
  return files.sort();
}

async function validateDirectories(sourceDir, targetDir, sourceLocale, targetLocale) {
  const results = {};
  const sourceFiles = await findMarkdownFiles(sourceDir);
  if (!sourceLocale) sourceLocale = detectLocaleFromPath(sourceDir);
  if (!targetLocale) targetLocale = detectLocaleFromPath(targetDir);
  for (const relPath of sourceFiles) {
    const srcFile = path.join(sourceDir, relPath);
    const tgtFile = path.join(targetDir, relPath);
    try {
      await fs.access(tgtFile);
      results[relPath] = await validateFiles(srcFile, tgtFile, sourceLocale, targetLocale);
    } catch {
      results[relPath] = {
        passed: false, errors: [`Target file missing: ${tgtFile}`],
        warnings: [], sections: {}, localeInfo: { sourceLocale, targetLocale }
      };
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  let isDir = false, jsonOutput = false;
  let sourceLocale = null, targetLocale = null;
  const paths = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') { isDir = true; }
    else if (args[i] === '--json') { jsonOutput = true; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node validate.js <source.md> <target.md> [options]');
      console.log('       node validate.js --dir <source_dir> <target_dir> [options]');
      console.log('');
      console.log('Options:');
      console.log('  --dir              Validate all files in directories');
      console.log('  --json             Output as JSON');
      console.log('  --source-locale    Source locale code (e.g., en)');
      console.log('  --target-locale    Target locale code (e.g., zh)');
      console.log('');
      console.log('NOTE: This script is deprecated. Use `npx i18n-quality` instead.');
      process.exit(0);
    }
    else if (args[i] === '--source-locale') { sourceLocale = args[++i]; }
    else if (args[i] === '--target-locale') { targetLocale = args[++i]; }
    else { paths.push(args[i]); }
  }

  if (paths.length < 2) {
    console.log('Error: Missing required paths. Run with --help for usage.');
    process.exit(1);
  }

  const [source, target] = paths;

  if (isDir) {
    const results = await validateDirectories(source, target, sourceLocale, targetLocale);
    const allPassed = Object.values(results).every(r => r.passed);
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
    const result = await validateFiles(source, target, sourceLocale, targetLocale);
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatReport(target, result));
    }
    process.exit(result.passed ? 0 : 1);
  }
}

main();
