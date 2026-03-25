---
name: beaver-claw-backup
description: Initialize backup rules and run backup or restore workflows for claw-style local apps. Use when the user asks to create or edit backup rules, run a backup, restore from an archive, or manage archive workflows for OpenClaw and similar claw variants.
---

# Beaver Claw Backup

Manage rule-based backup and restore workflows for claw-style local app data.

## Use This Skill When

- The user wants to initialize a backup rule
- The user wants to run a backup now
- The user wants to restore from an existing archive
- The user wants to add another claw preset under `references/default_rules/`

## Commands

```bash
npx @beaverslab/claw-backup init-rule
npx @beaverslab/claw-backup backup
npx @beaverslab/claw-backup restore
```

## Workflow

1. Run `init-rule` to create a YAML rule file under `~/.beaver-skill/beaver-claw-backup/`.
2. For `other`, edit the generated YAML rule before running backup.
3. Run `backup` to create a `tar.gz` archive from a selected rule.
4. Run `restore` to extract an archive into the selected target directory.

## Boundaries

- MVP preset: `openclaw`
- Runtime presets are packaged with `packages/claw-backup/references/default_rules/`
- Restore does not stop or restart external services
- Restore does not clear the target directory before extraction

Implementation details and rule semantics live in [README.zh-CN.md](README.zh-CN.md) and [references/restore.md](references/restore.md).
