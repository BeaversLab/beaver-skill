#!/usr/bin/env node
/**
 * Validate i18n markdown translation quality.
 *
 * Usage:
 *   node validate.js <source.md> <target.md> [--source-locale en] [--target-locale zh]
 *   node validate.js --dir <source_dir> <target_dir> [--source-locale en] [--target-locale zh]
 *
 * Checks:
 * - Structure match (headings, code blocks, lists)
 * - Code block preservation
 * - Link integrity and localization
 * - Frontmatter key match
 * - Terminology compliance (no-translate + consistency)
 * - Untranslated content detection
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { findI18nDir, readNoTranslateConfig } from './read-no-translate.js';

// ---------------------------------------------------------------------------
// Locale detection
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

function extractLinks(content) {
  return [...content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m => ({
    text: m[1],
    url: m[2]
  }));
}

function isInternalLink(url) {
  if (!url.startsWith('/')) return false;
  if (url.startsWith('http://') || url.startsWith('https://')) return false;
  return true;
}

function isExternalLink(url) {
  return url.startsWith('http://') || url.startsWith('https://');
}

function extractFrontmatterKeys(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const keys = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) keys[line.slice(0, colonIdx).trim()] = true;
  }
  return keys;
}

/**
 * Extract text outside code blocks for language detection.
 */
function extractProseLines(content) {
  const lines = content.split('\n');
  const prose = [];
  let inCode = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (!inCode) {
      prose.push({ lineNum: i + 1, text: lines[i] });
    }
  }
  return prose;
}

function extractStructure(content) {
  return {
    headings: [...content.matchAll(/^(#{1,6})\s+(.+)$/gm)].map(m => [m[1], m[2]]),
    codeBlocks: [...content.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map(m => [m[1], m[2]]),
    links: extractLinks(content),
    listItems: [...content.matchAll(/^[-*]\s+(.+)$/gm)].map(m => m[1]),
    frontmatter: extractFrontmatterKeys(content)
  };
}

// ---------------------------------------------------------------------------
// Terminology loading
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkStructure(src, tgt) {
  const errors = [];
  const warnings = [];

  if (src.headings.length !== tgt.headings.length) {
    errors.push(`Heading count mismatch: source=${src.headings.length}, target=${tgt.headings.length}`);
  }

  if (src.codeBlocks.length !== tgt.codeBlocks.length) {
    errors.push(`Code block count mismatch: source=${src.codeBlocks.length}, target=${tgt.codeBlocks.length}`);
  } else {
    for (let i = 0; i < src.codeBlocks.length; i++) {
      const [srcLang, srcCode] = src.codeBlocks[i];
      const [tgtLang, tgtCode] = tgt.codeBlocks[i];
      if (srcLang !== tgtLang) {
        errors.push(`Code block ${i + 1} language mismatch: source='${srcLang}', target='${tgtLang}'`);
      }
      if (srcCode.trim() !== tgtCode.trim()) {
        errors.push(`Code block ${i + 1} content changed (should be identical)`);
      }
    }
  }

  if (src.links.length !== tgt.links.length) {
    warnings.push(`Link count mismatch: source=${src.links.length}, target=${tgt.links.length}`);
  }

  const srcKeys = new Set(Object.keys(src.frontmatter));
  const tgtKeys = new Set(Object.keys(tgt.frontmatter));
  const missing = [...srcKeys].filter(k => !tgtKeys.has(k));
  const extra = [...tgtKeys].filter(k => !srcKeys.has(k));
  if (missing.length > 0) errors.push(`Missing frontmatter keys: ${missing.join(', ')}`);
  if (extra.length > 0) warnings.push(`Extra frontmatter keys: ${extra.join(', ')}`);

  if (Math.abs(src.listItems.length - tgt.listItems.length) > 2) {
    warnings.push(`List item count differs significantly: source=${src.listItems.length}, target=${tgt.listItems.length}`);
  }

  return { errors, warnings };
}

function checkLinks(srcLinks, tgtLinks, sourceLocale, targetLocale) {
  const warnings = [];

  for (const tl of tgtLinks) {
    if (isInternalLink(tl.url)) {
      if (sourceLocale && tl.url.startsWith(`/${sourceLocale}/`)) {
        warnings.push(`Link still uses source locale: "${tl.url}" (should use /${targetLocale}/)`);
      } else if (targetLocale) {
        const prefix = `/${targetLocale}/`;
        if (!tl.url.startsWith(prefix) && !tl.url.match(/^\/[a-z]{2}\//)) {
          warnings.push(`Internal link missing locale prefix: "${tl.url}" (expected /${targetLocale}/...)`);
        }
      }
    }
  }

  if (sourceLocale && targetLocale) {
    for (const sl of srcLinks) {
      if (!isInternalLink(sl.url)) continue;
      let expected;
      if (sl.url.startsWith(`/${sourceLocale}/`)) {
        expected = sl.url.replace(`/${sourceLocale}/`, `/${targetLocale}/`);
      } else if (!sl.url.match(/^\/[a-z]{2}\//)) {
        expected = `/${targetLocale}${sl.url}`;
      } else {
        expected = sl.url;
      }
      if (!tgtLinks.some(t => t.url === expected)) {
        warnings.push(`Missing localized link: source="${sl.url}" → expected="${expected}"`);
      }
    }
  }

  return warnings;
}

/**
 * Detect untranslated content.
 * Heuristic: lines of mostly Latin text in a CJK target, or CJK text in a Latin target.
 */
function checkUntranslated(targetContent, targetLocale) {
  const warnings = [];
  if (!targetLocale) return warnings;

  const cjkLocales = new Set(['zh', 'ja', 'ko']);
  const expectCjk = cjkLocales.has(targetLocale);

  const prose = extractProseLines(targetContent);

  // Accumulate consecutive suspect lines
  let suspectStart = null;
  let suspectCount = 0;

  for (const { lineNum, text } of prose) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed.startsWith('-') || trimmed.startsWith('!') || trimmed.startsWith('[')) {
      flushSuspect();
      continue;
    }

    // Skip lines that are mostly inline code or links
    const withoutCode = trimmed.replace(/`[^`]+`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    if (withoutCode.trim().length < 10) {
      flushSuspect();
      continue;
    }

    if (expectCjk) {
      // Target should contain CJK — flag lines that are purely Latin
      const hasCjk = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(withoutCode);
      if (!hasCjk) {
        if (suspectStart === null) suspectStart = lineNum;
        suspectCount++;
      } else {
        flushSuspect();
      }
    } else {
      // Target is Latin — flag lines that are mostly CJK
      const cjkChars = (withoutCode.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
      if (cjkChars > withoutCode.length * 0.3) {
        if (suspectStart === null) suspectStart = lineNum;
        suspectCount++;
      } else {
        flushSuspect();
      }
    }
  }
  flushSuspect();

  function flushSuspect() {
    if (suspectCount >= 2 && suspectStart !== null) {
      const endLine = suspectStart + suspectCount - 1;
      warnings.push(`Possible untranslated content at lines ${suspectStart}-${endLine}`);
    }
    suspectStart = null;
    suspectCount = 0;
  }

  return warnings;
}

/**
 * Check terminology compliance against no-translate and consistency configs.
 */
function checkTerminology(targetContent, targetLocale, noTranslateConfig, consistencyConfig) {
  const errors = [];
  const warnings = [];

  if (!targetLocale) return { errors, warnings };

  const prose = extractProseLines(targetContent);

  // Check no-translate terms: these should appear as-is in the target
  if (noTranslateConfig?.terms) {
    for (const rule of noTranslateConfig.terms) {
      if (!rule.text) continue;
      // Build common mistranslations to detect
      const term = rule.text;
      const knownBadTranslations = getCommonMistranslations(term, targetLocale);
      for (const bad of knownBadTranslations) {
        for (const { lineNum, text } of prose) {
          // Skip code spans
          const withoutCode = text.replace(/`[^`]+`/g, '');
          if (withoutCode.includes(bad)) {
            errors.push(`Terminology (line ${lineNum}): "${term}" should NOT be translated (found "${bad}")`);
            break;
          }
        }
      }
    }
  }

  // Check consistency terms: verify correct translations are used
  if (consistencyConfig?.translations) {
    for (const [key, mappings] of Object.entries(consistencyConfig.translations)) {
      const expectedTranslation = mappings[targetLocale];
      if (!expectedTranslation) continue;

      // Check other locale values are not used instead
      const otherTranslations = Object.entries(mappings)
        .filter(([locale]) => locale !== targetLocale && locale !== 'en')
        .map(([, val]) => val);

      for (const wrong of otherTranslations) {
        for (const { lineNum, text } of prose) {
          const withoutCode = text.replace(/`[^`]+`/g, '');
          if (withoutCode.includes(wrong)) {
            warnings.push(`Consistency (line ${lineNum}): "${key}" should be "${expectedTranslation}", found "${wrong}"`);
            break;
          }
        }
      }
    }
  }

  return { errors, warnings };
}

/**
 * Return common mistranslations for terms that should stay in English.
 */
function getCommonMistranslations(term, targetLocale) {
  if (targetLocale !== 'zh') return [];

  const map = {
    'API': ['应用程序接口', '应用接口'],
    'CLI': ['命令行接口', '命令行界面', '命令行工具'],
    'URL': ['网址', '链接地址'],
    'UI': ['用户界面', '界面'],
    'OAuth': ['开放授权'],
    'JWT': ['令牌'],
    'webhook': ['网络钩子', '回调钩子'],
    'Gateway': ['网关'],
  };

  return map[term] || [];
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------

async function validatePair(sourceContent, targetContent, sourceLocale, targetLocale, cwd) {
  const errors = [];
  const warnings = [];
  const sections = {};

  const src = extractStructure(sourceContent);
  const tgt = extractStructure(targetContent);

  // 1. Structure
  const structResult = checkStructure(src, tgt);
  errors.push(...structResult.errors);
  warnings.push(...structResult.warnings);
  sections.structure = {
    pass: structResult.errors.length === 0,
    detail: `headings: ${tgt.headings.length}/${src.headings.length}, code blocks: ${tgt.codeBlocks.length}/${src.codeBlocks.length}`
  };

  // 2. Code blocks (already checked inside checkStructure, summarize)
  const codeBlockErrors = structResult.errors.filter(e => e.includes('Code block'));
  sections.codeBlocks = {
    pass: codeBlockErrors.length === 0,
    detail: codeBlockErrors.length === 0 ? 'All code blocks preserved' : `${codeBlockErrors.length} issue(s)`
  };

  // 3. Links
  const linkWarnings = checkLinks(src.links, tgt.links, sourceLocale, targetLocale);
  warnings.push(...linkWarnings);
  sections.links = {
    pass: linkWarnings.length === 0,
    detail: `${tgt.links.length}/${src.links.length} links${linkWarnings.length > 0 ? `, ${linkWarnings.length} issue(s)` : ''}`
  };

  // 4. Terminology
  const { noTranslate, consistency } = await loadTerminologyConfig(cwd || process.cwd());
  const termResult = checkTerminology(targetContent, targetLocale, noTranslate, consistency);
  errors.push(...termResult.errors);
  warnings.push(...termResult.warnings);
  sections.terminology = {
    pass: termResult.errors.length === 0,
    detail: termResult.errors.length === 0 && termResult.warnings.length === 0
      ? 'Terminology compliant'
      : `${termResult.errors.length} error(s), ${termResult.warnings.length} warning(s)`
  };

  // 5. Untranslated content
  const untranslatedWarnings = checkUntranslated(targetContent, targetLocale);
  warnings.push(...untranslatedWarnings);
  sections.untranslated = {
    pass: untranslatedWarnings.length === 0,
    detail: untranslatedWarnings.length === 0 ? 'No untranslated blocks detected' : `${untranslatedWarnings.length} suspect region(s)`
  };

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    sections,
    localeInfo: { sourceLocale, targetLocale }
  };
}

function formatReport(filePath, result) {
  const lines = [`=== Quality Report: ${filePath} ===`];

  for (const [name, sec] of Object.entries(result.sections)) {
    const status = sec.pass ? 'PASS' : 'FAIL';
    lines.push(`${status}: ${name} (${sec.detail})`);
  }

  for (const e of result.errors) lines.push(`  ERROR: ${e}`);
  for (const w of result.warnings) lines.push(`  WARN: ${w}`);

  const verdict = result.passed ? 'PASSED' : 'FAILED';
  lines.push(`RESULT: ${verdict} (${result.errors.length} error(s), ${result.warnings.length} warning(s))`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// File and directory validation
// ---------------------------------------------------------------------------

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
        passed: false,
        errors: [`Target file missing: ${tgtFile}`],
        warnings: [],
        sections: {},
        localeInfo: { sourceLocale, targetLocale }
      };
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

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
      console.log('Checks: structure, code blocks, links, terminology, untranslated content');
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
