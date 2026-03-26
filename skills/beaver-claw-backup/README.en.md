# Beaver Claw Backup

English | [简体中文](./README.md)

Beaver Claw Backup is a YAML-based command-line tool designed to help users quickly backup, migrate, and restore data for specialized tools or specific folders (e.g., OpenClaw, Skill-Creator, Cursor settings).

## Core Features

- **Blazing Fast**: Prioritizes `bunx` for near-instant task execution without installation.
- **Rich Presets**: Built-in rules for popular tools like OpenClaw, Cursor, and VSCodium.
- **Flexible Customization**: Supports custom backup paths, exclusion rules, and restore destinations.
- **AI-Friendly**: Provides non-interactive mode (`--yes`) and machine-readable output (`--json`).

## Quick Start

### 1. Initialize a Rule

Create a backup configuration for a specific tool or folder:

```bash
# Use Bun (Recommended, faster)
bunx @beaverslab/claw-backup init-rule --name my-cursor --preset cursor --yes

# Use Npx (If Bun is not installed)
npx @beaverslab/claw-backup@latest init-rule --name my-cursor --preset cursor --yes
```

### 2. Run a Backup

Run a backup based on an existing rule:

```bash
# Automatically backup content defined in the 'my-cursor' rule
bunx @beaverslab/claw-backup backup my-cursor --yes
```

### 3. Restore Data

Restore archived data back to its target directory:

```bash
# Restore to the default location specified in the rule
bunx @beaverslab/claw-backup restore my-cursor --yes

# Restore to a specific new location
bunx @beaverslab/claw-backup restore my-cursor ~/new-location --yes
```

## Argument Reference

| Argument           | Description                                           |
| :----------------- | :---------------------------------------------------- |
| `-y, --yes`        | Skip confirmation prompts (Essential for scripts/AI). |
| `--json`           | Output results as JSON for easy machine parsing.      |
| `--archive <path>` | Specify a specific `.tar.gz` file for restoration.    |
| `--name <name>`    | Specify the rule file name (defaults to timestamp).   |

## Locations

- **Rule Files**: `~/.beaver-skill/beaver-claw-backup/`
- **Default Backup Directory**: Usually `~/claw-backups/` or a custom path.

---

_Powered by BeaversLab_
