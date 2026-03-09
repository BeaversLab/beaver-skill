#!/usr/bin/env node
/**
 * Merge translated chunk files back into the full skeleton target.
 *
 * After prepare.js splits a large file into chunks and the AI translates
 * each chunk, this script reassembles them into the target file.
 *
 * Usage:
 *   node scripts/merge-chunks.js <target> [options]
 *
 * Options:
 *   --project-dir   Project root for .i18n/ lookup (default: cwd)
 *   --dry-run       Show what would be merged without writing
 *
 * The script finds chunk files by matching the target filename in .i18n/chunks/.
 */

import fs from 'fs/promises';
import path from 'path';
import { findI18nDir } from './read-no-translate.js';

/**
 * Merge translated chunk files back into a single target.
 *
 * @param {string} target - target file path
 * @param {object} opts
 * @param {string} [opts.projectDir] - project root for .i18n/ lookup
 * @param {boolean} [opts.dryRun] - if true, skip writing
 * @returns {{ merged: string, chunkCount: number, chunkFiles: string[] }}
 */
export async function mergeChunks(target, opts = {}) {
  const projectDir = opts.projectDir || process.cwd();
  const dryRun = opts.dryRun || false;

  const i18nDir = await findI18nDir(projectDir);
  const effectiveI18nDir = i18nDir || path.join(projectDir, '.i18n');
  const chunksDir = path.join(effectiveI18nDir, 'chunks');

  let entries;
  try {
    entries = await fs.readdir(chunksDir);
  } catch {
    throw new Error(`No chunks directory found at ${chunksDir}`);
  }

  const basename = path.basename(target);
  const chunkFiles = entries
    .filter(f => f.includes(basename) && f.includes('.chunk-') && f.endsWith('.md'))
    .sort();

  if (chunkFiles.length === 0) {
    throw new Error(`No chunk files found for "${basename}" in ${chunksDir}. Expected pattern: <filename>.chunk-001.md, ...`);
  }

  console.log(`Found ${chunkFiles.length} chunk(s) for ${basename}:`);

  const parts = [];
  for (const f of chunkFiles) {
    const content = await fs.readFile(path.join(chunksDir, f), 'utf-8');
    parts.push(content);
    const todoCount = (content.match(/<!--\s*i18n:todo\s*-->/g) || []).length;
    const status = todoCount > 0 ? `${todoCount} TODO remaining` : 'OK';
    console.log(`  ${f} (${content.length} chars, ${status})`);
  }

  const merged = parts.join('\n');

  if (dryRun) {
    console.log(`\n[dry-run] Would write ${merged.length} chars to ${target}`);
  } else {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, merged, 'utf-8');
    console.log(`\n✓ Merged ${chunkFiles.length} chunks → ${target} (${merged.length} chars)`);
    console.log(`\nNext: node scripts/apply.js <source> ${target}`);
  }

  return { merged, chunkCount: chunkFiles.length, chunkFiles };
}

async function main() {
  const args = process.argv.slice(2);
  let target = null;
  let projectDir = process.cwd();
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-dir') { projectDir = args[++i]; }
    else if (args[i] === '--dry-run') { dryRun = true; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node scripts/merge-chunks.js <target> [options]');
      console.log('');
      console.log('Options:');
      console.log('  --project-dir   Project root for .i18n/ config lookup');
      console.log('  --dry-run       Show what would be merged without writing');
      process.exit(0);
    }
    else if (!target) { target = args[i]; }
  }

  if (!target) {
    console.error('Error: target path required. Use --help for usage.');
    process.exit(1);
  }

  await mergeChunks(target, { projectDir, dryRun });
}

const isDirectRun = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1].endsWith('/merge-chunks.js')
);
if (isDirectRun) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
