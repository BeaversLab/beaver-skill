#!/usr/bin/env node
/**
 * Read no-translate configuration.
 *
 * Usage:
 *   node read-no-translate.js [--project-dir <path>] [--format json|text]
 *
 * Searches upward from the given directory (or cwd) until it finds
 * a .i18n directory, stopping at the filesystem root or a .git boundary.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

/**
 * Walk upward from startPath to find a .i18n directory.
 * Stops at .git boundary or filesystem root.
 */
async function findI18nDir(startPath = process.cwd()) {
  let current = path.resolve(startPath);

  while (true) {
    const candidate = path.join(current, '.i18n');
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // Not found here, keep going
    }

    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root

    // Stop if we just crossed a .git boundary
    try {
      await fs.stat(path.join(current, '.git'));
      break; // .git found at current level but no .i18n — stop
    } catch {
      // No .git here, continue upward
    }

    current = parent;
  }

  return null;
}

async function readNoTranslateConfig(i18nDir) {
  const configPath = path.join(i18nDir, 'no-translate.yaml');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return yaml.load(content);
  } catch {
    return { headings: [], terms: [], sections: [], urls: [] };
  }
}

function shouldNotTranslate(text, type, config) {
  if (!config) return false;

  text = text.trim();

  switch (type) {
    case 'heading':
      for (const rule of config.headings || []) {
        if (rule.text && text === rule.text) {
          return { shouldSkip: true, reason: rule.reason };
        }
        if (rule.pattern) {
          try {
            if (new RegExp(rule.pattern).test(text)) {
              return { shouldSkip: true, reason: rule.reason };
            }
          } catch { /* invalid regex */ }
        }
      }
      break;

    case 'term':
      for (const rule of config.terms || []) {
        if (rule.text === text) {
          return { shouldSkip: true, reason: rule.reason };
        }
      }
      break;

    case 'section':
      for (const rule of config.sections || []) {
        if (rule.title === text) {
          return { shouldSkip: true, reason: rule.reason };
        }
      }
      break;
  }

  return { shouldSkip: false };
}

async function main() {
  const args = process.argv.slice(2);
  let projectDir = process.cwd();
  let outputFormat = 'json';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-dir') {
      projectDir = args[++i];
    } else if (args[i] === '--format') {
      outputFormat = args[++i];
    }
  }

  const i18nDir = await findI18nDir(projectDir);

  if (!i18nDir) {
    console.log('No .i18n directory found.');
    console.log('Create one at: <project_root>/.i18n/');
    process.exit(0);
  }

  const config = await readNoTranslateConfig(i18nDir);

  if (outputFormat === 'json') {
    console.log(JSON.stringify(config, null, 2));
  } else {
    console.log(`No-Translate Configuration: ${i18nDir}/no-translate.yaml\n`);

    if (config.headings?.length > 0) {
      console.log('Headings to keep in English:');
      config.headings.forEach(h => {
        console.log(h.pattern ? `  Pattern: "${h.pattern}" - ${h.reason}` : `  "${h.text}" - ${h.reason}`);
      });
      console.log('');
    }

    if (config.terms?.length > 0) {
      console.log('Terms to keep in English:');
      config.terms.forEach(t => console.log(`  "${t.text}" - ${t.reason} (${t.context || 'global'})`));
      console.log('');
    }

    if (config.sections?.length > 0) {
      console.log('Sections to skip:');
      config.sections.forEach(s => console.log(`  "${s.title}" - ${s.reason}`));
      console.log('');
    }

    if (config.urls?.length > 0) {
      console.log('URL patterns to exclude:');
      config.urls.forEach(u => console.log(`  ${u.pattern} - ${u.reason}`));
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

const DEFAULT_FM_TRANSLATE_KEYS = ['title', 'summary', 'description', 'read_when'];

function getFmTranslateKeys(config) {
  const keys = config?.frontmatter_translate_keys;
  return new Set(Array.isArray(keys) && keys.length > 0 ? keys : DEFAULT_FM_TRANSLATE_KEYS);
}

export { findI18nDir, readNoTranslateConfig, shouldNotTranslate, getFmTranslateKeys };
