# Beaver Skills 🦫

A collection of AI-powered automation workflow skills designed for efficient task execution, content creation, and system analysis via OpenClaw, Claude Code, Codex, Gemini CLI or other AI Agents.

## 🚀 Core Skills

This project currently includes the following core skills:

| Skill Name | Capabilities | Highlights |
| :--- | :--- | :--- |
| [beaver-image-gen](./skills/beaver-image-gen) | **Unified AI Image Gen Tool**: Wraps Gemini, DALL-E, DashScope, and Replicate APIs into a single CLI command. | Auto-detection, 2K/4K quality presets, seamless platform switching, reference image editing. |
| [beaver-xhs-images](./skills/beaver-xhs-images) | **Xiaohongshu Series Generator**: Automatically deconstructs content into 1–10 consistent, social-media-ready infographics. | 10 visual styles × 8 layout strategies, smart content analysis, session-based reference image consistency. |
| [beaver-release-skills](./skills/beaver-release-skills) | **Universal Release Workflow**: Auto-detects project types, generates multi-language changelogs, and handles SemVer updates. | Zero-config, intelligent SemVer suggestions, native multi-language changelog synchronization. |
| [beaver-skill-analysis](./skills/beaver-skill-analysis) | **Skill Analysis & Optimization**: Meta-tool for analyzing, reverse-engineering, and optimizing AI skills. | Provides structured analysis reports, risk checklists, and implementation roadmaps. |


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
