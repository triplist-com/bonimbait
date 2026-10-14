/**
 * Content Autopilot (P5) types: the runtime knowledge store
 * (supabase/migrations/20261014103000_autopilot_knowledge_store.sql) and the
 * pipeline's values. Client-safe (no server imports).
 */
import type { ConstructionStage } from '@/lib/db/types';

export const SOURCE_KINDS = ['youtube', 'podcast', 'upload'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_STATUSES = [
  'detected',
  'transcribing',
  'needs_transcript',
  'transcribed',
  'summarizing',
  'indexed',
  'published',
  'failed',
  'skipped',
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const TRANSCRIPT_SOURCES = [
  'captions_manual',
  'captions_auto',
  'upload_vtt',
  'upload_srt',
  'upload_sbv',
  'upload_json3',
  'upload_txt',
  'audio_transcription',
] as const;
export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];

export type DetectedVia = 'cron' | 'admin' | 'manual';

/** One timed caption line, in seconds (the static pipeline's transcript segment). */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** A searchable transcript chunk (the static pipeline's "segment"). */
export interface Chunk {
  chunk_index: number;
  start_s: number;
  end_s: number;
  text: string;
}

export interface SummaryKeyPoint {
  text: string;
  /** Second in the video where the point is made (null when unknown). */
  start_s: number | null;
}

export interface SummaryCost {
  item: string;
  price: string;
  unit: string;
  context: string;
}

export interface SummaryChapter {
  title: string;
  start_s: number;
}

/** knowledge_sources.summary: what the video page renders. */
export interface SourceSummary {
  summary: string;
  key_points: SummaryKeyPoint[];
  costs: SummaryCost[];
  /** One of the AI-index video categories (videos.json `categories`). */
  category_slug: string;
  /** Build stage, in the profile vocabulary (lib/constants/community.ts). */
  stage: ConstructionStage | null;
  chapters: SummaryChapter[];
  tips: string[];
  warnings: string[];
  /** Questions this video answers, for the "ask about this video" entry. */
  suggested_questions: string[];
  model?: string;
  generated_at?: string;
  edited_at?: string | null;
}

export type UsageStep = 'embed' | 'summarize' | 'transcribe_audio';

/** One paid call, appended to knowledge_sources.usage. */
export interface UsageEntry {
  step: UsageStep;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  audio_seconds?: number;
  usd_micros: number;
  at: string;
}

export type KnowledgeSourceRow = {
  id: string;
  kind: SourceKind;
  external_id: string;
  title: string;
  url: string | null;
  published_at: string | null;
  duration_s: number | null;
  thumbnail_url: string | null;
  status: SourceStatus;
  error: string | null;
  transcript_source: TranscriptSource | null;
  transcript_text: string | null;
  transcript_cues: Cue[] | null;
  summary: SourceSummary | null;
  chunk_count: number;
  cost_usd_micros: number;
  usage: UsageEntry[];
  attempts: number;
  is_demo: boolean;
  detected_via: DetectedVia | null;
  processed_at: string | null;
  site_published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeChunkRow = {
  id: string;
  source_id: string;
  chunk_index: number;
  start_s: number;
  end_s: number;
  text: string;
  /** pgvector literal ("[0.1,0.2,...]"); PostgREST returns vectors as text. */
  embedding: string | null;
  tokens: number | null;
  created_at: string;
};

/** A row of public.match_knowledge_chunks(). */
export type KnowledgeMatchRow = {
  chunk_id: string;
  source_id: string;
  kind: SourceKind;
  external_id: string;
  chunk_index: number;
  start_s: number;
  end_s: number;
  text: string;
  similarity: number;
  title: string;
  thumbnail_url: string | null;
  duration_s: number | null;
  published_at: string | null;
  category_slug: string | null;
  summary_text: string | null;
};

/** Light queue row (no transcript / usage payloads). */
export type SourceListRow = Pick<
  KnowledgeSourceRow,
  | 'id'
  | 'kind'
  | 'external_id'
  | 'title'
  | 'url'
  | 'published_at'
  | 'duration_s'
  | 'thumbnail_url'
  | 'status'
  | 'error'
  | 'transcript_source'
  | 'chunk_count'
  | 'cost_usd_micros'
  | 'attempts'
  | 'is_demo'
  | 'processed_at'
  | 'site_published_at'
  | 'updated_at'
  | 'created_at'
>;

export const SOURCE_LIST_COLUMNS =
  'id, kind, external_id, title, url, published_at, duration_s, thumbnail_url, status, error, transcript_source, chunk_count, cost_usd_micros, attempts, is_demo, processed_at, site_published_at, updated_at, created_at';

// ---------------------------------------------------------------------------
// Supabase schema typing for the autopilot tables (kept out of lib/db/types.ts)
// ---------------------------------------------------------------------------
type Insertable<Row, Required extends keyof Row, Generated extends keyof Row = never> = Pick<Row, Required> &
  Partial<Omit<Row, Required | Generated>>;

export type AutopilotDatabase = {
  public: {
    Tables: {
      knowledge_sources: {
        Row: KnowledgeSourceRow;
        Insert: Insertable<KnowledgeSourceRow, 'kind' | 'external_id' | 'title'>;
        Update: Partial<KnowledgeSourceRow>;
        Relationships: [];
      };
      knowledge_chunks: {
        Row: KnowledgeChunkRow;
        Insert: Insertable<KnowledgeChunkRow, 'source_id' | 'chunk_index' | 'text'>;
        Update: Partial<KnowledgeChunkRow>;
        Relationships: [
          {
            foreignKeyName: 'knowledge_chunks_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_sources';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_knowledge_chunks: {
        Args: { query_embedding: string; match_count?: number; min_similarity?: number };
        Returns: KnowledgeMatchRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
