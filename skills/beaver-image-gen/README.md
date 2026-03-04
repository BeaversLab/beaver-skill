# beaver-image-gen

简体中文

## 功能描述

统一的 AI 图像生成技能，将 Google Gemini、OpenAI GPT Image、DashScope（阿里通义万象）和 Replicate 四个平台的图像生成 API 封装为一条 CLI 命令。Agent 或其他技能只需传入提示词和输出路径，无需关心底层 API 差异。支持文本生成图像、参考图编辑、多种宽高比和质量预设，并通过 EXTEND.md 实现偏好持久化。

## 优点

- **一个命令覆盖四个平台**：无需为每个 provider 编写不同调用逻辑，切换 provider 只需改一个参数
- **自动检测可用 provider**：根据环境中存在的 API key 自动选择，零配置即可开始使用
- **偏好持久化**：首次使用后通过 EXTEND.md 保存默认 provider、模型、质量等设置，后续调用无需重复指定
- **参考图支持**：Google Gemini 和 OpenAI GPT Image 支持传入参考图进行风格迁移或编辑
- **多级配置优先级**：CLI 参数 > EXTEND.md > 环境变量 > 项目 .env > 全局 .env，灵活覆盖

🛠️ 版本说明：本项目基于 [技能 baoyu-image-gen](https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-image-gen) 进行二次开发。在保留核心逻辑的基础上，重点修复了 .env 加载优先级，强化了 Google provider 的 API Key 安全机制（采用配置临时文件传递），并为所有 Provider 的 fetch 调用引入了 300 秒超时及 Replicate 的指数退避轮询，同时增加了对 `--n` 参数的显式支持和 DashScope 错误提示的优化，并通过内联首次设置流程及完善文档，显著提升了工具的可靠性和易用性。

## 使用场景

### 适合使用

- 需要在 Agent 工作流中自动生成图像（封面、插画、信息图等）
- 配合 `beaver-xhs-images` 等下游技能批量生成系列图片
- 基于参考图进行风格一致的图像编辑
- 快速切换不同 provider 比较生成效果
- 中文内容创作场景（DashScope 对中文提示词支持较好）

### 不适合使用

- 需要精确局部编辑（inpainting/mask）的场景
- 视频生成
- 需要在单次调用中生成大量（10+）图片并自动拼接的场景
- 需要 sessionId 级别的跨图片严格风格一致性保证

## 使用方法

### 触发方式

当用户要求"生成图片"、"画一张图"、"generate image"、"create image"、"draw"等表述时自动触发。

### 基本流程

1. **首次使用**：技能检测到无 EXTEND.md，弹出设置向导，选择默认 provider、模型、质量和存储位置
2. **生成图像**：提供提示词和输出路径，执行生成命令
3. **查看结果**：图像保存到指定路径，`--json` 模式可输出元信息

### 示例对话

> **用户**：帮我生成一张可爱的猫咪图片
>
> **技能**：Using google / gemini-3-pro-image-preview
> Switch model: --model \<id\> | EXTEND.md default_model.google | env GOOGLE_IMAGE_MODEL
>
> *(执行命令，生成图片)*
>
> 图片已保存到 cat.png

> **用户**：用这张图作为参考，生成一张蓝色调的版本
>
> **技能**：*(使用 --ref 参数传入参考图，生成编辑后的图片)*

## 参数说明

| 参数 | 是否必填 | 默认值 | 说明 |
|------|---------|--------|------|
| `--prompt` / `-p` | 是（三选一） | — | 提示词文本 |
| `--promptfiles` | 是（三选一） | — | 从文件读取提示词（多文件拼接） |
| stdin | 是（三选一） | — | 从标准输入读取提示词 |
| `--image` | 是 | — | 输出图像路径 |
| `--provider` | 否 | 自动检测 | 指定 provider：google / openai / dashscope / replicate |
| `--model` / `-m` | 否 | 按 provider 默认 | 模型 ID |
| `--ar` | 否 | 1:1 | 宽高比，如 16:9、4:3、3:4 |
| `--size` | 否 | 按质量预设 | 精确尺寸，如 1024x1024 |
| `--quality` | 否 | 2k | 质量预设：normal (1024px) / 2k (2048px) |
| `--imageSize` | 否 | 按 quality | Google 专用图像尺寸：1K / 2K / 4K |
| `--ref` | 否 | — | 参考图路径，支持 Google Gemini 和 OpenAI GPT Image |
| `--n` | 否 | 1 | 生成数量。支持 OpenAI (非 dall-e-3)、Imagen、Replicate；Gemini 多模态会警告并只生成 1 张 |
| `--json` | 否 | false | 输出 JSON 格式结果 |

## 依赖

| 依赖项 | 类型 | 是否必须 | 说明 |
|--------|------|---------|------|
| Node.js >= 18 | 运行时 | 是 | 用于 npx 调用 |
| Bun | 运行时 | 是 | 通过 `npx -y bun` 自动安装，执行 TypeScript 脚本 |
| API Key（至少一个） | 凭证 | 是 | GOOGLE_API_KEY / OPENAI_API_KEY / DASHSCOPE_API_KEY / REPLICATE_API_TOKEN |
| curl | 系统工具 | 否 | 仅在 Google provider 检测到 HTTP 代理时使用 |

## 注意事项

- **首次使用必须完成设置**：没有 EXTEND.md 时技能会阻塞，必须先完成 provider/模型/质量选择
- **参考图有 provider 限制**：仅 Google Gemini 多模态模型和 OpenAI GPT Image 系列支持 `--ref`，DashScope 不支持
- **配置优先级**：CLI 参数 > EXTEND.md > 环境变量 > 项目级 .env > 用户级 .env
- **生成失败自动重试一次**：非配置类错误（如 API 临时故障）会自动重试
- **输出单文件**：即使 `--n > 1`，当前只保存第一张图到指定路径

## 常见问题

**Q：支持哪些模型？**
**A：** Google: gemini-3-pro-image-preview、gemini-3.1-flash-image-preview、gemini-3-flash-preview、imagen-3.0-*；OpenAI: gpt-image-1.5、gpt-image-1、dall-e-3、dall-e-2；DashScope: z-image-turbo、z-image-ultra；Replicate: 任何 owner/name 格式的模型。

**Q：如何切换默认 provider？**
**A：** 三种方式：1) 命令行 `--provider openai`；2) 修改 EXTEND.md 中的 `default_provider`；3) 只保留一个 API key 在环境变量中。

**Q：参考图不生效怎么办？**
**A：** 确认使用的是支持参考图的 provider 和模型。Google 需要 Gemini 系列（非 Imagen），OpenAI 需要 GPT Image 系列（非 dall-e）。可通过 `--provider google --model gemini-3-pro-image-preview` 显式指定。

**Q：代理环境下 Google 请求失败？**
**A：** 技能检测到 HTTP 代理时会自动切换为 curl 发送请求（绕过 Bun fetch 的代理兼容性问题）。确保系统安装了 curl 并且代理配置正确（支持 `https_proxy`、`HTTPS_PROXY`、`http_proxy`、`HTTP_PROXY`、`ALL_PROXY`）。

---

## 更新日志-2026.03.04

### Bug 修复

| 改动 | 文件 | 说明 |
|------|------|------|
| 修复 .env 加载优先级 | `scripts/main.ts` | 项目级 .env 现在正确覆盖用户级 .env，与文档声明一致 |

### 安全性

| 改动 | 文件 | 说明 |
|------|------|------|
| API key 不再出现在进程命令行 | `scripts/providers/google.ts` | Google curl 路径改用 `--config` 临时文件传递 API key header，`ps` 不再可见密钥 |

### 可靠性

| 改动 | 文件 | 说明 |
|------|------|------|
| fetch 请求超时 | `scripts/providers/openai.ts`、`scripts/providers/dashscope.ts` | 所有 fetch 调用添加 300 秒超时（`AbortSignal.timeout`），防止无限等待 |
| Replicate 指数退避轮询 | `scripts/providers/replicate.ts` | 轮询间隔从固定 2 秒改为 500ms → 1s → 2s → 4s → 8s 指数退避 |

### 功能完善

| 改动 | 文件 | 说明 |
|------|------|------|
| `--n` 参数显式处理 | `scripts/providers/google.ts`、`scripts/providers/openai.ts` | Gemini 多模态和 chat completions 路径在 n > 1 时输出警告；OpenAI generations 正确传递 n 参数 |
| DashScope 错误消息完善 | `scripts/providers/dashscope.ts` | 参考图不支持的错误提示现在列出所有可用替代方案（Google、OpenAI、Replicate） |

### 文档优化

| 改动 | 文件 | 说明 |
|------|------|------|
| 首次设置流程内联 | `SKILL.md` | 关键设置步骤内联到 SKILL.md，Agent 无需额外读取 first-time-setup.md 即可完成设置 |
| `--n` 支持说明 | `SKILL.md` | 文档标注了各 provider 对 `--n` 参数的支持情况 |

## 致谢
本项目深受以下优秀作品的启发并基于其构建：

- [@Jim Liu 宝玉](https://github.com/JimLiu/)开发的技能[baoyu-image-gen](https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-image-gen)