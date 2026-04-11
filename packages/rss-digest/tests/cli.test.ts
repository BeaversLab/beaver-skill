import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli, type DigestCliDeps } from '../src/cli.js';
import type { DigestConfigShape } from '../src/types.js';

function createConfig(outputDir?: string): DigestConfigShape {
  return {
    version: 2,
    llmApiKeyEnv: 'LLM_API_KEY',
    defaults: {
      hours: 48,
      topN: 5,
      language: 'zh',
      outputDir,
      reportTemplate: 'default',
    },
    llms: [
      {
        enabled: true,
        provider: 'mock',
        apiType: 'openai-compatible',
        baseUrl: 'https://example.com',
        model: 'mock-model',
      },
    ],
    categories: [{ id: 'other', emoji: '📝', label: 'Other' }],
    prompts: {
      scoring: 'score',
      summary: 'summary',
      highlights: 'highlights',
    },
    rssFeeds: [
      { name: 'Feed', xmlUrl: 'https://example.com/feed.xml', htmlUrl: 'https://example.com' },
    ],
  };
}

test('runCli defaults to stdout when defaults.outputDir is missing', async () => {
  const config = createConfig('');
  let captured: { stdout: boolean; outputPath: string } | null = null;

  const deps: DigestCliDeps<DigestConfigShape> = {
    configPath: '/tmp/config.yaml',
    defaultLlmApiKeyEnv: 'LLM_API_KEY',
    loadConfig: async () => config,
    initConfig: async () => ({ created: false, path: '/tmp/config.yaml' }),
    loadI18n: async () => ({ zh: {}, en: {} }),
    saveConfig: async () => {},
    validateConfig: async () => ({ errors: [], warnings: [] }),
    resolveConfiguredLlmApiKeyEnv: () => 'LLM_API_KEY',
    resolveConfiguredLlmApiKey: () => 'test-key',
    runDigest: async (options) => {
      captured = { stdout: options.stdout, outputPath: options.outputPath };
      return { outputPath: options.outputPath };
    },
  };

  await runCli(['run'], deps);

  assert.deepEqual(captured, { stdout: true, outputPath: '[stdout]' });
});

test('runCli writes to file when defaults.outputDir is configured', async () => {
  const config = createConfig('./output');
  let capturedStdout: boolean | undefined;
  let capturedOutputPath = '';

  const deps: DigestCliDeps<DigestConfigShape> = {
    configPath: '/tmp/config.yaml',
    defaultLlmApiKeyEnv: 'LLM_API_KEY',
    loadConfig: async () => config,
    initConfig: async () => ({ created: false, path: '/tmp/config.yaml' }),
    loadI18n: async () => ({ zh: {}, en: {} }),
    saveConfig: async () => {},
    validateConfig: async () => ({ errors: [], warnings: [] }),
    resolveConfiguredLlmApiKeyEnv: () => 'LLM_API_KEY',
    resolveConfiguredLlmApiKey: () => 'test-key',
    runDigest: async (options) => {
      capturedStdout = options.stdout;
      capturedOutputPath = options.outputPath;
      return { outputPath: options.outputPath };
    },
  };

  await runCli(['run'], deps);

  if (capturedStdout === undefined) {
    throw new Error('runDigest was not called');
  }
  assert.equal(capturedStdout, false);
  assert.match(capturedOutputPath, /^output\/digest-\d{8}\.md$/);
});
