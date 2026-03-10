---
name: beaver-markdown-i18n
description: Translate and sync markdown documentation between languages (EN↔ZH/JA/KO). Handles new document translation and incremental sync when source updates. Preserves code blocks, frontmatter structure, links, and variables. Use when translating docs, localizing markdown, syncing i18n files, or when the user mentions translation, localization, multilingual documentation, 翻译, ローカライズ, or 번역.
---

# Markdown i18n

Token-efficient translation pipeline. Scripts handle parsing, caching, masking, and validation — you only translate the marked segments.

> **SKILL_DIR** — set this to the absolute path of this skill's root directory (the folder containing this SKILL.md). All `node` commands below use `$SKILL_DIR/scripts/`.

## Workflow (3 steps)

All scenarios — single file, batch, incremental sync — use the same pipeline.

### Step 1: Prepare [MUST]

Run the prepare command to generate a skeleton target file:

```bash
# Single file
node $SKILL_DIR/scripts/translate-cli.js prepare <source.md> <target.md> --lang <locale>

# Directory (batch / sync)
node $SKILL_DIR/scripts/translate-cli.js prepare <source_dir/> <target_dir/> --lang <locale>

# Seed TM from existing translations (one-time migration)
node $SKILL_DIR/scripts/translate-cli.js seed <source_dir/> <target_dir/> --lang <locale>
```

**What prepare does internally (you do NOT need to do these):**
- Loads `.i18n/no-translate.yaml`, `.i18n/translation-consistency.yaml`, and glossary
- Loads Translation Memory (`.i18n/<lang>.tm.jsonl`)
- Parses source markdown into segments via AST
- Fills in cached translations from TM
- Masks inline code, URLs, variables as `%%Pn%%` placeholders
- Masks fenced code blocks as `%%CB_<hash>%%` placeholders — hash-based IDs derived from content, so they survive chunk reordering
- Marks untranslated segments with `<!-- i18n:todo -->` markers
- Large files (>3000 chars): auto-splits into chunks in `.i18n/chunks/`, splitting at segment boundaries
- Writes skeleton + task metadata to `.i18n/task-meta.json`

Review the console output — it shows segments to translate, cached count, and any chunks generated.

### Step 2: Translate [MUST]

Open the skeleton file (or chunk files for large documents). For each `<!-- i18n:todo -->` section, translate the content between the markers to the target language.

**Rules:**
1. Translate ONLY the text between `<!-- i18n:todo -->` and `<!-- /i18n:todo -->` markers
2. Keep `%%Pn%%` and `%%CB_<hash>%%` placeholders **exactly as-is** — do NOT modify, delete, or reformat them
3. Do NOT touch segments without markers (they are cached translations)
4. You do NOT need to remove the markers — `apply.js` strips them automatically

**Example — before:**
```markdown
<!-- i18n:todo -->
See [configuration]%%P2%% for %%P1%% flag details.
<!-- /i18n:todo -->
```

**Example — after:**
```markdown
<!-- i18n:todo -->
参阅[配置]%%P2%%了解 %%P1%% 标志详情。
<!-- /i18n:todo -->
```

> **WARNING — Placeholders:** `%%Pn%%` and `%%CB_<hash>%%` are restored to original content (inline code, URLs, code blocks) by the apply script. If you delete or modify them, the final document will be broken. When in doubt, leave them in place.

**Large files (chunked):** If prepare generated chunks in `.i18n/chunks/`, translate **one chunk file at a time** in order (chunk-001, chunk-002, …). Read only the current chunk, translate all its `<!-- i18n:todo -->` sections, save, then move to the next chunk. Do NOT open multiple chunks simultaneously. After all chunks are translated, merge them back:
```bash
node $SKILL_DIR/scripts/translate-cli.js merge <target>
```

### Step 3: Apply [MUST]

Run the apply command to validate, unmask placeholders, and update TM:

```bash
node $SKILL_DIR/scripts/translate-cli.js apply <source> <target> [--lang <locale>]
```

**What apply does internally:**
- Auto-strips remaining `<!-- i18n:todo -->` markers
- Auto-fixes common placeholder mangling (spacing, casing)
- Restores `%%Pn%%` → original inline code/URLs, `%%CB_<hash>%%` → original code blocks
- Validates: code block integrity, heading count, link count, variables, frontmatter keys
- Updates Translation Memory with new translations
- Reports structured results per file

**If validation fails:** use quick-fix commands to resolve common issues, then re-run apply:

```bash
# Replace code blocks with source originals (when count matches)
node $SKILL_DIR/scripts/translate-cli.js fix codeblocks <source> <target>

# Restore link URLs from source (when count matches, keeps translated text)
node $SKILL_DIR/scripts/translate-cli.js fix links <source> <target>

# Fix mangled placeholders
node $SKILL_DIR/scripts/translate-cli.js fix placeholders <target>

# Strip leftover i18n:todo markers
node $SKILL_DIR/scripts/translate-cli.js fix markers <target>
```

### Step 4: Mark Done [MUST]

After apply passes, mark the file as done in the plan. This triggers **mandatory quality validation** — the `set` command automatically merges remaining chunks and runs all quality checks. If validation fails, the status change is rejected:

```bash
node $SKILL_DIR/scripts/plan-cli.js set <file_pattern> done
```

If validation fails, fix the issues (using fix commands from Step 3), then retry. Use `--skip-validation` only as a last resort.

**Standalone quality check** (without changing status):

```bash
node $SKILL_DIR/scripts/quality-cli.js <source> <target> --target-locale <locale>
```

This runs all checks including terminology compliance, untranslated content detection, section omission, external/relative link preservation, and frontmatter value translation. See `references/quality-checklist.md` for the full check list.

---

## CLI Quick Reference

Three CLI tools. All invoked as `node $SKILL_DIR/scripts/<cli>.js`.

### translate-cli.js — Translation Pipeline

```bash
T="node $SKILL_DIR/scripts/translate-cli.js"

# Core pipeline
$T prepare <source> <target> --lang <locale>           # Step 1: generate skeleton
$T apply <source> <target> [--lang <locale>]            # Step 3: validate & unmask
$T merge <target> [--project-dir .]                     # Merge chunks before apply
$T seed <source> <target> --lang <locale>               # Seed TM from existing pairs

# Quick fixes (run when apply reports errors, then re-run apply)
$T fix codeblocks <source> <target>                     # Restore source code blocks
$T fix links <source> <target>                          # Restore source link URLs
$T fix placeholders <target>                            # Fix mangled %%Pn%% / %%CB_hash%%
$T fix markers <target>                                 # Strip leftover i18n:todo markers

# Translation Memory management
$T tm stats [--lang <locale>]                           # Show TM entry counts
$T tm search <query> --lang <locale> [--limit N]        # Search by source/translated text
$T tm get <cache_key> --lang <locale>                   # Get single entry
$T tm add --lang <locale> --source <text> --translated <text>  # Add entry
$T tm update <cache_key> --lang <locale> --translated <text>   # Update translation
$T tm delete <cache_key> --lang <locale>                # Delete single entry
$T tm delete --file <rel_path> --lang <locale> [--dry-run]     # Delete all entries for a file
$T tm delete --match <query> --lang <locale> [--dry-run]       # Batch delete by text match
$T tm export --lang <locale> [--format jsonl|json]      # Export TM
$T tm compact --lang <locale>                           # Deduplicate & compact TM file
```

### quality-cli.js — Quality Checks

```bash
Q="node $SKILL_DIR/scripts/quality-cli.js"

$Q <source> <target> --target-locale <locale>           # Single file check
$Q --dir <source_dir> <target_dir> --target-locale <locale>  # Directory check
$Q <source> <target> --check structure,codeBlocks       # Run specific checks only
$Q <source> <target> --skip terminology                 # Skip specific checks
$Q <source> <target> --json                             # JSON output
```

Check IDs: `structure`, `codeBlocks`, `variables`, `links`, `terminology`, `untranslated`, `sections`, `frontmatterTranslated`

### plan-cli.js — Plan Management

```bash
P="node $SKILL_DIR/scripts/plan-cli.js"

$P init <source_dir> --lang <locale>                    # Initialize plan + run dir
$P status                                               # Show overall progress
$P list --status pending --sort lines [--limit N]       # Filter/list files
$P set <file_pattern> done [--notes "..."]              # Update single file status
$P set --batch --from pending --to in_progress [--match "gateway/*"]  # Batch update
$P add <file> [--status pending]                        # Add file to plan
$P add --match "gateway/*.md"                           # Add files by glob
$P scan [<target_dir>] [--lang <locale>]                # Re-scan target completeness
$P sync --mode git --from <commit> --to HEAD            # Detect source changes (git)
$P sync --mode hash                                     # Detect source changes (hash)
$P clean [--all] [--keep-plan] [--dry-run]              # Clean temp files
```

---

## Configuration

### `.i18n/no-translate.yaml`

Terms, headings, and sections to keep in the source language:

```yaml
# Frontmatter keys whose values should be translated
# Default: [title, summary, description, read_when]
frontmatter_translate_keys:
  - title
  - summary
  - description
  - read_when

headings:
  - text: "API Reference"
    reason: "Industry standard term"

terms:
  - text: "Gateway"
    reason: "Product name"

sections:
  - title: "Changelog"
    reason: "Historical record"
```

### `.i18n/translation-consistency.yaml`

Mandatory term translations:

```yaml
translations:
  install:
    en: Install
    zh: 安装
    ja: インストール
    ko: 설치
```

### Translation Memory

Location: `.i18n/<lang>.tm.jsonl`

Segment-level cache. On subsequent runs, `prepare.js` skips segments whose source text hash matches a TM entry and pre-fills the cached translation — only changed or new segments get `<!-- i18n:todo -->` markers.

To seed TM from existing translations:
```bash
node $SKILL_DIR/scripts/translate-cli.js seed <source_dir> <target_dir> --lang <locale>
```

---

## Plan Management

Unified CLI for managing translation plans.

```bash
node $SKILL_DIR/scripts/plan-cli.js <command> [options]
```

### Lifecycle

```bash
PLAN="node $SKILL_DIR/scripts/plan-cli.js"

# 1. Initialize: create run dir, detect changes, scan targets
$PLAN init <source_dir> --lang zh

# 2. Check progress
$PLAN status

# 3. List files to translate (sorted by size)
$PLAN list --status pending --sort lines

# 4. After translating a file, mark it done
$PLAN set <file_pattern> done

# 5. Re-scan targets after batch completion
$PLAN scan

# 6. Clean up temp files when plan is complete
$PLAN clean
```

### Commands

| Command | Purpose |
|---|---|
| `init` | Create run dir, sync source changes, scan targets |
| `scan` | Scan target files, compute translation completeness |
| `sync` | Detect source file changes (git diff or hash mode) |
| `add` | Add files to the plan (single, glob, or file list) |
| `status` | Show overall progress with completeness metrics |
| `list` | Filter/sort files by status, size, name |
| `set` | Update file status (single or batch) |
| `clean` | Remove temp files (run directories) |

### Sync modes

```bash
# Git mode (default): compare two commits
$PLAN sync --mode git --from abc1234 --to HEAD

# Hash mode: compare file hashes against plan records
$PLAN sync --mode hash
```

### Run directories

Each `init` creates `.i18n/runs/<timestamp>/` for temporary files (task-meta, chunks, manifest). `clean` removes the current run directory.
