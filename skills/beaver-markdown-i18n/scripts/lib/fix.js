/**
 * Quick-fix functions for common post-translation issues.
 *
 * Each function takes content strings and returns { text, ...stats }.
 * No file I/O — callers handle reading/writing.
 */

import { fixMangledPlaceholders } from './masking.js';

const FENCED_CODE_BLOCK_RE = /^(`{3,})([^\n]*)\n([\s\S]*?)^\1\s*$/gm;
const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const TODO_BLOCK_RE = /<!--\s*i18n:todo\s*-->\n?([\s\S]*?)\n?<!--\s*\/i18n:todo\s*-->/g;

// ---------------------------------------------------------------------------
// Fix code blocks
// ---------------------------------------------------------------------------

function collectCodeBlocks(content) {
  const blocks = [];
  let match;
  const re = new RegExp(FENCED_CODE_BLOCK_RE.source, FENCED_CODE_BLOCK_RE.flags);
  while ((match = re.exec(content)) !== null) {
    blocks.push({ full: match[0], fence: match[1], lang: match[2], body: match[3], index: match.index });
  }
  return blocks;
}

/**
 * Replace target code blocks with source code blocks (positional 1:1).
 * Only works when block count matches.
 *
 * @returns {{ text: string, replaced: number, error?: string }}
 */
export function fixCodeBlocks(srcContent, tgtContent) {
  const srcBlocks = collectCodeBlocks(srcContent);
  const tgtBlocks = collectCodeBlocks(tgtContent);

  if (srcBlocks.length !== tgtBlocks.length) {
    return {
      text: tgtContent,
      replaced: 0,
      error: `Code block count mismatch: source=${srcBlocks.length}, target=${tgtBlocks.length}`,
    };
  }

  if (srcBlocks.length === 0) {
    return { text: tgtContent, replaced: 0 };
  }

  let replaced = 0;
  let result = tgtContent;
  for (let i = tgtBlocks.length - 1; i >= 0; i--) {
    if (tgtBlocks[i].full !== srcBlocks[i].full) {
      result = result.slice(0, tgtBlocks[i].index) +
               srcBlocks[i].full +
               result.slice(tgtBlocks[i].index + tgtBlocks[i].full.length);
      replaced++;
    }
  }

  return { text: result, replaced };
}

// ---------------------------------------------------------------------------
// Fix links
// ---------------------------------------------------------------------------

function collectLinks(content) {
  const links = [];
  let match;
  const re = new RegExp(LINK_RE.source, LINK_RE.flags);
  while ((match = re.exec(content)) !== null) {
    links.push({ full: match[0], text: match[1], url: match[2], index: match.index });
  }
  return links;
}

/**
 * Replace target link URLs with source URLs (positional 1:1).
 * Preserves translated link text. Only works when link count matches.
 *
 * @returns {{ text: string, replaced: number, changes: Array<{pos: number, from: string, to: string}>, error?: string }}
 */
export function fixLinks(srcContent, tgtContent) {
  const srcLinks = collectLinks(srcContent);
  const tgtLinks = collectLinks(tgtContent);

  if (srcLinks.length !== tgtLinks.length) {
    return {
      text: tgtContent,
      replaced: 0,
      changes: [],
      error: `Link count mismatch: source=${srcLinks.length}, target=${tgtLinks.length}`,
    };
  }

  if (srcLinks.length === 0) {
    return { text: tgtContent, replaced: 0, changes: [] };
  }

  let replaced = 0;
  const changes = [];
  let result = tgtContent;

  for (let i = tgtLinks.length - 1; i >= 0; i--) {
    if (tgtLinks[i].url !== srcLinks[i].url) {
      const fixed = `[${tgtLinks[i].text}](${srcLinks[i].url})`;
      result = result.slice(0, tgtLinks[i].index) +
               fixed +
               result.slice(tgtLinks[i].index + tgtLinks[i].full.length);
      changes.unshift({ pos: i + 1, from: tgtLinks[i].url, to: srcLinks[i].url });
      replaced++;
    }
  }

  return { text: result, replaced, changes };
}

// ---------------------------------------------------------------------------
// Fix placeholders
// ---------------------------------------------------------------------------

/**
 * Fix mangled %%Pn%%/%%CB_hash%% placeholders in translated content.
 *
 * @returns {{ text: string, fixCount: number }}
 */
export function fixPlaceholdersInFile(content) {
  return fixMangledPlaceholders(content);
}

// ---------------------------------------------------------------------------
// Fix markers
// ---------------------------------------------------------------------------

/**
 * Strip remaining <!-- i18n:todo --> / <!-- /i18n:todo --> markers,
 * keeping the content between them.
 *
 * @returns {{ text: string, strippedCount: number }}
 */
export function fixMarkers(content) {
  let strippedCount = 0;
  const text = content.replace(TODO_BLOCK_RE, (_match, inner) => {
    strippedCount++;
    return inner.trim();
  });
  return { text, strippedCount };
}
