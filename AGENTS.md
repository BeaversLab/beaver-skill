# AGENTS.md

This file provides guidance to Gemini CLI when working with code in this repository.

## Repository Overview

This is **beaver-skill**, a collection of agent skills for AI-powered workflows. The repository contains standalone skill packages that can be invoked to perform specific tasks.

### Project Structure

```
beaver-skill/
├── skills/                      # All skill packages
│   ├── beaver-image-gen/        # Unified AI image generation (Google, OpenAI, DashScope, Replicate)
│   │   ├── scripts/             # Implementation scripts (Bun/TS)
│   │   │   ├── providers/       # Multi-platform adapters
│   │   │   └── main.ts          # Entry point
│   │   ├── references/          # Supporting documentation
│   │   └── SKILL.md             # Main skill definition
│   └── beaver-xhs-images/       # Xiaohongshu infographic generator
│       ├── references/          # Modular reference documentation (presets, layouts, etc.)
│       └── SKILL.md             # Main skill definition
└── AGENTS.md                    # This file
```

## Skill Architecture

### Core Components

Each skill follows this structure:

1. **SKILL.md** - The main skill file containing:
   - YAML frontmatter with `name` and `description` (required)
   - Usage documentation and examples
   - Detailed workflow/implementation instructions
   - References to supporting documentation

2. **scripts/** - Implementation logic (optional):
   - Primarily uses Bun/TypeScript for high-performance CLI execution.

3. **references/** - Modular supporting documentation:
   - Category-organized specifications (config, workflows, elements, presets, etc.)

### Key Design Patterns

**Reference-Based Documentation**: Skills with complex workflows use `references/` subdirectories to keep the main SKILL.md focused on high-level flow.

**Multi-Platform Providers**: Skills like `beaver-image-gen` abstract multiple AI backends (Google, OpenAI, DashScope, Replicate) behind a single interface.

**Preference Persistence**: Uses `EXTEND.md` (via `.beaver-skill/` directory) to save user preferences like default providers, models, and quality settings.

**Safety & Reliability**: 
- API keys are handled securely (e.g., via temporary config files for curl).
- Network requests include explicit timeouts (300s).
- Long-polling operations (like Replicate) use exponential backoff.

## Skills Inventory

### beaver-image-gen
- **Purpose**: Unified AI image generation CLI.
- **Trigger**: User asks to "generate image", "draw", or "create a picture".
- **Backends**: Google Gemini, OpenAI DALL-E/GPT Image, DashScope (Alibaba), Replicate.
- **Features**: Reference image support, quality presets (2K/4K), aspect ratio control, automatic provider detection.

### beaver-xhs-images
- **Purpose**: Generate Xiaohongshu (Little Red Book) infographic series.
- **Trigger**: User mentions "小红书图片", "XHS images", "RedNote infographics".
- **Features**: 
  - 10 visual styles x 8 layouts.
  - Smart content analysis and outline generation.
  - Multi-image consistency via session-based reference chains.

### beaver-skill-analysis
- **Purpose**: Analyze and improve skills.
- **Trigger**: User asks how a skill works or how to optimize it.

## Conventions

### File Naming
- Use kebab-case for directories and files.
- Use descriptive prefixes for generated assets (e.g., `01-cover-`, `02-content-`).

### Frontmatter Format
All SKILL.md files must include:
```yaml
---
name: skill-name
description: Trigger description that explains when to use this skill
---
```

### Documentation Style
- **Blocking Operations**: Marked with ⛔.
- **Confirmations**: Marked with ⚠️.
- **Updates**: Document functional changes and bug fixes in the skill's README.md under "更新日志".
