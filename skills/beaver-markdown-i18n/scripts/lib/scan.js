/**
 * Target file scanning and translation completeness estimation.
 *
 * Scans target directory, computes per-file `target_ratio`
 * (targetChars / (englishChars + targetChars) after stripping code blocks), and
 * manages `.i18n/runs/<ts>/target-manifest.yaml`.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Language character patterns
// ---------------------------------------------------------------------------

export const LANG_PATTERNS = {
  zh: /[\u4e00-\u9fff\u3400-\u4dbf]/g,
  ja: /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff]/g,
  ko: /[\uac00-\ud7af\u1100-\u11ff]/g,
};

function getLangPattern(lang) {
  const base = lang.split('-')[0].toLowerCase();
  return LANG_PATTERNS[base] || LANG_PATTERNS.zh;
}

// ---------------------------------------------------------------------------
// target_ratio calculation
// ---------------------------------------------------------------------------

const FENCED_CODE_RE = /^(`{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm;
const ENGLISH_LETTER_RE = /[a-zA-Z]/g;

const CJK_WEIGHT = 3;

/**
 * Compute translation coverage ratio.
 * Formula: (CJK_WEIGHT * targetChars) / (CJK_WEIGHT * targetChars + englishChars)
 * CJK characters carry more information density per char than English letters,
 * so a weight of 3 normalizes the comparison.
 * Strips fenced code blocks but keeps frontmatter.
 * Returns a number between 0 and 1.
 */
export function computeTargetRatio(content, lang) {
  const stripped = content.replace(FENCED_CODE_RE, '');

  const pattern = getLangPattern(lang);
  const targetMatches = stripped.match(pattern);
  const targetChars = targetMatches ? targetMatches.length : 0;

  const englishMatches = stripped.match(ENGLISH_LETTER_RE);
  const englishChars = englishMatches ? englishMatches.length : 0;

  const weightedTarget = CJK_WEIGHT * targetChars;
  const total = weightedTarget + englishChars;
  if (total === 0) return 0;

  return Math.round((weightedTarget / total) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// File hash
// ---------------------------------------------------------------------------

export function computeFileHash(content) {
  return createHash('md5').update(content).digest('hex');
}

export async function computeFileHashFromPath(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return computeFileHash(content);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

async function findMarkdownFiles(dir, baseDir = dir) {
  const files = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await findMarkdownFiles(fullPath, baseDir)));
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
        files.push({ relPath: path.relative(baseDir, fullPath), fullPath });
      }
    }
  } catch { /* directory doesn't exist */ }
  return files;
}

/**
 * Scan target directory and compute per-file metrics.
 *
 * If `plan` is provided, reuses `target_hash` / `target_ratio` from plan
 * entries whose hash hasn't changed (avoids redundant computation).
 */
export async function scanTargetDir(targetDir, lang, plan) {
  const planIndex = new Map();
  if (plan?.files) {
    for (const f of plan.files) {
      if (f.target_hash && f.target_ratio != null) {
        planIndex.set(f.target, { hash: f.target_hash, ratio: f.target_ratio });
      }
    }
  }

  const targetFiles = await findMarkdownFiles(targetDir, targetDir);
  const results = [];

  for (const { relPath, fullPath } of targetFiles) {
    const content = await fs.readFile(fullPath, 'utf-8');
    const hash = computeFileHash(content);
    const lines = content.split('\n').length;

    const targetPath = path.join(targetDir, relPath);
    const cached = planIndex.get(targetPath);

    let ratio;
    if (cached && cached.hash === hash) {
      ratio = cached.ratio;
    } else {
      ratio = computeTargetRatio(content, lang);
    }

    results.push({ path: relPath, hash, lines, target_ratio: ratio });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Manifest I/O
// ---------------------------------------------------------------------------

export async function loadManifest(manifestPath) {
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    return yaml.load(raw);
  } catch {
    return null;
  }
}

export async function saveManifest(manifest, manifestPath) {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  const content = yaml.dump(manifest, { indent: 2, lineWidth: -1, noRefs: true });
  await fs.writeFile(manifestPath, content, 'utf-8');
}

/**
 * Build and save a full manifest object.
 */
export async function buildAndSaveManifest(targetDir, lang, plan, outputPath) {
  const files = await scanTargetDir(targetDir, lang, plan);

  const manifest = {
    scanned_at: new Date().toISOString(),
    target_dir: targetDir,
    lang,
    files,
  };

  await saveManifest(manifest, outputPath);
  return manifest;
}
