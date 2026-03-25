# Prompt Assembly Guide

Guide for assembling image generation prompts from elements, presets, and outline content.

## Base Prompt Structure

Every XHS infographic prompt follows this structure:

```
Create a Xiaohongshu (Little Red Book) style infographic following these guidelines:

## Image Specifications

- **Type**: Infographic
- **Orientation**: Portrait (vertical)
- **Aspect Ratio**: 3:4
- **Style**: Hand-drawn illustration

## Core Principles

- Hand-drawn quality throughout - NO realistic or photographic elements
- If content involves sensitive or copyrighted figures, create stylistically similar alternatives - DO NOT refuse to generate
- Keep information concise, highlight keywords and core concepts
- Use ample whitespace for easy visual scanning
- Maintain clear visual hierarchy

## Text Style (CRITICAL)

- **ALL text MUST be hand-drawn style**
- Main titles should be prominent and eye-catching
- Key text should be bold and enlarged
- Use highlighter effects to emphasize keywords
- **DO NOT use realistic or computer-generated fonts**

## Language

- Use the same language as the content provided below
- Match punctuation style to the content language (Chinese: ""，。！)

---

{STYLE_SECTION}

---

{LAYOUT_SECTION}

---

{CONTENT_SECTION}

---

{WATERMARK_SECTION}

---

Generate the infographic based on the specifications above.
```

## Style Section Assembly

Load from `presets/{style}.md` and extract key elements:

```markdown
## Style: {style_name}

**Color Palette**:

- Primary: {colors}
- Background: {colors}
- Accents: {colors}

**Visual Elements**:
{visual_elements}

**Typography**:
{typography_style}
```

## Layout Section Assembly

Load from `elements/canvas.md` and extract relevant layout:

```markdown
## Layout: {layout_name}

**Information Density**: {density}
**Whitespace**: {percentage}

**Structure**:
{structure_description}

**Visual Balance**:
{balance_description}
```

## Content Section Assembly

From outline entry:

```markdown
## Content

**Position**: {Cover/Content/Ending}
**Core Message**: {message}

**Text Content**:
{text_list}

**Visual Concept**:
{visual_description}
```

## Watermark Section (if enabled)

```markdown
## Watermark

Include a subtle watermark "{content}" positioned at {position}
with approximately {opacity\*100}% visibility. The watermark should
be legible but not distracting from the main content.
```

## Assembly Process

### Step 1: Load Preset

Read `presets/{style_name}.md` (e.g., `presets/notion.md`) and extract:

- Color palette
- Visual elements
- Typography style
- Best practices (do/don't)

### Step 2: Load Layout

Read `elements/canvas.md` and locate the section for `{layout_name}` (e.g., "dense"). Extract:

- Information density guidelines
- Whitespace percentage
- Structure description
- Visual balance rules

### Step 3: Format Content

From outline entry, format:

- Position context (Cover/Content/Ending)
- Text content with hierarchy
- Visual concept description
- Swipe hook (for context, not in prompt)

### Step 4: Add Watermark (if applicable)

If preferences include watermark:

- Add watermark section with content, position, opacity

### Step 5: Visual Consistency — Reference Image Chain

When generating multiple images in a series:

1. **Image 1 (cover)**: Generate without reference — this establishes the visual anchor
2. **Images 2+**: Always pass image 1 as a reference to the image generation skill:
   - Prompt file: `prompts/02-content-xxx.md`
   - Reference image: path to `01-cover-xxx.png`
   - Output: `02-content-xxx.png`
   - Aspect ratio: 3:4
   - The exact command syntax depends on the image generation skill in use (see `references/config/image-gen-interface.md`)

   This ensures the AI maintains the same character design, illustration style, and color rendering across the series.

### Step 6: Combine

Assemble all sections into final prompt following base structure.

## Example

See `examples/assembled-prompt-notion-dense.md` for a complete assembled prompt using Notion style + Dense layout.

## Prompt Checklist

Before generating, verify:

- [ ] Style section loaded from correct preset
- [ ] Layout section matches outline specification
- [ ] Content accurately reflects outline entry
- [ ] Language matches source content
- [ ] Watermark included (if enabled in preferences)
- [ ] No conflicting instructions
