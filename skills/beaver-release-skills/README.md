# Beaver Release Skills

简体中文 | [English](README.en.md)

## 功能描述

`beaver-release-skills` 是一个由 [Changesets](https://github.com/changesets/changesets) 驱动的通用双轨发布工作流技能。它专为现代 Monorepo 设计，明确支持两种不同的发布目标：

1. **统一技能库 (`skills/`)**：管理所有 AI 智能体技能的统一版本（文本为主）。
2. **独立工具包 (`packages/`)**：管理多语言（NPM, Go, Python, Rust 等）工具包的独立版本。

## 优点

- **双架构支持**：优雅处理统一库版本和独立包版本共存的复杂场景。
- **AI 辅助 Changeset**：自动分析 Git 历史，推断语义化版本变更（Major/Minor/Patch）并起草发布说明。
- **跨语言版本同步**：智能检测 Rust, Python, Go 等非 Node.js 包，自动将 Changeset 版本的变更同步到原生配置文件（如 `Cargo.toml`, `pyproject.toml`）。
- **多语言更新日志**：自动翻译并将 `CHANGELOG.md` 的更新合并到本地化文件（如 `CHANGELOG.zh.md`）。
- **安全可控**：在生成 Changeset、提交版本和推送远程仓库前，严格要求用户确认。

## 工作流

### 1. 创建 Changeset (AI 辅助)

- 分析 `git diff`/`log` 以识别未发布变更。
- 智能判断变更是属于 `skills/`（统一版本）还是 `packages/`（独立版本）。
- 基于 Conventional Commits 推荐版本更新类型。
- 在生成 `.changeset/*.md` 之前请求用户确认。

### 2. 版本更新与同步

- 执行 `npx changeset version` 消耗变更集。
- 将更新后的 `package.json` 版本号同步至多语言项目的原生清单文件。
- 更新所有多语言 `CHANGELOG.*.md` 文件。
- 自动提交发布。

### 3. 推送与发布

- 请求用户确认是否推送 Tag 和 Commit 到远程仓库。
- 支持针对多语言产物执行发布逻辑（`npm publish`, `cargo publish`, `twine upload`）。

## 使用方法

### 触发方式

在对话框输入以下指令即可激活：

- `release` / `发布`
- `new version` / `新版本`
- `bump version` / `更新版本`
- `changeset`
- `prepare release`

## 依赖

| 依赖项     | 类型       | 是否必须 | 说明                                    |
| ---------- | ---------- | -------- | --------------------------------------- |
| Changesets | 命令行工具 | 是       | 核心版本管理引擎（`@changesets/cli`）。 |
| Git        | 命令行工具 | 是       | 用于分析提交记录、创建提交和标签。      |
