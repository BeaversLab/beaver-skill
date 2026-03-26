## 0.5.0

### 次要变更

- feat(beaver-release-skills): 重构技能发布工作流，支持 Changesets 双版本发布架构。

## 0.4.2

## 0.4.1 - 2026-03-11

### 新功能

- beaver-markdown-i18n: 增强翻译脚本，支持占位符检查和任务元数据管理

### 文档

- project: 更新 README 文件并移除冗余行，提高清晰度
- beaver-release-skills: 更新 README 文档

## 0.4.0 - 2026-03-10

### 新功能

- beaver-markdown-i18n: 新增 Markdown 翻译流水线工具，支持 AST 级占位符掩码和增量同步
- beaver-markdown-i18n: 新增全面的 CLI 工具（translate-cli, quality-cli, plan-cli）
- beaver-skill: 新增 AGENTS.md 文档，定义技能结构标准

### 优化

- beaver-markdown-i18n: 统一脚本管理，强化质量验证流程

# 更新日志

## 0.3.0 - 2026-03-06

### 新功能

- **beaver-cover-image**: 新增封面图生成技能，支持 5 个维度的视觉定制。
- **beaver-release-skills**: 新增全量英文文档。

### 优化与修复

- **beaver-release-skills**: 移除自动发布到 npm 的工作流，改为通过 npx skills 直接安装。
- **beaver-cover-image**: 增加更多比例选项 (4:3, 3:2) 并优化默认比例为 16:9。
- **项目**: 优化 README 安装说明和快速安装指令。

## 0.2.4 - 2026-03-05

### 优化

- **CI**: 成功配置 NPM 令牌并恢复自动发布流程

## 0.2.2 - 2026-03-05

### 修复

- **CI**: 修复 GitHub Action 发布时 `npm version` 因版本已更新而报错的问题

## 0.2.1 - 2026-03-05

### 新功能

- **project**: 添加 .gitignore 并将核心技能介绍改为表格形式，增强文档可读性
- **beaver-release-skills**: 为技能添加详细的中文和英文 README 文档

## 0.2.0 - 2026-03-05

### 新功能

- **beaver-release-skills**: 引入 beaver-release-skills 并同步远程 URL
- **beaver-image-gen**: 引入 AI 图像生成技能 beaver-image-gen
- **beaver-xhs-images**: 增强布局偏好、错误恢复及完善文档
- **project**: 初始化项目，配置 package.json、GitHub Actions 及多语言 README
