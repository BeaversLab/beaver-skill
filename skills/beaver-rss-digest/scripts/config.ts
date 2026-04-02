import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import type { CategoryConfig, FeedSource, LlmProfile, OutputLanguage } from './types';
import type { PromptTemplates } from './prompts';

export interface DigestConfig {
  version: number;
  defaults: {
    hours: number;
    topN: number;
    language: OutputLanguage;
    outputDir: string;
    reportTemplate: string;
  };
  llms: LlmProfile[];
  categories: CategoryConfig[];
  prompts: PromptTemplates;
  rssFeeds: FeedSource[];
}

export type I18nDictionary = Record<OutputLanguage, Record<string, string>>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_CONFIG_DIR = resolve(__dirname, '..', 'config');
export const REPO_TEMPLATES_DIR = resolve(__dirname, '..', 'templates');
const REPO_CONFIG_EXAMPLE_PATH = join(REPO_CONFIG_DIR, 'config.example.yaml');
const REPO_I18N_PATH = join(REPO_CONFIG_DIR, 'i18n.yaml');

const BEAVER_SKILL_DIR = join(homedir(), '.beaver-skill');
export const ENV_PATH = join(BEAVER_SKILL_DIR, '.env');
export const CONFIG_DIR = join(BEAVER_SKILL_DIR, 'beaver-rss-digest');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.yaml');
export const I18N_PATH = join(CONFIG_DIR, 'i18n.yaml');

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseLanguage(value: unknown): OutputLanguage | null {
  return value === 'zh' || value === 'en' ? value : null;
}

export function extractEnvName(token: string): string | null {
  const value = token.trim();
  const braces = value.match(/^\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}$/);
  if (braces) return braces[1]!;
  const angle = value.match(/^<([A-Za-z_][A-Za-z0-9_]*)>$/);
  if (angle) return angle[1]!;
  const plain = value.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
  if (plain) return plain[1]!;
  return null;
}

export function resolveEnvToken(raw: string): string {
  const envName = extractEnvName(raw);
  if (!envName) return '';
  return process.env[envName] || '';
}

function parseConfig(raw: string): DigestConfig {
  const parsed = asRecord(yaml.load(raw));
  const defaults = asRecord(parsed.defaults);
  const prompts = asRecord(parsed.prompts);
  const llmsRaw = Array.isArray(parsed.llms) ? parsed.llms : [];
  const categoriesRaw = Array.isArray(parsed.categories) ? parsed.categories : [];
  const feedsRaw = Array.isArray(parsed.rssFeeds) ? parsed.rssFeeds : [];

  const version = asNumber(parsed.version);
  const hours = asNumber(defaults.hours);
  const topN = asNumber(defaults.topN);
  const language = parseLanguage(defaults.language);
  const outputDir = asString(defaults.outputDir);
  const reportTemplate = asString(defaults.reportTemplate).trim() || 'default';
  if (version === null || hours === null || topN === null || !language || !outputDir.trim()) {
    throw new Error('Invalid defaults section');
  }

  const llms: LlmProfile[] = llmsRaw
    .map((item) => asRecord(item))
    .map((item) => ({
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      provider: asString(item.provider).trim(),
      apiType:
        item.apiType === 'anthropic-compatible' ? 'anthropic-compatible' : 'openai-compatible',
      baseUrl: asString(item.baseUrl).trim(),
      model: asString(item.model).trim(),
      apiKey: asString(item.apiKey).trim(),
    }));

  const categories: CategoryConfig[] = categoriesRaw
    .map((item) => asRecord(item))
    .map((item) => ({
      id: asString(item.id).trim(),
      emoji: asString(item.emoji).trim(),
      label: asString(item.label).trim(),
    }));

  const rssFeeds: FeedSource[] = feedsRaw
    .map((item) => asRecord(item))
    .map((item) => ({
      name: asString(item.name).trim(),
      xmlUrl: asString(item.xmlUrl).trim(),
      htmlUrl: asString(item.htmlUrl).trim(),
    }));

  const cfg: DigestConfig = {
    version,
    defaults: { hours, topN, language, outputDir, reportTemplate },
    llms,
    categories,
    prompts: {
      scoring: asString(prompts.scoring),
      summary: asString(prompts.summary),
      highlights: asString(prompts.highlights),
    },
    rssFeeds,
  };
  return cfg;
}

export async function loadConfig(): Promise<DigestConfig> {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config file: ${CONFIG_PATH}. Run digest init first.`);
  }
  const raw = await readFile(CONFIG_PATH, 'utf-8');
  const config = parseConfig(raw);
  const { errors } = await validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid config:\n- ${errors.join('\n- ')}`);
  }
  return config;
}

async function copyTemplate(src: string, dst: string): Promise<void> {
  const content = await readFile(src, 'utf-8');
  await writeFile(dst, content, 'utf-8');
}

const ENV_TEMPLATE = `# beaver-skill shared environment variables
# Uncomment and fill in the API keys you need.
# This file is loaded automatically by pnpm scripts via --env-file.

# ZHIPU_API_KEY=your-key-here
# OPENAI_API_KEY=your-key-here
# ANTHROPIC_API_KEY=your-key-here
`;

export async function initConfig(force = false): Promise<{ created: boolean; path: string }> {
  if (existsSync(CONFIG_PATH) && !force) return { created: false, path: CONFIG_PATH };
  await mkdir(CONFIG_DIR, { recursive: true });
  await copyTemplate(REPO_CONFIG_EXAMPLE_PATH, CONFIG_PATH);
  if (!existsSync(I18N_PATH) || force) {
    await copyTemplate(REPO_I18N_PATH, I18N_PATH);
  }
  if (!existsSync(ENV_PATH)) {
    await mkdir(BEAVER_SKILL_DIR, { recursive: true });
    await writeFile(ENV_PATH, ENV_TEMPLATE, 'utf-8');
  }
  return { created: true, path: CONFIG_PATH };
}

export async function saveConfig(config: DigestConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, yaml.dump(config, { lineWidth: -1 }), 'utf-8');
}

export async function loadI18n(): Promise<I18nDictionary> {
  const path = existsSync(I18N_PATH) ? I18N_PATH : REPO_I18N_PATH;
  const raw = await readFile(path, 'utf-8');
  const parsed = asRecord(yaml.load(raw));
  const zh = asRecord(parsed.zh);
  const en = asRecord(parsed.en);
  return {
    zh: Object.fromEntries(Object.entries(zh).map(([k, v]) => [k, String(v)])),
    en: Object.fromEntries(Object.entries(en).map(([k, v]) => [k, String(v)])),
  };
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export async function validateConfig(config: DigestConfig): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.defaults.hours <= 0) errors.push('defaults.hours must be > 0');
  if (config.defaults.topN <= 0) errors.push('defaults.topN must be > 0');
  if (!config.defaults.outputDir.trim()) errors.push('defaults.outputDir must not be empty');
  if (!config.defaults.reportTemplate.trim())
    errors.push('defaults.reportTemplate must not be empty');
  if (!['zh', 'en'].includes(config.defaults.language))
    errors.push('defaults.language must be zh or en');

  if (!config.llms.length) errors.push('llms must not be empty');
  const enabledLlms = config.llms.filter((llm) => llm.enabled);
  if (!enabledLlms.length) errors.push('At least one llm must be enabled');
  let hasResolvedKey = false;
  for (const llm of enabledLlms) {
    if (!llm.provider) errors.push('llms[].provider must not be empty');
    if (!llm.baseUrl) errors.push(`llm ${llm.provider || '<unknown>'} missing baseUrl`);
    if (!llm.model) errors.push(`llm ${llm.provider || '<unknown>'} missing model`);
    const envName = extractEnvName(llm.apiKey);
    if (!envName) {
      errors.push(
        `llm ${llm.provider || '<unknown>'} apiKey must be env token format: {{ENV}} or <ENV> or ENV`
      );
      continue;
    }
    if (resolveEnvToken(llm.apiKey)) {
      hasResolvedKey = true;
    } else {
      warnings.push(
        `llm ${llm.provider}: env var ${envName} is not set (export ${envName}=your-key)`
      );
    }
  }
  if (enabledLlms.length && !hasResolvedKey) {
    warnings.push(
      'No LLM apiKey env var is currently set — set at least one before running digest'
    );
  }

  if (!config.categories.length) errors.push('categories must not be empty');
  for (const category of config.categories) {
    if (!category.id) errors.push('categories[].id must not be empty');
    if (!category.label) errors.push(`category ${category.id || '<unknown>'} missing label`);
  }

  if (!config.prompts.scoring.trim()) errors.push('prompts.scoring must not be empty');
  if (!config.prompts.summary.trim()) errors.push('prompts.summary must not be empty');
  if (!config.prompts.highlights.trim()) errors.push('prompts.highlights must not be empty');

  if (!config.rssFeeds.length) errors.push('rssFeeds must not be empty');
  for (const feed of config.rssFeeds) {
    if (!feed.name) errors.push('rssFeeds[].name must not be empty');
    if (!feed.xmlUrl) errors.push(`rss feed ${feed.name || '<unknown>'} missing xmlUrl`);
    if (!feed.htmlUrl) errors.push(`rss feed ${feed.name || '<unknown>'} missing htmlUrl`);
  }

  return { errors, warnings };
}
