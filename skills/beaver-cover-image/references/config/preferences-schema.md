---
name: preferences-schema
description: EXTEND.md YAML schema for beaver-cover-image user preferences
---

# Preferences Schema

## Full Schema

```yaml
---
version: 1

watermark:
  enabled: false
  content: ""
  position: bottom-right  # bottom-right|bottom-left|bottom-center|top-right

preferred_type: null      # hero|conceptual|typography|metaphor|scene|minimal or null for auto-select

preferred_palette: null   # warm|elegant|cool|dark|earth|vivid|pastel|mono|retro or null for auto-select

preferred_rendering: null # flat-vector|hand-drawn|painterly|digital|pixel|chalk or null for auto-select

preferred_text: title-only  # none|title-only|title-subtitle|text-rich

preferred_mood: balanced    # subtle|balanced|bold

default_aspect: "16:9"   # 16:9|2.35:1|4:3|3:2|1:1|3:4

quick_mode: false         # Skip confirmation when true

language: null            # zh|en|ja|ko|auto (null = auto-detect)

custom_palettes:
  - name: my-palette
    description: "Palette description"
    colors:
      primary: ["#1E3A5F", "#4A90D9"]
      background: "#F5F7FA"
      accents: ["#00B4D8"]
    decorative_hints: "Clean lines, geometric shapes"
    best_for: "Business, tech content"
---
```

## Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | int | 1 | Schema version |
| `watermark.enabled` | bool | false | Enable watermark |
| `watermark.content` | string | "" | Watermark text (@username or custom) |
| `watermark.position` | enum | bottom-right | Position on image |
| `preferred_type` | string | null | Type name or null for auto |
| `preferred_palette` | string | null | Palette name or null for auto |
| `preferred_rendering` | string | null | Rendering name or null for auto |
| `preferred_text` | string | title-only | Text density level |
| `preferred_mood` | string | balanced | Mood intensity level |
| `default_aspect` | string | "16:9" | Default aspect ratio |
| `quick_mode` | bool | false | Skip confirmation step |
| `language` | string | null | Output language (null = auto-detect) |
| `custom_palettes` | array | [] | User-defined palettes |

## Type Options

| Value | Description |
|-------|-------------|
| `hero` | Large visual impact, title overlay |
| `conceptual` | Concept visualization, abstract core ideas |
| `typography` | Text-focused layout, prominent title |
| `metaphor` | Visual metaphor, concrete expressing abstract |
| `scene` | Atmospheric scene, narrative feel |
| `minimal` | Minimalist composition, generous whitespace |

## Palette Options

| Value | Description |
|-------|-------------|
| `warm` | Friendly, approachable — orange, golden yellow, terracotta |
| `elegant` | Sophisticated, refined — soft coral, muted teal, dusty rose |
| `cool` | Technical, professional — engineering blue, navy, cyan |
| `dark` | Cinematic, premium — electric purple, cyan, magenta |
| `earth` | Natural, organic — forest green, sage, earth brown |
| `vivid` | Energetic, bold — bright red, neon green, electric blue |
| `pastel` | Gentle, whimsical — soft pink, mint, lavender |
| `mono` | Clean, focused — black, near-black, white |
| `retro` | Nostalgic, vintage — muted orange, dusty pink, maroon |

## Rendering Options

| Value | Description |
|-------|-------------|
| `flat-vector` | Clean outlines, uniform fills, geometric icons |
| `hand-drawn` | Sketchy, organic, imperfect strokes, paper texture |
| `painterly` | Soft brush strokes, color bleeds, watercolor feel |
| `digital` | Polished, precise edges, subtle gradients, UI components |
| `pixel` | Pixel grid, dithering, chunky 8-bit shapes |
| `chalk` | Chalk strokes, dust effects, blackboard texture |

## Text Options

| Value | Description |
|-------|-------------|
| `none` | Pure visual, no text elements |
| `title-only` | Single headline |
| `title-subtitle` | Title + subtitle |
| `text-rich` | Title + subtitle + keyword tags (2-4) |

## Mood Options

| Value | Description |
|-------|-------------|
| `subtle` | Low contrast, muted colors, calm aesthetic |
| `balanced` | Medium contrast, normal saturation, versatile |
| `bold` | High contrast, vivid colors, dynamic energy |

## Position Options

| Value | Description |
|-------|-------------|
| `bottom-right` | Lower right corner (default, most common) |
| `bottom-left` | Lower left corner |
| `bottom-center` | Bottom center |
| `top-right` | Upper right corner |

## Aspect Ratio Options

| Value | Description | Best For |
|-------|-------------|----------|
| `16:9` | Standard widescreen (default) | Presentations, video thumbnails |
| `2.35:1` | Cinematic widescreen | Article headers, blog covers |
| `4:3` | Classic | Traditional displays, slides |
| `3:2` | Photo standard | Photography, editorial |
| `1:1` | Square | Social media, profile images |
| `3:4` | Portrait | Xiaohongshu, Pinterest, mobile content |

## Custom Palette Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique palette identifier (kebab-case) |
| `description` | Yes | What the palette conveys |
| `colors.primary` | No | Main colors (array of hex) |
| `colors.background` | No | Background color (hex) |
| `colors.accents` | No | Accent colors (array of hex) |
| `decorative_hints` | No | Decorative elements and patterns |
| `best_for` | No | Recommended content types |

## Example: Minimal Preferences

```yaml
---
version: 1
watermark:
  enabled: true
  content: "@myhandle"
preferred_type: null
preferred_palette: elegant
preferred_rendering: hand-drawn
preferred_text: title-only
preferred_mood: balanced
quick_mode: false
---
```

## Example: Full Preferences

```yaml
---
version: 1
watermark:
  enabled: true
  content: "myblog.com"
  position: bottom-right

preferred_type: conceptual

preferred_palette: cool

preferred_rendering: digital

preferred_text: title-subtitle

preferred_mood: subtle

default_aspect: "16:9"

quick_mode: true

language: en

custom_palettes:
  - name: corporate-tech
    description: "Professional B2B tech palette"
    colors:
      primary: ["#1E3A5F", "#4A90D9"]
      background: "#F5F7FA"
      accents: ["#00B4D8", "#48CAE4"]
    decorative_hints: "Clean lines, subtle gradients, circuit patterns"
    best_for: "SaaS, enterprise, technical"
---
```

