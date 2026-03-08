/**
 * Shared logic for translation plan management.
 *
 * Handles loading, saving, filtering, status updates, summary recalculation,
 * and run-directory lifecycle for `.i18n/translation-plan.yaml`.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// YAML I/O
// ---------------------------------------------------------------------------

const YAML_OPTS = { indent: 2, lineWidth: -1, noRefs: true };

export async function loadPlan(planPath) {
  const raw = await fs.readFile(planPath, 'utf-8');
  return yaml.load(raw);
}

export async function savePlan(plan, planPath) {
  recalcSummary(plan);
  const content = yaml.dump(plan, YAML_OPTS);
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, content, 'utf-8');
}

export function findPlanFile(projectDir) {
  return path.join(projectDir, '.i18n', 'translation-plan.yaml');
}

export async function planExists(planPath) {
  try {
    await fs.access(planPath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Empty plan skeleton
// ---------------------------------------------------------------------------

export function createEmptyPlan(sourceDir, lang) {
  return {
    meta: {
      created: new Date().toISOString(),
      source_dir: sourceDir,
      target_dir: '',
      lang: lang || '',
      status: 'not_started',
      sync_from_commit: '',
      sync_to_commit: '',
      current_run: '',
    },
    summary: {
      total: 0,
      pending: 0,
      in_progress: 0,
      needs_update: 0,
      done: 0,
      deleted: 0,
    },
    files: [],
    log: [],
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function recalcSummary(plan) {
  const counts = { pending: 0, in_progress: 0, needs_update: 0, done: 0, deleted: 0 };
  for (const f of plan.files) {
    if (f.status in counts) counts[f.status]++;
  }
  plan.summary = { total: plan.files.length, ...counts };

  const actionable = counts.pending + counts.in_progress + counts.needs_update;
  if (plan.files.length === 0) {
    plan.meta.status = 'not_started';
  } else if (actionable === 0 && counts.done > 0) {
    plan.meta.status = 'completed';
  } else {
    plan.meta.status = 'in_progress';
  }
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export function filterFiles(plan, { status, match } = {}) {
  let files = plan.files;

  if (status) {
    const statuses = new Set(status.split(',').map(s => s.trim()));
    files = files.filter(f => statuses.has(f.status));
  }

  if (match) {
    const pattern = globToRegex(match);
    files = files.filter(f => pattern.test(f.source));
  }

  return files;
}

function globToRegex(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(escaped);
}

// ---------------------------------------------------------------------------
// File status updates
// ---------------------------------------------------------------------------

/**
 * Update the status of files matching `pattern`.
 * Returns the number of files updated.
 */
export function updateFileStatus(plan, pattern, newStatus, notes) {
  let count = 0;
  for (const file of plan.files) {
    if (file.source === pattern || file.source.endsWith(pattern) || file.source.includes(pattern)) {
      file.status = newStatus;
      if (notes !== undefined) file.notes = notes;
      plan.log.push({
        time: new Date().toISOString(),
        file: file.source,
        action: newStatus,
        notes: notes || '',
      });
      count++;
      break;
    }
  }
  return count;
}

/**
 * Batch-update files matching criteria.
 * Returns the number of files updated.
 */
export function batchUpdateStatus(plan, { from, to, match }) {
  const candidates = plan.files.filter(f => {
    if (from && f.status !== from) return false;
    if (match) {
      const pattern = globToRegex(match);
      if (!pattern.test(f.source)) return false;
    }
    return true;
  });
  for (const f of candidates) {
    f.status = to;
    plan.log.push({
      time: new Date().toISOString(),
      file: f.source,
      action: to,
      notes: `batch: ${from || '*'} -> ${to}`,
    });
  }
  return candidates.length;
}

/**
 * Add a file entry to the plan. Returns false if already present.
 */
export function addFile(plan, sourceFile, targetFile, sourceHash, status = 'pending') {
  const existing = plan.files.find(f => f.source === sourceFile);
  if (existing) return false;
  plan.files.push({
    source: sourceFile,
    target: targetFile,
    status,
    source_hash: sourceHash || '',
    target_hash: '',
    target_ratio: 0,
    notes: '',
  });
  return true;
}

// ---------------------------------------------------------------------------
// Run directory management
// ---------------------------------------------------------------------------

function formatTimestamp() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function createRunDir(i18nDir) {
  const ts = formatTimestamp();
  const runDir = path.join(i18nDir, 'runs', ts);
  await fs.mkdir(runDir, { recursive: true });
  return { ts, runDir };
}

export function getRunDir(plan, i18nDir) {
  const ts = plan.meta.current_run;
  if (!ts) return null;
  return path.join(i18nDir, 'runs', ts);
}

export async function cleanRunDir(i18nDir, runTs) {
  if (runTs) {
    const dir = path.join(i18nDir, 'runs', runTs);
    await fs.rm(dir, { recursive: true, force: true });
    return [dir];
  }
  const runsDir = path.join(i18nDir, 'runs');
  try {
    await fs.rm(runsDir, { recursive: true, force: true });
  } catch { /* ignore */ }
  return [runsDir];
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export async function computeFileHash(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return createHash('md5').update(content).digest('hex');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function gitExec(args, cwd = process.cwd()) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

export async function isGitRepo(cwd = process.cwd()) {
  try {
    await gitExec(['rev-parse', '--git-dir'], cwd);
    return true;
  } catch {
    return false;
  }
}

export async function getCurrentCommit(cwd = process.cwd()) {
  return gitExec(['rev-parse', 'HEAD'], cwd);
}

export async function verifyCommit(ref, cwd = process.cwd()) {
  try {
    await gitExec(['cat-file', '-t', ref], cwd);
    return true;
  } catch {
    return false;
  }
}

export async function getChangedFiles(fromRef, toRef, sourceDir, cwd = process.cwd()) {
  const output = await gitExec(
    ['diff', '--name-only', '--diff-filter=ACMR', fromRef, toRef, '--', sourceDir],
    cwd,
  );
  if (!output) return [];
  return output.split('\n').filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
}

export async function getDeletedFiles(fromRef, toRef, sourceDir, cwd = process.cwd()) {
  const output = await gitExec(
    ['diff', '--name-only', '--diff-filter=D', fromRef, toRef, '--', sourceDir],
    cwd,
  );
  if (!output) return [];
  return output.split('\n').filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

export async function findMarkdownFiles(dir, baseDir = dir) {
  const files = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await findMarkdownFiles(fullPath, baseDir)));
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
        files.push({
          relPath: path.relative(baseDir, fullPath),
          fullPath,
        });
      }
    }
  } catch { /* directory doesn't exist */ }
  return files;
}

// ---------------------------------------------------------------------------
// Sync: git mode
// ---------------------------------------------------------------------------

export async function syncGitMode(plan, sourceDir, fromCommit, toCommit, cwd = process.cwd()) {
  const changedFiles = await getChangedFiles(fromCommit, toCommit, sourceDir, cwd);
  const deletedFiles = await getDeletedFiles(fromCommit, toCommit, sourceDir, cwd);

  const changedRelPaths = new Set(changedFiles.map(f => path.relative(sourceDir, f)));
  const deletedRelPaths = new Set(deletedFiles.map(f => path.relative(sourceDir, f)));

  const sourceFiles = await findMarkdownFiles(sourceDir, sourceDir);
  const existingSourceSet = new Set(plan.files.map(f => f.source));

  const results = { added: 0, modified: 0, deleted: 0, unchanged: 0 };

  const hashPromises = sourceFiles.map(async f => [f.relPath, await computeFileHash(f.fullPath)]);
  const hashes = new Map(await Promise.all(hashPromises));

  for (const { relPath, fullPath } of sourceFiles) {
    const sourcePath = path.join(sourceDir, relPath);
    const targetPath = path.join(plan.meta.target_dir, relPath);
    const hash = hashes.get(relPath);

    if (changedRelPaths.has(relPath)) {
      const existing = plan.files.find(f => f.source === sourcePath);
      if (existing) {
        existing.status = 'needs_update';
        existing.source_hash = hash;
        existing.notes = 'MODIFIED';
        results.modified++;
      } else {
        addFile(plan, sourcePath, targetPath, hash, 'pending');
        const entry = plan.files[plan.files.length - 1];
        entry.notes = 'NEW';
        results.added++;
      }
      console.log(`  ${existing ? '* MODIFIED' : '+ NEW'}: ${relPath}`);
    }
    // UNCHANGED files are not recorded
  }

  for (const relPath of deletedRelPaths) {
    const sourcePath = path.join(sourceDir, relPath);
    const existing = plan.files.find(f => f.source === sourcePath);
    if (existing) {
      existing.status = 'deleted';
      existing.notes = 'DELETED';
      results.deleted++;
      console.log(`  - DELETED: ${relPath}`);
    }
  }

  // Check for new files not in git diff (files that exist but aren't in plan)
  for (const { relPath } of sourceFiles) {
    const sourcePath = path.join(sourceDir, relPath);
    if (!existingSourceSet.has(sourcePath) && !changedRelPaths.has(relPath)) {
      const hash = hashes.get(relPath);
      addFile(plan, sourcePath, path.join(plan.meta.target_dir, relPath), hash, 'pending');
      const entry = plan.files[plan.files.length - 1];
      entry.notes = 'NEW';
      results.added++;
      console.log(`  + NEW: ${relPath}`);
    }
  }

  plan.meta.sync_from_commit = fromCommit;
  plan.meta.sync_to_commit = toCommit;

  return results;
}

// ---------------------------------------------------------------------------
// Sync: hash mode
// ---------------------------------------------------------------------------

export async function syncHashMode(plan, sourceDir) {
  const sourceFiles = await findMarkdownFiles(sourceDir, sourceDir);
  const existingMap = new Map(plan.files.map(f => [f.source, f]));

  const results = { added: 0, modified: 0, deleted: 0, unchanged: 0 };

  const hashPromises = sourceFiles.map(async f => [f.relPath, await computeFileHash(f.fullPath)]);
  const hashes = new Map(await Promise.all(hashPromises));

  const seenSources = new Set();

  for (const { relPath } of sourceFiles) {
    const sourcePath = path.join(sourceDir, relPath);
    const targetPath = path.join(plan.meta.target_dir, relPath);
    const currentHash = hashes.get(relPath);
    seenSources.add(sourcePath);

    const existing = existingMap.get(sourcePath);
    if (!existing) {
      addFile(plan, sourcePath, targetPath, currentHash, 'pending');
      const entry = plan.files[plan.files.length - 1];
      entry.notes = 'NEW';
      results.added++;
      console.log(`  + NEW: ${relPath}`);
    } else if (existing.source_hash && currentHash !== existing.source_hash && existing.status === 'done') {
      existing.status = 'needs_update';
      existing.source_hash = currentHash;
      existing.notes = 'MODIFIED';
      results.modified++;
      console.log(`  * MODIFIED: ${relPath}`);
    }
    // UNCHANGED: not recorded / left as-is
  }

  // Detect deleted source files
  for (const [sourcePath, entry] of existingMap) {
    if (!seenSources.has(sourcePath) && entry.status !== 'deleted') {
      entry.status = 'deleted';
      entry.notes = 'DELETED';
      results.deleted++;
      const relPath = path.relative(sourceDir, sourcePath);
      console.log(`  - DELETED: ${relPath}`);
    }
  }

  return results;
}
