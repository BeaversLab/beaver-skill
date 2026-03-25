# Changelog Internationalization Reference

## Section Title Translations

| Type     | en               | zh         | ja               | ko            | de               | fr                  | es                  |
| -------- | ---------------- | ---------- | ---------------- | ------------- | ---------------- | ------------------- | ------------------- |
| feat     | Features         | 新功能     | 新機能           | 새로운 기능   | Funktionen       | Fonctionnalités     | Características     |
| fix      | Fixes            | 修复       | 修正             | 수정          | Fehlerbehebungen | Corrections         | Correcciones        |
| docs     | Documentation    | 文档       | ドキュメント     | 문서          | Dokumentation    | Documentation       | Documentación       |
| refactor | Refactor         | 重构       | リファクタリング | 리팩토링      | Refactoring      | Refactorisation     | Refactorización     |
| perf     | Performance      | 性能优化   | パフォーマンス   | 성능          | Leistung         | Performance         | Rendimiento         |
| breaking | Breaking Changes | 破坏性变更 | 破壊的変更       | 주요 변경사항 | Breaking Changes | Changements majeurs | Cambios importantes |

## Changelog Format

```markdown
## {VERSION} - {YYYY-MM-DD}

### Features

- Description of new feature
- Description of third-party contribution (by @username)

### Fixes

- Description of fix

### Documentation

- Description of docs changes
```

Only include sections that have changes. Omit empty sections.

## Third-Party Attribution Rules

- Only add `(by @username)` for contributors who are NOT the repo owner
- Use GitHub username with `@` prefix
- Place at the end of the changelog entry line
- Apply to all languages consistently (always use `(by @username)` format, not translated)

## Multi-language Example

English (CHANGELOG.en.md):

```markdown
## 1.3.0 - 2026-01-22

### Features

- Add user authentication module (by @contributor1)
- Support OAuth2 login

### Fixes

- Fix memory leak in connection pool
```

Chinese (CHANGELOG.md):

```markdown
## 1.3.0 - 2026-01-22

### 新功能

- 新增用户认证模块 (by @contributor1)
- 支持 OAuth2 登录

### 修复

- 修复连接池内存泄漏问题
```

Japanese (CHANGELOG.ja.md):

```markdown
## 1.3.0 - 2026-01-22

### 新機能

- ユーザー認証モジュールを追加 (by @contributor1)
- OAuth2 ログインをサポート

### 修正

- コネクションプールのメモリリークを修正
```
