# Beaver Skills 🦫

AI 驱动的自动化工作流技能合集，使用 OpenClaw, Claude Code, Codex, Gemini CLI 或其他 AI Agent 实现高效的任务执行、内容创作和系统分析。

## 🚀 核心技能

本项目目前包含以下核心技能：

### 1. [beaver-image-gen](./skills/beaver-image-gen)
**统一的 AI 图像生成工具**
- **功能**：将 Google Gemini、OpenAI DALL-E/GPT Image、阿里通义万象（DashScope）和 Replicate 四个平台的图像生成 API 封装为一条简单的 CLI 命令。
- **亮点**：自动检测可用 API、支持参考图编辑、内置 2K/4K 质量预设、多平台透明切换。

### 2. [beaver-xhs-images](./skills/beaver-xhs-images)
**小红书信息图系列生成器**
- **功能**：将长文内容自动拆解并生成 1–10 张风格统一、适合小红书传播的信息图（从封面到结尾）。
- **亮点**：内置 10 种视觉风格 × 8 种布局策略，支持智能内容分析和参考图链一致性。

## 🛠️ 安装与配置

本项目基于 **Bun** 和 **Node.js** 环境运行。

1. **环境准备**：确保系统中安装了 Bun (>= 1.0)。
2. **凭证设置**：根据需要生成图片的平台，在 `.env` 或环境变量中设置以下 Key：
   - `GOOGLE_API_KEY`
   - `OPENAI_API_KEY`
   - `DASHSCOPE_API_KEY`
   - `REPLICATE_API_TOKEN`

## 📖 使用指南

每个技能的详细文档位于其各自目录下的 `SKILL.md` 或 `README.md` 中。通常可以通过以下方式触发：

- **生成图片**："帮我画一张[描述]的图"
- **创作小红书图片**："把这段文字转换成小红书风格的信息图"

## 🛡️ 安全与可靠性

- **API 安全**：通过临时配置文件传递密钥，避免出现在进程命令行中。
- **健壮性**：所有网络请求均设有超时机制（300s），并针对异步任务（如 Replicate）采用指数退避轮询。

## 📜 许可

本项目采用 [MIT 许可证](./LICENSE)。

