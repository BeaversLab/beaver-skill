# i18n Glossary

Default terminology conventions bundled with the skill.
Project-level `.i18n/translation-consistency.yaml` takes precedence over entries here.

## Links

Link URLs are masked as placeholders and restored unchanged. Locale prefix rewriting
(e.g. `/en/` → `/zh/`) is the project's responsibility and is **not** performed by
this skill.

## Terms to Keep in English

These terms should NOT be translated in any target language:

| Term | Reason |
|---|---|
| API | Industry standard |
| CLI | Industry standard |
| URL | Industry standard |
| UI | Industry standard |
| OAuth | Protocol name |
| JWT | Protocol name |
| SSL/TLS | Protocol names |
| HTTP/HTTPS | Protocol names |
| RPC | Protocol name |
| JSON/YAML | Format names |
| webhook | Technical term |
| npm | Tool name |
| Node.js | Tool name |
| PATH | Environment concept |

## Context-Dependent Terms

| Term | ZH | JA | Context |
|---|---|---|---|
| Run | 运行 | 実行 / 稼働 | Command / Server |
| Service | 服务 | サービス | All contexts |
| Model | 模型 / 数据模型 | モデル / データモデル | AI / Data |

## Command-Line Flags

Never translate flags or their values: `--verbose`, `--beta`, `-s`

## Placeholder Patterns

Keep unchanged:
- `{{variable}}` — Mustache variables
- `${variable}` — Shell/template variables
- `$VARIABLE` — Environment variables
- `%s`, `%d` — Format specifiers
- `:param` — URL parameters
