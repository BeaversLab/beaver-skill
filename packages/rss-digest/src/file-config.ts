import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';
import yaml from 'js-yaml';
import { runCli } from './cli.js';
import { runDigest } from './digest-core.js';
import type { DigestCliDeps, ValidationResult } from './cli.js';
import type {
  CategoryConfig,
  DigestConfigShape,
  FeedSource,
  LlmProfile,
  OutputLanguage,
} from './types.js';

export type DigestFileConfig = DigestConfigShape;
export type I18nDictionary = Record<OutputLanguage, Record<string, string>>;
type FileCliDeps = Omit<DigestCliDeps<DigestFileConfig>, 'runDigest'>;

export interface DigestFileConfigOptions {
  configPath: string;
  i18nPath: string;
  repoI18nPath: string;
  configExamplePath: string;
  defaultLlmApiKeyEnv: string;
}

export interface LocalDigestCliOptions extends DigestFileConfigOptions {
  args: string[];
  templatesDir: string;
}

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

function normalizeApiKeyToken(raw: string, defaultLlmApiKeyEnv: string): string {
  const trimmed = raw.trim();
  return trimmed || defaultLlmApiKeyEnv;
}

export function parseDigestConfig(raw: string, defaultLlmApiKeyEnv: string): DigestFileConfig {
  const parsed = asRecord(yaml.load(raw));
  const defaults = asRecord(parsed.defaults);
  const prompts = asRecord(parsed.prompts);
  const llmsRaw = Array.isArray(parsed.llms) ? parsed.llms : [];
  const categoriesRaw = Array.isArray(parsed.categories) ? parsed.categories : [];
  const feedsRaw = Array.isArray(parsed.rssFeeds) ? parsed.rssFeeds : [];

  const version = asNumber(parsed.version);
  const llmApiKeyEnv = normalizeApiKeyToken(asString(parsed.llmApiKeyEnv), defaultLlmApiKeyEnv);
  const hours = asNumber(defaults.hours);
  const topN = asNumber(defaults.topN);
  const language = parseLanguage(defaults.language);
  const outputDir = asString(defaults.outputDir);
  const reportTemplate = asString(defaults.reportTemplate).trim() || 'default';
  if (version === null || hours === null || topN === null || !language) {
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
      apiKey: normalizeApiKeyToken(asString(item.apiKey), defaultLlmApiKeyEnv),
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

  return {
    version,
    llmApiKeyEnv,
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
}

async function copyTemplate(src: string, dst: string): Promise<void> {
  const content = await readFile(src, 'utf-8');
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, content, 'utf-8');
}

export function resolveConfiguredLlmApiKeyEnv(
  config: DigestFileConfig,
  defaultLlmApiKeyEnv: string
): string {
  return extractEnvName(config.llmApiKeyEnv) || defaultLlmApiKeyEnv;
}

export function resolveConfiguredLlmApiKey(
  config: DigestFileConfig,
  defaultLlmApiKeyEnv: string
): string {
  return process.env[resolveConfiguredLlmApiKeyEnv(config, defaultLlmApiKeyEnv)] || '';
}

export async function validateDigestConfig(
  config: DigestFileConfig,
  defaultLlmApiKeyEnv: string
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.defaults.hours <= 0) errors.push('defaults.hours must be > 0');
  if (config.defaults.topN <= 0) errors.push('defaults.topN must be > 0');
  if (!config.defaults.reportTemplate.trim())
    errors.push('defaults.reportTemplate must not be empty');
  if (!['zh', 'en'].includes(config.defaults.language))
    errors.push('defaults.language must be zh or en');

  if (!config.llms.length) errors.push('llms must not be empty');
  const enabledLlms = config.llms.filter((llm) => llm.enabled);
  if (!enabledLlms.length) errors.push('At least one llm must be enabled');
  const configuredEnvName = extractEnvName(config.llmApiKeyEnv);
  if (!configuredEnvName) errors.push('llmApiKeyEnv must be a valid env var name');
  for (const llm of enabledLlms) {
    if (!llm.provider) errors.push('llms[].provider must not be empty');
    if (!llm.baseUrl) errors.push(`llm ${llm.provider || '<unknown>'} missing baseUrl`);
    if (!llm.model) errors.push(`llm ${llm.provider || '<unknown>'} missing model`);
  }
  if (
    enabledLlms.length &&
    configuredEnvName &&
    !resolveConfiguredLlmApiKey(config, defaultLlmApiKeyEnv)
  ) {
    warnings.push(
      `Configured llmApiKeyEnv ${configuredEnvName} is not set in the current shell environment`
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

export function createFileCliDeps(options: DigestFileConfigOptions): FileCliDeps {
  const loadConfig = async (): Promise<DigestFileConfig> => {
    if (!existsSync(options.configPath)) {
      throw new Error(`Missing config file: ${options.configPath}. Run digest init first.`);
    }
    const raw = await readFile(options.configPath, 'utf-8');
    const config = parseDigestConfig(raw, options.defaultLlmApiKeyEnv);
    const { errors } = await validateDigestConfig(config, options.defaultLlmApiKeyEnv);
    if (errors.length > 0) {
      throw new Error(`Invalid config:\n- ${errors.join('\n- ')}`);
    }
    return config;
  };

  const initConfig = async (force = false): Promise<{ created: boolean; path: string }> => {
    if (existsSync(options.configPath) && !force)
      return { created: false, path: options.configPath };
    await copyTemplate(options.configExamplePath, options.configPath);
    if (!existsSync(options.i18nPath) || force) {
      await copyTemplate(options.repoI18nPath, options.i18nPath);
    }
    return { created: true, path: options.configPath };
  };

  const loadI18n = async (): Promise<I18nDictionary> => {
    const path = existsSync(options.i18nPath) ? options.i18nPath : options.repoI18nPath;
    const raw = await readFile(path, 'utf-8');
    const parsed = asRecord(yaml.load(raw));
    const zh = asRecord(parsed.zh);
    const en = asRecord(parsed.en);
    return {
      zh: Object.fromEntries(Object.entries(zh).map(([k, v]) => [k, String(v)])),
      en: Object.fromEntries(Object.entries(en).map(([k, v]) => [k, String(v)])),
    };
  };

  const saveConfig = async (config: DigestFileConfig): Promise<void> => {
    await mkdir(dirname(options.configPath), { recursive: true });
    await writeFile(options.configPath, yaml.dump(config, { lineWidth: -1 }), 'utf-8');
  };

  return {
    configPath: options.configPath,
    defaultLlmApiKeyEnv: options.defaultLlmApiKeyEnv,
    loadConfig,
    initConfig,
    loadI18n,
    saveConfig,
    validateConfig: (config) => validateDigestConfig(config, options.defaultLlmApiKeyEnv),
    resolveConfiguredLlmApiKeyEnv: (config) =>
      resolveConfiguredLlmApiKeyEnv(config, options.defaultLlmApiKeyEnv),
    resolveConfiguredLlmApiKey: (config) =>
      resolveConfiguredLlmApiKey(config, options.defaultLlmApiKeyEnv),
  };
}

export async function runLocalDigestCli(options: LocalDigestCliOptions): Promise<void> {
  const cliDeps = createFileCliDeps(options);

  await runCli(options.args, {
    ...cliDeps,
    runDigest: (digestOptions) =>
      runDigest({
        ...digestOptions,
        templatesDir: options.templatesDir,
      }),
  });
}
