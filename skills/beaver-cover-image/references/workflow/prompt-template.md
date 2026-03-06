# Step 3: Prompt Template

Save to `prompts/cover.md`:

```markdown
---
type: cover
palette: [confirmed palette]
rendering: [confirmed rendering]
references:
  - ref_id: 01
    filename: refs/ref-01-{slug}.{ext}
    usage: direct | style | palette
  - ref_id: 02
    filename: refs/ref-02-{slug}.{ext}
    usage: direct | style | palette
---

# Content Context
Article title: [full original title from source]
Content summary: [2-3 sentence summary of key points and themes]
Keywords: [5-8 key terms extracted from content]

# Visual Design
Cover theme: [2-3 words visual interpretation]
Type: [confirmed type]
Palette: [confirmed palette]
Rendering: [confirmed rendering]
Font: [confirmed font]
Text level: [confirmed text level]
Mood: [confirmed mood]
Aspect ratio: [confirmed ratio]
Language: [confirmed language]

# Text Elements
[Based on text level:]
- none: "No text elements"
- title-only: "Title: [exact title from source or user]"
- title-subtitle: "Title: [title] / Subtitle: [context]"
- text-rich: "Title: [title] / Subtitle: [context] / Tags: [2-4 keywords]"

# Mood Application
[Based on mood level:]
- subtle: "Use low contrast, muted colors, light visual weight, calm aesthetic"
- balanced: "Use medium contrast, normal saturation, balanced visual weight"
- bold: "Use high contrast, vivid saturated colors, heavy visual weight, dynamic energy"

# Font Application
[Based on font style:]
- clean: "Use clean geometric sans-serif typography. Modern, minimal letterforms."
- handwritten: "Use warm hand-lettered typography with organic brush strokes. Friendly, personal feel."
- serif: "Use elegant serif typography with refined letterforms. Classic, editorial character."
- display: "Use bold decorative display typography. Heavy, expressive headlines."

# Composition
Type composition:
- [Type-specific layout and structure]

Visual composition:
- Main visual: [metaphor derived from content meaning]
- Layout: [positioning based on type and aspect ratio]
- Decorative: [palette-specific elements that reinforce content theme]

Color scheme: [primary, background, accent from palette definition, adjusted by mood]
Rendering notes: [key characteristics from rendering definition — lines, texture, depth, element style]
Type notes: [key characteristics from type definition]
Palette notes: [key characteristics from palette definition]

[Watermark section if enabled]

[Reference images section if provided — REQUIRED, see below]
```

## Reference-Driven Design ⚠️ HIGH PRIORITY

When reference images are provided, they are the **primary visual input** and MUST strongly influence the output. The cover should look like it belongs to the same visual family as the references.

**Passing `--ref` alone is NOT enough.** Image generation models often ignore reference images unless the prompt text explicitly describes what to reproduce. Always combine `--ref` with detailed textual instructions.

## Content-Driven Design

- Article title and summary inform the visual metaphor choice
- Keywords guide decorative elements and symbols
- The skill controls visual style; the content drives meaning

## Visual Element Selection

Match content themes to icon vocabulary:

| Content Theme | Suggested Elements |
|---------------|-------------------|
| Programming/Dev | Code window, terminal, API brackets, gear |
| AI/ML | Brain, neural network, robot, circuit |
| Growth/Business | Chart, rocket, plant, mountain, arrow |
| Security | Lock, shield, key, fingerprint |
| Communication | Speech bubble, megaphone, mail, handshake |
| Tools/Methods | Wrench, checklist, pencil, puzzle |

Full library: [../visual-elements.md](../visual-elements.md)

## Type-Specific Composition

| Type | Composition Guidelines |
|------|------------------------|
| `hero` | Large focal visual (60-70% area), title overlay on visual, dramatic composition |
| `conceptual` | Abstract shapes representing core concepts, information hierarchy, clean zones |
| `typography` | Title as primary element (40%+ area), minimal supporting visuals, strong hierarchy |
| `metaphor` | Concrete object/scene representing abstract idea, symbolic elements, emotional resonance |
| `scene` | Atmospheric environment, narrative elements, mood-setting lighting and colors |
| `minimal` | Single focal element, generous whitespace (60%+), essential shapes only |

## Title Guidelines

When text level includes title:
- **Source**: Use the exact title provided by user, or extract from source content
- **Do NOT invent titles**: Stay faithful to the original
- Match confirmed language

## Watermark Application

If enabled in preferences, add to prompt:

```
Include a subtle watermark "[content]" positioned at [position].
The watermark should be legible but not distracting from the main content.
```

Reference: `config/watermark-guide.md`

## Reference Image Handling

For input detection, file saving, analysis, and usage type rules, see [reference-images.md](reference-images.md).

### Frontmatter References

**MUST add `references` field in YAML frontmatter** when reference files are saved to `refs/`:

```yaml
references:
  - ref_id: 01
    filename: refs/ref-01-podcast-thumbnail.jpg
    usage: style
```

**Omit `references` field entirely** if no reference files saved (style extracted verbally only).

**Before writing prompt with references, verify**: `test -f refs/ref-NN-{slug}.{ext}`

### Embedding References in Prompt Body ⚠️ CRITICAL

**Passing `--ref` alone is NOT enough.** Image generation models frequently ignore reference images unless the prompt text explicitly describes what to reproduce. **ALWAYS** add a detailed mandatory section in the prompt body:

```
# Reference Style — MUST INCORPORATE

CRITICAL: The generated cover MUST visually reference the provided images.

## From Ref 1 ([filename]) — REQUIRED elements:
- [Brand element]: [Specific description, e.g., "The logo uses vertical parallel lines (|||) for the letter 'm'."]
- [Signature pattern]: [Specific description, e.g., "Woven intersecting curves forming diamond grid. MUST appear prominently."]
- [Colors]: [Exact hex values, e.g., "Dark teal #2D4A3E background, cream #F5F0E0 text"]
- [Typography]: [Specific treatment, e.g., "Uppercase text with wide letter-spacing"]
- [Layout element]: [Specific spatial element, e.g., "Bottom banner strip in dark color"]

## Integration approach:
[Exact spatial arrangement, e.g., "SPLIT LAYOUT: illustration area (~65%) + dark teal banner strip (~35%) with branding."]
```

**Key rules**:
- Each element gets "MUST" or "REQUIRED" prefix
- Descriptions must be **specific enough to reproduce**
- Integration approach must describe **exact spatial arrangement**
- After generation, verify reference elements are visible; if not, strengthen and regenerate

**If style extracted verbally (no file)**: Omit `references` frontmatter; append to prompt body using the same MUST INCORPORATE format above.
