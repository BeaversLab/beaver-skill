#!/usr/bin/env bun

import process from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLocalDigestCli } from './file-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');
const packagedAssetsDir = join(__dirname, 'assets');
const defaultLlmApiKeyEnv = 'LLM_API_KEY';

interface GlobalCliOptions {
  args: string[];
  configPath: string;
  i18nPath: string;
  repoI18nPath: string;
  configExamplePath: string;
  templatesDir: string;
}

function printGlobalUsage(): void {
  console.log(`rss-digest

Usage:
  rss-digest <command> [command-options] [global-options]

Commands:
  init [--force] [--interactive]
  run [--hours <n>] [--top-n <n>] [--lang <zh|en>] [--output <path>]
  config path
  config validate
  source list
  source add [--name <name> --xml <xmlUrl> --html <htmlUrl>]
  source remove [--name <name>]

Global options:
  --config <path>          Config file path
  --i18n <path>            User i18n file path
  --config-example <path>  Config example file path used by init
  --repo-i18n <path>       Fallback i18n file path used by init/load
  --templates-dir <path>   Template directory for report rendering
  --help, -h               Show this help

Examples:
  bunx @beaverslab/rss-digest init --config ~/.beaver-skill/beaver-rss-digest/config.yaml
  bunx @beaverslab/rss-digest run --templates-dir ./templates --output ./output/today.md
`);
}

function consumeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseGlobalOptions(argv: string[]): GlobalCliOptions {
  const defaults = {
    configPath: join(process.cwd(), 'config', 'config.yaml'),
    i18nPath: join(process.cwd(), 'config', 'i18n.yaml'),
    repoI18nPath: join(packagedAssetsDir, 'i18n.yaml'),
    configExamplePath: join(packagedAssetsDir, 'config.example.yaml'),
    templatesDir: join(process.cwd(), 'templates'),
  };

  const commandArgs: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === '--help' || token === '-h') {
      printGlobalUsage();
      process.exit(0);
    }
    if (token === '--config') {
      defaults.configPath = consumeValue(argv, i, token);
      i += 1;
      continue;
    }
    if (token === '--i18n') {
      defaults.i18nPath = consumeValue(argv, i, token);
      i += 1;
      continue;
    }
    if (token === '--config-example') {
      defaults.configExamplePath = consumeValue(argv, i, token);
      i += 1;
      continue;
    }
    if (token === '--repo-i18n') {
      defaults.repoI18nPath = consumeValue(argv, i, token);
      i += 1;
      continue;
    }
    if (token === '--templates-dir') {
      defaults.templatesDir = consumeValue(argv, i, token);
      i += 1;
      continue;
    }
    commandArgs.push(token);
  }

  if (commandArgs.length === 0) {
    printGlobalUsage();
    process.exit(1);
  }

  return {
    args: commandArgs,
    ...defaults,
  };
}

const options = parseGlobalOptions(process.argv.slice(2));

await runLocalDigestCli({
  args: options.args,
  configPath: options.configPath,
  i18nPath: options.i18nPath,
  repoI18nPath: options.repoI18nPath,
  configExamplePath: options.configExamplePath,
  defaultLlmApiKeyEnv,
  templatesDir: options.templatesDir,
});
