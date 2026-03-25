import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { saveRule, createRuleFile, loadRule } from '../src/rules.js';
import type { BackupRule, CreateRuleResult } from '../src/types.js';

const testRule: BackupRule = {
  version: 1,
  clawType: 'test-claw',
  createdAt: '2026-03-25T12:00:00.000Z',
  sourceDir: '/tmp/test-source',
  backupDir: '/tmp/test-backups',
  restoreDir: '/tmp/test-source',
  include: ['data/', 'config.json'],
  exclude: ['*.log'],
  archivePrefix: 'testclaw',
};

test('saveRule creates file with custom name', async () => {
  const customName = `test-custom-${Date.now()}`;
  let rulePath: string | undefined;

  try {
    rulePath = await saveRule(testRule, { customName });
    assert.match(rulePath, new RegExp(`${customName}\\.yaml$`));

    // Verify content
    const loaded = await loadRule(rulePath);
    assert.equal(loaded.clawType, testRule.clawType);
  } finally {
    if (rulePath) await rm(rulePath).catch(() => {});
  }
});

test('saveRule rejects duplicate custom names', async () => {
  const customName = `test-dup-${Date.now()}`;
  let rulePath: string | undefined;

  try {
    rulePath = await saveRule(testRule, { customName });

    // Second save with same name should fail
    await assert.rejects(
      async () => saveRule(testRule, { customName }),
      {
        message: /already exists/,
      }
    );
  } finally {
    if (rulePath) await rm(rulePath).catch(() => {});
  }
});

test('saveRule creates timestamp-based name without customName', async () => {
  let rulePath: string | undefined;

  try {
    rulePath = await saveRule(testRule);
    assert.match(rulePath, /test-claw_\d{12}\.yaml$/);

    const loaded = await loadRule(rulePath);
    assert.equal(loaded.clawType, testRule.clawType);
  } finally {
    if (rulePath) await rm(rulePath).catch(() => {});
  }
});

test('saveRule includes comment when provided', async () => {
  const customName = `test-comment-${Date.now()}`;
  let rulePath: string | undefined;

  try {
    rulePath = await saveRule(testRule, {
      customName,
      includeComment: 'This is a test comment.',
    });

    const content = await readFile(rulePath, 'utf8');
    assert.match(content, /# This is a test comment\./);
  } finally {
    if (rulePath) await rm(rulePath).catch(() => {});
  }
});

test('createRuleFile supports customName parameter', async () => {
  const customName = `test-create-${Date.now()}`;
  let result: CreateRuleResult | undefined;

  try {
    result = await createRuleFile({
      presetId: 'openclaw',
      customName,
    });

    assert.match(result.rulePath, new RegExp(`${customName}\\.yaml$`));
    assert.equal(result.needsManualEditing, false);
    assert.equal(result.rule.clawType, 'openclaw');
  } finally {
    if (result?.rulePath) await rm(result.rulePath).catch(() => {});
  }
});

test('createRuleFile creates custom rule with customName', async () => {
  const customName = `test-custom-rule-${Date.now()}`;
  let result: CreateRuleResult | undefined;

  try {
    result = await createRuleFile({
      presetId: 'other',
      clawType: 'MyCustomType',
      sourceDir: '~/.mycustom',
      backupDir: '~/backups',
      customName,
    });

    assert.match(result.rulePath, new RegExp(`${customName}\\.yaml$`));
    assert.equal(result.needsManualEditing, true);
    assert.equal(result.rule.clawType, 'mycustomtype');
  } finally {
    if (result?.rulePath) await rm(result.rulePath).catch(() => {});
  }
});
