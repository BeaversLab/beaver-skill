# @beaverslab/rss-digest

Reusable RSS digest package for:

- CLI orchestration
- RSS fetching and digest generation
- prompt assembly
- multi-LLM fallback

This package is intentionally split from the skill layer. The package provides generic execution primitives, while a skill such as `skills/beaver-rss-digest` is responsible for:

- user config paths
- config parsing and validation policy
- template directory selection
- environment variable decision logic
- skill-specific docs and prompts

## Scope

`@beaverslab/rss-digest` is not a complete app by itself. It is a reusable package that expects the caller to inject config I/O and runtime decisions.

Current LLM behavior:

- `openai-compatible` models use Vercel AI SDK via `@ai-sdk/openai-compatible`
- `anthropic-compatible` models use the package's built-in adapter
- enabled providers are tried in config order until one succeeds

## Exports

The package currently exposes:

- `@beaverslab/rss-digest`
- `@beaverslab/rss-digest/cli`
- `@beaverslab/rss-digest/file-config`
- `@beaverslab/rss-digest/digest-core`
- `@beaverslab/rss-digest/prompts`
- `@beaverslab/rss-digest/config-types`

Mapped files:

- `./src/cli.ts`
- `./src/file-config.ts`
- `./src/digest-core.ts`
- `./src/prompts.ts`
- `./src/types.ts`

## Main Interfaces

### `runCli(args, deps)`

Source:
[cli.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/cli.ts)

Purpose:
Provides a generic CLI shell for config initialization, validation, source management, and digest execution.

You inject all environment-specific behavior through `DigestCliDeps`.

Key interface:

```ts
export interface DigestCliDeps<TConfig extends DigestConfigShape = DigestConfigShape> {
  configPath: string;
  defaultLlmApiKeyEnv: string;
  loadConfig: () => Promise<TConfig>;
  initConfig: (force?: boolean) => Promise<{ created: boolean; path: string }>;
  loadI18n: () => Promise<Record<OutputLanguage, Record<string, string>>>;
  saveConfig: (config: TConfig) => Promise<void>;
  validateConfig: (config: TConfig) => Promise<ValidationResult>;
  resolveConfiguredLlmApiKeyEnv: (config: TConfig) => string;
  resolveConfiguredLlmApiKey: (config: TConfig) => string;
  runDigest: (options: {
    feeds: FeedSource[];
    prompts: TConfig['prompts'];
    hours: number;
    topN: number;
    language: OutputLanguage;
    outputPath: string;
    llms: TConfig['llms'];
    llmApiKey: string;
    categories: TConfig['categories'];
    reportTemplate: string;
    i18n: Record<string, string>;
  }) => Promise<DigestRunResult>;
}
```

Expected use:

- package consumer owns config loading and persistence
- package consumer decides where config lives
- package consumer decides how `llmApiKeyEnv` is resolved

### `runDigest(options)`

Source:
[digest-core.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/digest-core.ts)

Purpose:
Runs the digest pipeline:

1. fetch RSS feeds
2. filter recent articles
3. score articles with LLM
4. summarize top articles
5. generate highlights
6. render markdown output from a template

Key interface:

```ts
export interface RunDigestOptions {
  feeds: FeedSource[];
  prompts: PromptTemplates;
  hours: number;
  topN: number;
  language: OutputLanguage;
  outputPath: string;
  llms: LlmProfile[];
  llmApiKey: string;
  categories: CategoryConfig[];
  i18n?: Record<string, string>;
  reportTemplate: string;
  templatesDir: string;
}
```

### Prompt builders

Source:
[prompts.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/prompts.ts)

Exports:

- `buildScoringPrompt`
- `buildSummaryPrompt`
- `buildHighlightsPrompt`

Use these if you want custom orchestration but still want to reuse the package's prompt assembly.

### Core types

Source:
[types.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/types.ts)

Important exported types:

- `DigestConfigShape`
- `DigestDefaults`
- `LlmProfile`
- `FeedSource`
- `CategoryConfig`
- `PromptTemplates`
- `Article`
- `ScoredArticle`
- `OutputLanguage`

## Minimal Integration Pattern

The recommended pattern is:

1. define your own config module
2. make your config type extend `DigestConfigShape`
3. wire your config functions into `runCli`
4. call `runDigest` from the injected `runDigest` dependency

Example:

```ts
import process from 'node:process';
import { runCli } from '@beaverslab/rss-digest/cli';
import { runDigest } from '@beaverslab/rss-digest/digest-core';

await runCli(process.argv.slice(2), {
  configPath: '/path/to/config.yaml',
  defaultLlmApiKeyEnv: 'LLM_API_KEY',
  initConfig,
  loadConfig,
  loadI18n,
  saveConfig,
  validateConfig,
  resolveConfiguredLlmApiKeyEnv,
  resolveConfiguredLlmApiKey,
  runDigest: (options) =>
    runDigest({
      ...options,
      templatesDir: '/path/to/templates',
    }),
});
```

The in-repo skill adapter is the concrete example:
[skills/beaver-rss-digest/scripts/cli.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/skills/beaver-rss-digest/scripts/cli.ts)

## Config Shape Expected By The Package

The package-level CLI assumes a config object compatible with:

```ts
export interface DigestConfigShape {
  version: number;
  llmApiKeyEnv: string;
  defaults: {
    hours: number;
    topN: number;
    language: 'zh' | 'en';
    outputDir: string;
    reportTemplate: string;
  };
  llms: LlmProfile[];
  categories: CategoryConfig[];
  prompts: PromptTemplates;
  rssFeeds: FeedSource[];
}
```

The package does not dictate:

- where this config is stored
- whether it is YAML, JSON, DB-backed, or generated
- how environment variables are loaded into `process.env`

## LLM Provider Model

The package uses a single resolved API key string per run:

- caller resolves env var name
- caller resolves env var value
- caller passes `llmApiKey` into `runDigest`

This keeps provider resolution policy outside the package CLI core.

Provider behavior:

- `openai-compatible`: uses Vercel AI SDK
- `anthropic-compatible`: uses internal `fetch` adapter

This allows the skill layer to keep decision policy simple while still reusing a common engine.

## What Belongs In The Skill Layer

Keep these outside the package:

- repo-specific config templates
- home-directory paths like `~/.beaver-skill/...`
- skill frontmatter and user-facing triggering docs
- template directory ownership
- environment variable naming policy

That is why `skills/beaver-rss-digest` still owns:

- `config/config.example.yaml`
- `config/i18n.yaml`
- `templates/`

## Current File Layout

Package files:

- [package.json](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/package.json)
- [src/cli.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/cli.ts)
- [src/file-config.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/file-config.ts)
- [src/digest-core.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/digest-core.ts)
- [src/prompts.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/prompts.ts)
- [src/types.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/types.ts)

Skill adapter:

- [scripts/cli.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/skills/beaver-rss-digest/scripts/cli.ts)

## Notes

- The package currently exports source files directly.
- It assumes a Node.js 20+ runtime.
- It is optimized for embedding into a higher-level skill or app, not for standalone zero-config use.
