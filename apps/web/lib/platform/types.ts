/**
 * Database types for the foundation tables (supabase/migrations/20261014102000_*
 * and 20261014102100_*). Kept out of the shared lib/db/types.ts on purpose:
 * lib/platform/db.ts builds a client typed with this schema only.
 *
 * Same shape as `supabase gen types` output (Row / Insert / Update /
 * Relationships, Functions with Args / Returns).
 */
import type { Json } from '@/lib/db/types';

export type DeviceKind = 'mobile' | 'desktop' | 'tablet' | 'bot';

export type PlatformEventRow = {
  id: string;
  occurred_at: string;
  name: string;
  anon_id: string | null;
  session_id: string | null;
  user_id: string | null;
  path: string | null;
  referrer: string | null;
  utm: Json;
  props: Json;
  ip_hash: string | null;
  device: DeviceKind | null;
  is_demo: boolean;
};

export type PlatformEventInsert = Partial<Omit<PlatformEventRow, 'id' | 'name'>> & { name: string };

export type AiUsageRow = {
  id: string;
  day: string;
  route: string;
  model: string;
  is_demo: boolean;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  created_at: string;
  updated_at: string;
};

export type RateLimitRow = {
  key: string;
  window_start: string;
  hits: number;
  updated_at: string;
};

export type PlatformEventsDailyRow = {
  day: string;
  name: string;
  is_demo: boolean;
  events: number;
  visitors: number;
  sessions: number;
};

type NoRelationships = [];

export type PlatformDatabase = {
  public: {
    Tables: {
      platform_events: {
        Row: PlatformEventRow;
        Insert: PlatformEventInsert;
        Update: Partial<PlatformEventRow>;
        Relationships: NoRelationships;
      };
      ai_usage: {
        Row: AiUsageRow;
        Insert: Partial<AiUsageRow> & Pick<AiUsageRow, 'day' | 'route' | 'model'>;
        Update: Partial<AiUsageRow>;
        Relationships: NoRelationships;
      };
      rate_limits: {
        Row: RateLimitRow;
        Insert: Partial<RateLimitRow> & Pick<RateLimitRow, 'key' | 'window_start'>;
        Update: Partial<RateLimitRow>;
        Relationships: NoRelationships;
      };
    };
    Views: {
      platform_events_daily: { Row: PlatformEventsDailyRow; Relationships: NoRelationships };
    };
    Functions: {
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number; p_cost?: number };
        Returns: { allowed: boolean; used: number; remaining: number; retry_after_seconds: number }[];
      };
      record_ai_usage: {
        Args: {
          p_route: string;
          p_model: string;
          p_input_tokens: number;
          p_output_tokens: number;
          p_cache_read_tokens?: number;
          p_cache_write_tokens?: number;
          p_cost_usd?: number;
          p_is_demo?: boolean;
          p_day?: string;
        };
        Returns: number;
      };
      ai_spend_for_day: { Args: { p_day?: string }; Returns: number };
      platform_daily_counts: {
        Args: { p_from: string; p_to: string; p_names?: string[]; p_include_demo?: boolean; p_tz?: string };
        Returns: { day: string; name: string; events: number; visitors: number }[];
      };
      platform_unique_visitors: {
        Args: { p_from: string; p_to: string; p_include_demo?: boolean };
        Returns: { visitors: number; sessions: number; page_views: number; events: number }[];
      };
      platform_unique_visitors_daily: {
        Args: { p_from: string; p_to: string; p_include_demo?: boolean; p_tz?: string };
        Returns: { day: string; visitors: number; sessions: number; page_views: number }[];
      };
      platform_funnel: {
        Args: { p_steps: string[]; p_from: string; p_to: string; p_include_demo?: boolean };
        Returns: { step: number; name: string; visitors: number; conversion: number }[];
      };
      platform_top_props: {
        Args: {
          p_name: string;
          p_prop: string;
          p_from: string;
          p_to: string;
          p_limit?: number;
          p_include_demo?: boolean;
        };
        Returns: { value: string; events: number; visitors: number; last_seen: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
