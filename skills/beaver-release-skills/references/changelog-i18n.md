# Changelog Internationalization & Formatting Reference

## Version Header Format

Standard: `## {VERSION} - {YYYY-MM-DD}` (e.g., `## 0.5.2 - 2026-03-26`)

## Section Categories & Translations

| Type     | en                   | zh         | Description                                      |
| -------- | -------------------- | ---------- | ------------------------------------------------ |
| feat     | New Features         | 新功能     | Significant new functionality                    |
| fix      | Improvements & Fixes | 优化与修复 | Bug fixes, minor improvements, and refactors     |
| ci       | CI/CD                | CI/CD      | Changes to workflows, scripts, and build systems |
| docs     | Documentation        | 文档       | Changes to READMEs, SKILLs, and other docs       |
| breaking | Breaking Changes     | 破坏性变更 | Incompatible API or workflow changes             |

## Rules

1. **File Scanning**: Always check for all `CHANGELOG*.md` files in the root directory.
2. **Synchronization**: All identified changelog files MUST be updated simultaneously for every release.
3. **Consistency**: Use the exact category names from the table above.
4. **Empty Sections**: Omit sections that do not have any changes for the current version.
5. **Attribution**: Only add `(by @username)` for non-owner contributors at the end of the line.

## Multi-language Example

**English (CHANGELOG.en.md):**

```markdown
## 0.5.2 - 2026-03-26

### New Features

- Add support for parallel image generation

### Improvements & Fixes

- Refactor internal task management for better reliability

### CI/CD

- Update release workflow to support multi-language changelogs

### Documentation

- Update beaver-release-skills instructions
```

**Chinese (CHANGELOG.md):**

```markdown
## 0.5.2 - 2026-03-26

### 新功能

- 新增支持并行生成图像的功能

### 优化与修复

- 重构内部任务管理，提升可靠性

### CI/CD

- 更新发布工作流，支持多语言 Changelog 同步

### 文档

- 更新 beaver-release-skills 技能说明
```
