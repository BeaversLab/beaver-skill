import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import ignore from 'ignore';
import type { BackupResult, BackupRule, RestoreResult } from './types.js';
import { currentTimestamp } from './paths.js';

function normalizeRelativePath(input: string): string {
  const value = input
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
  return value || '.';
}

function runTar(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `tar exited with code ${code}`));
    });
  });
}

async function gatherFiles(
  baseDir: string,
  relativePath: string,
  matcher: ReturnType<typeof ignore>
): Promise<string[]> {
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = normalized === '.' ? baseDir : path.join(baseDir, normalized);
  const entry = await stat(absolutePath).catch(() => null);
  if (!entry) {
    return [];
  }

  const relativeForMatch = normalized === '.' ? '' : normalized;
  if (relativeForMatch && matcher.ignores(relativeForMatch)) {
    return [];
  }

  if (entry.isFile()) {
    return relativeForMatch ? [relativeForMatch] : [];
  }

  if (!entry.isDirectory()) {
    return [];
  }

  const results: string[] = [];
  const children = await readdir(absolutePath, { withFileTypes: true });
  for (const child of children) {
    const childRelative = relativeForMatch ? `${relativeForMatch}/${child.name}` : child.name;
    const childNormalized = child.isDirectory() ? `${childRelative}/` : childRelative;
    if (matcher.ignores(childNormalized) || matcher.ignores(childRelative)) {
      continue;
    }
    if (child.isDirectory()) {
      const nested = await gatherFiles(baseDir, childRelative, matcher);
      if (nested.length === 0) {
        results.push(childRelative);
      } else {
        results.push(...nested);
      }
      continue;
    }
    if (child.isFile()) {
      results.push(childRelative);
    }
  }
  return results;
}

async function createManifest(
  entries: string[]
): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'beaver-claw-backup-'));
  const filePath = path.join(tempDir, 'manifest.txt');
  await writeFile(filePath, `${entries.join('\n')}\n`, 'utf8');
  return {
    filePath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

export async function createBackup(
  rulePath: string,
  rule: BackupRule,
  ruleName: string
): Promise<BackupResult> {
  const matcher = ignore().add(rule.exclude);
  const files = new Set<string>();
  for (const includeEntry of rule.include) {
    const gathered = await gatherFiles(rule.sourceDir, includeEntry, matcher);
    for (const file of gathered) {
      files.add(file);
    }
  }

  if (files.size === 0) {
    throw new Error('No files matched the current include/exclude rules.');
  }

  const ruleBackupDir = path.join(rule.backupDir, ruleName);
  await mkdir(ruleBackupDir, { recursive: true });
  const archiveName = `${currentTimestamp()}.tar.gz`;
  const archivePath = path.join(ruleBackupDir, archiveName);
  const manifest = await createManifest(Array.from(files).sort());
  try {
    await runTar(['-czf', archivePath, '-C', rule.sourceDir, '-T', manifest.filePath]);
  } finally {
    await manifest.cleanup();
  }

  return {
    archivePath,
    fileCount: files.size,
    rulePath,
  };
}

export async function listArchives(backupDir: string, ruleName: string): Promise<string[]> {
  const ruleBackupDir = path.join(backupDir, ruleName);
  const entries = await readdir(ruleBackupDir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tar.gz'))
    .map((entry) => path.join(ruleBackupDir, entry.name));
  files.sort((left, right) => right.localeCompare(left));
  return files;
}

export async function restoreArchive(
  archivePath: string,
  targetDir: string
): Promise<RestoreResult> {
  await mkdir(targetDir, { recursive: true });
  await runTar(['-xzf', archivePath, '-C', targetDir]);
  return {
    archivePath,
    targetDir,
  };
}
