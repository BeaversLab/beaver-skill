/**
 * Quality check library for i18n markdown translations.
 *
 * Pure logic — no file I/O. All checks accept content strings and config
 * objects, returning { errors: string[], warnings: string[] } results.
 *
 * Each check function is also exported individually so callers (apply.js,
 * quality-cli.js) can compose the subset they need.
 */

// ---------------------------------------------------------------------------
// Content extraction helpers
// ---------------------------------------------------------------------------

function stripCodeBlocks(content) {
  return content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { raw: '', entries: {} };
  const raw = match[1];
  const entries = {};
  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      entries[key] = value;
    }
  }
  return { raw, entries };
}

export function extractStructure(content) {
  return {
    headings: [...content.matchAll(/^(#{1,6})\s+(.+)$/gm)].map(m => [m[1], m[2]]),
    codeBlocks: [...content.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map(m => [m[1], m[2]]),
    links: [...content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m => ({ text: m[1], url: m[2] })),
    listItems: [...content.matchAll(/^[-*]\s+(.+)$/gm)].map(m => m[1]),
    frontmatterKeys: extractFrontmatter(content).entries,
  };
}

function extractProseLines(content) {
  const lines = content.split('\n');
  const prose = [];
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('```')) { inCode = !inCode; continue; }
    if (!inCode) prose.push({ lineNum: i + 1, text: lines[i] });
  }
  return prose;
}

// ---------------------------------------------------------------------------
// S1-S4: Structure checks
// ---------------------------------------------------------------------------

export function checkStructure(srcContent, tgtContent) {
  const src = extractStructure(srcContent);
  const tgt = extractStructure(tgtContent);
  const errors = [];
  const warnings = [];
  const details = {};

  // S1 headingCount
  details.headingCount = { src: src.headings.length, tgt: tgt.headings.length };
  if (src.headings.length !== tgt.headings.length) {
    errors.push(`Heading count mismatch: source=${src.headings.length}, target=${tgt.headings.length}`);
  }

  // S2 codeBlockCount
  details.codeBlockCount = { src: src.codeBlocks.length, tgt: tgt.codeBlocks.length };
  if (src.codeBlocks.length !== tgt.codeBlocks.length) {
    errors.push(`Code block count mismatch: source=${src.codeBlocks.length}, target=${tgt.codeBlocks.length}`);
  }

  // S3 listItemCount
  details.listItemCount = { src: src.listItems.length, tgt: tgt.listItems.length };
  if (Math.abs(src.listItems.length - tgt.listItems.length) > 2) {
    warnings.push(`List item count differs significantly: source=${src.listItems.length}, target=${tgt.listItems.length}`);
  }

  // S4 frontmatterKeys
  const srcKeys = new Set(Object.keys(src.frontmatterKeys));
  const tgtKeys = new Set(Object.keys(tgt.frontmatterKeys));
  const missingKeys = [...srcKeys].filter(k => !tgtKeys.has(k));
  const extraKeys = [...tgtKeys].filter(k => !srcKeys.has(k));
  details.frontmatterKeys = { missing: missingKeys, extra: extraKeys };
  if (missingKeys.length > 0) errors.push(`Missing frontmatter keys: ${missingKeys.join(', ')}`);
  if (extraKeys.length > 0) warnings.push(`Extra frontmatter keys: ${extraKeys.join(', ')}`);

  // L1 linkCount
  details.linkCount = { src: src.links.length, tgt: tgt.links.length };
  if (src.links.length !== tgt.links.length) {
    warnings.push(`Link count mismatch: source=${src.links.length}, target=${tgt.links.length}`);
  }

  return { id: 'structure', errors, warnings, details };
}

// ---------------------------------------------------------------------------
// C1-C2: Code block content & language tags
// ---------------------------------------------------------------------------

export function checkCodeBlocks(srcContent, tgtContent) {
  const src = [...srcContent.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map(m => [m[1], m[2]]);
  const tgt = [...tgtContent.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map(m => [m[1], m[2]]);
  const errors = [];
  const details = { total: src.length, langMismatch: 0, contentChanged: 0 };

  if (src.length !== tgt.length) {
    errors.push(`Code block count: source=${src.length}, target=${tgt.length}`);
    return { id: 'codeBlocks', errors, warnings: [], details };
  }

  for (let i = 0; i < src.length; i++) {
    if (src[i][0] !== tgt[i][0]) {
      errors.push(`Code block ${i + 1} language mismatch: source='${src[i][0]}', target='${tgt[i][0]}'`);
      details.langMismatch++;
    }
    if (src[i][1].trim() !== tgt[i][1].trim()) {
      errors.push(`Code block ${i + 1} content changed (must be identical)`);
      details.contentChanged++;
    }
  }

  return { id: 'codeBlocks', errors, warnings: [], details };
}

// ---------------------------------------------------------------------------
// V1-V3: Variables & placeholders
// ---------------------------------------------------------------------------

function extractVariables(content) {
  const prose = stripCodeBlocks(content);
  const mustache = (prose.match(/\{\{[\w.]+\}\}/g) || []);
  const dollar = (prose.match(/\$\{[\w.]+\}|\$[A-Z_]{2,}/g) || []);
  const format = (prose.match(/%[sd]/g) || []);
  return { mustache, dollar, format };
}

function countMap(arr) {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  return m;
}

function diffCounts(srcArr, tgtArr, label) {
  const srcMap = countMap(srcArr);
  const tgtMap = countMap(tgtArr);
  const issues = [];
  for (const [token, srcCount] of srcMap) {
    const tgtCount = tgtMap.get(token) || 0;
    if (tgtCount < srcCount) {
      issues.push(`${label} "${token}": expected ${srcCount}, found ${tgtCount}`);
    }
  }
  return issues;
}

export function checkVariables(srcContent, tgtContent) {
  const src = extractVariables(srcContent);
  const tgt = extractVariables(tgtContent);
  const errors = [];
  const details = {
    mustache: { src: src.mustache.length, tgt: tgt.mustache.length },
    dollar: { src: src.dollar.length, tgt: tgt.dollar.length },
    format: { src: src.format.length, tgt: tgt.format.length },
  };

  errors.push(...diffCounts(src.mustache, tgt.mustache, 'Mustache var'));
  errors.push(...diffCounts(src.dollar, tgt.dollar, 'Env/template var'));
  errors.push(...diffCounts(src.format, tgt.format, 'Format specifier'));

  return { id: 'variables', errors, warnings: [], details };
}

// ---------------------------------------------------------------------------
// L2-L4: Detailed link checks
// ---------------------------------------------------------------------------

function extractLinksFromContent(content) {
  return [...content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m => ({
    text: m[1], url: m[2]
  }));
}

export function checkLinks(srcContent, tgtContent) {
  const srcLinks = extractLinksFromContent(srcContent);
  const tgtLinks = extractLinksFromContent(tgtContent);
  const errors = [];
  const warnings = [];
  const details = { external: { total: 0, mismatched: 0 }, relative: { total: 0, mismatched: 0 }, anchors: { total: 0, missing: 0 } };

  const srcExternal = srcLinks.filter(l => /^https?:\/\//.test(l.url));
  const tgtExternal = tgtLinks.filter(l => /^https?:\/\//.test(l.url));
  details.external.total = srcExternal.length;

  const srcExternalUrls = srcExternal.map(l => l.url);
  const tgtExternalUrls = new Set(tgtExternal.map(l => l.url));
  for (const url of srcExternalUrls) {
    if (!tgtExternalUrls.has(url)) {
      warnings.push(`External URL missing or changed: "${url}"`);
      details.external.mismatched++;
    }
  }

  const srcRelative = srcLinks.filter(l => l.url.startsWith('../') || l.url.startsWith('./'));
  const tgtRelative = tgtLinks.filter(l => l.url.startsWith('../') || l.url.startsWith('./'));
  details.relative.total = srcRelative.length;

  const srcRelUrls = srcRelative.map(l => l.url);
  const tgtRelUrls = new Set(tgtRelative.map(l => l.url));
  for (const url of srcRelUrls) {
    if (!tgtRelUrls.has(url)) {
      warnings.push(`Relative link missing or changed: "${url}"`);
      details.relative.mismatched++;
    }
  }

  const srcAnchors = srcLinks.filter(l => l.url.includes('#')).map(l => {
    const idx = l.url.indexOf('#');
    return l.url.slice(idx);
  });
  const tgtAnchors = tgtLinks.filter(l => l.url.includes('#')).map(l => {
    const idx = l.url.indexOf('#');
    return l.url.slice(idx);
  });
  details.anchors.total = srcAnchors.length;

  const tgtAnchorSet = new Set(tgtAnchors);
  for (const anchor of srcAnchors) {
    if (!tgtAnchorSet.has(anchor)) {
      warnings.push(`Anchor missing in target: "${anchor}"`);
      details.anchors.missing++;
    }
  }

  return { id: 'links', errors, warnings, details };
}

// ---------------------------------------------------------------------------
// T1-T3: Terminology
// ---------------------------------------------------------------------------

const COMMON_MISTRANSLATIONS_ZH = {
  'API': ['应用程序接口', '应用接口'],
  'CLI': ['命令行接口', '命令行界面', '命令行工具'],
  'URL': ['网址', '链接地址'],
  'UI': ['用户界面', '界面'],
  'OAuth': ['开放授权'],
  'JWT': ['令牌'],
  'webhook': ['网络钩子', '回调钩子'],
  'Gateway': ['网关'],
};

function getCommonMistranslations(term, targetLocale) {
  if (targetLocale !== 'zh') return [];
  return COMMON_MISTRANSLATIONS_ZH[term] || [];
}

export function checkTerminology(tgtContent, targetLocale, noTranslateConfig, consistencyConfig) {
  const errors = [];
  const warnings = [];
  if (!targetLocale) return { id: 'terminology', errors, warnings, details: {} };

  const prose = extractProseLines(tgtContent);

  if (noTranslateConfig?.terms) {
    for (const rule of noTranslateConfig.terms) {
      if (!rule.text) continue;
      const bads = getCommonMistranslations(rule.text, targetLocale);
      for (const bad of bads) {
        for (const { lineNum, text } of prose) {
          const withoutCode = text.replace(/`[^`]+`/g, '');
          if (withoutCode.includes(bad)) {
            errors.push(`Terminology (line ${lineNum}): "${rule.text}" should NOT be translated (found "${bad}")`);
            break;
          }
        }
      }
    }
  }

  if (consistencyConfig?.translations) {
    for (const [key, mappings] of Object.entries(consistencyConfig.translations)) {
      const expected = mappings[targetLocale];
      if (!expected) continue;
      const others = Object.entries(mappings)
        .filter(([loc]) => loc !== targetLocale && loc !== 'en')
        .map(([, val]) => val);
      for (const wrong of others) {
        for (const { lineNum, text } of prose) {
          const withoutCode = text.replace(/`[^`]+`/g, '');
          if (withoutCode.includes(wrong)) {
            warnings.push(`Consistency (line ${lineNum}): "${key}" should be "${expected}", found "${wrong}"`);
            break;
          }
        }
      }
    }
  }

  return { id: 'terminology', errors, warnings, details: {} };
}

// ---------------------------------------------------------------------------
// K1: Untranslated content detection
// ---------------------------------------------------------------------------

export function checkUntranslated(tgtContent, targetLocale) {
  const warnings = [];
  if (!targetLocale) return { id: 'untranslated', errors: [], warnings, details: {} };

  const cjkLocales = new Set(['zh', 'ja', 'ko']);
  const expectCjk = cjkLocales.has(targetLocale);
  const prose = extractProseLines(tgtContent);

  let suspectStart = null;
  let suspectCount = 0;

  for (const { lineNum, text } of prose) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') ||
        trimmed.startsWith('-') || trimmed.startsWith('!') || trimmed.startsWith('[')) {
      flush();
      continue;
    }

    const withoutCode = trimmed.replace(/`[^`]+`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    if (withoutCode.trim().length < 10) { flush(); continue; }

    if (expectCjk) {
      const hasCjk = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(withoutCode);
      if (!hasCjk) {
        if (suspectStart === null) suspectStart = lineNum;
        suspectCount++;
      } else { flush(); }
    } else {
      const cjkChars = (withoutCode.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
      if (cjkChars > withoutCode.length * 0.3) {
        if (suspectStart === null) suspectStart = lineNum;
        suspectCount++;
      } else { flush(); }
    }
  }
  flush();

  function flush() {
    if (suspectCount >= 2 && suspectStart !== null) {
      warnings.push(`Possible untranslated content at lines ${suspectStart}-${suspectStart + suspectCount - 1}`);
    }
    suspectStart = null;
    suspectCount = 0;
  }

  return { id: 'untranslated', errors: [], warnings, details: {} };
}

// ---------------------------------------------------------------------------
// K2: Section omission
// ---------------------------------------------------------------------------

export function checkSections(srcContent, tgtContent) {
  const srcHeadings = [...srcContent.matchAll(/^(#{1,6})\s+(.+)$/gm)].map(m => m[1]);
  const tgtHeadings = [...tgtContent.matchAll(/^(#{1,6})\s+(.+)$/gm)].map(m => m[1]);
  const warnings = [];
  const details = { srcSequence: srcHeadings.length, tgtSequence: tgtHeadings.length };

  if (srcHeadings.length === tgtHeadings.length) {
    for (let i = 0; i < srcHeadings.length; i++) {
      if (srcHeadings[i] !== tgtHeadings[i]) {
        warnings.push(`Heading level mismatch at position ${i + 1}: source="${srcHeadings[i]}", target="${tgtHeadings[i]}"`);
      }
    }
  } else if (srcHeadings.length > tgtHeadings.length) {
    const missing = srcHeadings.length - tgtHeadings.length;
    warnings.push(`${missing} heading(s) missing in target — possible section omission`);
  }

  return { id: 'sections', errors: [], warnings, details };
}

// ---------------------------------------------------------------------------
// K3: Frontmatter values translated
// ---------------------------------------------------------------------------

const TRANSLATABLE_FM_FIELDS = new Set(['title', 'summary', 'description', 'sidebar_label']);

export function checkFrontmatterTranslated(srcContent, tgtContent, targetLocale) {
  const warnings = [];
  if (!targetLocale) return { id: 'frontmatterTranslated', errors: [], warnings, details: {} };

  const cjkLocales = new Set(['zh', 'ja', 'ko']);
  if (!cjkLocales.has(targetLocale)) {
    return { id: 'frontmatterTranslated', errors: [], warnings, details: {} };
  }

  const srcFm = extractFrontmatter(srcContent);
  const tgtFm = extractFrontmatter(tgtContent);
  const details = { checked: [], untranslated: [] };

  for (const field of TRANSLATABLE_FM_FIELDS) {
    const srcVal = srcFm.entries[field];
    const tgtVal = tgtFm.entries[field];
    if (!srcVal || !tgtVal) continue;

    details.checked.push(field);
    const hasCjk = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(tgtVal);
    if (!hasCjk) {
      warnings.push(`Frontmatter "${field}" may not be translated: "${tgtVal}"`);
      details.untranslated.push(field);
    }
  }

  return { id: 'frontmatterTranslated', errors: [], warnings, details };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

const ALL_CHECK_IDS = [
  'structure', 'codeBlocks', 'variables', 'links',
  'terminology', 'untranslated', 'sections', 'frontmatterTranslated',
];

/**
 * Run all quality checks on a source/target pair.
 *
 * @param {string} srcContent - source markdown
 * @param {string} tgtContent - target markdown
 * @param {object} opts
 * @param {string} [opts.targetLocale]
 * @param {object} [opts.noTranslateConfig]
 * @param {object} [opts.consistencyConfig]
 * @param {string[]} [opts.only] - run only these check IDs
 * @param {string[]} [opts.skip] - skip these check IDs
 * @returns {{ passed: boolean, errors: string[], warnings: string[], sections: Record<string, object> }}
 */
export function runAllChecks(srcContent, tgtContent, opts = {}) {
  const { targetLocale, noTranslateConfig, consistencyConfig, only, skip } = opts;

  let ids = only && only.length > 0 ? only : ALL_CHECK_IDS;
  if (skip && skip.length > 0) {
    const skipSet = new Set(skip);
    ids = ids.filter(id => !skipSet.has(id));
  }
  const active = new Set(ids);

  const allErrors = [];
  const allWarnings = [];
  const sections = {};

  function collect(result) {
    if (!result) return;
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
    sections[result.id] = {
      pass: result.errors.length === 0,
      errors: result.errors,
      warnings: result.warnings,
      details: result.details || {},
    };
  }

  if (active.has('structure'))             collect(checkStructure(srcContent, tgtContent));
  if (active.has('codeBlocks'))            collect(checkCodeBlocks(srcContent, tgtContent));
  if (active.has('variables'))             collect(checkVariables(srcContent, tgtContent));
  if (active.has('links'))                 collect(checkLinks(srcContent, tgtContent));
  if (active.has('terminology'))           collect(checkTerminology(tgtContent, targetLocale, noTranslateConfig, consistencyConfig));
  if (active.has('untranslated'))          collect(checkUntranslated(tgtContent, targetLocale));
  if (active.has('sections'))              collect(checkSections(srcContent, tgtContent));
  if (active.has('frontmatterTranslated')) collect(checkFrontmatterTranslated(srcContent, tgtContent, targetLocale));

  return {
    passed: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    sections,
  };
}

export { ALL_CHECK_IDS };
