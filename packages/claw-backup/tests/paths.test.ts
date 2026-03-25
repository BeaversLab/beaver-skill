import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import {
  isAbsolutePath,
  looksLikePath,
  isArchivePath,
  resolveRulePath,
  ruleFileExists,
  expandHome,
  sanitizeName,
  currentTimestamp,
} from '../src/paths.js';

test('isAbsolutePath detects absolute paths correctly', () => {
  // Unix absolute paths
  assert.equal(isAbsolutePath('/tmp/test'), true);
  assert.equal(isAbsolutePath('/Users/test/file.yaml'), true);
  assert.equal(isAbsolutePath('/'), true);

  // Relative paths
  assert.equal(isAbsolutePath('relative/path'), false);
  assert.equal(isAbsolutePath('./file.yaml'), false);
  assert.equal(isAbsolutePath('../file.yaml'), false);
  assert.equal(isAbsolutePath('file.yaml'), false);
});

test('looksLikePath detects path-like strings', () => {
  // Path-like (contains separator)
  assert.equal(looksLikePath('./file.yaml'), true);
  assert.equal(looksLikePath('../file.yaml'), true);
  assert.equal(looksLikePath('relative/path'), true);
  assert.equal(looksLikePath('a/b/c'), true);

  // Not path-like (simple names)
  assert.equal(looksLikePath('myfile'), false);
  assert.equal(looksLikePath('my-rule-name'), false);
  assert.equal(looksLikePath('openclaw_20260325'), false);
});

test('isArchivePath detects tar.gz files', () => {
  // Archive files
  assert.equal(isArchivePath('backup.tar.gz'), true);
  assert.equal(isArchivePath('/path/to/backup.tar.gz'), true);
  assert.equal(isArchivePath('archive.tgz'), true);

  // Non-archive files
  assert.equal(isArchivePath('backup.zip'), false);
  assert.equal(isArchivePath('file.yaml'), false);
  assert.equal(isArchivePath('file.tar'), false);
  assert.equal(isArchivePath('file.gz'), false);
});

test('expandHome handles ~ expansion', () => {
  assert.equal(expandHome('~'), os.homedir());
  assert.equal(expandHome('~/Documents'), path.join(os.homedir(), 'Documents'));
  assert.ok(expandHome('~/').startsWith(os.homedir()));
  assert.equal(expandHome('/absolute/path'), '/absolute/path');
  assert.equal(expandHome('relative/path'), 'relative/path');
});

test('sanitizeName normalizes names', () => {
  assert.equal(sanitizeName('My Rule Name'), 'my-rule-name');
  assert.equal(sanitizeName('MyRuleName'), 'myrulename');
  assert.equal(sanitizeName('my_rule_name'), 'my_rule_name');
  assert.equal(sanitizeName('  spaced  '), 'spaced');
  assert.equal(sanitizeName('UPPERCASE'), 'uppercase');
  assert.equal(sanitizeName('rule@#$%name'), 'rule-name');
  assert.equal(sanitizeName(''), 'custom-claw');
  assert.equal(sanitizeName('   '), 'custom-claw');
});

test('currentTimestamp returns valid format', () => {
  const ts = currentTimestamp();
  assert.match(ts, /^\d{12}$/); // YYYYMMDDHHmm format
});

test('resolveRulePath handles absolute paths', async () => {
  const absPath = '/tmp/test/rule.yaml';
  const result = await resolveRulePath(absPath);
  assert.equal(result, absPath);
});

test('resolveRulePath handles relative paths', async () => {
  const relPath = './test/rule.yaml';
  const result = await resolveRulePath(relPath);
  assert.equal(result, path.resolve(relPath));
});

test('resolveRulePath handles names by looking in RULES_DIR', async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), 'beaver-claw-paths-test-'));

  try {
    // Create a temporary rules directory structure
    const rulesDir = path.join(baseDir, 'rules');
    await mkdir(rulesDir, { recursive: true });
    const rulePath = path.join(rulesDir, 'test-rule.yaml');
    await writeFile(rulePath, 'version: 1\n', 'utf8');

    // We can't easily mock RULES_DIR, so we test the error case
    // for a non-existent name
    await assert.rejects(async () => resolveRulePath('nonexistent-rule-name-xyz'), {
      message: /Rule file not found/,
    });
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test('ruleFileExists returns correct status', async () => {
  // Test with a name that likely doesn't exist
  const exists = await ruleFileExists('nonexistent-rule-xyz-12345');
  assert.equal(exists, false);
});

test('resolveRulePath error message suggests relative path syntax', async () => {
  try {
    await resolveRulePath('nonexistent-rule-name-for-error-test');
    assert.fail('Should have thrown');
  } catch (error) {
    assert(error instanceof Error);
    assert.match(error.message, /\.\//); // Contains "./" suggestion
  }
});
