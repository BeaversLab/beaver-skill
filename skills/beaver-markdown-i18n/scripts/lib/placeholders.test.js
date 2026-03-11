import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runAllChecks } from './quality.js';
import { scanTranslationPathForPlaceholders, scanTmForPlaceholders } from './placeholders.js';

test('quality check reports leaked placeholders as errors', () => {
  const source = '# Title\n\nHello world.\n';
  const target = '# 标题\n\n保留了 %%P1%% 占位符。\n';

  const result = runAllChecks(source, target, {});

  assert.equal(result.passed, false);
  assert.ok(result.errors.some(error => error.includes('Placeholder leak')));
  assert.ok(result.sections.placeholders);
  assert.equal(result.sections.placeholders.pass, false);
});

test('scanTranslationPathForPlaceholders detects placeholders in markdown files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'beaver-placeholder-scan-'));
  const targetFile = path.join(dir, 'guide.md');
  await fs.writeFile(targetFile, '# Title\n\nContains %%P9%%\n', 'utf8');

  const result = await scanTranslationPathForPlaceholders(targetFile);

  assert.equal(result.passed, false);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].count, 1);
  assert.equal(result.files[0].occurrences[0].token, '%%P9%%');

  await fs.rm(dir, { recursive: true, force: true });
});

test('scanTmForPlaceholders detects leaked placeholders in translated TM entries', () => {
  const tm = {
    entries: new Map([
      ['k1', {
        segment_id: 'docs/a.md:1',
        source_path: 'docs/a.md',
        translated: '正常翻译',
      }],
      ['k2', {
        segment_id: 'docs/b.md:2',
        source_path: 'docs/b.md',
        translated: '残留 %%CB_abcd1234%% 占位符',
      }],
    ]),
  };

  const result = scanTmForPlaceholders(tm);

  assert.equal(result.passed, false);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].key, 'k2');
  assert.equal(result.entries[0].occurrences[0].token, '%%CB_abcd1234%%');
});
