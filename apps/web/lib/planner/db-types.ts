/**
 * Database types for planner_price_book
 * (supabase/migrations/20261014124000_growth_planner_price_book.sql). Kept out
 * of the shared lib/db/types.ts on purpose, like lib/platform/types.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/db/types';

export type PlannerPriceBookRow = {
  id: string;
  /** The date the numbers are valid for. */
  valid_as_of: string;
  /** PriceBook (lib/planner/types.ts), money in agorot. Validated by the app. */
  data: Json;
  /** What changed (admin). */
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type PlannerDatabase = {
  public: {
    Tables: {
      planner_price_book: {
        Row: PlannerPriceBookRow;
        Insert: Pick<PlannerPriceBookRow, 'valid_as_of' | 'data'> & Partial<Pick<PlannerPriceBookRow, 'id' | 'note' | 'created_by'>>;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type PlannerDb = SupabaseClient<PlannerDatabase>;

/** Any Supabase client (public, user-bound or service role), typed for the planner tables. */
export function asPlannerDb(client: unknown): PlannerDb {
  return client as PlannerDb;
}
