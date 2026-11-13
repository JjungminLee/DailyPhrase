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

export type LocalJudgeCase = {
  case_id: string;
  language: string;
  phrase: string;
  code_checks: Record<string, boolean | null>;
  judgment: {
    naturalness: number;
    context_fit: number;
    beginner_usefulness: number;
    language_quality: number;
    field_quality: number;
    confidence: number;
    rationale: string;
  };
};
export type LocalJudgeResult = {
  timestamp: string;
  evaluation_mode?: 'quick' | 'full';
  cached?: boolean;
  evaluator_model: string;
  generator_model: string;
  evaluator_rubric_revision: string;
  baseline_file: string;
  dataset: { cases: number; id: string };
  interpretation: string;
  summary: Record<string, { cases: number; averages: Record<string, number> }>;
  cases: LocalJudgeCase[];
};

export type MultilingualBenchmark = {
  reward: {
    timestamp: string;
    dataset: { id: string; sha256: string; cases: number };
    baseline: { file: string; model: { requested: string; digest: string; ollama_version?: string } };
    reward_revision_sha256?: string;
    per_language: Record<string, {
      cases: number;
      successful_generations: number;
      eligible_outputs: number;
      mean_code_reward: number | null;
      checks: Record<string, { passed: number; failed: number }>;
      injected_errors: { detected: number; total: number };
    }>;
    repeatability: { stable_cases: number; total_cases: number; repetitions_per_fixed_output: number };
    injected_errors: { detected: number; total: number; kinds: string[] };
    rag: { status: string; reason: string };
    limitations: string[];
  };
  baseline: {
    timestamp: string;
    model: { requested: string; digest: string };
    summary: Record<string, {
      cases: number;
      requests_succeeded: number;
      grounded_outputs: number;
      pronunciation_present: number;
      chinese_pinyin_with_tone_marks: number;
    }>;
  };
};

export type Week6Evaluation = {
  run_id: string;
  timestamp: string;
  model: { requested: string; revision: string; adapter: string | null; variant: 'base' | 'sft_lora'; license: string };
  dataset: { id: string; sha256: string; cases: number; split: string; used_as_training_data: boolean };
  generation: { temperature: number; max_tokens: number; seed: number; do_sample: boolean; constrained_json_schema?: boolean };
  machine: { platform: string; device: string; peak_process_rss_bytes: number; peak_mps_driver_allocated_bytes: number | null };
  runtime: { torch: string; transformers: string };
  summary: { cases: number; requests_succeeded: number; eligible_outputs: number; mean_code_reward: number; mean_latency_ms: number; p50_latency_ms: number; p95_latency_ms: number; total_output_tokens: number };
  per_language: Record<string, {
    cases: number;
    requests_succeeded: number;
    source_grounded: number;
    eligible_outputs: number;
    mean_code_reward: number | null;
    exact_reference_matches: number;
    mean_latency_ms: number | null;
    checks: Record<string, { passed: number; failed: number }>;
  }>;
  limitations: string[];
  cases: Array<{
    id: string;
    language: string;
    status: string;
    output: { text?: string } | null;
    checks: Record<string, boolean>;
    reward: number;
    eligible: boolean;
    elapsed_ms: number;
    raw_output: string;
  }>;
};

export type Week6TrainingRun = {
  created_at: string;
  git_sha: string;
  model_id: string;
  model_revision: string;
  dataset_id: string;
  dataset_sha256: string;
  dataset_counts: Record<string, number>;
  device: string;
  lora: { r: number; alpha: number; dropout: number };
  training: { train_loss?: number; train_runtime?: number; train_steps_per_second?: number; epoch?: number };
};

export type Week6GrpoRun = {
  status?: string;
  status_note?: string;
  created_at: string;
  model_id: string;
  model_revision: string;
  starting_adapter?: string;
  dataset_id: string;
  dataset_sha256: string;
  evaluation_dataset_used_for_training: boolean;
  reward?: string;
  device: string;
  settings?: Record<string, number | string | boolean>;
  training?: { train_loss?: number; train_runtime?: number; train_steps_per_second?: number };
  training_log?: Array<Record<string, number | string>>;
  peak_mps_driver_allocated_bytes?: number | null;
};

export type Week6Experiments = {
  evaluations: Week6Evaluation[];
  training_runs: Week6TrainingRun[];
  grpo_runs: Week6GrpoRun[];
  dataset: { id: string; status: string; rights_status: string; cases: number; native_speaker_reviewed: boolean };
};

export type ApiError = Error & { payload?: unknown; status?: number };
