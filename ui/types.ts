export type LanguageConfig = {
  code: string;
  name: string;
  phrase_unit: 'words' | 'chars';
  min: number;
  max: number;
  level_scale: string;
};

export type ConfigResponse = {
  request_id: string;
  default_languages: string[];
  languages: LanguageConfig[];
};

export type HealthResponse = {
  request_id: string;
  status: string;
  version: string;
  languages: string[];
  init_ms: number;
};

export type Phrase = {
  text: string;
  meaning_ko: string;
  context_sentence: string;
  level: string;
  type?: 'collocation' | 'idiom' | 'phrasal_verb' | 'sentence_pattern' | 'other';
  pinyin?: string;
  reading?: string;
  note_ko?: string;
};

export type ArticleSource = {
  feed_id: string;
  title: string;
  url: string;
  published_at: string | null;
};

export type FeedAvailability = {
  id: string;
  language: string;
  enabled: boolean;
  verified: boolean;
  is_default?: boolean;
};

export type LanguageResult = {
  language: string;
  source?: ArticleSource;
  phrases: Phrase[];
};

export type DailyResponse = {
  request_id: string;
  date: string;
  results: Record<string, LanguageResult>;
  errors: Array<{ language: string; type: string; message: string }>;
};

export type ArticleItem = {
  id: string;
  feed_id: string;
  feed_name: string;
  language: string;
  title: string;
  url: string;
  published_at: string | null;
  discovered_at: string;
  status: 'new' | 'processed' | 'baseline';
};

export type Feed = {
  id: string;
  name: string;
  language: string;
  rss_url: string;
  homepage_url?: string;
  enabled: boolean;
  verified: boolean;
  is_default?: boolean;
  last_checked_at?: string;
  last_error?: { type: string; message: string } | null;
};

export type FeedVerification = {
  url: string;
  source_type: string;
  entry_count: number;
  sample: Array<{ title: string; url: string; published_at: string }>;
};

export type BatchStudy = {
  runs: Array<{
    concurrency: number;
    mean_duration_ms: number;
    p50_duration_ms: number;
    p95_duration_ms: number;
    scans_per_second: number;
    successful_scans: number;
    failed_scans: number;
  }>;
};

export type ApiError = Error & { payload?: unknown; status?: number };
