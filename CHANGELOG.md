# 更新日志

## 0.6.4

## 0.6.3

## 0.6.2 - 2026-04-08

### 内部变更

- **project**: 发布 `@beaverslab/rss-digest` v0.2.0。
- **project**: 同步更新 `@beaverslab/skills` 至 v0.6.2。

## 0.6.1 - 2026-03-31

### 新功能

- **beaver-resource-compilation**: 新增 `content_hash` 字段，用于内容去重和变更检测。

## 0.6.0 - 2026-03-31

### 新功能

- **beaver-resource-compilation**: 新增资源汇编技能，支持从多个源目录收集 Markdown 文件并自动生成 frontmatter（title、tags、summary 等）。

### 文档

- **project**: 更新 Changelog 标题为中文。

## 0.5.2 - 2026-03-26

### 文档

- **beaver-release-skills**: 建立标准化的多语言 Changelog 工作流及格式规范。

## 0.5.1 - 2026-03-26

### 优化与修复

- **beaver-release-skills**: 在发布流程中增加显式的“创建 Git Tag”步骤，确保版本追踪的完整性。

## 0.5.0 - 2026-03-26

### 新功能

- **beaver-release-skills**: 重构技能发布工作流，支持 Changesets 双版本（统一技能库与独立包）发布架构。

## 0.4.2 - 2026-03-26

### 优化与修复

- **project**: 实施技能与包的双重版本控制策略。
- **project**: 将所有技能整合到统一的 `@beaverslab/skills` 包中。

## 0.4.1 - 2026-03-11

### 新功能

- **beaver-markdown-i18n**: 增强翻译脚本，支持占位符检查和任务元数据管理。

### 文档

- **project**: 更新 README 文件并移除冗余行，提高清晰度。
- **beaver-release-skills**: 更新 README 文档。

## 0.4.0 - 2026-03-10

### 新功能

- **beaver-markdown-i18n**: 增加基于 AST 遮罩和增量同步的完整 Markdown 翻译流水线。
- **beaver-markdown-i18n**: 增加统一的 CLI 工具（translate-cli, quality-cli, plan-cli）。
- **beaver-skill**: 增加 AGENTS.md 以定义技能结构标准。

### 优化与修复

- **beaver-markdown-i18n**: 整合脚本并增强质量验证流程。
