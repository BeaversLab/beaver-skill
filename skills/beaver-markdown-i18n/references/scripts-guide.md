# Scripts Guide

Utility scripts for the translation pipeline. All scripts run with Node.js >= 18.

Install dependencies first:
```bash
cd <skill-path> && pnpm install
```

## Pipeline Scripts (primary workflow)

| Script | Purpose | Usage |
|---|---|---|
| `prepare.js` | Pre-process source → skeleton with TM cache | `node scripts/prepare.js <src> <tgt> --lang <locale>` |
| `apply.js` | Post-process: unmask, validate, update TM | `node scripts/apply.js <src> <tgt>` |

### prepare.js

Generate a skeleton target file with Translation Memory caching and placeholder masking.

```bash
# Single file
node scripts/prepare.js docs/en/guide.md docs/zh/guide.md --lang zh-CN

# Directory (batch)
node scripts/prepare.js docs/en/ docs/zh/ --lang zh-CN

# Seed TM from existing translations
node scripts/prepare.js --seed-tm docs/en/ docs/zh/ --lang zh-CN

# With explicit source locale
node scripts/prepare.js docs/en/ docs/zh/ --lang zh-CN --src-lang en
```

**Output:**
- Skeleton file(s) at target path with `<!-- i18n:todo -->` markers
- Task metadata at `.i18n/task-meta.json`
- Console summary: segments to translate vs cached

**Internally loads:** `.i18n/no-translate.yaml`, `.i18n/translation-consistency.yaml`, glossary.md, Translation Memory.

### apply.js

Validate translations, unmask placeholders, and update Translation Memory.

```bash
# Single file
node scripts/apply.js docs/en/guide.md docs/zh/guide.md

# Directory
node scripts/apply.js docs/en/ docs/zh/

# With explicit locale
node scripts/apply.js docs/en/guide.md docs/zh/guide.md --lang zh-CN
```

**Checks performed:**
- No remaining `<!-- i18n:todo -->` markers
- All `%%Pn%%` placeholders intact (restored to original)
- Code block count and content preserved
- Heading count match
- Link localization
- Frontmatter key match

**Output:** Per-file PASS/FAIL report, TM update summary.

---

## Legacy Scripts (still available)

| Script | Purpose | Usage |
|---|---|---|
| `create-plan.js` | Generate initial translation plan | `node scripts/create-plan.js <src_dir> <tgt_dir>` |
| `sync-plan.js` | Create directory sync plan | `node scripts/sync-plan.js <src_dir> <tgt_dir>` |
| `git-diff-sync.js` | Create Git-based sync plan | `node scripts/git-diff-sync.js <src_file> <tgt_file>` |
| `update-plan.js` | Update file status in plan | `node scripts/update-plan.js <plan> <file> <status>` |
| `validate.js` | Validate translation quality | `node scripts/validate.js <source.md> <target.md>` |
| `diff-sections.js` | Find changed sections | `node scripts/diff-sections.js <old.md> <new.md>` |
| `read-no-translate.js` | Read no-translate config | `node scripts/read-no-translate.js` |

These scripts are still functional but the primary workflow now uses `prepare.js` + `apply.js`.

---

## Core Libraries (`scripts/lib/`)

| Module | Purpose |
|---|---|
| `tm.js` | Translation Memory — JSONL load/save, cache key generation |
| `segments.js` | Markdown AST parsing (remark/unified), segment extraction |
| `masking.js` | Placeholder masking/unmasking for inline code, URLs, variables |
