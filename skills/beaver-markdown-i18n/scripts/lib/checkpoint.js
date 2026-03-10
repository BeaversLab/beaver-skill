#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { cacheKey, tmPath, TranslationMemory } from './tm.js';
import { fixMangledPlaceholders, unmaskMarkdown } from './masking.js';
import { findI18nDir } from './read-no-translate.js';

const TODO_BLOCK_RE = /<!--\s*i18n:todo\s*-->\n?([\s\S]*?)\n?<!--\s*\/i18n:todo\s*-->/g;

function getChunkMetaPath(chunkFile) {
  return chunkFile.replace(/\.md$/, '.meta.json');
}

async function loadTaskMeta(effectiveI18nDir) {
  const taskMetaPath = path.join(effectiveI18nDir, 'task-meta.json');
  try {
    return JSON.parse(await fs.readFile(taskMetaPath, 'utf-8'));
  } catch {
    return null;
  }
}

function extractTodoContents(chunkContent) {
  return [...chunkContent.matchAll(TODO_BLOCK_RE)].map(match => match[1].trim());
}

export async function checkpointChunk(chunkFile, opts = {}) {
  const projectDir = opts.projectDir || process.cwd();
  const i18nDir = await findI18nDir(projectDir);
  const effectiveI18nDir = i18nDir || path.join(projectDir, '.i18n');
  const taskMeta = await loadTaskMeta(effectiveI18nDir);
  const srcLang = opts.srcLang || taskMeta?.source_locale || 'en';
  const tgtLang = opts.tgtLang || taskMeta?.target_locale;

  if (!tgtLang) {
    throw new Error('Target locale not found. Pass --lang or ensure .i18n/task-meta.json exists.');
  }

  const metaPath = getChunkMetaPath(chunkFile);
  const [chunkContent, metaRaw] = await Promise.all([
    fs.readFile(chunkFile, 'utf-8'),
    fs.readFile(metaPath, 'utf-8'),
  ]);

  const meta = JSON.parse(metaRaw);
  const entries = Array.isArray(meta.entries) ? meta.entries : [];
  const todoContents = extractTodoContents(chunkContent);
  if (todoContents.length !== entries.length) {
    throw new Error(
      `Chunk TODO count mismatch for ${chunkFile}: found ${todoContents.length}, metadata has ${entries.length}.`,
    );
  }

  const placeholders = taskMeta?.placeholders || {};
  const tmFile = tmPath(effectiveI18nDir, tgtLang);
  const tm = await TranslationMemory.load(tmFile);

  let added = 0;
  let updated = 0;
  let cached = 0;
  let skipped = 0;
  let autoFixed = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const sourceText = (entry.text || '').trim();
    if (!sourceText) {
      skipped++;
      continue;
    }

    const fixed = fixMangledPlaceholders(todoContents[i]);
    autoFixed += fixed.fixCount;
    const translated = unmaskMarkdown(fixed.text, placeholders).trim();
    if (!translated || translated === sourceText) {
      skipped++;
      continue;
    }

    const ck = cacheKey(srcLang, tgtLang, entry.segment_id, entry.text_hash);
    const existing = tm.entries.get(ck);
    if (existing?.translated === translated) {
      cached++;
      continue;
    }

    tm.put({
      cache_key: ck,
      segment_id: entry.segment_id,
      source_path: entry.source_path || meta.rel_path,
      text_hash: entry.text_hash,
      text: sourceText,
      translated,
      updated_at: new Date().toISOString(),
    });

    if (existing) updated++;
    else added++;
  }

  await tm.save();

  return {
    chunkFile,
    tmFile,
    added,
    updated,
    cached,
    skipped,
    autoFixed,
    entryCount: entries.length,
  };
}

export async function checkpointChunks(chunkFiles, opts = {}) {
  const results = [];
  for (const chunkFile of chunkFiles) {
    results.push(await checkpointChunk(chunkFile, opts));
  }
  return results;
}
