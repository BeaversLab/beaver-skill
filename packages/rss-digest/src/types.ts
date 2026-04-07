export type OutputLanguage = 'zh' | 'en';

export type CategoryId = string;

export interface CategoryConfig {
  id: string;
  emoji: string;
  label: string;
}

export interface LlmProfile {
  enabled: boolean;
  provider: string;
  apiType: 'openai-compatible' | 'anthropic-compatible';
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface FeedSource {
  name: string;
  xmlUrl: string;
  htmlUrl: string;
}

export interface Article {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  sourceName: string;
  sourceUrl: string;
}

export interface ScoredArticle extends Article {
  score: number;
  scoreBreakdown: {
    relevance: number;
    quality: number;
    timeliness: number;
  };
  category: CategoryId;
  keywords: string[];
  titleZh: string;
  summary: string;
  reason: string;
}

export interface DigestDefaults {
  hours: number;
  topN: number;
  language: OutputLanguage;
  outputDir: string;
  reportTemplate: string;
}

export interface DigestConfigShape {
  version: number;
  llmApiKeyEnv: string;
  defaults: DigestDefaults;
  llms: LlmProfile[];
  categories: CategoryConfig[];
  prompts: PromptTemplates;
  rssFeeds: FeedSource[];
}

export type PromptTemplates = {
  scoring: string;
  summary: string;
  highlights: string;
};
