import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join } from 'node:path';
import process from 'node:process';
import type { FeedSource, OutputLanguage, DigestConfigShape } from './types.js';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export interface DigestRunResult {
  outputPath: string;
}

export interface DigestCliDeps<TConfig extends DigestConfigShape = DigestConfigShape> {
  configPath: string;
  defaultLlmApiKeyEnv: string;
  loadConfig: () => Promise<TConfig>;
  initConfig: (force?: boolean) => Promise<{ created: boolean; path: string }>;
  loadI18n: () => Promise<Record<OutputLanguage, Record<string, string>>>;
  saveConfig: (config: TConfig) => Promise<void>;
  validateConfig: (config: TConfig) => Promise<ValidationResult>;
  resolveConfiguredLlmApiKeyEnv: (config: TConfig) => string;
  resolveConfiguredLlmApiKey: (config: TConfig) => string;
  runDigest: (options: {
    feeds: FeedSource[];
    prompts: TConfig['prompts'];
    hours: number;
    topN: number;
    language: OutputLanguage;
    outputPath: string;
    llms: TConfig['llms'];
    llmApiKey: string;
    categories: TConfig['categories'];
    reportTemplate: string;
    i18n: Record<string, string>;
  }) => Promise<DigestRunResult>;
}

function printUsage(): void {
  console.log(`beaver-rss-digest

Usage:
  digest init [--force] [--interactive]
  digest run [--hours <n>] [--top-n <n>] [--lang <zh|en>] [--output <path>]
  digest config path
  digest config validate
  digest source list
  digest source add [--name <name> --xml <xmlUrl> --html <htmlUrl>]
  digest source remove [--name <name>]
`);
}

function parseNumberArg(args: string[], key: string): number | undefined {
  const idx = args.indexOf(key);
  if (idx < 0 || !args[idx + 1]) return undefined;
  const parsed = Number.parseInt(args[idx + 1]!, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringArg(args: string[], key: string): string | undefined {
  const idx = args.indexOf(key);
  if (idx < 0 || !args[idx + 1]) return undefined;
  return args[idx + 1]!;
}

async function runInteractiveSetup<TConfig extends DigestConfigShape>(
  deps: DigestCliDeps<TConfig>
): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    const hours = (await rl.question('默认抓取小时数（默认 48）: ')).trim();
    const topN = (await rl.question('默认精选条数（默认 15）: ')).trim();
    const langRaw = (await rl.question('默认输出语言 zh/en（默认 zh）: ')).trim();
    const outputDir = (await rl.question('默认输出目录（默认 ./output）: ')).trim();
    const llmApiKeyEnv = (
      await rl.question(`LLM API Key 环境变量名（默认 ${deps.defaultLlmApiKeyEnv}）: `)
    ).trim();
    const cfg = await deps.loadConfig();
    if (hours) cfg.defaults.hours = Number.parseInt(hours, 10) || cfg.defaults.hours;
    if (topN) cfg.defaults.topN = Number.parseInt(topN, 10) || cfg.defaults.topN;
    if (langRaw === 'en' || langRaw === 'zh') cfg.defaults.language = langRaw as OutputLanguage;
    if (outputDir) cfg.defaults.outputDir = outputDir;
    if (llmApiKeyEnv) cfg.llmApiKeyEnv = llmApiKeyEnv;
    await deps.saveConfig(cfg);
    console.log('[digest] 配置已保存。');
  } finally {
    rl.close();
  }
}

async function ensureConfigReady<TConfig extends DigestConfigShape>(
  deps: DigestCliDeps<TConfig>
): Promise<void> {
  let config;
  try {
    config = await deps.loadConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Missing config file')) {
      console.log('[digest] 配置文件不存在，正在初始化...');
      await deps.initConfig(false);
      console.log('[digest] 已创建默认配置。请编辑后重试：');
      console.log(`  配置文件: ${deps.configPath}`);
      console.log('\n需要配置的关键项：');
      console.log(`  1. 在 config.yaml 中设置 llmApiKeyEnv，默认值为 ${deps.defaultLlmApiKeyEnv}`);
      console.log(
        `  2. 在当前 shell 环境中 export 对应变量，例如 export ${deps.defaultLlmApiKeyEnv}=your-key`
      );
      console.log('  3. llms[].enabled — 启用至少一个 LLM');
      console.log('  4. rssFeeds — 根据需要增删 RSS 源');
      process.exit(1);
    }
    throw e;
  }

  if (config.version < 2) {
    console.log('[digest] 配置版本过旧，正在升级...');
    await deps.initConfig(true);
    await runInteractiveSetup(deps);
    return;
  }

  const { errors, warnings } = await deps.validateConfig(config);

  if (warnings.length) {
    for (const w of warnings) console.warn(`[digest] ⚠️  ${w}`);
    console.log('');
  }

  if (!errors.length) return;

  const llmErrors = errors.filter(
    (e) => e.toLowerCase().includes('llm') || e.toLowerCase().includes('apikey')
  );
  const otherErrors = errors.filter((e) => !llmErrors.includes(e));

  console.error('[digest] 配置存在问题：');
  for (const err of errors) console.error(`  - ${err}`);
  console.log('');

  if (llmErrors.length) {
    console.log('LLM 相关问题修复建议：');
    console.log('  1. 确保至少一个 llms[] 项的 enabled 为 true');
    console.log(`  2. 确保 llmApiKeyEnv 为合法环境变量名，默认值为 ${deps.defaultLlmApiKeyEnv}`);
    console.log('  3. 如果当前环境里没有这个变量，请修改 config.yaml 中的 llmApiKeyEnv');
    console.log('  4. 或者在当前 shell 环境中 export 与 llmApiKeyEnv 同名的变量');
    console.log(`  5. 编辑配置文件: ${deps.configPath}`);
    console.log('');
  }

  if (otherErrors.length && !llmErrors.length) {
    console.log('[digest] 将进入交互配置向导修复 defaults 配置...');
    await runInteractiveSetup(deps);
    return;
  }

  process.exit(1);
}

async function handleRun<TConfig extends DigestConfigShape>(
  args: string[],
  deps: DigestCliDeps<TConfig>
): Promise<void> {
  await ensureConfigReady(deps);
  const config = await deps.loadConfig();
  const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const hours = parseNumberArg(args, '--hours') ?? config.defaults.hours;
  const topN = parseNumberArg(args, '--top-n') ?? config.defaults.topN;
  const langRaw = parseStringArg(args, '--lang');
  const language: OutputLanguage = langRaw === 'en' ? 'en' : config.defaults.language;
  const outputPath =
    parseStringArg(args, '--output') ?? join(config.defaults.outputDir, `digest-${now}.md`);

  const i18n = await deps.loadI18n();
  const enabledLlms = config.llms.filter((l) => l.enabled);
  if (!enabledLlms.length) {
    console.error('[digest] No enabled LLM configured. Edit config: ' + deps.configPath);
    process.exit(1);
  }
  const configuredEnvName = deps.resolveConfiguredLlmApiKeyEnv(config);
  const llmApiKey = deps.resolveConfiguredLlmApiKey(config);
  if (!llmApiKey) {
    console.error(
      `[digest] Configured llmApiKeyEnv ${configuredEnvName} is not set in the current shell environment.`
    );
    console.error(
      `[digest] If the env var name is wrong, update llmApiKeyEnv in ${deps.configPath}`
    );
    console.error(`[digest] Otherwise export ${configuredEnvName}=your-key before running.`);
    process.exit(1);
  }
  console.log(
    `[digest] LLM chain: ${enabledLlms.map((l) => `${l.provider}/${l.model}`).join(' → ')}`
  );
  console.log(`[digest] llmApiKeyEnv=${configuredEnvName}`);
  console.log(`[digest] hours=${hours} topN=${topN} lang=${language}`);

  await deps.runDigest({
    feeds: config.rssFeeds,
    prompts: config.prompts,
    hours,
    topN,
    language,
    outputPath,
    llms: config.llms,
    llmApiKey,
    categories: config.categories,
    reportTemplate: config.defaults.reportTemplate,
    i18n: i18n[language],
  });
}

async function handleSourceList<TConfig extends DigestConfigShape>(
  deps: DigestCliDeps<TConfig>
): Promise<void> {
  const config = await deps.loadConfig();
  if (!config.rssFeeds.length) {
    console.log('[digest] No RSS sources configured.');
    return;
  }
  for (const [index, source] of config.rssFeeds.entries()) {
    console.log(`${index + 1}. ${source.name}`);
    console.log(`   xml:  ${source.xmlUrl}`);
    console.log(`   html: ${source.htmlUrl}`);
  }
}

async function handleSourceAdd<TConfig extends DigestConfigShape>(
  args: string[],
  deps: DigestCliDeps<TConfig>
): Promise<void> {
  const config = await deps.loadConfig();
  const rl = createInterface({ input, output });
  try {
    const name = parseStringArg(args, '--name') || (await rl.question('source name: ')).trim();
    const xmlUrl = parseStringArg(args, '--xml') || (await rl.question('xml url: ')).trim();
    const htmlUrl = parseStringArg(args, '--html') || (await rl.question('html url: ')).trim();
    if (!name || !xmlUrl || !htmlUrl) throw new Error('name/xml/html are required');
    const exists = config.rssFeeds.some((x) => x.name === name || x.xmlUrl === xmlUrl);
    if (exists) throw new Error('source already exists');
    const next: FeedSource = { name, xmlUrl, htmlUrl };
    config.rssFeeds.push(next);
    await deps.saveConfig(config);
    console.log(`[digest] added source: ${name}`);
  } finally {
    rl.close();
  }
}

async function handleSourceRemove<TConfig extends DigestConfigShape>(
  args: string[],
  deps: DigestCliDeps<TConfig>
): Promise<void> {
  const config = await deps.loadConfig();
  const rl = createInterface({ input, output });
  try {
    const name =
      parseStringArg(args, '--name') || (await rl.question('source name to remove: ')).trim();
    const before = config.rssFeeds.length;
    config.rssFeeds = config.rssFeeds.filter((x) => x.name !== name);
    if (config.rssFeeds.length === before) throw new Error(`source not found: ${name}`);
    await deps.saveConfig(config);
    console.log(`[digest] removed source: ${name}`);
  } finally {
    rl.close();
  }
}

export async function runCli<TConfig extends DigestConfigShape>(
  args: string[],
  deps: DigestCliDeps<TConfig>
): Promise<void> {
  const [command, subcommand] = args;
  if (!command || command === '--help' || command === '-h') return printUsage();

  if (command === 'init') {
    const force = args.includes('--force');
    const interactive = args.includes('--interactive');
    const result = await deps.initConfig(force);
    console.log(
      result.created
        ? `[digest] Created config: ${result.path}`
        : `[digest] Config exists: ${result.path}`
    );
    console.log(
      `[digest] Configure llmApiKeyEnv in config.yaml, then export that env var before running (default: ${deps.defaultLlmApiKeyEnv}=your-key)`
    );
    if (interactive) await runInteractiveSetup(deps);
    return;
  }
  if (command === 'run') return handleRun(args, deps);
  if (command === 'config' && subcommand === 'path') return void console.log(deps.configPath);
  if (command === 'config' && subcommand === 'validate') {
    const config = await deps.loadConfig();
    const { errors, warnings } = await deps.validateConfig(config);
    if (warnings.length) {
      for (const w of warnings) console.warn(`[digest] ⚠️  ${w}`);
      console.warn(
        `[digest] Check llmApiKeyEnv in ${deps.configPath} and export the same env var in the current shell.`
      );
    }
    if (errors.length) {
      console.error(`[digest] Config invalid:\n- ${errors.join('\n- ')}`);
      process.exit(1);
    }
    console.log('[digest] Config is valid.');
    return;
  }
  if (command === 'source' && subcommand === 'list') return handleSourceList(deps);
  if (command === 'source' && subcommand === 'add') return handleSourceAdd(args, deps);
  if (command === 'source' && subcommand === 'remove') return handleSourceRemove(args, deps);
  printUsage();
}
