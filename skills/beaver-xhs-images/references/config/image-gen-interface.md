# Image Generation Interface Contract

Standard interface that any image generation skill must support to work with beaver-xhs-images.

## Required Capabilities

| Capability      | Description                                                  | Required    |
| --------------- | ------------------------------------------------------------ | ----------- |
| Prompt input    | Accept a text prompt or prompt file path                     | Yes         |
| Image output    | Save generated image to a specified path                     | Yes         |
| Aspect ratio    | Support 3:4 portrait ratio                                   | Yes         |
| Reference image | Accept a reference image for style consistency (`--ref`)     | Recommended |
| Session ID      | Maintain visual consistency across a session (`--sessionId`) | Optional    |

## Expected Input

| Parameter       | Type              | Description                                                         |
| --------------- | ----------------- | ------------------------------------------------------------------- |
| Prompt          | text or file path | The assembled prompt from `prompts/NN-{type}-[slug].md`             |
| Output path     | file path         | Target path for the generated image (e.g., `01-cover-ai-tools.png`) |
| Aspect ratio    | string            | `3:4` (portrait, default for XHS)                                   |
| Reference image | file path         | Path to image 1 for visual consistency (images 2+ only)             |
| Session ID      | string            | Format: `xhs-{topic-slug}-{timestamp}`                              |

## Expected Output

- A PNG image saved to the specified output path
- Image dimensions matching the requested aspect ratio
- On failure: return an error message (the skill will auto-retry once)

## Skill Selection

1. Check available image generation skills in the runtime environment
2. If only one skill is available, use it automatically
3. If multiple skills are available, ask the user which to use
4. If no skill is available, inform the user and stop the workflow

## Integration Notes

- The prompt file contains the full assembled prompt (style + layout + content + watermark)
- Reference image chain is critical for multi-image series consistency
- Session ID provides additional consistency when the backend supports it
- All images in a series should be generated sequentially (not in parallel)
