import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { load as loadHtml } from 'cheerio';
import TurndownService from 'turndown';
import {
  buildHighlightsPrompt,
  buildScoringPrompt,
  buildSummaryPrompt,
  type PromptTemplates,
} from './prompts.js';
import type {
  Article,
  CategoryConfig,
  CategoryId,
  FeedSource,
  LlmProfile,
  OutputLanguage,
  ScoredArticle,
} from './types.js';

const RSS_FETCH_TIMEOUT_MS = 30_000;
const RSS_FETCH_CONCURRENCY = 15;
const ARTICLE_FETCH_TIMEOUT_MS = 20_000;
const ARTICLE_FETCH_CONCURRENCY = 8;
const LLM_CALL_TIMEOUT_MS = 120_000;
const LLM_JSON_RETRY_COUNT = 1;
const MIN_RSS_DESCRIPTION_LENGTH = 140;
const MAX_ARTICLE_DESCRIPTION_LENGTH = 2_000;
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

export interface RunDigestOptions {
  feeds: FeedSource[];
  prompts: PromptTemplates;
  hours: number;
  topN: number;
  language: OutputLanguage;
  outputPath: string;
  stdout?: boolean;
  llms: LlmProfile[];
  llmApiKey: string;
  categories: CategoryConfig[];
  i18n?: Record<string, string>;
  reportTemplate: string;
  templatesDir: string;
}

function logDigestMessage(stdout: boolean | undefined, message: string): void {
  if (stdout) {
    console.error(message);
    return;
  }
  console.log(message);
}

function sanitizeDescription(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function sanitizeArticleContent(raw: string): string {
  return raw
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, MAX_ARTICLE_DESCRIPTION_LENGTH);
}

function extractArticleText(html: string): string {
  const $ = loadHtml(html);

  $('script, style, noscript, svg, img, iframe, nav, footer, header, aside, form').remove();

  const candidates = [
    'article',
    'main article',
    'main',
    '[role="main"]',
    '.post-content',
    '.entry-content',
    '.article-content',
    '.post-body',
    '.entry-body',
    '.content',
    'body',
  ];

  let bestText = '';
  for (const selector of candidates) {
    const node = $(selector).first();
    if (!node.length) continue;

    const htmlFragment = node.html() || '';
    const markdown = sanitizeArticleContent(turndownService.turndown(htmlFragment));
    const textFallback = sanitizeArticleContent(node.text());
    const content = markdown.length >= textFallback.length / 2 ? markdown : textFallback;

    if (content.length > bestText.length) bestText = content;
    if (bestText.length >= MAX_ARTICLE_DESCRIPTION_LENGTH / 2) break;
  }

  return bestText;
}

function unwrapCdata(raw: string): string {
  return raw
    .trim()
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, '$1')
    .trim();
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeFeedValue(raw: string, options?: { stripTags?: boolean }): string {
  let value = decodeXmlEntities(unwrapCdata(raw));
  if (options?.stripTags) {
    value = value.replace(/<[^>]*>/g, '');
  }
  return value.trim();
}

function shouldEnrichDescription(description: string): boolean {
  return description.trim().length < MIN_RSS_DESCRIPTION_LENGTH;
}

async function fetchArticleContent(article: Article): Promise<string> {
  const resp = await fetch(article.link, {
    signal: AbortSignal.timeout(ARTICLE_FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': 'beaver-rss-digest/0.1 (+https://github.com/BeaversLab/beaver-skill)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const html = await resp.text();
  const content = extractArticleText(html);
  if (!content) throw new Error('empty article body');
  return content;
}

async function enrichArticleDescriptions(articles: Article[]): Promise<Article[]> {
  const enriched: Article[] = [];

  for (let i = 0; i < articles.length; i += ARTICLE_FETCH_CONCURRENCY) {
    const batch = articles.slice(i, i + ARTICLE_FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (article) => {
        if (!shouldEnrichDescription(article.description)) return article;

        try {
          const content = await fetchArticleContent(article);
          return {
            ...article,
            description: content,
          };
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn(`[digest] article fetch failed for ${article.link}: ${reason}`);
          return article;
        }
      })
    );

    for (const result of settled) {
      if (result.status === 'fulfilled') enriched.push(result.value);
    }
  }

  return enriched;
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');
}

function extractFirstJsonBlock(text: string): string | null {
  const start = text.search(/[\[{]/);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let opener = '';

  for (let i = start; i < text.length; i += 1) {
    const char = text[i]!;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      if (depth === 0) opener = char;
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      const matches =
        (char === '}' && opener === '{') || (char === ']' && opener === '[') || depth > 1;
      if (!matches) return null;
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function parseJSON<T>(text: string): T {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const extracted = extractFirstJsonBlock(cleaned);
    if (!extracted) throw new Error('No JSON object or array found in model response');
    return JSON.parse(extracted) as T;
  }
}

async function callOpenAICompatible(
  prompt: string,
  profile: LlmProfile,
  apiKey: string
): Promise<string> {
  const provider = createOpenAICompatible({
    name: profile.provider.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'provider',
    apiKey,
    baseURL: profile.baseUrl,
  });

  const result = await Promise.race([
    generateText({
      // `@ai-sdk/openai-compatible` currently exposes a newer model interface
      // than the generic `generateText` type accepts in this package setup.
      model: provider(profile.model) as unknown as Parameters<typeof generateText>[0]['model'],
      prompt,
      temperature: 0.3,
    }),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`LLM request timed out after ${LLM_CALL_TIMEOUT_MS}ms`)),
        LLM_CALL_TIMEOUT_MS
      );
    }),
  ]);

  return result.text;
}

async function callAnthropicCompatible(
  prompt: string,
  profile: LlmProfile,
  apiKey: string
): Promise<string> {
  if (!apiKey) throw new Error(`Missing API key for ${profile.provider}`);

  const signal = AbortSignal.timeout(LLM_CALL_TIMEOUT_MS);

  const resp = await fetch(`${profile.baseUrl.replace(/\/+$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: profile.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal,
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = (await resp.json()) as { content?: Array<{ type?: string; text?: string }> };
  return data.content?.find((x) => x.type === 'text')?.text || '';
}

async function callWithProfile(
  prompt: string,
  profile: LlmProfile,
  apiKey: string
): Promise<string> {
  if (!apiKey) throw new Error(`Missing API key for ${profile.provider}`);

  if (profile.apiType === 'anthropic-compatible') {
    return callAnthropicCompatible(prompt, profile, apiKey);
  }

  return callOpenAICompatible(prompt, profile, apiKey);
}

async function aiCall(prompt: string, llms: LlmProfile[], apiKey: string): Promise<string> {
  const enabled = llms.filter((l) => l.enabled);
  if (!enabled.length) throw new Error('No enabled LLM providers configured.');

  let lastError = '';
  for (const profile of enabled) {
    try {
      return await callWithProfile(prompt, profile, apiKey);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[digest] LLM ${profile.provider} failed: ${lastError}`);
    }
  }
  throw new Error(`All LLM providers failed: ${lastError}`);
}

function aiCallJSON<T>(prompt: string, llms: LlmProfile[], apiKey: string): Promise<T> {
  return (async () => {
    let lastParseError = '';
    for (let attempt = 0; attempt <= LLM_JSON_RETRY_COUNT; attempt++) {
      const raw = await aiCall(prompt, llms, apiKey);
      try {
        return parseJSON<T>(raw);
      } catch (e) {
        lastParseError = e instanceof Error ? e.message : String(e);
        console.error(`[digest] JSON parse failed (attempt ${attempt + 1}): ${lastParseError}`);
        if (attempt < LLM_JSON_RETRY_COUNT) {
          console.error('[digest] Retrying LLM call for valid JSON...');
        }
      }
    }
    throw new Error(
      `Failed to parse LLM response as JSON after ${LLM_JSON_RETRY_COUNT + 1} attempts: ${lastParseError}`
    );
  })();
}

export function parseRSSItems(
  xml: string
): Array<{ title: string; link: string; pubDate: string; description: string }> {
  const items: Array<{ title: string; link: string; pubDate: string; description: string }> = [];

  const rssItems = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const item of rssItems) {
    const title =
      normalizeFeedValue(item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', {
        stripTags: true,
      }) || '';
    const link = normalizeFeedValue(item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '');
    const pubDate = normalizeFeedValue(
      item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || ''
    );
    const desc = normalizeFeedValue(
      item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || ''
    );
    if (title && link) items.push({ title, link, pubDate, description: desc });
  }

  const atomEntries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const entry of atomEntries) {
    const title =
      normalizeFeedValue(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', {
        stripTags: true,
      }) || '';
    const linkHref =
      normalizeFeedValue(entry.match(/<link[^>]*href=["']([^"']*)["'][^>]*\/?>/i)?.[1] || '') ||
      normalizeFeedValue(entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '') ||
      '';
    const published =
      normalizeFeedValue(entry.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] || '') ||
      normalizeFeedValue(entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] || '') ||
      '';
    const desc =
      normalizeFeedValue(entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || '') ||
      normalizeFeedValue(entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] || '') ||
      '';
    if (title && linkHref)
      items.push({ title, link: linkHref, pubDate: published, description: desc });
  }

  return items;
}

async function fetchOneFeed(feed: FeedSource): Promise<Article[]> {
  const resp = await fetch(feed.xmlUrl, { signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS) });
  if (!resp.ok) return [];
  const xml = await resp.text();
  return parseRSSItems(xml).map((item) => ({
    title: item.title,
    link: item.link,
    pubDate: new Date(item.pubDate || 0),
    description: sanitizeDescription(item.description),
    sourceName: feed.name,
    sourceUrl: feed.htmlUrl,
  }));
}

async function fetchArticles(feeds: FeedSource[]): Promise<Article[]> {
  const results: Article[] = [];
  let failCount = 0;

  for (let i = 0; i < feeds.length; i += RSS_FETCH_CONCURRENCY) {
    const batch = feeds.slice(i, i + RSS_FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((f) => fetchOneFeed(f)));
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(...result.value);
      } else {
        failCount++;
      }
    }
  }

  if (failCount > 0) console.error(`[digest] ${failCount}/${feeds.length} feeds failed to fetch`);
  return results;
}

function buildCategoryChart(
  articles: ScoredArticle[],
  categories: CategoryConfig[],
  chartTitle: string
): string {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const count = new Map<CategoryId, number>();
  for (const a of articles) count.set(a.category, (count.get(a.category) || 0) + 1);
  if (!count.size) return '';
  let md = `\`\`\`mermaid\npie showData\n    title "${chartTitle}"\n`;
  for (const [id, n] of count.entries()) {
    const c = categoryMap.get(id) || { emoji: '📝', label: id };
    md += `    "${c.emoji} ${c.label}" : ${n}\n`;
  }
  md += '```\n';
  return md;
}

function buildArticlesSection(articles: ScoredArticle[], categories: CategoryConfig[]): string {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return articles
    .map((a, i) => {
      const category = categoryMap.get(a.category);
      const categoryLine = category
        ? `**分类**: ${category.emoji} ${category.label}`
        : `**分类**: ${a.category}`;

      return `## ${i + 1}. ${a.titleZh || a.title}\n\n${categoryLine}\n\n[${a.title}](${a.link})\n\n> ${a.summary}\n`;
    })
    .join('\n');
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
}

async function renderReportFromTemplate(
  templatesDir: string,
  templateName: string,
  articles: ScoredArticle[],
  highlights: string,
  categories: CategoryConfig[],
  i18n?: Record<string, string>
): Promise<string> {
  const templatePath = join(templatesDir, `${templateName}.md`);
  let template = '';
  try {
    template = await readFile(templatePath, 'utf-8');
  } catch {
    throw new Error(`Report template not found: ${templateName} (${templatePath})`);
  }

  const reportTitle = i18n?.['report.title'] || 'AI 博客每日精选';
  const highlightsTitle = i18n?.['summary.sectionTitle'] || '今日看点';
  const chartTitle = i18n?.['chart.categoryTitle'] || '文章分类分布';
  const highlightsSection = highlights ? `## ${highlightsTitle}\n\n${highlights}` : '';
  const categoryChartSection = buildCategoryChart(articles, categories, chartTitle);
  const articlesSection = buildArticlesSection(articles, categories);

  return (
    renderTemplate(template, {
      reportTitle,
      date: new Date().toISOString().slice(0, 10),
      highlightsSection,
      categoryChartSection,
      articlesSection,
    }).trim() + '\n'
  );
}

export async function runDigest(
  options: RunDigestOptions
): Promise<{ outputPath: string; finalArticles: ScoredArticle[] }> {
  logDigestMessage(
    options.stdout,
    `[digest] Fetching ${options.feeds.length} feeds (concurrency=${RSS_FETCH_CONCURRENCY}, timeout=${RSS_FETCH_TIMEOUT_MS}ms)...`
  );
  const allArticles = await fetchArticles(options.feeds);
  const recentCandidates = allArticles.filter(
    (a) => a.pubDate.getTime() > Date.now() - options.hours * 3600_000
  );
  logDigestMessage(
    options.stdout,
    `[digest] ${allArticles.length} total articles, ${recentCandidates.length} within ${options.hours}h window`
  );
  if (!recentCandidates.length) throw new Error('No recent articles found.');

  logDigestMessage(
    options.stdout,
    `[digest] Enriching short RSS descriptions (concurrency=${ARTICLE_FETCH_CONCURRENCY}, timeout=${ARTICLE_FETCH_TIMEOUT_MS}ms)...`
  );
  const recent = await enrichArticleDescriptions(recentCandidates);

  const categoryIds = new Set(options.categories.map((c) => c.id));

  logDigestMessage(options.stdout, `[digest] Scoring ${recent.length} articles...`);
  const scorePrompt = buildScoringPrompt(
    options.prompts,
    recent.map((a, index) => ({
      index,
      title: a.title,
      description: a.description,
      sourceName: a.sourceName,
    })),
    options.categories
  );
  const score = await aiCallJSON<{
    results: Array<{
      index: number;
      relevance: number;
      quality: number;
      timeliness: number;
      category: string;
      keywords: string[];
    }>;
  }>(scorePrompt, options.llms, options.llmApiKey);

  const picked = recent
    .map((a, i) => {
      const s = score.results.find((x) => x.index === i) || {
        relevance: 5,
        quality: 5,
        timeliness: 5,
        category: 'other',
        keywords: [],
      };
      return {
        ...a,
        total: s.relevance + s.quality + s.timeliness,
        scoreBreakdown: { relevance: s.relevance, quality: s.quality, timeliness: s.timeliness },
        category: (categoryIds.has(s.category) ? s.category : 'other') as CategoryId,
        keywords: s.keywords || [],
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, options.topN);

  logDigestMessage(options.stdout, `[digest] Summarizing top ${picked.length} articles...`);
  const summaryPrompt = buildSummaryPrompt(
    options.prompts,
    picked.map((a, index) => ({
      index,
      title: a.title,
      description: a.description,
      sourceName: a.sourceName,
      link: a.link,
    })),
    options.language,
    options.i18n?.['prompt.summary.instruction']
  );
  const summary = await aiCallJSON<{
    results: Array<{ index: number; titleZh: string; summary: string; reason: string }>;
  }>(summaryPrompt, options.llms, options.llmApiKey);

  const finalArticles: ScoredArticle[] = picked.map((a, i) => {
    const sm = summary.results.find((x) => x.index === i);
    return {
      ...a,
      score: a.total,
      titleZh: sm?.titleZh || a.title,
      summary: sm?.summary || a.description,
      reason: sm?.reason || '',
    };
  });

  logDigestMessage(options.stdout, '[digest] Generating highlights...');
  const highlights = await aiCall(
    buildHighlightsPrompt(
      options.prompts,
      finalArticles,
      options.language,
      options.i18n?.['prompt.highlights.instruction']
    ),
    options.llms,
    options.llmApiKey
  ).catch(() => '');

  const report = await renderReportFromTemplate(
    options.templatesDir,
    options.reportTemplate,
    finalArticles,
    highlights.trim(),
    options.categories,
    options.i18n
  );
  if (options.stdout) {
    process.stdout.write(report);
    return { outputPath: '[stdout]', finalArticles };
  }

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, report);
  console.log(`[digest] Report written to ${options.outputPath}`);
  return { outputPath: options.outputPath, finalArticles };
}
