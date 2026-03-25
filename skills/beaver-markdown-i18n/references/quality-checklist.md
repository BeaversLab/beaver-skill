# Quality Checklist

All checks below are automated by `quality-cli.js`. Run after translation:

```bash
node $SKILL_DIR/scripts/quality-cli.js <source.md> <target.md> --target-locale <tgt>
node $SKILL_DIR/scripts/quality-cli.js --dir <source_dir> <target_dir> --target-locale <tgt>
```

## Automated Checks

### Structure (`--check structure`)

| Check            | ID  | Severity | Description                                        |
| ---------------- | --- | -------- | -------------------------------------------------- |
| Heading count    | S1  | error    | Same number of `#`/`##`/`###` headings             |
| Code block count | S2  | error    | Same number of fenced code blocks                  |
| List item count  | S3  | warning  | Same number of list items (tolerance: 2)           |
| Frontmatter keys | S4  | error    | Keys match source exactly (only values translated) |
| Link count       | L1  | warning  | Same number of `[text](url)` links                 |

### Code Blocks (`--check codeBlocks`)

| Check             | ID  | Severity | Description                                          |
| ----------------- | --- | -------- | ---------------------------------------------------- |
| Content identical | C1  | error    | Every code block content is byte-identical to source |
| Language tags     | C2  | error    | Language tags match source (`bash`, `yaml`, etc.)    |

### Variables (`--check variables`)

| Check              | ID  | Severity | Description                                      |
| ------------------ | --- | -------- | ------------------------------------------------ |
| Mustache variables | V1  | error    | All `{{variables}}` preserved exactly (by count) |
| Env/template vars  | V2  | error    | All `$ENV_VARS` and `${variables}` preserved     |
| Format specifiers  | V3  | error    | All `%s`, `%d` preserved                         |

### Links (`--check links`)

| Check          | ID  | Severity | Description                            |
| -------------- | --- | -------- | -------------------------------------- |
| External URLs  | L2  | warning  | `http(s)://` URLs completely unchanged |
| Relative links | L3  | warning  | `../`, `./` links unchanged            |
| Anchor links   | L4  | warning  | `#anchor` parts preserved              |

### Terminology (`--check terminology`)

| Check              | ID  | Severity | Description                                                         |
| ------------------ | --- | -------- | ------------------------------------------------------------------- |
| No-translate terms | T1  | error    | Terms in `.i18n/no-translate.yaml` kept in source language          |
| Consistency terms  | T2  | warning  | Terms in `.i18n/translation-consistency.yaml` use exact translation |
| Industry terms     | T3  | error    | Common terms (API, CLI, OAuth, JWT, etc.) not mistranslated         |

### Completeness (`--check untranslated,sections,frontmatterTranslated`)

| Check                | ID  | Severity | Description                                                              |
| -------------------- | --- | -------- | ------------------------------------------------------------------------ |
| Untranslated content | K1  | warning  | No source-language paragraphs left untranslated                          |
| Section omission     | K2  | warning  | Heading hierarchy sequence matches source                                |
| Frontmatter values   | K3  | warning  | `title`/`summary`/`description`/`sidebar_label` translated (CJK targets) |

## Manual Checks (not automated)

| Check                                                | Reason                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| Command-line flags/technical commands not translated | Context-dependent; hard to distinguish from translatable text |
| `:param` URL parameters preserved                    | Already handled by `prepare.js` placeholder masking           |

## CLI Options

```bash
# Run all checks
node $SKILL_DIR/scripts/quality-cli.js source.md target.md --target-locale zh

# Run specific checks only
node $SKILL_DIR/scripts/quality-cli.js source.md target.md --target-locale zh --check structure,codeBlocks

# Skip specific checks
node $SKILL_DIR/scripts/quality-cli.js source.md target.md --target-locale zh --skip terminology

# JSON output (for programmatic use)
node $SKILL_DIR/scripts/quality-cli.js source.md target.md --target-locale zh --json

# Directory mode
node $SKILL_DIR/scripts/quality-cli.js --dir docs/en/ docs/zh/ --target-locale zh
```

## Exit Codes

- `0` — all checks passed (warnings are OK)
- `1` — one or more checks failed (errors found)
