## 0.4.1 - 2026-03-11
### Features
- beaver-markdown-i18n: enhance translation scripts with placeholder checks and task metadata management
### Documentation
- project: update README files and remove redundant lines for better clarity
- beaver-release-skills: update README documentation

## 0.4.0 - 2026-03-10
### Features
- beaver-markdown-i18n: Add comprehensive Markdown translation pipeline with AST-level masking and incremental sync
- beaver-markdown-i18n: Add unified CLI tools (translate-cli, quality-cli, plan-cli)
- beaver-skill: Add AGENTS.md to define skill structure standards
### Improvements
- beaver-markdown-i18n: Consolidate scripts and enhance quality validation process

# Changelog

## 0.3.0 - 2026-03-06

### Features
- **beaver-cover-image**: Introduced cover image generation skill with 5 dimensions of visual customization.
- **beaver-release-skills**: Added comprehensive English documentation.

### Improvements & Fixes
- **beaver-release-skills**: Removed automated npm publishing workflow (use npx skills for direct installation).
- **beaver-cover-image**: Added more aspect ratio options (4:3, 3:2) and set 16:9 as default.
- **Project**: Enhanced README with structured installation and quick start instructions.

## 0.2.4 - 2026-03-05

### Optimizations
- **CI**: Successfully configured NPM token and restored automated publishing flow

## 0.2.2 - 2026-03-05

### Fixes
- **CI**: Fix GitHub Action failure where `npm version` errors when the version in `package.json` is already updated

## 0.2.1 - 2026-03-05

### Features
- **project**: Add .gitignore and convert core skills section to table format for better readability
- **beaver-release-skills**: Add detailed Chinese and English README documentation

## 0.2.0 - 2026-03-05

### Features
- **beaver-release-skills**: include beaver-release-skills and sync remote URL
- **beaver-image-gen**: Introduce beaver-image-gen skill for AI image generation
- **beaver-xhs-images**: Enhance with layout preferences, error recovery, and comprehensive documentation
- **project**: Initialize project with package.json, GitHub Actions, and multilingual READMEs
