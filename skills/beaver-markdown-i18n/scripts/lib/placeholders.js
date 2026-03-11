import fs from 'fs/promises';
import path from 'path';

export const PLACEHOLDER_RE = /%%(?:P\d+|CB_[A-Za-z0-9_]+)%%/g;

function lineAndColumnAt(text, index) {
  const upToIndex = text.slice(0, index);
  const lines = upToIndex.split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

export function findPlaceholderOccurrences(text) {
  const occurrences = [];
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const { line, column } = lineAndColumnAt(text, match.index || 0);
    occurrences.push({
      token: match[0],
      index: match.index || 0,
      line,
      column,
    });
  }
  return occurrences;
}

export function checkTextForPlaceholders(text) {
  const occurrences = findPlaceholderOccurrences(text);
  return {
    passed: occurrences.length === 0,
    count: occurrences.length,
    occurrences,
  };
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
      files.push({ full, rel: path.relative(baseDir, full) });
    }
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

export async function scanTranslationPathForPlaceholders(targetPath) {
  const stat = await fs.stat(targetPath);
  const results = [];

  if (stat.isDirectory()) {
    const files = await findMarkdownFiles(targetPath, targetPath);
    for (const file of files) {
      const content = await fs.readFile(file.full, 'utf-8');
      results.push({
        path: file.full,
        relPath: file.rel,
        ...checkTextForPlaceholders(content),
      });
    }
  } else {
    const content = await fs.readFile(targetPath, 'utf-8');
    results.push({
      path: targetPath,
      relPath: path.basename(targetPath),
      ...checkTextForPlaceholders(content),
    });
  }

  return {
    passed: results.every(result => result.passed),
    files: results,
  };
}

export function scanTmForPlaceholders(tm) {
  const entries = [];

  for (const [key, entry] of tm.entries) {
    const translated = entry.translated || '';
    const check = checkTextForPlaceholders(translated);
    if (check.passed) continue;

    entries.push({
      key,
      segmentId: entry.segment_id || '',
      sourcePath: entry.source_path || '',
      occurrences: check.occurrences,
      translatedPreview: translated.slice(0, 120).replace(/\n/g, ' '),
    });
  }

  return {
    passed: entries.length === 0,
    entries,
  };
}
