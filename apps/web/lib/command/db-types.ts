/**
 * Database types for the Command Center tables and RPCs
 * (supabase/migrations/20261014123000_command_center.sql), merged with the
 * foundation's platform types so one typed client reaches both. Kept out of
 * the shared lib/db/types.ts on purpose (docs/platform/PROGRAM.md §5).
 */
import type { Json } from '@/lib/db/types';
import type { PlatformDatabase } from '@/lib/platform/types';

export type InsightRunStatus = 'running' | 'done' | 'partial' | 'empty' | 'failed' | 'budget';
export type CoverageLevel = 'gap' | 'partial' | 'covered';
export type CoverageLevelSource = 'similarity' | 'review';

export type InsightRunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: InsightRunStatus;
  window_from: string;
  window_to: string;
  question_count: number;
  ask_count: number;
  topic_count: number;
  embed_tokens: number;
  label_input_tokens: number;
  label_output_tokens: number;
  cost_usd: number;
  label_model: string | null;
  params: Json;
  message: string | null;
  triggered_by: string | null;
};

export type InsightTopicRow = {
  id: string;
  run_id: string;
  rank: number;
  label: string;
  suggested_title: string | null;
  asks: number;
  visitors: number;
  question_count: number;
  asks_this_week: number;
  asks_prev_week: number;
  trend_pct: number | null;
  coverage: number;
  top_similarity: number;
  coverage_level: CoverageLevel;
  level_source: CoverageLevelSource;
  level_reason: string | null;
  avg_confidence: number | null;
  examples: Json;
  nearest: Json;
  created_at: string;
};

export type PipelineExpectedValueRow = {
  id: string;
  key: string;
  deal_value_agorot: number;
  close_rate: number;
  note: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type LeadStatusEventRow = {
  id: string;
  lead_id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  changed_by: string | null;
};

type NoRelationships = [];
type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Row>; Relationships: NoRelationships };

type PlatformPublic = PlatformDatabase['public'];

export type QuestionStatRow = {
  question: string;
  question_key: string;
  asks: number;
  visitors: number;
  asks_this_week: number;
  asks_prev_week: number;
  answers: number;
  avg_confidence: number | null;
  zero_source_answers: number;
  avg_top_similarity: number | null;
  first_seen: string;
  last_seen: string;
};

export type CommandDatabase = {
  public: {
    Tables: PlatformPublic['Tables'] & {
      insight_runs: Table<
        InsightRunRow,
        Partial<InsightRunRow> & Pick<InsightRunRow, 'window_from' | 'window_to'>
      >;
      insight_topics: Table<
        InsightTopicRow,
        Partial<InsightTopicRow> & Pick<InsightTopicRow, 'run_id' | 'rank' | 'label' | 'coverage' | 'top_similarity' | 'coverage_level'>
      >;
      pipeline_expected_values: Table<
        PipelineExpectedValueRow,
        Partial<PipelineExpectedValueRow> & Pick<PipelineExpectedValueRow, 'key' | 'deal_value_agorot' | 'close_rate'>
      >;
      lead_status_events: Table<LeadStatusEventRow, Partial<LeadStatusEventRow> & Pick<LeadStatusEventRow, 'lead_id' | 'to_status'>>;
    };
    Views: PlatformPublic['Views'];
    Functions: PlatformPublic['Functions'] & {
      command_question_stats: {
        Args: { p_from: string; p_to: string; p_week_start: string; p_limit?: number; p_include_demo?: boolean };
        Returns: QuestionStatRow[];
      };
      command_top_paths: {
        Args: { p_from: string; p_to: string; p_limit?: number; p_include_demo?: boolean };
        Returns: { path: string; views: number; visitors: number }[];
      };
      command_cited_sources: {
        Args: { p_from: string; p_to: string; p_limit?: number; p_include_demo?: boolean };
        Returns: { source_id: string; citations: number; clicks: number; last_seen: string }[];
      };
      command_partner_stats: {
        Args: { p_from: string; p_to: string; p_include_demo?: boolean };
        Returns: {
          partner_id: string;
          impressions: number;
          clicks: number;
          reach: number;
          offer_views: number;
          offer_clicks: number;
        }[];
      };
      command_lead_first_changes: {
        Args: { p_from: string; p_to: string };
        Returns: { lead_id: string; first_changed_at: string; first_status: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
