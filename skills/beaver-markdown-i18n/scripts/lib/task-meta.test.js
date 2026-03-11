import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { findFileDirForTarget, saveTaskMeta, targetKeyFor } from './task-meta.js';

test('findFileDirForTarget resolves the per-file work directory under runs', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'beaver-i18n-task-meta-'));
  const i18nDir = path.join(projectDir, '.i18n');
  const relPath = 'guides/setup.md';
  const target = path.join(projectDir, 'docs', 'zh', 'guides', 'setup.md');
  const runDir = path.join(i18nDir, 'runs', '20260311-140000');
  const fileDir = path.join(runDir, targetKeyFor(relPath, target));

  await saveTaskMeta(fileDir, {
    target,
    rel_path: relPath,
    source_locale: 'en',
    target_locale: 'zh',
    placeholders: {},
  });

  const match = await findFileDirForTarget(i18nDir, target, { relPath });

  assert.ok(match);
  assert.equal(match.fileDir, fileDir);

  await fs.rm(projectDir, { recursive: true, force: true });
});
