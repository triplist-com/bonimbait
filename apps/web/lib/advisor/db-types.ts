/**
 * Database types for the advisor tables (supabase/migrations/20261014120000_advisor_threads.sql).
 * Same shape as `supabase gen types`; kept out of the shared lib/db/types.ts.
 */
import type { Json } from '@/lib/db/types';

export type AdvisorThreadRow = {
  id: string;
  user_id: string;
  title: string;
  turn_count: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type AdvisorMessageRow = {
  id: string;
  thread_id: string;
  user_id: string;
  turn: number;
  role: 'user' | 'assistant';
  content: string;
  sources: Json;
  followups: Json;
  confidence: number | null;
  created_at: string;
};

export type AdvisorShareRow = {
  id: string;
  question: string;
  payload: Json;
  user_id: string | null;
  is_demo: boolean;
  created_at: string;
};

type NoRelationships = [];

export type AdvisorDatabase = {
  public: {
    Tables: {
      advisor_threads: {
        Row: AdvisorThreadRow;
        Insert: Partial<AdvisorThreadRow> & Pick<AdvisorThreadRow, 'user_id' | 'title'>;
        Update: Partial<AdvisorThreadRow>;
        Relationships: NoRelationships;
      };
      advisor_messages: {
        Row: AdvisorMessageRow;
        Insert: Partial<AdvisorMessageRow> & Pick<AdvisorMessageRow, 'thread_id' | 'user_id' | 'turn' | 'role' | 'content'>;
        Update: Partial<AdvisorMessageRow>;
        Relationships: NoRelationships;
      };
      advisor_shares: {
        Row: AdvisorShareRow;
        Insert: Partial<AdvisorShareRow> & Pick<AdvisorShareRow, 'id' | 'question' | 'payload'>;
        Update: Partial<AdvisorShareRow>;
        Relationships: NoRelationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      advisor_usage_daily: {
        Args: { p_from: string; p_to: string; p_tz?: string };
        Returns: { day: string; threads: number; questions: number; members: number; shares: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
