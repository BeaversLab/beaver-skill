---
name: beaver-rss-digest
description: Generate configurable RSS digest with YAML-driven LLM chain, source management, prompt customization, i18n, and template-based report output.
---

# Beaver RSS Digest

从 RSS 源抓取文章，使用配置化 LLM 链路打分与摘要，输出模板化 Markdown 报告。

## 配置与目录

- 用户配置：`~/.beaver-skill/beaver-rss-digest/config.yaml`
- 多语言文案：`~/.beaver-skill/beaver-rss-digest/i18n.yaml`
- 配置模板：`skills/beaver-rss-digest/config/config.example.yaml`
- 报告模板目录：`skills/beaver-rss-digest/templates/`
- 通用 CLI / 摘要引擎：`packages/rss-digest`

## 环境变量

API Key 环境变量名通过 `config.yaml` 的 `llmApiKeyEnv` 配置，默认值为 `LLM_API_KEY`。实际 Key 仍通过当前 shell 环境变量提供，例如：

```env
LLM_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here
```

运行前先在当前 shell 中 `export` 对应变量，例如：

```bash
export LLM_API_KEY=your-key-here
```

## 核心流程

1. 读取 `config.yaml`
2. 校验配置完整性（LLM、分类、提示词、RSS 源、模板名）
3. 按 `llms` 顺序筛选 `enabled: true` 项
4. 从第一个 enabled LLM 开始调用，失败则自动切换下一个
5. 使用 `defaults.reportTemplate` 对应模板渲染报告

## LLM 配置规范

`config.yaml` 中额外支持：

- `llmApiKeyEnv`: 全局 API Key 环境变量名，默认 `LLM_API_KEY`

`llms` 为数组，每项支持：

- `enabled`: `true/false`
- `provider`: 提供商名称（仅用于标识）
- `apiType`: `openai-compatible` 或 `anthropic-compatible`
- `baseUrl`: API 基础地址
- `model`: 模型名
  注意：运行时会先读取 `llmApiKeyEnv`，如果当前环境中不存在这个变量，会提示用户修改 `config.yaml` 中的 `llmApiKeyEnv`。

## 报告模板

- 配置项：`defaults.reportTemplate`
- 对应文件：`templates/<reportTemplate>.md`
- 默认模板：`templates/default.md`

模板变量：

- `{{reportTitle}}`
- `{{date}}`
- `{{highlightsSection}}`
- `{{categoryChartSection}}`
- `{{articlesSection}}`

## CLI 命令

在 `skills/beaver-rss-digest` 目录执行：

```bash
pnpm install
pnpm run digest:init
pnpm run digest:config:validate
pnpm run digest:run
```

细粒度命令：

```bash
pnpm run digest:config:path
pnpm run digest:source:list
pnpm run digest:source:add
pnpm run digest:source:remove
```

`digest:source:add/remove` 未传参数时会进入交互输入。

pnpm 脚本自动选择运行时：优先使用 bun，未安装则回退到 node + tsx。

## 常用运行示例

```bash
# 通过 pnpm 脚本运行（自动选择 bun 或 node）
pnpm run digest:run -- --hours 24 --top-n 10 --lang en --output ./output/my-digest.md

# 手动指定运行时
bun scripts/cli.ts run --hours 24 --top-n 10
# 或
node --import tsx scripts/cli.ts run --hours 24 --top-n 10
```

## 关键配置项说明

- `defaults.hours`: 默认抓取时间窗口
- `defaults.topN`: 默认输出文章数
- `defaults.language`: `zh` / `en`
- `defaults.outputDir`: 默认输出目录
- `defaults.reportTemplate`: 报告模板名
- `categories`: 分类定义（`id/emoji/label`）
- `prompts`: 评分、摘要、看点提示词模板
- `rssFeeds`: RSS 源列表（支持 CLI 动态增删）

## 故障排查

- 配置错误：先执行 `pnpm run digest:config:validate`
- 模板不存在：检查 `defaults.reportTemplate` 与 `templates/<name>.md`
- 全部 LLM 失败：检查 `llmApiKeyEnv` 是否正确，以及当前 shell 是否已 `export` 同名 Key
- 无文章输出：扩大 `hours` 或确认 RSS 源可访问
