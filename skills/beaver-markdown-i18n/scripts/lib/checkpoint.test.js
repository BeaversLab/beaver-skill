import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { checkpointChunk } from './checkpoint.js';
import { targetKeyFor } from './task-meta.js';

test('checkpointChunk restores placeholders before saving translated text to TM', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'beaver-i18n-checkpoint-'));
  const i18nDir = path.join(projectDir, '.i18n');
  const relPath = 'docs/guide.md';
  const fileDir = path.join(i18nDir, 'runs', '20260311-130000', targetKeyFor(relPath, 'guide.md'));
  const chunkFile = path.join(fileDir, 'chunk-001.md');
  const metaFile = chunkFile.replace(/\.md$/, '.meta.json');
  const tmFile = path.join(i18nDir, 'zh.tm.jsonl');

  await fs.mkdir(fileDir, { recursive: true });
  await fs.writeFile(
    path.join(fileDir, 'task-meta.json'),
    JSON.stringify({
      source_locale: 'en',
      target_locale: 'zh',
      source_dir: path.join(projectDir, 'docs', 'en'),
      target: path.join(projectDir, 'docs', 'zh', 'guide.md'),
      rel_path: relPath,
      placeholders: {
        '%%P1%%': '`foo`',
        '%%P2%%': 'https://example.com/docs',
      },
    }),
    'utf8',
  );

  await fs.writeFile(
    chunkFile,
    [
      '<!-- i18n:todo -->',
      '使用 %%P1%% 访问 %%P2%%',
      '<!-- /i18n:todo -->',
      '',
    ].join('\n'),
    'utf8',
  );

  await fs.writeFile(
    metaFile,
    JSON.stringify({
      rel_path: relPath,
      entries: [
        {
          segment_id: `${relPath}:paragraph:1`,
          text_hash: 'hash-1',
          text: 'Use %%P1%% to visit %%P2%%',
          source_path: relPath,
        },
      ],
    }),
    'utf8',
  );

  await checkpointChunk(chunkFile, { projectDir });

  const [entry] = (await fs.readFile(tmFile, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));

  assert.equal(entry.translated, '使用 `foo` 访问 https://example.com/docs');

  await fs.rm(projectDir, { recursive: true, force: true });
});
