/**
 * Markdown segment extraction using remark (unified/mdast).
 *
 * Walks the AST and collects translatable text from paragraphs, headings,
 * and list items. Skips code blocks, inline code, HTML, and images at the
 * AST level — the translator never sees them.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { textHash, segmentId } from './tm.js';

const parser = unified().use(remarkParse).use(remarkGfm);

const TRANSLATABLE_TYPES = new Set(['paragraph', 'heading', 'listItem']);
const SKIP_TYPES = new Set(['code', 'inlineCode', 'html', 'image', 'imageReference']);

/**
 * Serialize an mdast node back to its approximate markdown source text.
 * For translatable nodes we want the raw text span from the original source
 * rather than re-stringifying, so we use source positions.
 */
function nodeText(node, source) {
  if (node.position) {
    return source.slice(node.position.start.offset, node.position.end.offset);
  }
  if (node.value != null) return node.value;
  if (node.children) return node.children.map(c => nodeText(c, source)).join('');
  return '';
}

/**
 * Check if a node contains only non-translatable content (e.g. a paragraph
 * that is entirely an image or entirely code).
 */
function hasTranslatableText(node, source) {
  if (node.value != null) {
    return node.value.trim().length > 0;
  }
  if (!node.children) return false;

  for (const child of node.children) {
    if (SKIP_TYPES.has(child.type)) continue;
    if (hasTranslatableText(child, source)) return true;
  }
  return false;
}

/**
 * Extract translatable segments from markdown source.
 *
 * @param {string} source - full markdown content
 * @param {string} relPath - relative file path (for segment ID generation)
 * @returns {Segment[]}
 */
export function extractSegments(source, relPath) {
  const tree = parser.parse(source);
  const segments = [];

  walkBlock(tree, source, relPath, segments);

  return segments;
}

function walkBlock(node, source, relPath, segments) {
  if (!node.children) return;

  for (const child of node.children) {
    if (child.type === 'code' || child.type === 'html') {
      // Top-level code/html blocks — skip entirely
      continue;
    }

    if (TRANSLATABLE_TYPES.has(child.type)) {
      if (!hasTranslatableText(child, source)) continue;

      const text = nodeText(child, source);
      const trimmed = text.trim();
      if (!trimmed) continue;

      const hash = textHash(trimmed);
      const id = segmentId(relPath, hash);

      segments.push({
        type: child.type,
        start: child.position.start.offset,
        end: child.position.end.offset,
        text: trimmed,
        textHash: hash,
        segmentId: id,
        headingDepth: child.type === 'heading' ? child.depth : undefined,
      });
    } else if (child.children) {
      // Recurse into containers like blockquote, list, table, etc.
      walkBlock(child, source, relPath, segments);
    }
  }
}

/**
 * Rebuild a markdown document from the original source, replacing segment
 * regions with provided translations (or cached content).
 *
 * @param {string} source - original markdown content
 * @param {Segment[]} segments - extracted segments (must be sorted by start)
 * @param {Map<string, string>} translations - segmentId → translated text
 * @returns {string}
 */
export function applyTranslations(source, segments, translations) {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const parts = [];
  let cursor = 0;

  for (const seg of sorted) {
    if (seg.start < cursor) continue;
    parts.push(source.slice(cursor, seg.start));

    const translated = translations.get(seg.segmentId);
    parts.push(translated != null ? translated : seg.text);
    cursor = seg.end;
  }

  parts.push(source.slice(cursor));
  return parts.join('');
}

/**
 * Split frontmatter from body. Returns { frontmatter, body, hasFrontmatter }.
 * Frontmatter is the raw YAML string (without delimiters).
 */
export function splitFrontmatter(content) {
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content, hasFrontmatter: false };
  }

  const lines = content.split('\n');
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { frontmatter: null, body: content, hasFrontmatter: false };
  }

  const frontmatter = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');

  return { frontmatter, body, hasFrontmatter: true };
}

/**
 * Reassemble frontmatter + body.
 */
export function joinFrontmatter(frontmatter, body) {
  if (!frontmatter) return body;
  return `---\n${frontmatter}\n---\n${body}`;
}
