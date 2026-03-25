# @beaverslab/claw-backup

[简体中文](./README.zh.md) | English

Rule-based backup and restore CLI for claw-style local app data.

## Install

```bash
npm install -g @beaverslab/claw-backup
```

## Commands

### init-rule

Create a new backup rule file.

```bash
# Interactive mode (prompts for rule name)
claw-backup init-rule

# With custom name via flag
claw-backup init-rule --name my-project

# Auto-generated timestamp name if no name provided
```

Rule files are stored in `~/.beaver-skill/beaver-claw-backup/`.

### backup

Run backup using a rule file.

```bash
# Interactive selection
claw-backup backup

# By rule name (looks up in default directory)
claw-backup backup my-project

# By relative path
claw-backup backup ./rules/my-project.yaml

# By absolute path
claw-backup backup /path/to/rule.yaml
```

### restore

Restore from backup archive.

**Mode 1: Rule-based restore**

```bash
# Interactive selection of rule and archive
claw-backup restore

# Using a specific rule (by name or path)
claw-backup restore my-project
claw-backup restore ./rules/my-project.yaml
```

**Mode 2: Direct extraction**

```bash
# Extract archive directly to target directory (no rule needed)
claw-backup restore backup.tar.gz ~/restore-target
```

## Rule File Format

Rules are YAML files with the following structure:

```yaml
version: 1
clawType: openclaw
createdAt: 2026-03-25T12:00:00.000Z
sourceDir: ~/.openclaw
backupDir: ~/claw-backups
restoreDir: ~/.openclaw
include:
  - data/
  - config.json
exclude:
  - '*.tmp'
  - cache/
```

## Backup Storage Structure

Backups are organized by rule name in subdirectories:

```
~/claw-backups/
├── openclaw/
│   ├── 202603261200.tar.gz
│   └── 202603261800.tar.gz
├── myproject/
│   └── 202603261500.tar.gz
└── formatcheck/
    └── 202603251353.tar.gz
```

Each rule's archives are stored in `{backupDir}/{ruleName}/` with timestamp-based filenames.

## Changelog

### 0.3.0

- **Breaking**: Removed `archivePrefix` field from rule files
- Backup archives now organized by rule name: `{backupDir}/{ruleName}/{timestamp}.tar.gz`
- Archive filenames simplified to just `{timestamp}.tar.gz`

## Related

The associated skill definition and user-facing docs live under `skills/beaver-claw-backup/`.
