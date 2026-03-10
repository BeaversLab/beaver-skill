# Beaver Release Skills

简体中文 | [English](README.en.md)

## 功能描述

`beaver-release-skills` 是一个通用的自动化发布工作流技能。它能够自动检测项目类型（Node.js, Python, Rust, Claude Plugin 等），根据 Conventional Commits 规范分析变更并建议版本号，自动生成多语言更新日志（Changelog），并完成版本更新、提交、打标签及推送等一系列发布操作。它旨在消除手动发布过程中的重复劳动和人为错误。

## 优点

- **零配置起步**：自动识别 package.json, pyproject.toml, Cargo.toml 等常见版本文件。
- **多语言支持**：原生支持生成 zh, en, ja 等多种语言的更新日志，并保持内容同步。
- **智能化分析**：基于提交记录自动区分新功能、修复和破坏性变更，智能建议语义化版本（SemVer）更新。
- **模块化友好**：支持按模块/技能分组提交变更，特别适合 monorepo 或插件集项目。
- **安全可靠**：提供 `--dry-run` 预览模式，发布前需用户确认版本号和推送行为。

🛠️ 版本说明：本项目基于 [技能 baoyu-release-skills](https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-release-skills) 进行二次开发。

**重要更新点**：

- **示例与默认语言**：所有示例中的技能名由 `baoyu-*` 替换为 `beaver-*`（如 `beaver-image-gen`、`beaver-xhs-images`）；无后缀的 `CHANGELOG.md` 默认语言统一为中文（zh）。
- **推送与分支**：推送命令由 `git push origin main` 改为 `git push origin HEAD`，避免在非 main 分支上误推。
- **无 Tag 场景**：Step 2 增加无 git tag 时的 fallback（`if [ -z "$LAST_TAG" ]`），将全部提交视为未发布变更，不再因空 tag 导致命令失败。
- **步骤分工**：Step 4 负责定义 Changelog 格式与多语言规则，Step 7 明确为「执行写入与版本更新」，避免语义重叠。
- **项目类型判断**：Step 5 增加适用性检查：仅当项目存在 `skills/` 目录时执行按技能分组；普通单包项目（Python/Rust 等）跳过 Step 5–6，直接进入 Step 7 单次发布提交。
- **gh CLI 回退**：第三方贡献者识别依赖 `gh`；若未安装或未登录，则跳过贡献者检测、不写入 `(by @username)`，且不阻断发布流程。
- **CI Status Check**: Step 9 完成后，若已推送且 `gh` 可用，提示运行 `gh run list --limit 1` 查看由 tag 触发的 CI 状态；否则提醒用户手动查看 Actions 页。
- **文档拆分**：将 Changelog 章节标题翻译对照表及多语言示例移至 `references/changelog-i18n.md`，主流程 SKILL.md 通过引用保持精简。

## 使用场景

### 适合使用

- **多语言开源项目**：需要同时维护中文、英文等多语言更新日志的项目。
- **标准化发布流程**：希望在团队内统一发布规范（如打标签、更新版本号、同步 Changelog）的场景。
- **频繁发布的插件/工具**：如 Claude 插件、Node.js 工具包等需要快速迭代的项目。

### 不适合使用

- **非 Git 项目**：该技能深度依赖 Git 记录进行变更分析。
- **完全自定义发布逻辑**：如果项目有极其复杂、非标准的发布流水线且无法通过 `.releaserc.yml` 配置。

## 使用方法

### 触发方式

在对话框输入以下指令即可激活：
- `release` / `发布`
- `new version` / `新版本`
- `bump version` / `更新版本`
- `prepare release`

### 基本流程

1. **自动检测**：识别版本文件、现有的多语言更新日志文件及项目结构。
2. **变更分析**：对比上次标签（Tag）以来的提交，识别功能点、修复项及破坏性变更。
3. **日志生成**：按语言自动编写更新日志条目（支持自动识别第三方贡献者）。
4. **用户确认**：展示建议的版本号（如 `1.2.3 → 1.3.0`）和推送选项。
5. **执行发布**：更新文件、创建发布提交、打 Git 标签，并根据确认结果推送至远端。

### 示例对话

> **用户**：帮我发布一个新版本，包含这次的所有修复。
>
> **技能**：检测到项目为 Node.js (v1.0.1)，发现 3 个 fix 提交。建议更新为 v1.0.2。正在生成中文和英文更新日志... 请确认版本号及是否推送？

## 参数说明

| 参数 | 是否必填 | 默认值 | 说明 |
|---|---|---|---|
| `--dry-run` | 否 | - | 预览模式，仅显示将要执行的操作，不修改任何文件。 |
| `--major` | 否 | - | 强制进行主版本号（Major）更新。 |
| `--minor` | 否 | - | 强制进行次版本号（Minor）更新。 |
| `--patch` | 否 | - | 强制进行修订号（Patch）更新。 |

## 依赖

| 依赖项 | 类型 | 是否必须 | 说明 |
|---|---|---|---|
| Git | 命令行工具 | 是 | 用于分析提交记录、同步变更、创建提交和标签。 |
| GitHub CLI (gh) | 命令行工具 | 否 | **可选**。用于识别第三方贡献者和查看 CI 状态。若不可用，将跳过贡献者检测且不阻断发布流程。 |
| Node.js | 运行时 | 否 | 仅当项目为 Node.js 类型时用于读取版本，或运行相关辅助脚本。 |

## 注意事项

- **提交规范**：建议遵循 Conventional Commits（如 `feat: ...`, `fix: ...`），否则技能可能无法准确识别变更类型并默认执行 Patch 更新。
- **项目类型自动识别**：技能会自动根据 `skills/` 目录是否存在来决定是按模块分组提交（Monorepo 模式）还是单次发布提交。
- **无 Tag 兼容**：如果项目中没有任何 Git Tag，技能会将所有提交视为未发布内容，并以当前版本文件中的版本号作为起始点。
- **远端权限**：执行推送（Push）操作需要当前环境具备 Git 远端仓库的写入权限。

## 常见问题

**Q：它如何知道我的 Changelog 文件在哪？**
**A：** 技能会自动递归扫描根目录下以 `CHANGELOG`、`HISTORY` 或 `CHANGES` 开头的 Markdown 文件，并根据后缀（如 `.en.md`）智能识别语言。

**Q：如果不安装 GitHub CLI (gh) 还能用吗？**
**A：** 可以。GitHub CLI 仅用于增强功能（如识别第三方 PR 作者和在推送后检查 CI 状态），缺失时会自动回退，不影响核心的发布和打标签流程。

**Q：我可以自定义版本号更新规则吗？**
**A：** 默认遵循 SemVer。你可以通过指令显式指定 `--major`、`--minor` 或 `--patch` 来强制覆盖自动建议。

## 致谢
本项目深受以下优秀作品的启发并基于其构建：

- [@Jim Liu 宝玉](https://github.com/JimLiu/)开发的技能[baoyu-release-skills](https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-release-skills)
