/**
 * Translation Memory — segment-level cache backed by JSONL.
 *
 * Storage: `.i18n/<lang>.tm.jsonl`
 * Each line is a JSON object with cache_key, segment_id, text_hash, text, translated, etc.
 * Cache key = sha256(WORKFLOW_VERSION + srcLang + tgtLang + segmentId + textHash)
 */

import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export const WORKFLOW_VERSION = 2;

export function tmPath(i18nDir, lang) {
  return path.join(i18nDir, `${lang}.tm.jsonl`);
}

export function cacheKey(srcLang, tgtLang, segmentId, textHash) {
  const raw = `${WORKFLOW_VERSION}:${srcLang}:${tgtLang}:${segmentId}:${textHash}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

export function textHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function segmentId(relPath, hash) {
  return `${relPath}:${hash}`;
}

export class TranslationMemory {
  constructor(filePath) {
    this.filePath = filePath;
    this.entries = new Map();
  }

  static async load(filePath) {
    const tm = new TranslationMemory(filePath);
    try {
      await fs.access(filePath);
    } catch {
      return tm;
    }

    const rl = createInterface({
      input: createReadStream(filePath, 'utf-8'),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (entry.cache_key && entry.translated?.trim()) {
          tm.entries.set(entry.cache_key, entry);
        }
      } catch {
        // skip malformed lines
      }
    }

    return tm;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry || !entry.translated?.trim()) return null;
    return entry;
  }

  put(entry) {
    if (!entry.cache_key) return;
    this.entries.set(entry.cache_key, entry);
  }

  get size() {
    return this.entries.size;
  }

  async save() {
    if (!this.filePath) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const tmpPath = this.filePath + '.tmp';
    const keys = [...this.entries.keys()].sort();
    const lines = keys.map(k => JSON.stringify(this.entries.get(k)));
    await fs.writeFile(tmpPath, lines.join('\n') + '\n', 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }
}
