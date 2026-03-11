import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

function normalizeRelPath(relPath) {
  return (relPath || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function shortHash(input) {
  return createHash('sha1').update(input).digest('hex').slice(0, 10);
}

export function targetKeyFor(relPath, targetPath) {
  const normalized = normalizeRelPath(relPath) || path.basename(targetPath);
  return `${path.basename(targetPath)}@${shortHash(normalized)}`;
}

export function taskMetaPathForFileDir(fileDir) {
  return path.join(fileDir, 'task-meta.json');
}

export async function saveTaskMeta(fileDir, taskMeta) {
  const taskMetaPath = taskMetaPathForFileDir(fileDir);
  await fs.mkdir(fileDir, { recursive: true });
  await fs.writeFile(taskMetaPath, JSON.stringify(taskMeta, null, 2), 'utf-8');
  return taskMetaPath;
}

export async function loadTaskMeta(taskMetaPath) {
  try {
    return JSON.parse(await fs.readFile(taskMetaPath, 'utf-8'));
  } catch {
    return null;
  }
}

export async function loadTaskMetaForChunk(chunkFile) {
  const fileDir = path.dirname(chunkFile);
  const chunkMetaPath = chunkFile.replace(/\.md$/, '.meta.json');
  const [taskMeta, chunkMeta] = await Promise.all([
    loadTaskMeta(taskMetaPathForFileDir(fileDir)),
    loadTaskMeta(chunkMetaPath),
  ]);
  return { fileDir, taskMeta, chunkMeta };
}

async function listDirectories(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse();
  } catch {
    return [];
  }
}

async function maybeMatchTaskMeta(fileDir, targetPath, relPath) {
  const taskMeta = await loadTaskMeta(taskMetaPathForFileDir(fileDir));
  if (!taskMeta) return null;

  const resolvedTarget = path.resolve(targetPath);
  const normalizedRelPath = normalizeRelPath(relPath);
  const targetMatches = taskMeta.target && path.resolve(taskMeta.target) === resolvedTarget;
  const relPathMatches = normalizedRelPath && normalizeRelPath(taskMeta.rel_path) === normalizedRelPath;

  if (!targetMatches && !relPathMatches) return null;

  return { fileDir, taskMeta };
}

export async function findFileDirForTarget(i18nDir, targetPath, opts = {}) {
  const relPath = normalizeRelPath(opts.relPath);
  const runDir = opts.runDir;
  const basenamePrefix = `${path.basename(targetPath)}@`;
  const directKey = relPath ? targetKeyFor(relPath, targetPath) : null;

  const candidateDirs = [];
  if (runDir && directKey) {
    candidateDirs.push(path.join(runDir, directKey));
  }

  if (runDir) {
    const names = await listDirectories(runDir);
    for (const name of names) {
      if (name.startsWith(basenamePrefix)) {
        candidateDirs.push(path.join(runDir, name));
      }
    }
  }

  for (const fileDir of candidateDirs) {
    const match = await maybeMatchTaskMeta(fileDir, targetPath, relPath);
    if (match) return match;
  }

  const runsDir = path.join(i18nDir, 'runs');
  const runNames = await listDirectories(runsDir);
  for (const runName of runNames) {
    const currentRunDir = path.join(runsDir, runName);
    const dirNames = await listDirectories(currentRunDir);
    for (const dirName of dirNames) {
      if (!dirName.startsWith(basenamePrefix)) continue;
      const fileDir = path.join(currentRunDir, dirName);
      const match = await maybeMatchTaskMeta(fileDir, targetPath, relPath);
      if (match) return match;
    }
  }

  return null;
}

export async function loadTaskMetaForTarget(i18nDir, targetPath, opts = {}) {
  const match = await findFileDirForTarget(i18nDir, targetPath, opts);
  if (!match) return null;
  return match.taskMeta;
}
