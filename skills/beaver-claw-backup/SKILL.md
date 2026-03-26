---
name: beaver-claw-backup
description: Backup, restore, and migrate workspace data or tool configurations. Use when the user mentions "backup", "restore", "snapshot", "migrate", "备份", "恢复", "还原", "迁移", or "存档".
---

# Backup & Restore Instructions

Manage data persistence for tools and directories. Use `bunx` for execution. Prefer `--yes` and `--json` flags for non-interactive tasks.

## Common Workflows

### 1. Create a Backup Rule

- **Built-in Preset**: `bunx @beaverslab/claw-backup init-rule --name <name> --preset <preset> --yes`
- **Custom Path**: `bunx @beaverslab/claw-backup init-rule --name <name> --preset other --type <type> --src <path> --dest <path> --yes`

### 2. Run a Backup

- **Silent**: `bunx @beaverslab/claw-backup backup <rule-name> --yes`
- **Machine Read**: `bunx @beaverslab/claw-backup backup <rule-name> --json`

### 3. Restore Data

- **By Rule**: `bunx @beaverslab/claw-backup restore <rule-name> [target-dir] --yes`
- **By Archive**: `bunx @beaverslab/claw-backup restore <rule-name> --archive <path> --yes`
- **Direct**: `bunx @beaverslab/claw-backup restore <archive.tar.gz> <target-dir> --yes`

## Fallback & Compatibility

If `bun` is not installed, use `npx @beaverslab/claw-backup@latest` instead of `bunx @beaverslab/claw-backup`.

## Troubleshooting & Schema

- **Rules Location**: `~/.beaver-skill/beaver-claw-backup/`
- **Rule Format**: See [YAML Schema](references/default_rules/openclaw.yaml)
- **Recovery Details**: See [Restore Guide](references/restore.md)
