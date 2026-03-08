#!/usr/bin/env node
/**
 * Create a sync plan by comparing source and target directories.
 *
 * Two detection modes:
 *
 * 1. Git diff (default when a previous plan with last_synced_commit exists):
 *    Compares last_synced_commit..HEAD for the source directory.
 *    Fast and precise — only files actually changed in git are marked.
 *
 * 2. Hash comparison (fallback, or forced with --no-git):
 *    Compares MD5 hashes of source files against stored hashes from the
 *    previous plan.
 *
 * Usage:
 *   node sync-plan.js <source_dir> <target_dir> [options]
 *
 * Options:
 *   --output, -o       Custom output path (default: <cwd>/.i18n/translation-plan.yaml)
 *   --prev-plan        Path to previous plan for hash/commit comparison
 *   --no-git           Force hash-based comparison even if git info is available
 *   --git-ref          Override: use this ref as the "last synced" commit instead of plan's
 *
 * Examples:
 *   node sync-plan.js en/ zh/
 *   node sync-plan.js en/ zh/ --git-ref abc1234
 *   node sync-plan.js en/ zh/ --no-git
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { createHash } from 'crypto';

const execFileAsync = promisify(execFile);

// --- git helpers ---

async function gitExec(args, cwd = process.cwd()) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

async function isGitRepo(cwd = process.cwd()) {
  try {
    await gitExec(['rev-parse', '--git-dir'], cwd);
    return true;
  } catch {
    return false;
  }
}

async function getCurrentCommit(cwd = process.cwd()) {
  return gitExec(['rev-parse', 'HEAD'], cwd);
}

async function getChangedFilesByGit(fromRef, toRef, sourceDir, cwd = process.cwd()) {
  const output = await gitExec(
    ['diff', '--name-only', '--diff-filter=ACMR', fromRef, toRef, '--', sourceDir],
    cwd,
  );
  if (!output) return [];
  return output.split('\n').filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
}

async function getDeletedFilesByGit(fromRef, toRef, sourceDir, cwd = process.cwd()) {
  const output = await gitExec(
    ['diff', '--name-only', '--diff-filter=D', fromRef, toRef, '--', sourceDir],
    cwd,
  );
  if (!output) return [];
  return output.split('\n').filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
}

// --- hash helpers ---

async function getFileHash(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return createHash('md5').update(content).digest('hex');
  } catch {
    return null;
  }
}

// --- filesystem ---

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
        files.push({
          relPath: path.relative(baseDir, fullPath),
          fullPath,
        });
      }
    }
  } catch {
    // directory doesn't exist or can't be read
  }
  return files;
}

// --- previous plan ---

async function loadPreviousPlan(planPath) {
  try {
    const content = await fs.readFile(planPath, 'utf-8');
    return yaml.load(content);
  } catch {
    return null;
  }
}

function extractPlanHashes(plan) {
  const hashMap = new Map();
  if (!plan?.files) return hashMap;
  for (const f of plan.files) {
    if (f.source_hash && (f.status === 'done' || f.status === 'needs_update')) {
      hashMap.set(f.source, f.source_hash);
    }
  }
  return hashMap;
}

// --- plan generation: git mode ---

async function createPlanGitMode(sourceDir, targetDir, fromCommit, outputPath, cwd) {
  const currentCommit = await getCurrentCommit(cwd);

  console.log(`\nGit diff mode:`);
  console.log(`  From: ${fromCommit.slice(0, 12)}`);
  console.log(`  To:   ${currentCommit.slice(0, 12)} (HEAD)`);
  console.log(`  Path: ${sourceDir}`);

  const changedFiles = await getChangedFilesByGit(fromCommit, currentCommit, sourceDir, cwd);
  const deletedFiles = await getDeletedFilesByGit(fromCommit, currentCommit, sourceDir, cwd);

  console.log(`\n  Changed/added: ${changedFiles.length} file(s)`);
  console.log(`  Deleted:       ${deletedFiles.length} file(s)`);

  const sourceFiles = await findMarkdownFiles(sourceDir, sourceDir);
  const targetFiles = await findMarkdownFiles(targetDir, targetDir);
  const targetSet = new Set(targetFiles.map(f => f.relPath));

  const changedRelPaths = new Set(changedFiles.map(f => path.relative(sourceDir, f)));
  const deletedRelPaths = new Set(deletedFiles.map(f => path.relative(sourceDir, f)));

  const planFiles = [];
  const summary = { total: 0, new: 0, deleted: 0, modified: 0, unchanged: 0, needs_action: 0 };

  // source files: changed or unchanged
  const hashPromises = sourceFiles.map(async f => [f.relPath, await getFileHash(f.fullPath)]);
  const hashes = new Map(await Promise.all(hashPromises));

  for (const { relPath } of sourceFiles) {
    const sourcePath = path.join(sourceDir, relPath);
    const targetPath = path.join(targetDir, relPath);
    const hash = hashes.get(relPath);
    const targetExists = targetSet.has(relPath);

    if (!targetExists) {
      summary.new++;
      planFiles.push({ source: sourcePath, target: targetPath, status: 'pending', source_hash: hash, notes: 'NEW' });
      console.log(`  + NEW: ${relPath}`);
    } else if (changedRelPaths.has(relPath)) {
      summary.modified++;
      planFiles.push({ source: sourcePath, target: targetPath, status: 'needs_update', source_hash: hash, notes: 'MODIFIED' });
      console.log(`  * MODIFIED: ${relPath}`);
    } else {
      summary.unchanged++;
      planFiles.push({ source: sourcePath, target: targetPath, status: 'done', source_hash: hash, notes: '' });
    }
    summary.total++;
  }

  // deleted files (in source between commits but target may still exist)
  for (const relPath of deletedRelPaths) {
    if (targetSet.has(relPath)) {
      summary.deleted++;
      summary.total++;
      planFiles.push({ source: null, target: path.join(targetDir, relPath), status: 'deleted', notes: 'DELETED' });
      console.log(`  - DELETED: ${relPath}`);
    }
  }

  summary.needs_action = summary.new + summary.modified + summary.deleted;
  const overallStatus = summary.needs_action === 0 ? 'completed' : 'in_progress';

  const plan = {
    meta: {
      created: new Date().toISOString(),
      source_dir: sourceDir,
      target_dir: targetDir,
      type: 'sync',
      mode: 'git',
      status: overallStatus,
      last_synced_commit: fromCommit,
      current_commit: currentCommit,
    },
    summary,
    files: planFiles,
    log: [],
  };

  await writePlan(plan, outputPath);
  return plan;
}

// --- plan generation: hash mode ---

async function createPlanHashMode(sourceDir, targetDir, prevHashes, outputPath) {
  console.log(`\nHash comparison mode`);

  const sourceFiles = await findMarkdownFiles(sourceDir, sourceDir);
  const targetFiles = await findMarkdownFiles(targetDir, targetDir);

  const sourceMap = new Map(sourceFiles.map(f => [f.relPath, f]));
  const targetMap = new Map(targetFiles.map(f => [f.relPath, f]));
  const allPaths = new Set([...sourceFiles.map(f => f.relPath), ...targetFiles.map(f => f.relPath)]);

  const hashPromises = sourceFiles.map(async f => [f.relPath, await getFileHash(f.fullPath)]);
  const currentHashes = new Map(await Promise.all(hashPromises));

  const planFiles = [];
  const summary = { total: 0, new: 0, deleted: 0, modified: 0, unchanged: 0, needs_action: 0 };

  let cwd;
  let currentCommit = null;
  try {
    cwd = process.cwd();
    if (await isGitRepo(cwd)) {
      currentCommit = await getCurrentCommit(cwd);
    }
  } catch { /* not in git repo */ }

  for (const relPath of Array.from(allPaths).sort()) {
    const sourceFile = sourceMap.get(relPath);
    const targetFile = targetMap.get(relPath);

    if (sourceFile && !targetFile) {
      summary.new++;
      planFiles.push({
        source: path.join(sourceDir, relPath),
        target: path.join(targetDir, relPath),
        status: 'pending',
        source_hash: currentHashes.get(relPath),
        notes: 'NEW',
      });
      console.log(`  + NEW: ${relPath}`);
    } else if (!sourceFile && targetFile) {
      summary.deleted++;
      planFiles.push({
        source: null,
        target: path.join(targetDir, relPath),
        status: 'deleted',
        notes: 'DELETED',
      });
      console.log(`  - DELETED: ${relPath}`);
    } else if (sourceFile && targetFile) {
      const currentHash = currentHashes.get(relPath);
      const prevHash = prevHashes.get(path.join(sourceDir, relPath));

      if (prevHash && currentHash !== prevHash) {
        summary.modified++;
        planFiles.push({
          source: path.join(sourceDir, relPath),
          target: path.join(targetDir, relPath),
          status: 'needs_update',
          source_hash: currentHash,
          prev_source_hash: prevHash,
          notes: 'MODIFIED',
        });
        console.log(`  * MODIFIED: ${relPath}`);
      } else {
        summary.unchanged++;
        planFiles.push({
          source: path.join(sourceDir, relPath),
          target: path.join(targetDir, relPath),
          status: 'done',
          source_hash: currentHash,
          notes: '',
        });
      }
    }
    summary.total++;
  }

  summary.needs_action = summary.new + summary.modified + summary.deleted;
  const overallStatus = summary.needs_action === 0 ? 'completed' : 'in_progress';

  const plan = {
    meta: {
      created: new Date().toISOString(),
      source_dir: sourceDir,
      target_dir: targetDir,
      type: 'sync',
      mode: 'hash',
      status: overallStatus,
      ...(currentCommit ? { current_commit: currentCommit } : {}),
    },
    summary,
    files: planFiles,
    log: [],
  };

  await writePlan(plan, outputPath);
  return plan;
}

// --- output ---

async function writePlan(plan, outputPath) {
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });
  const yamlContent = yaml.dump(plan, { indent: 2, lineWidth: -1, noRefs: true });
  await fs.writeFile(outputPath, yamlContent, 'utf-8');

  console.log(`\n✓ Sync plan created: ${outputPath}`);
  console.log(`\nSummary:`);
  console.log(`  New files:      ${plan.summary.new}`);
  console.log(`  Modified files: ${plan.summary.modified}`);
  console.log(`  Deleted files:  ${plan.summary.deleted}`);
  console.log(`  Unchanged:      ${plan.summary.unchanged}`);
  console.log(`  Total:          ${plan.summary.total}`);
  console.log(`\nActions needed: ${plan.summary.needs_action}`);

  if (plan.summary.deleted > 0) {
    console.log(`\n⚠️  ${plan.summary.deleted} file(s) deleted in source — review target files.`);
  }
}

// --- main ---

async function main() {
  const args = process.argv.slice(2);
  let sourceDir, targetDir, outputPath = null, prevPlanPath = null;
  let noGit = false, gitRefOverride = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[++i];
    } else if (args[i] === '--prev-plan') {
      prevPlanPath = args[++i];
    } else if (args[i] === '--no-git') {
      noGit = true;
    } else if (args[i] === '--git-ref') {
      gitRefOverride = args[++i];
    } else if (!sourceDir) {
      sourceDir = args[i];
    } else if (!targetDir) {
      targetDir = args[i];
    }
  }

  if (!sourceDir || !targetDir) {
    console.log('Usage: node sync-plan.js <source_dir> <target_dir> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --output, -o     Custom output path (default: <cwd>/.i18n/translation-plan.yaml)');
    console.log('  --prev-plan      Path to previous plan for comparison');
    console.log('  --no-git         Force hash-based comparison');
    console.log('  --git-ref        Use this commit as "last synced" (overrides plan value)');
    console.log('');
    console.log('Detects: + New, * Modified, - Deleted, = Unchanged');
    console.log('');
    console.log('Examples:');
    console.log('  node sync-plan.js en/ zh/');
    console.log('  node sync-plan.js en/ zh/ --git-ref abc1234');
    console.log('  node sync-plan.js en/ zh/ --no-git');
    process.exit(1);
  }

  const finalOutputPath = outputPath || path.join(process.cwd(), '.i18n', 'translation-plan.yaml');

  console.log(`Scanning directories...`);
  console.log(`  Source: ${sourceDir}`);
  console.log(`  Target: ${targetDir}`);
  console.log(`  Output: ${finalOutputPath}`);

  const effectivePrevPlanPath = prevPlanPath || finalOutputPath;
  const prevPlan = await loadPreviousPlan(effectivePrevPlanPath);

  // Decide mode: git (if repo + have a last_synced_commit or git-ref) or hash
  const inGitRepo = !noGit && (await isGitRepo());
  let fromCommit = gitRefOverride || prevPlan?.meta?.current_commit || null;

  if (inGitRepo && fromCommit) {
    // Verify the commit exists
    try {
      await gitExec(['cat-file', '-t', fromCommit]);
    } catch {
      console.log(`\n⚠️  Commit ${fromCommit} not found in repo, falling back to hash mode.`);
      fromCommit = null;
    }
  }

  if (inGitRepo && fromCommit) {
    await createPlanGitMode(sourceDir, targetDir, fromCommit, finalOutputPath, process.cwd());
  } else {
    if (!noGit && inGitRepo && !fromCommit) {
      console.log(`\n  No previous commit reference found — using hash comparison.`);
      console.log(`  (Next run will use git diff after this plan records the current commit.)`);
    }
    const prevHashes = prevPlan ? extractPlanHashes(prevPlan) : new Map();
    await createPlanHashMode(sourceDir, targetDir, prevHashes, finalOutputPath);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
