/**
 * Placeholder masking/unmasking for markdown content.
 *
 * Masks inline code, link URLs, angle-bracket links, template variables,
 * and fenced code blocks so the translator never sees untranslatable tokens.
 *
 * Inline tokens use sequential %%Pn%% tags (safe — they stay within segments).
 * Code blocks use content-hash tags %%CB_<hash8>%% so that placeholder identity
 * is position-independent and survives chunk split/merge reordering.
 *
 * Also handles link localization: internal URLs are rewritten to the target
 * locale during masking, so the restored text already has correct links.
 */

import { createHash } from 'crypto';

const INLINE_CODE_RE = /`[^`]+`/g;
const ANGLE_LINK_RE = /<https?:\/\/[^>]+>/g;
const LINK_URL_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const VARIABLE_RE = /(\{\{[\w.]+\}\}|\$\{[\w.]+\}|\$[A-Z_]{2,})/g;
const FENCED_CODE_BLOCK_RE = /^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm;

export class PlaceholderState {
  constructor(existingText = '') {
    const existingP = existingText.match(/%%P(\d+)%%/g) || [];
    const maxPId = existingP.reduce((max, p) => {
      const n = parseInt(p.match(/\d+/)[0], 10);
      return n > max ? n : max;
    }, 0);
    this.counter = maxPId + 1;

    this.placeholders = new Map();
    this.order = [];
  }

  next(original) {
    const tag = `%%P${this.counter++}%%`;
    this.placeholders.set(tag, original);
    this.order.push(tag);
    return tag;
  }

  nextCodeBlock(original) {
    const hash = createHash('sha256').update(original).digest('hex').slice(0, 8);
    let tag = `%%CB_${hash}%%`;
    if (this.placeholders.has(tag)) {
      let n = 2;
      while (this.placeholders.has(`%%CB_${hash}_${n}%%`)) n++;
      tag = `%%CB_${hash}_${n}%%`;
    }
    this.placeholders.set(tag, original);
    this.order.push(tag);
    return tag;
  }

  toJSON() {
    return Object.fromEntries(this.placeholders);
  }
}

/**
 * Localize an internal link URL from source locale to target locale.
 */
function localizeURL(url, sourceLocale, targetLocale) {
  if (!targetLocale) return url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('#') || url.startsWith('../') || url.startsWith('./')) {
    return url;
  }
  if (sourceLocale && url.startsWith(`/${sourceLocale}/`)) {
    return url.replace(`/${sourceLocale}/`, `/${targetLocale}/`);
  }
  if (url.startsWith('/') && !url.match(/^\/[a-z]{2}(?:-[A-Za-z]{2,})?\//)) {
    return `/${targetLocale}${url}`;
  }
  return url;
}

/**
 * Mask markdown content, returning the masked text and placeholder state.
 *
 * @param {string} text - raw segment text
 * @param {object} opts
 * @param {string} [opts.sourceLocale]
 * @param {string} [opts.targetLocale]
 * @param {PlaceholderState} [opts.state] - reuse across segments
 * @returns {{ masked: string, state: PlaceholderState }}
 */
export function maskMarkdown(text, opts = {}) {
  const state = opts.state || new PlaceholderState(text);
  let masked = text;

  // 1. Inline code
  masked = masked.replace(INLINE_CODE_RE, match => state.next(match));

  // 2. Angle-bracket links
  masked = masked.replace(ANGLE_LINK_RE, match => state.next(match));

  // 3. Markdown link URLs (keep link text for translation, mask URL)
  masked = masked.replace(LINK_URL_RE, (_match, linkText, url) => {
    const localizedUrl = localizeURL(url, opts.sourceLocale, opts.targetLocale);
    const tag = state.next(`(${localizedUrl})`);
    return `[${linkText}]${tag}`;
  });

  // 4. Template variables / env vars
  masked = masked.replace(VARIABLE_RE, match => state.next(match));

  return { masked, state };
}

/**
 * Restore placeholders in translated text.
 */
export function unmaskMarkdown(text, placeholders) {
  let result = text;
  if (placeholders instanceof PlaceholderState) {
    for (const [tag, original] of placeholders.placeholders) {
      result = result.replaceAll(tag, original);
    }
  } else if (placeholders instanceof Map) {
    for (const [tag, original] of placeholders) {
      result = result.replaceAll(tag, original);
    }
  } else {
    for (const [tag, original] of Object.entries(placeholders)) {
      result = result.replaceAll(tag, original);
    }
  }
  return result;
}

/**
 * Mask fenced code blocks in a full document (skeleton).
 * Replaces each code block with %%CB_<hash8>%% (content-hash-based) so the AI
 * never sees code content. Hash-based IDs survive chunk split/merge reordering.
 */
export function maskCodeBlocks(text, state) {
  return text.replace(FENCED_CODE_BLOCK_RE, match => state.nextCodeBlock(match));
}

/**
 * Fix common AI mangling of placeholder tags.
 * Handles both sequential %%Pn%% / legacy %%CBn%% and hash-based %%CB_<hex>%% tags.
 * Normalizes spacing and casing: "%% p1 %%" → "%%P1%%", "%% cb_a1b2 %%" → "%%CB_a1b2%%".
 * Returns the fixed text and a count of corrections made.
 */
export function fixMangledPlaceholders(text) {
  let fixCount = 0;
  const fixed = text.replace(/%%\s*(P\d+|CB\d+|CB_[a-f0-9]+(?:_\d+)?)\s*%%/gi, (match, id) => {
    let normalized;
    if (/^CB_/i.test(id)) {
      normalized = `%%CB_${id.slice(3).toLowerCase()}%%`;
    } else {
      normalized = `%%${id.toUpperCase()}%%`;
    }
    if (match !== normalized) fixCount++;
    return normalized;
  });
  return { text: fixed, fixCount };
}

/**
 * Validate that all placeholders survive translation.
 * Returns list of missing placeholder tags.
 */
export function validatePlaceholders(text, placeholders) {
  const tags = placeholders instanceof PlaceholderState
    ? [...placeholders.placeholders.keys()]
    : placeholders instanceof Map
      ? [...placeholders.keys()]
      : Object.keys(placeholders);

  return tags.filter(tag => !text.includes(tag));
}
