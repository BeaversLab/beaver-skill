# Beaver Skills 🦫

[简体中文](README.md) | English

A collection of AI-powered automation workflow skills designed for efficient task execution, content creation, and system analysis via OpenClaw, Claude Code, Codex, Gemini CLI or other AI Agents.

## 🚀 Core Skills

This project currently includes the following core skills, covering everything from content creation to engineering releases:

| Skill Name                                              | Capabilities                                                                                             | Highlights                                                                             |
| :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| [beaver-image-gen](./skills/beaver-image-gen)           | **Unified AI Image Gen**: Integrated with Google, OpenAI, DashScope, and Replicate.                      | Auto-detection, 2K/4K quality presets, reference image consistency.                    |
| [beaver-xhs-images](./skills/beaver-xhs-images)         | **Xiaohongshu Infographic**: Turns long articles into 1–10 consistent, social-media-ready cards.         | 10 visual styles × 8 layout strategies, 3 distinct copywriting strategies.             |
| [beaver-markdown-i18n](./skills/beaver-markdown-i18n)   | **Markdown Translation Pipeline**: AST-level masking and sync tool for documentation.                    | Zero structure destruction (code blocks/variable protection), TM reuse, auto-chunking. |
| [beaver-cover-image](./skills/beaver-cover-image)       | **Article Cover Generator**: 5-dimensional customization for minimal, conceptual, or typography covers.  | 9 color palettes × 6 rendering styles, cinematic and widescreen support.               |
| [beaver-release-skills](./skills/beaver-release-skills) | **Universal Release Workflow**: Auto-detects project types, multi-language changelogs, and SemVer bumps. | Zero-config, intelligent SemVer suggestions, native multi-language changelog sync.     |

## 🛠️ Installation

### Quick Install (Recommended)

If you are using an AI terminal that supports skill extensions (like Gemini CLI), you can add all skills from this project with a single command:

```bash
npx skills add BeaversLab/beaver-skill
```

### Manual Installation and Configuration

This project can also be run from source using **Bun** and **Node.js**.

1. **Prerequisites**: Ensure Bun (>= 1.0) is installed on your system.
2. **Credential Setup**: Set the following keys in your `~/.beaver-skill/.env` or environment variables based on the platform you intend to use for image generation(optional):
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
