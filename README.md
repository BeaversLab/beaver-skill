# Beaver Skills 🦫

简体中文 | [English](README.en.md)

AI 驱动的自动化工作流技能合集，使用 OpenClaw, Claude Code, Codex, Gemini CLI 或其他 AI Agent 实现高效的任务执行、内容创作和系统分析。

## 🚀 核心技能

本项目目前包含以下核心技能，旨在覆盖从内容创作到工程发布的完整工作流：

| 技能名称                                                | 功能描述                                                              | 核心亮点                                                            |
| :------------------------------------------------------ | :-------------------------------------------------------------------- | :------------------------------------------------------------------ |
| [beaver-claw-backup](./skills/beaver-claw-backup)       | **数据备份与恢复**：基于 YAML 规则的自动化存档工具。                  | 支持 `bunx` 极速运行、AI 非交互模式、多语言文档支持。               |
| [beaver-image-gen](./skills/beaver-image-gen)           | **全能 AI 图像生成器**：集成 Google, OpenAI, DashScope 和 Replicate。 | 自动探测 API、2K/4K 质量预设、支持参考图一致性。                    |
| [beaver-xhs-images](./skills/beaver-xhs-images)         | **小红书信息图生成器**：将长文转化为 1–10 张风格统一的爆款信息图。    | 10 种视觉风格 × 8 种布局策略，内置 3 种文案拆解策略。               |
| [beaver-markdown-i18n](./skills/beaver-markdown-i18n)   | **Markdown 翻译流水线**：文档 AST 级脱敏翻译与增量同步工具。          | 结构零破坏（代码块/变量保护）、翻译记忆（TM）复用、大文件自动分块。 |
| [beaver-cover-image](./skills/beaver-cover-image)       | **文章封面生成器**：5 维度自定义生成极简、概念或排版风格的封面。      | 9 种色板 × 6 种渲染风格，支持电影感、宽幅等多种比例。               |
| [beaver-release-skills](./skills/beaver-release-skills) | **全能发布工作流**：自动检测项目、生成多语言 Changelog 并完成发布。   | 零配置起步、智能 SemVer 建议、原生支持多语言同步发布。              |

## 📦 版本管理策略

本项目采用 **双层版本管理** 架构：

- **技能库 (Library Version)**：整个 `skills/` 集合作为一个整体，共享统一的版本号（当前：`0.4.2`）。
- **工具包 (Package Version)**：`packages/` 下的 NPM 包（如 `@beaverslab/claw-backup`）拥有独立的语义化版本。

## 🛠️ 安装

### 快速安装（推荐）

如果您使用的是支持技能扩展的 AI 终端（如 Gemini CLI），可以通过以下命令一键添加本项目的所有技能：

```bash
npx skills add BeaversLab/beaver-skill
```

### 离线安装与配置

本项目也可以通过源码运行，基于 **Bun** 和 **Node.js** 环境。

1. **环境准备**：确保系统中安装了 Bun (>= 1.0)。
2. **凭证设置**：根据需要生成图片的平台，在 `~/.beaver-skill/.env` 或环境变量中设置以下 Key (可选)：

- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `DASHSCOPE_API_KEY`
- `REPLICATE_API_TOKEN`

## 📖 使用指南

每个技能的详细文档位于其各自目录下的 `SKILL.md` 或 `README.md` 中。通常可以通过以下方式触发：

- **备份数据**："帮我把这个项目的配置备份一下"
- **生成图片**："帮我画一张[描述]的图"
- **创作小红书图片**："把这段文字转换成小红书风格的信息图"

## 🛡️ 安全与可靠性

- **API 安全**：通过临时配置文件传递密钥，避免出现在进程命令行中。
- **健壮性**：所有网络请求均设有超时机制（300s），并针对异步任务（如 Replicate）采用指数退避轮询。

## 📜 许可

本项目采用 [MIT 许可证](./LICENSE)。
