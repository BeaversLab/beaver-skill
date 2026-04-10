# @beaverslab/rss-digest

一个可复用的 RSS Digest 包，提供：

- CLI 编排
- RSS 抓取与摘要生成
- Prompt 组装
- 多 LLM 回退

这个包是刻意从 skill 层拆出来的。现在它同时提供：

- 可直接通过 `bunx @beaverslab/rss-digest` 调用的 CLI
- 可复用的模块接口

而像 `skills/beaver-rss-digest` 这样的 skill 主要负责：

- 用户配置路径
- 模板目录选择
- skill 特定文档与 prompt

## 作用范围

`@beaverslab/rss-digest` 既可以作为可复用包嵌入，也可以作为一个需要显式传入路径参数的 CLI 使用。它不是零配置应用，但已经不再依赖 skill 侧的 `package.json` 包装。

当前 LLM 行为：

- `openai-compatible` 模型通过 `@ai-sdk/openai-compatible` 使用 Vercel AI SDK
- `anthropic-compatible` 模型使用包内置 adapter
- 启用的 provider 会按配置顺序依次尝试，直到有一个成功

## Exports

当前包导出：

- `@beaverslab/rss-digest`
- `@beaverslab/rss-digest/cli`
- `@beaverslab/rss-digest/file-config`
- `@beaverslab/rss-digest/digest-core`
- `@beaverslab/rss-digest/prompts`
- `@beaverslab/rss-digest/config-types`

对应文件：

- `./src/bin.ts`
- `./src/cli.ts`
- `./src/file-config.ts`
- `./src/digest-core.ts`
- `./src/prompts.ts`
- `./src/types.ts`

## Standalone CLI

包现在暴露可执行命令：

- `rss-digest`

适合在只复制 skill 目录时直接运行：

```bash
bunx @beaverslab/rss-digest init \
  --config ~/.beaver-skill/beaver-rss-digest/config.yaml \
  --i18n ~/.beaver-skill/beaver-rss-digest/i18n.yaml \
  --templates-dir ./templates

bunx @beaverslab/rss-digest run \
  --config ~/.beaver-skill/beaver-rss-digest/config.yaml \
  --i18n ~/.beaver-skill/beaver-rss-digest/i18n.yaml \
  --templates-dir ./templates
```

推荐优先使用 `bunx`。如果环境中没有 `bunx`，可直接使用 `npx @beaverslab/rss-digest ...`，包内的 JS 启动器会优先尝试 `bun`，否则回退到 `node --import tsx`。

CLI 内置默认资源：

- `config.example.yaml`
- `i18n.yaml`

可选全局参数：

- `--config`
- `--i18n`
- `--config-example`
- `--repo-i18n`
- `--templates-dir`

## 主要接口

### `runCli(args, deps)`

源码：
[cli.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/cli.ts)

用途：
提供一个通用 CLI 外壳，用于配置初始化、配置校验、RSS 源管理和 digest 执行。

所有环境相关行为都通过 `DigestCliDeps` 注入。

核心接口：

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

典型用法：

- 包使用方负责配置加载和持久化
- 包使用方决定配置文件存放位置
- 包使用方决定如何解析 `llmApiKeyEnv`

### `runDigest(options)`

源码：
[digest-core.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/digest-core.ts)

用途：
执行完整 digest 流程：

1. 抓取 RSS
2. 过滤最近文章
3. 用 LLM 对文章打分
4. 摘要 Top 文章
5. 生成 highlights
6. 用模板渲染 Markdown 输出

核心接口：

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

### Prompt 构造函数

源码：
[prompts.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/prompts.ts)

导出：

- `buildScoringPrompt`
- `buildSummaryPrompt`
- `buildHighlightsPrompt`

如果你想自己编排流程，但仍然复用本包的 prompt 组装逻辑，可以直接使用这些函数。

### 核心类型

源码：
[types.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/types.ts)

重要导出类型：

- `DigestConfigShape`
- `DigestDefaults`
- `LlmProfile`
- `FeedSource`
- `CategoryConfig`
- `PromptTemplates`
- `Article`
- `ScoredArticle`
- `OutputLanguage`

## 最小接入模式

推荐模式：

1. 定义你自己的配置模块
2. 让你的配置类型兼容 `DigestConfigShape`
3. 把配置函数接入 `runCli`
4. 在注入的 `runDigest` 依赖中调用包里的 `runDigest`

示例：

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

如果你仍然想嵌入自己的适配层，也可以继续直接调用 `runLocalDigestCli` 或 `runCli`。

## 包期望的配置结构

包级 CLI 假定配置对象兼容以下结构：

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

这个包不规定：

- 配置存储在哪里
- 配置是 YAML、JSON、数据库还是运行时生成
- 环境变量如何被加载进 `process.env`

## LLM Provider 模型

这个包在一次运行中只使用一个已经解析好的 API key 字符串：

- 调用方负责解析环境变量名
- 调用方负责读取环境变量值
- 调用方把 `llmApiKey` 传给 `runDigest`

这样可以把 provider 解析策略留在 package CLI 核心之外。

Provider 行为：

- `openai-compatible`: 使用 Vercel AI SDK
- `anthropic-compatible`: 使用内部 `fetch` adapter

这样 skill 层可以保持决策逻辑简单，同时复用统一执行引擎。

## 哪些内容应该留在 Skill 层

这些内容仍然更适合放在 package 外：

- 类似 `~/.beaver-skill/...` 的用户目录路径
- skill frontmatter 和用户触发文档
- 模板目录归属

这也是为什么 `skills/beaver-rss-digest` 仍然保留：

- `templates/`

## 当前文件布局

Package 文件：

- [package.json](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/package.json)
- [bin/rss-digest.js](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/bin/rss-digest.js)
- [src/bin.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/bin.ts)
- [src/cli.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/cli.ts)
- [src/file-config.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/file-config.ts)
- [src/digest-core.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/digest-core.ts)
- [src/prompts.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/prompts.ts)
- [src/types.ts](/Users/marco/Documents/git/github.com/BeaversLab/beaver-skill/packages/rss-digest/src/types.ts)

## 备注

- 当前包直接导出源码文件。
- 假定运行时为 Node.js 20+。
- 这个包现在既适合嵌入，也适合通过 `bunx` 直接调用。
