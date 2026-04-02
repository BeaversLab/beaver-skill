import type { CategoryConfig, OutputLanguage, ScoredArticle } from './types';

export interface PromptTemplates {
  scoring: string;
  summary: string;
  highlights: string;
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
}

export function buildScoringPrompt(
  templates: PromptTemplates,
  articles: Array<{ index: number; title: string; description: string; sourceName: string }>,
  categories: CategoryConfig[]
): string {
  const articlesList = articles
    .map((a) => `Index ${a.index}: [${a.sourceName}] ${a.title}\n${a.description.slice(0, 300)}`)
    .join('\n\n---\n\n');
  const categoryOptions = categories.map((c) => `- ${c.id}: ${c.label}`).join('\n');
  return renderTemplate(templates.scoring, { articlesList, categoryOptions });
}

export function buildSummaryPrompt(
  templates: PromptTemplates,
  articles: Array<{
    index: number;
    title: string;
    description: string;
    sourceName: string;
    link: string;
  }>,
  lang: OutputLanguage,
  overrideInstruction?: string
): string {
  const articlesList = articles
    .map(
      (a) =>
        `Index ${a.index}: [${a.sourceName}] ${a.title}\nURL: ${a.link}\n${a.description.slice(0, 800)}`
    )
    .join('\n\n---\n\n');
  const languageInstruction =
    overrideInstruction ||
    (lang === 'zh'
      ? '请用中文撰写摘要和推荐理由。如果原文是英文，请翻译为中文。标题翻译也用中文。'
      : 'Write summaries, reasons, and title translations in English.');
  return renderTemplate(templates.summary, { articlesList, languageInstruction });
}

export function buildHighlightsPrompt(
  templates: PromptTemplates,
  articles: ScoredArticle[],
  lang: OutputLanguage,
  overrideInstruction?: string
): string {
  const articleList = articles
    .slice(0, 10)
    .map((a, i) => `${i + 1}. [${a.category}] ${a.titleZh || a.title} — ${a.summary.slice(0, 100)}`)
    .join('\n');
  const languageInstruction =
    overrideInstruction || (lang === 'zh' ? '用中文回答。' : 'Write in English.');
  return renderTemplate(templates.highlights, { articleList, languageInstruction });
}
