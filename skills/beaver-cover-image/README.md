# 文章封面图生成器 (beaver-cover-image)

简体中文

## 功能描述

**beaver-cover-image** 是一个面向文章和博客的 AI 封面图生成技能。它将封面设计抽象为 5 个可组合的视觉维度（类型、色板、渲染风格、文字密度、氛围）+ 字体，总计提供 9 种色板 × 6 种渲染风格 × 6 种封面类型的海量组合，并支持参考图驱动和 19 种风格预设快捷方式。

核心价值：**从文章内容自动分析视觉意图，一步生成风格统一、构图专业的封面图**，省去反复调试 prompt 和手动选色的繁琐过程。

🛠️ 版本说明：本项目基于 [技能 baoyu-cover-image](https://github.com/nicepkg/baoyu-skills/tree/main/skills/baoyu-cover-image) 进行二次开发。在保留核心五维设计体系和参考图工作流的基础上，统一了宽高比选项（6 种比例在所有配置文件中保持一致）、精简了 base-prompt 模板以减少重复 token 消耗、合并了参考图处理文档的冗余内容、新增了图像生成后端 `--ref` 能力检测与自动降级机制、增加了维度兼容矩阵的运行时校验与用户警告，并添加了按需加载 reference 的策略声明以优化上下文占用。

## 优点

- **5 维度参数化设计**：类型（hero/conceptual/typography 等）、色板（9 种）、渲染风格（6 种）、文字密度（4 级）、氛围（3 级）+ 字体（4 种），可精确控制也可全部自动
- **智能内容分析**：根据文章内容的主题、语气、关键词自动推荐最优的维度组合，无需手动选择
- **19 种风格预设**：`--style blueprint`、`--style watercolor` 等一键设定色板+渲染风格，同时保留单独覆盖的灵活性
- **参考图驱动**：支持传入参考图（`--ref`），深度分析品牌元素、签名纹样、色值并强制嵌入 prompt，确保输出与参考图属于同一视觉家族
- **兼容矩阵校验**：选择维度时自动检查色板×渲染、类型×渲染等 4 张兼容矩阵，不推荐的组合会主动警告并建议替代方案
- **Quick 模式**：`--quick` 跳过 6 维度确认（仅保留宽高比），适合快速迭代
- **可定制偏好**：通过 EXTEND.md 保存水印、默认维度、宽高比、输出目录、Quick 模式等偏好，首次使用时引导完成设置

## 使用场景

### 适合使用

- 为技术博客、公众号文章、个人 Newsletter 等内容创建封面图
- 需要统一视觉风格的系列文章封面（通过固定 EXTEND.md 偏好实现）
- 有参考图/品牌规范需要遵循的封面设计（通过 `--ref` 传入参考图）
- 快速迭代不同风格方案的封面选型（Quick 模式 + 切换 `--style`）

### 不适合使用

- 需要真实照片或写实风格的封面（技能使用简化剪影，禁止写实人像）
- 需要精确到像素级的排版控制
- 批量生成多篇文章的封面（每次仅输出一张）
- Logo 设计、UI 设计等非封面类设计需求

## 使用方法

### 触发方式

通过以下关键词或命令激活：

```bash
# 指定文章文件
/beaver-cover-image path/to/article.md

# Quick 模式
/beaver-cover-image article.md --quick

# 指定维度
/beaver-cover-image article.md --type conceptual --palette warm --rendering flat-vector

# 使用风格预设
/beaver-cover-image article.md --style blueprint

# 传入参考图
/beaver-cover-image article.md --ref brand-guide.png

# 直接粘贴内容
/beaver-cover-image --palette mono --aspect 1:1 --quick
[粘贴你的文章内容]
```

也可通过自然语言触发，提及："生成封面图"、"文章封面"、"create cover image"、"make cover" 等关键词。

### 基本流程

1. **加载偏好设置**：自动检查 EXTEND.md 配置文件，首次使用时引导完成 8 项初始设置（水印、类型、色板、渲染、宽高比、输出目录、Quick 模式、存储位置）
2. **内容分析**：分析文章的主题、语气、关键词和视觉隐喻，保存参考图（如有），确定输出目录
3. **确认维度**：展示 AI 推荐的 6 维度 + 宽高比供确认或调整（Quick 模式跳过维度确认）
4. **生成 prompt**：将确认后的维度、内容摘要、参考图信息写入结构化 prompt 文件
5. **生成封面图**：调用图像生成技能产出 `cover.png`（失败自动重试一次）
6. **输出完成报告**：汇总所有维度、文件路径和生成结果

### 示例对话

> **用户**：帮我生成一张封面图，文章是关于微服务架构演进的
>
> **技能**：
> 已分析内容，推荐配置：
>
> - 类型：conceptual（概念可视化）
> - 色板：cool（技术蓝调）
> - 渲染：digital（精致数字风）
> - 文字：title-only
> - 氛围：balanced
> - 字体：clean
>
> 请确认以上配置，或选择其他选项？
>
> **用户**：风格改成 blueprint
>
> **技能**：已切换为 blueprint 预设（cool + digital）。正在生成封面图… ✓ 完成！文件已保存至 `cover-image/microservices-evolution/cover.png`

## 参数说明

| 参数                 | 是否必填 | 默认值     | 说明                                                                                         |
| -------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------- |
| 内容源               | 是       | —          | 文件路径或直接粘贴的文本内容                                                                 |
| `--type <name>`      | 否       | 自动推荐   | 封面类型：`hero` / `conceptual` / `typography` / `metaphor` / `scene` / `minimal`            |
| `--palette <name>`   | 否       | 自动推荐   | 色板：`warm` / `elegant` / `cool` / `dark` / `earth` / `vivid` / `pastel` / `mono` / `retro` |
| `--rendering <name>` | 否       | 自动推荐   | 渲染风格：`flat-vector` / `hand-drawn` / `painterly` / `digital` / `pixel` / `chalk`         |
| `--style <name>`     | 否       | —          | 风格预设（色板+渲染的快捷组合），共 19 种                                                    |
| `--text <level>`     | 否       | title-only | 文字密度：`none` / `title-only` / `title-subtitle` / `text-rich`                             |
| `--mood <level>`     | 否       | balanced   | 氛围：`subtle` / `balanced` / `bold`                                                         |
| `--font <name>`      | 否       | clean      | 字体：`clean` / `handwritten` / `serif` / `display`                                          |
| `--aspect <ratio>`   | 否       | 16:9       | 宽高比：`16:9` / `2.35:1` / `4:3` / `3:2` / `1:1` / `3:4`                                    |
| `--lang <code>`      | 否       | 自动检测   | 标题语言（en, zh, ja 等）                                                                    |
| `--no-title`         | 否       | —          | 等同于 `--text none`                                                                         |
| `--quick`            | 否       | —          | 跳过 6 维度确认，使用自动选择                                                                |
| `--ref <files...>`   | 否       | —          | 参考图文件，用于风格/构图引导                                                                |

## 依赖

| 依赖项        | 类型       | 是否必须 | 说明                                                               |
| ------------- | ---------- | -------- | ------------------------------------------------------------------ |
| 图片生成能力  | 工具/技能  | 是       | 需要运行环境具备 AI 图片生成能力（如 beaver-image-gen 或同类技能） |
| 文件系统访问  | 运行时权限 | 是       | 用于保存源文件、prompt 文件、参考图和生成的封面图                  |
| Bash 命令执行 | 运行时权限 | 是       | 用于检查 EXTEND.md 配置文件是否存在                                |

## 注意事项

- **首次使用须完成初始设置**：未找到 EXTEND.md 时，技能会阻塞在 Step 0，必须先完成偏好设置才能继续
- **标题忠实原文**：技能使用用户提供或文章中提取的原始标题，不会自行编造或修改
- **角色处理**：涉及人物时仅使用简化剪影或图标符号，不生成写实人像
- **参考图优先级高**：传入参考图后，其视觉特征优先于默认偏好（色板/渲染风格），技能会强制将参考图元素嵌入 prompt
- **不兼容组合警告**：选择的维度组合在兼容矩阵中标记为不推荐时，会收到警告并获得替代建议
- **后端 `--ref` 降级**：若图像生成后端不支持 `--ref` 参数，技能会自动降级为风格提取模式并通知用户

## 常见问题

**Q：如何选择最适合我内容的风格？**
**A：** 不指定任何维度时，技能会根据文章内容的主题关键词自动推荐（如技术文章推荐 `cool` + `digital`，个人故事推荐 `warm` + `hand-drawn`）。你也可以在确认环节中调整。

**Q：`--style` 和单独指定 `--palette` / `--rendering` 有什么区别？**
**A：** `--style` 是预设快捷方式，一次设定色板和渲染风格。你可以用 `--style blueprint --rendering hand-drawn` 覆盖其中一个维度，显式参数总是优先。

**Q：参考图是如何影响生成结果的？**
**A：** 技能会深度分析参考图的品牌元素、色值、纹样和布局，然后用 "MUST"/"REQUIRED" 前缀将提取的特征写入 prompt，强制图像生成模型复现这些视觉元素。

**Q：如何保存偏好避免每次重新设置？**
**A：** 首次使用的初始设置会引导配置所有偏好，自动保存到 EXTEND.md。支持项目级（`.beaver-skill/beaver-cover-image/EXTEND.md`）和用户级（`$HOME/.beaver-skill/beaver-cover-image/EXTEND.md`）两种存储位置。

**Q：生成后想修改怎么办？**
**A：** 修改 `prompts/cover.md` 中的相关内容，然后请求重新生成。技能会自动备份原始封面图后覆盖生成。

## 致谢

本项目深受以下优秀作品的启发并基于其构建：

- [@Jim Liu 宝玉](https://github.com/JimLiu/)开发的技能[baoyu-cover-image](https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-cover-image)
