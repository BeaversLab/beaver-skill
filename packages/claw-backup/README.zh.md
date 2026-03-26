# @beaverslab/claw-backup

简体中文 | [English](./README.md)

基于规则的本地应用数据备份与恢复 CLI 工具。

## 安装

```bash
npm install -g @beaverslab/claw-backup
```

## 命令

### init-rule

创建新的备份规则文件。

```bash
# 交互模式（会提示输入规则名称）
claw-backup init-rule

# 通过参数指定名称
claw-backup init-rule --name my-project

# 不提供名称时自动生成时间戳命名
```

规则文件存储在 `~/.beaver-skill/beaver-claw-backup/` 目录。

### backup

使用规则文件运行备份。

```bash
# 交互选择
claw-backup backup

# 通过规则名称（在默认目录中查找）
claw-backup backup my-project

# 通过相对路径
claw-backup backup ./rules/my-project.yaml

# 通过绝对路径
claw-backup backup /path/to/rule.yaml
```

### restore

从备份归档恢复数据。

**模式一：基于规则的恢复**

```bash
# 交互选择规则和归档
claw-backup restore

# 使用指定规则（通过名称或路径）
claw-backup restore my-project
claw-backup restore ./rules/my-project.yaml
```

**模式二：直接解压**

```bash
# 直接解压归档到目标目录（无需规则文件）
claw-backup restore backup.tar.gz ~/restore-target
```

## 规则文件格式

规则文件为 YAML 格式，结构如下：

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

## 备份存储结构

备份按规则名称组织在子目录中：

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

每个规则的归档存储在 `{backupDir}/{ruleName}/` 目录，文件名为时间戳格式。

## 更新日志

[更新日志](CHANGELOG.md)

## 相关

相关的 skill 定义和用户文档位于 `skills/beaver-claw-backup/` 目录。
