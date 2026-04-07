import type {
  Article,
  CategoryConfig,
  PromptTemplates,
  ScoredArticle,
  OutputLanguage,
} from './types.js';

export type { PromptTemplates } from './types.js';

export function buildScoringPrompt(
  prompts: PromptTemplates,
  articles: Array<Pick<Article, 'title' | 'description' | 'sourceName'> & { index: number }>,
  categories: CategoryConfig[]
): string {
  const categoryOptions = categories.map((c) => `- ${c.id}: ${c.label}`).join('\n');
  const articlesList = articles
    .map(
      (a) =>
        `### [${a.index}] ${a.title}\nSource: ${a.sourceName}\nDescription: ${a.description || '(empty)'}`
    )
    .join('\n\n');
  return prompts.scoring
    .replace('{{categoryOptions}}', categoryOptions)
    .replace('{{articlesList}}', articlesList);
}

export function buildSummaryPrompt(
  prompts: PromptTemplates,
  articles: Array<
    Pick<Article, 'title' | 'description' | 'sourceName' | 'link'> & {
      index: number;
    }
  >,
  language: OutputLanguage,
  languageInstruction?: string
): string {
  const articlesList = articles
    .map(
      (a) =>
        `### [${a.index}] ${a.title}\nSource: ${a.sourceName}\nLink: ${a.link}\nDescription: ${a.description || '(empty)'}`
    )
    .join('\n\n');
  return prompts.summary
    .replace('{{languageInstruction}}', languageInstruction || language)
    .replace('{{articlesList}}', articlesList);
}

export function buildHighlightsPrompt(
  prompts: PromptTemplates,
  articles: Array<Pick<ScoredArticle, 'titleZh' | 'title' | 'summary' | 'sourceName'>>,
  language: OutputLanguage,
  languageInstruction?: string
): string {
  const articleList = articles
    .map((a) => `- ${a.titleZh || a.title} (${a.sourceName}): ${a.summary}`)
    .join('\n');
  return prompts.highlights
    .replace('{{languageInstruction}}', languageInstruction || language)
    .replace('{{articleList}}', articleList);
}
