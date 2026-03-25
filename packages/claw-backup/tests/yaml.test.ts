import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { parseRuleYaml, serializeRule } from '../src/yaml.js';
import { createBackup, restoreArchive } from '../src/archive.js';
import type { BackupRule } from '../src/types.js';

const sampleRule: BackupRule = {
  version: 1,
  clawType: 'openclaw',
  createdAt: '2026-03-01T10:00:00.000Z',
  sourceDir: '/Users/test/.openclaw',
  backupDir: '/Users/test/openclaw-backups',
  restoreDir: '/Users/test/.openclaw',
  include: ['openclaw.json', 'workspace'],
  exclude: ['completions/', '*.log'],
  archivePrefix: 'openclaw',
};

test('serializeRule and parseRuleYaml round-trip rule data', () => {
  const raw = serializeRule(sampleRule);
  assert.match(raw, /^version: 1/m);
  assert.doesNotMatch(raw, /^\{/m);
  const parsed = parseRuleYaml(raw);
  assert.deepEqual(parsed, sampleRule);
});

test('exclude rules override included directories for matching files', async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), 'beaver-claw-backup-test-'));
  const sourceDir = path.join(baseDir, 'source');
  const backupDir = path.join(baseDir, 'backups');
  const restoreDir = path.join(baseDir, 'restore');

  try {
    await mkdir(path.join(sourceDir, 'a'), { recursive: true });
    await writeFile(path.join(sourceDir, 'a', 'keep.txt'), 'keep', 'utf8');
    await writeFile(path.join(sourceDir, 'a', 'skip.log'), 'skip', 'utf8');

    const rule: BackupRule = {
      version: 1,
      clawType: 'openclaw',
      createdAt: '2026-03-01T10:00:00.000Z',
      sourceDir,
      backupDir,
      restoreDir,
      include: ['a/'],
      exclude: ['a/*.log'],
      archivePrefix: 'openclaw',
    };

    const backup = await createBackup(path.join(baseDir, 'rule.yaml'), rule);
    await restoreArchive(backup.archivePath, restoreDir);

    const kept = await readFile(path.join(restoreDir, 'a', 'keep.txt'), 'utf8');
    await assert.rejects(readFile(path.join(restoreDir, 'a', 'skip.log'), 'utf8'));
    assert.equal(kept, 'keep');
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
