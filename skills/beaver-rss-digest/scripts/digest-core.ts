import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  buildHighlightsPrompt,
  buildScoringPrompt,
  buildSummaryPrompt,
  type PromptTemplates,
} from './prompts';
import { REPO_TEMPLATES_DIR, resolveEnvToken } from './config';
import type {
  Article,
  CategoryConfig,
  CategoryId,
  FeedSource,
  LlmProfile,
  OutputLanguage,
  ScoredArticle,
} from './types';

const RSS_FETCH_TIMEOUT_MS = 30_000;
const RSS_FETCH_CONCURRENCY = 15;
const LLM_CALL_TIMEOUT_MS = 120_000;
const LLM_JSON_RETRY_COUNT = 1;

export interface RunDigestOptions {
  feeds: FeedSource[];
  prompts: PromptTemplates;
  hours: number;
  topN: number;
  language: OutputLanguage;
  outputPath: string;
  llms: LlmProfile[];
  categories: CategoryConfig[];
  i18n?: Record<string, string>;
  reportTemplate: string;
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

function parseJSON<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');
  return JSON.parse(cleaned) as T;
}

async function callWithProfile(prompt: string, profile: LlmProfile): Promise<string> {
  const apiKey = resolveEnvToken(profile.apiKey);
  if (!apiKey) throw new Error(`Missing API key for ${profile.provider}`);

  const signal = AbortSignal.timeout(LLM_CALL_TIMEOUT_MS);

  if (profile.apiType === 'anthropic-compatible') {
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

  const resp = await fetch(`${profile.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: profile.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
    signal,
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

async function aiCall(prompt: string, llms: LlmProfile[]): Promise<string> {
  const enabled = llms.filter((l) => l.enabled);
  if (!enabled.length) throw new Error('No enabled LLM providers configured.');

  let lastError = '';
  for (const profile of enabled) {
    try {
      return await callWithProfile(prompt, profile);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[digest] LLM ${profile.provider} failed: ${lastError}`);
    }
  }
  throw new Error(`All LLM providers failed: ${lastError}`);
}

function aiCallJSON<T>(prompt: string, llms: LlmProfile[]): Promise<T> {
  return (async () => {
    let lastParseError = '';
    for (let attempt = 0; attempt <= LLM_JSON_RETRY_COUNT; attempt++) {
      const raw = await aiCall(prompt, llms);
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

function parseRSSItems(
  xml: string
): Array<{ title: string; link: string; pubDate: string; description: string }> {
  const items: Array<{ title: string; link: string; pubDate: string; description: string }> = [];

  const rssItems = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const item of rssItems) {
    const title =
      item
        .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        ?.replace(/<[^>]*>/g, '')
        .trim() || '';
    const link = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() || '';
    const pubDate = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || '';
    const desc = item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '';
    if (title && link) items.push({ title, link, pubDate, description: desc });
  }

  const atomEntries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const entry of atomEntries) {
    const title =
      entry
        .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        ?.replace(/<[^>]*>/g, '')
        .trim() || '';
    const linkHref =
      entry.match(/<link[^>]*href=["']([^"']*)["'][^>]*\/?>/i)?.[1] ||
      entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() ||
      '';
    const published =
      entry.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] ||
      entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ||
      '';
    const desc =
      entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ||
      entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ||
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

function buildArticlesSection(articles: ScoredArticle[]): string {
  return articles
    .map(
      (a, i) =>
        `## ${i + 1}. ${a.titleZh || a.title}\n\n[${a.title}](${a.link})\n\n> ${a.summary}\n`
    )
    .join('\n');
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
}

async function renderReportFromTemplate(
  templateName: string,
  articles: ScoredArticle[],
  highlights: string,
  categories: CategoryConfig[],
  i18n?: Record<string, string>
): Promise<string> {
  const templatePath = join(REPO_TEMPLATES_DIR, `${templateName}.md`);
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
  const articlesSection = buildArticlesSection(articles);

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
  console.log(
    `[digest] Fetching ${options.feeds.length} feeds (concurrency=${RSS_FETCH_CONCURRENCY}, timeout=${RSS_FETCH_TIMEOUT_MS}ms)...`
  );
  const allArticles = await fetchArticles(options.feeds);
  const recent = allArticles.filter(
    (a) => a.pubDate.getTime() > Date.now() - options.hours * 3600_000
  );
  console.log(
    `[digest] ${allArticles.length} total articles, ${recent.length} within ${options.hours}h window`
  );
  if (!recent.length) throw new Error('No recent articles found.');

  const categoryIds = new Set(options.categories.map((c) => c.id));

  console.log(`[digest] Scoring ${recent.length} articles...`);
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
  }>(scorePrompt, options.llms);

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

  console.log(`[digest] Summarizing top ${picked.length} articles...`);
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
  }>(summaryPrompt, options.llms);

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

  console.log('[digest] Generating highlights...');
  const highlights = await aiCall(
    buildHighlightsPrompt(
      options.prompts,
      finalArticles,
      options.language,
      options.i18n?.['prompt.highlights.instruction']
    ),
    options.llms
  ).catch(() => '');

  const report = await renderReportFromTemplate(
    options.reportTemplate,
    finalArticles,
    highlights.trim(),
    options.categories,
    options.i18n
  );
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, report);
  console.log(`[digest] Report written to ${options.outputPath}`);
  return { outputPath: options.outputPath, finalArticles };
}
