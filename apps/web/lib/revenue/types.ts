/**
 * Database types for the revenue tables (supabase/migrations/20261014122*_revenue_*.sql),
 * kept out of the shared lib/db/types.ts on purpose: RevenueDatabase extends
 * the shared schema with our tables, the two new lead columns and our RPCs,
 * and lib/revenue/db.ts builds clients typed with it.
 *
 * Same shape as `supabase gen types` output. Client-safe (types only).
 */
import type { Database, Json, LeadRow } from '@/lib/db/types';
import type { ProjectStageId } from '@/lib/project-file/types';
import type { TopicKey } from './topics';

type Table<Row, Insert, Update = Partial<Row>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
type Timestamps = { created_at: string; updated_at: string };

/** leads + the revenue columns (migration 20261014122000). */
export type RevenueLeadRow = LeadRow & {
  /** 0-100 (lib/project-file/score.ts); null = not scored. */
  score: number | null;
  /** When the consultation was booked. */
  booked_at: string | null;
};

export type PartnerTierRow = {
  id: string;
  slug: string;
  name: string;
  badge_label: string;
  /** 1 = חברים ... 3 = שגרירים: the priority weight. */
  rank: number;
  price_agorot: number;
  billing_period: 'month';
  /** string[] of Hebrew benefit lines. */
  benefits: Json;
  /** Viewable impressions per 30 days the tier promises (partner health pace); null = no target. */
  monthly_impression_target: number | null;
  is_active: boolean;
  sort_order: number;
} & Timestamps;

export type PartnerSubscriptionStatus = 'pending' | 'active' | 'past_due' | 'cancelled';

export type PartnerSubscriptionRow = {
  id: string;
  business_id: string;
  tier_id: string;
  status: PartnerSubscriptionStatus;
  price_agorot: number;
  started_at: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  provider: 'mock' | 'upay' | 'manual' | null;
  provider_ref: string | null;
  last_payment_at: string | null;
  created_by: string | null;
  note: string | null;
} & Timestamps;

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended';
export const OFFER_PLACEMENTS = ['video', 'article', 'directory', 'answer', 'hub', 'planner'] as const;
export type OfferPlacement = (typeof OFFER_PLACEMENTS)[number];

export type PartnerCampaignRow = {
  id: string;
  business_id: string;
  name: string;
  status: CampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  topics: string[];
  stages: string[];
  region_slugs: string[];
  placements: string[];
  headline: string;
  body: string | null;
  cta_label: string;
  target_url: string;
  product_id: string | null;
  image_url: string | null;
  priority: number;
  created_by: string | null;
} & Timestamps;

export type PartnerDealRow = {
  id: string;
  business_id: string;
  lead_id: string | null;
  value_agorot: number | null;
  /** YYYY-MM-DD (Israel). */
  closed_on: string;
  note: string | null;
  reported_by: string | null;
} & Timestamps;

export type RoutingTarget = 'owner_inbox' | 'business' | 'partner_campaign' | 'business_default';

export type LeadRoutingRuleRow = {
  id: string;
  name: string;
  is_active: boolean;
  priority: number;
  lead_types: string[];
  specialty_slugs: string[];
  region_slugs: string[];
  stages: string[];
  min_score: number | null;
  max_score: number | null;
  target: RoutingTarget;
  target_business_id: string | null;
  target_campaign_id: string | null;
  note: string | null;
  created_by: string | null;
} & Timestamps;

/** revenue_business_metrics() result. Every count is a number (JSON). */
export type BusinessMetrics = {
  profile_views: number;
  unique_viewers: number;
  phone_reveals: number;
  contact_clicks: number;
  shortlist_adds: number;
  quote_events: number;
  impressions: number;
  reach: number;
  clicks: number;
  category_questions: number;
  category_askers: number;
  leads: number;
  leads_new: number;
  leads_contacted: number;
  leads_won: number;
  quote_requests: number;
  routed_leads: number;
  assisted_leads: number;
  regional_builders: number;
  deals: number;
  deal_value_agorot: number;
  daily: Array<{ day: string; views: number; impressions: number }>;
};

/** revenue_peer_rank() result. */
export type PeerRank = {
  peers: number;
  specialty?: string | null;
  views?: number;
  leads?: number;
  view_rank?: number;
  lead_rank?: number;
  median_views?: number;
  median_leads?: number;
};

export type PartnerOverviewRow = {
  business_id: string;
  impressions: number;
  clicks: number;
  leads: number;
  quote_requests: number;
  deals: number;
  deal_value_agorot: number;
};

type Shared = Database['public'];

export type RevenueDatabase = {
  public: {
    Tables: Omit<Shared['Tables'], 'leads'> & {
      leads: Table<RevenueLeadRow, Shared['Tables']['leads']['Insert'] & Partial<Pick<RevenueLeadRow, 'score' | 'booked_at'>>>;
      partner_tiers: Table<
        PartnerTierRow,
        Pick<PartnerTierRow, 'slug' | 'name' | 'badge_label' | 'rank' | 'price_agorot'> & Partial<PartnerTierRow>
      >;
      partner_subscriptions: Table<
        PartnerSubscriptionRow,
        Pick<PartnerSubscriptionRow, 'business_id' | 'tier_id' | 'price_agorot'> & Partial<PartnerSubscriptionRow>
      >;
      partner_campaigns: Table<
        PartnerCampaignRow,
        Pick<PartnerCampaignRow, 'business_id' | 'name' | 'headline' | 'target_url'> & Partial<PartnerCampaignRow>
      >;
      partner_deals: Table<PartnerDealRow, Pick<PartnerDealRow, 'business_id'> & Partial<PartnerDealRow>>;
      lead_routing_rules: Table<LeadRoutingRuleRow, Pick<LeadRoutingRuleRow, 'name' | 'target'> & Partial<LeadRoutingRuleRow>>;
    };
    Views: Shared['Views'] & {
      partner_badges: {
        Row: { business_id: string; tier_slug: string; tier_name: string; badge_label: string; rank: number };
        Relationships: [];
      };
    };
    Functions: Shared['Functions'] & {
      revenue_business_metrics: {
        Args: { p_business_id: string; p_from: string; p_to: string; p_patterns?: string[] };
        Returns: Json;
      };
      revenue_peer_rank: { Args: { p_business_id: string; p_from: string; p_to: string }; Returns: Json };
      revenue_partner_overview: { Args: { p_from: string; p_to: string }; Returns: PartnerOverviewRow[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/** Targeting a sponsored slot is asked for. */
export type OfferContext = {
  /** A topic key, a specialty slug or free text (video title, category name). */
  topic?: string | null;
  stage?: ProjectStageId | string | null;
  region?: string | null;
  placement?: OfferPlacement;
};

/** What <PartnerOfferSlot> renders (plain JSON: safe for Client Components). */
export type PartnerOffer = {
  campaignId: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  logoUrl: string | null;
  tier: { slug: string; name: string; badgeLabel: string; rank: number } | null;
  headline: string;
  body: string | null;
  ctaLabel: string;
  href: string;
  imageUrl: string | null;
  topics: TopicKey[];
};
