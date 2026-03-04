# Beaver Skills 🦫

A collection of AI-powered automation workflow skills designed for efficient task execution, content creation, and system analysis via OpenClaw, Claude Code, Codex, Gemini CLI or other AI Agents.

## 🚀 Core Skills

This project currently includes the following core skills:

### 1. [beaver-image-gen](./skills/beaver-image-gen)
**Unified AI Image Generation Tool**
- **Capabilities**: Wraps image generation APIs from Google Gemini, OpenAI DALL-E/GPT Image, Alibaba DashScope, and Replicate into a single simple CLI command.
- **Highlights**: Auto-detection of available APIs, support for reference image editing, built-in 2K/4K quality presets, and seamless switching between platforms.

### 2. [beaver-xhs-images](./skills/beaver-xhs-images)
**Xiaohongshu Infographic Series Generator**
- **Capabilities**: Automatically deconstructs long-form content and generates a series of 1–10 consistent, social-media-ready infographics (from cover to ending).
- **Highlights**: 10 visual styles × 8 layout strategies, featuring smart content analysis and session-based reference image consistency.

### 3. [beaver-skill-analysis](./skills/beaver-skill-analysis)
**Skill Analysis and Improvement Tool**
- **Capabilities**: A meta-tool for analyzing, reverse-engineering, and optimizing AI skills.
- **Highlights**: Provides structured analysis report templates and risk checklists.

## 🛠️ Installation and Configuration

This project runs on **Bun** and **Node.js**.

1. **Prerequisites**: Ensure Bun (>= 1.0) is installed on your system.
2. **Credential Setup**: Set the following keys in your `.env` or environment variables based on the platform you intend to use for image generation:
   - `GOOGLE_API_KEY`
   - `OPENAI_API_KEY`
   - `DASHSCOPE_API_KEY`
   - `REPLICATE_API_TOKEN`

## 📖 Usage Guide

Detailed documentation for each skill is located in its respective directory within `SKILL.md` or `README.md`. Skills are typically triggered by phrases like:

- **Generate Image**: "Draw a picture of [description]"
- **Create Xiaohongshu Series**: "Turn this text into a series of infographics"

## 🛡️ Security and Reliability

- **API Security**: Uses temporary configuration files to pass keys, preventing secrets from appearing in process command lines.
- **Robustness**: All network requests have an explicit 300s timeout, and asynchronous tasks (like Replicate) utilize exponential backoff polling.

## 📜 License

This project is licensed under the [MIT License](./LICENSE).
