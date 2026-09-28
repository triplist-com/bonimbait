/**
 * Hand-written database types mirroring supabase/migrations/*.sql.
 *
 * Keep in sync with the migrations. Once the schema is applied, these can be
 * replaced by `supabase gen types typescript --project-id <id>` output — the
 * shape below matches what the generator produces (Row / Insert / Update /
 * Relationships per table).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ---------------------------------------------------------------------------
// Enumerations (CHECK constraints in SQL)
// ---------------------------------------------------------------------------
export type Role = 'member' | 'pro' | 'editor' | 'admin';
/** Mirrors the live signup form (see lib/constants/community.ts for labels). */
export type ConstructionStage =
  | 'land'
  | 'planning'
  | 'tender'
  | 'frame'
  | 'finishing'
  | 'design'
  | 'moving_in'
  | 'renovation';
export type ContentStatus = 'draft' | 'pending' | 'published' | 'archived';
export type VideoPageKind = 'video' | 'podcast';
export type BusinessTier = 'free' | 'basic' | 'premium';
export type BusinessStatus = 'draft' | 'pending' | 'published' | 'suspended';
export type LeadRouting = 'site' | 'direct';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type ReviewSource = 'migrated' | 'member';
export type ProductStatus = 'draft' | 'published' | 'archived';
export type ProductTaxonomy = 'product_cat' | 'category_product';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
export type PaymentProviderName = 'mock' | 'upay';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
export type LeadType =
  | 'consultation'
  | 'contact'
  | 'advertise'
  | 'partner'
  | 'join_pro'
  | 'business_contact'
  | 'benefit'
  | 'whatsapp_join'
  | 'service_plan';
export type LeadStatus = 'new' | 'in_progress' | 'qualified' | 'closed' | 'spam';
export type RedirectCode = 301 | 302 | 307 | 308;
export type RedirectSource = 'manual' | 'wp_redirection' | 'migration';

// ---------------------------------------------------------------------------
// Helpers to derive Insert / Update shapes
// ---------------------------------------------------------------------------
type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

/** Build a Relationships entry (FK column -> referenced table.id). */
type FK<Name extends string, Column extends string, Table extends string> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Table;
  referencedColumns: ['id'];
};

/**
 * Required: columns without a DB default that must be supplied on insert.
 * Generated: columns computed by the DB, never written.
 */
type TableDef<
  Row extends Record<string, unknown>,
  Required extends keyof Row,
  Generated extends keyof Row = never,
  Relationships extends Rel[] = [],
> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | Generated>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: Relationships;
};

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------
type Timestamps = { created_at: string; updated_at: string };

export type WhatsappGroupRow = {
  id: string;
  slug: string;
  name: string;
  invite_url: string;
  sort_order: number;
  is_active: boolean;
} & Timestamps;

export type WhatsappGroupPublicRow = Pick<WhatsappGroupRow, 'id' | 'slug' | 'name' | 'sort_order'>;

export type RegionRow = {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  is_nationwide: boolean;
  whatsapp_group_id: string | null;
  sort_order: number;
} & Timestamps;

export type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: Role;
  construction_stage: ConstructionStage | null;
  region_id: string | null;
  whatsapp_opt_in: boolean;
  /** "Tips & updates" opt-in (migration 20260928130200). */
  newsletter_opt_in: boolean;
  avatar_url: string | null;
} & Timestamps;

export type PostCategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  legacy_wp_id: number | null;
} & Timestamps;

export type AuthorRow = {
  id: string;
  slug: string;
  name: string;
  bio_html: string | null;
  avatar_url: string | null;
  legacy_wp_id: number | null;
} & Timestamps;

export type PostRow = {
  id: string;
  slug: string;
  title: string;
  content_html: string;
  excerpt: string | null;
  featured_image: string | null;
  featured_image_alt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  noindex: boolean;
  status: ContentStatus;
  published_at: string | null;
  primary_category_id: string | null;
  author_id: string | null;
  legacy_wp_id: number | null;
  created_by: string | null;
  updated_by: string | null;
} & Timestamps;

export type PostCategoryAssignmentRow = { post_id: string; category_id: string; created_at: string };

export type PageRow = {
  id: string;
  slug: string;
  title: string;
  content_html: string;
  excerpt: string | null;
  featured_image: string | null;
  featured_image_alt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  noindex: boolean;
  template: string | null;
  parent_id: string | null;
  sort_order: number;
  status: ContentStatus;
  published_at: string | null;
  legacy_wp_id: number | null;
  created_by: string | null;
  updated_by: string | null;
} & Timestamps;

/** Existing apps/api table (video categories). Not modified by parity. */
export type VideoCategoryRow = {
  id: string;
  name_he: string;
  slug: string;
  description_he: string | null;
  icon: string | null;
  created_at: string;
};

/** Existing apps/api table (indexed YouTube videos). Not modified by parity. */
export type VideoRow = {
  id: string;
  youtube_id: string;
  title: string;
  description: string | null;
  duration_seconds: number;
  thumbnail_url: string | null;
  published_at: string | null;
  category_id: string | null;
  transcript_text: string | null;
  summary: string | null;
  key_points: Json | null;
  costs_data: Json | null;
} & Timestamps;

/** Legacy WordPress /video/<slug>/ page. */
export type VideoPageRow = {
  id: string;
  legacy_slug: string;
  title: string;
  body_html: string;
  excerpt: string | null;
  featured_image: string | null;
  youtube_ids: string[];
  related_youtube_ids: string[];
  video_id: string | null;
  kind: VideoPageKind;
  author_name: string | null;
  legacy_categories: Json;
  seo_title: string | null;
  seo_description: string | null;
  noindex: boolean;
  status: ContentStatus;
  published_at: string | null;
  legacy_wp_id: number | null;
} & Timestamps;

export type SpecialtyRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
} & Timestamps;

export type GalleryImage = { url: string; alt?: string | null };

/** Public business profile. Contact details are in BusinessContactRow. */
export type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description_html: string | null;
  primary_specialty_id: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  gallery: Json;
  social_links: Json;
  extra_links: Json;
  youtube_ids: string[];
  lead_routing: LeadRouting;
  owner_member_id: string | null;
  tier: BusinessTier;
  status: BusinessStatus;
  is_featured: boolean;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  legacy_wp_id: number | null;
  legacy_url: string | null;
  published_at: string | null;
} & Timestamps;

/** Private (owner/staff/service role only). */
export type BusinessContactRow = {
  business_id: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  other_phones: string[];
  lead_email: string | null;
} & Timestamps;

export type BusinessSpecialtyRow = { business_id: string; specialty_id: string; created_at: string };
export type BusinessRegionRow = { business_id: string; region_id: string; created_at: string };

export type ReviewRow = {
  id: string;
  business_id: string;
  member_id: string | null;
  author_name: string | null;
  /** 0–10 overall (live scale). */
  rating: number;
  score_value: number | null;
  score_availability: number | null;
  score_attitude: number | null;
  score_reliability: number | null;
  title: string | null;
  body: string | null;
  images: Json;
  status: ReviewStatus;
  source: ReviewSource;
  legacy_id: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  published_at: string | null;
} & Timestamps;

export type BusinessReviewStatsRow = {
  business_id: string;
  review_count: number;
  rating_avg: number;
  rating_percent: number;
  score_value_avg: number | null;
  score_availability_avg: number | null;
  score_attitude_avg: number | null;
  score_reliability_avg: number | null;
};

export type ServicePlanFeature = { category?: string; label: string; value: boolean | string };

export type ServicePlanRow = {
  id: string;
  slug: string;
  name: string;
  track_label: string | null;
  subtitle: string | null;
  description_html: string | null;
  highlights: Json;
  features: Json;
  is_featured: boolean;
  is_purchasable_online: boolean;
  is_active: boolean;
  sort_order: number;
  /** Card CTA text on the live page (migration 20260928130200). */
  cta_label: string | null;
  /** Column tag in the comparison table header. */
  compare_label: string | null;
} & Timestamps;

export type ServicePlanPriceRow = {
  id: string;
  plan_id: string;
  label: string | null;
  min_sqm: number | null;
  max_sqm: number | null;
  price_agorot: number;
  currency: string;
  vat_included: boolean;
  sort_order: number;
} & Timestamps;

export type ProductCategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  legacy_wp_id: number | null;
  /** product_cat -> /product-category/<slug>/, category_product -> /category-product/<slug>/ */
  taxonomy: ProductTaxonomy;
} & Timestamps;

export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description_html: string | null;
  is_purchasable: boolean;
  price_agorot: number;
  sale_price_agorot: number | null;
  currency: string;
  featured_image: string | null;
  images: Json;
  sku: string | null;
  stock_quantity: number | null;
  partner_business_id: string | null;
  status: ProductStatus;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  legacy_wp_id: number | null;
  /** Product tag chip shown on cards ("דוד שמש"). */
  tag_label: string | null;
  subtitle: string | null;
  /** Heading of the "leave details" box on the product page. */
  lead_heading: string | null;
  /** Show the optional "urgent need" checkbox on the lead form. */
  lead_urgent_option: boolean;
  /** Accordion sections: [{ title, html }]. */
  details: Json;
  /** Yoast canonical path from the import (Migration workstream, 20260928130400). */
  seo_canonical: string | null;
} & Timestamps;

export type ProductCategoryAssignmentRow = { product_id: string; category_id: string; created_at: string };

export type OrderRow = {
  id: string;
  order_number: number;
  member_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  status: OrderStatus;
  subtotal_agorot: number;
  discount_agorot: number;
  vat_agorot: number;
  total_agorot: number;
  currency: string;
  billing: Json;
  notes: string | null;
  paid_at: string | null;
} & Timestamps;

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  service_plan_price_id: string | null;
  description: string;
  quantity: number;
  unit_price_agorot: number;
  total_agorot: number;
  created_at: string;
};

export type PaymentRow = {
  id: string;
  order_id: string;
  provider: PaymentProviderName;
  provider_ref: string | null;
  status: PaymentStatus;
  amount_agorot: number;
  currency: string;
  raw: Json | null;
  error_message: string | null;
} & Timestamps;

export type LeadRow = {
  id: string;
  type: LeadType;
  status: LeadStatus;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  region_id: string | null;
  construction_stage: string | null;
  payload: Json;
  source_url: string | null;
  utm: Json;
  business_id: string | null;
  product_id: string | null;
  service_plan_id: string | null;
  whatsapp_group_id: string | null;
  member_id: string | null;
  assigned_to: string | null;
  forwarded_to: string | null;
  notes: string | null;
} & Timestamps;

export type RedirectRow = {
  id: string;
  from_path: string;
  to_path: string;
  code: RedirectCode;
  is_active: boolean;
  source: RedirectSource;
  note: string | null;
} & Timestamps;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
export type Database = {
  public: {
    Tables: {
      whatsapp_groups: TableDef<WhatsappGroupRow, 'slug' | 'name' | 'invite_url'>;
      regions: TableDef<
        RegionRow,
        'slug' | 'name',
        never,
        [FK<'regions_whatsapp_group_id_fkey', 'whatsapp_group_id', 'whatsapp_groups'>]
      >;
      profiles: TableDef<ProfileRow, 'id', never, [FK<'profiles_region_id_fkey', 'region_id', 'regions'>]>;
      post_categories: TableDef<PostCategoryRow, 'slug' | 'name'>;
      authors: TableDef<AuthorRow, 'slug' | 'name'>;
      posts: TableDef<
        PostRow,
        'slug' | 'title',
        never,
        [
          FK<'posts_primary_category_id_fkey', 'primary_category_id', 'post_categories'>,
          FK<'posts_author_id_fkey', 'author_id', 'authors'>,
        ]
      >;
      post_category_assignments: TableDef<
        PostCategoryAssignmentRow,
        'post_id' | 'category_id',
        never,
        [
          FK<'post_category_assignments_post_id_fkey', 'post_id', 'posts'>,
          FK<'post_category_assignments_category_id_fkey', 'category_id', 'post_categories'>,
        ]
      >;
      pages: TableDef<PageRow, 'slug' | 'title'>;
      categories: TableDef<VideoCategoryRow, 'name_he' | 'slug'>;
      videos: TableDef<VideoRow, 'youtube_id' | 'title' | 'duration_seconds'>;
      video_pages: TableDef<
        VideoPageRow,
        'legacy_slug' | 'title',
        never,
        [FK<'video_pages_video_id_fkey', 'video_id', 'videos'>]
      >;
      specialties: TableDef<SpecialtyRow, 'slug' | 'name'>;
      businesses: TableDef<
        BusinessRow,
        'slug' | 'name',
        never,
        [FK<'businesses_primary_specialty_id_fkey', 'primary_specialty_id', 'specialties'>]
      >;
      business_contacts: TableDef<
        BusinessContactRow,
        'business_id',
        never,
        [FK<'business_contacts_business_id_fkey', 'business_id', 'businesses'>]
      >;
      business_specialties: TableDef<
        BusinessSpecialtyRow,
        'business_id' | 'specialty_id',
        never,
        [
          FK<'business_specialties_business_id_fkey', 'business_id', 'businesses'>,
          FK<'business_specialties_specialty_id_fkey', 'specialty_id', 'specialties'>,
        ]
      >;
      business_regions: TableDef<
        BusinessRegionRow,
        'business_id' | 'region_id',
        never,
        [
          FK<'business_regions_business_id_fkey', 'business_id', 'businesses'>,
          FK<'business_regions_region_id_fkey', 'region_id', 'regions'>,
        ]
      >;
      reviews: TableDef<
        ReviewRow,
        'business_id' | 'rating',
        never,
        [FK<'reviews_business_id_fkey', 'business_id', 'businesses'>]
      >;
      service_plans: TableDef<ServicePlanRow, 'slug' | 'name'>;
      service_plan_prices: TableDef<
        ServicePlanPriceRow,
        'plan_id' | 'price_agorot',
        never,
        [FK<'service_plan_prices_plan_id_fkey', 'plan_id', 'service_plans'>]
      >;
      product_categories: TableDef<ProductCategoryRow, 'slug' | 'name'>;
      products: TableDef<ProductRow, 'slug' | 'name'>;
      product_category_assignments: TableDef<
        ProductCategoryAssignmentRow,
        'product_id' | 'category_id',
        never,
        [
          FK<'product_category_assignments_product_id_fkey', 'product_id', 'products'>,
          FK<'product_category_assignments_category_id_fkey', 'category_id', 'product_categories'>,
        ]
      >;
      orders: TableDef<OrderRow, 'customer_name' | 'customer_email', 'order_number'>;
      order_items: TableDef<
        OrderItemRow,
        'order_id' | 'description' | 'unit_price_agorot',
        'total_agorot',
        [FK<'order_items_order_id_fkey', 'order_id', 'orders'>]
      >;
      payments: TableDef<PaymentRow, 'order_id' | 'provider' | 'amount_agorot'>;
      leads: TableDef<LeadRow, 'type'>;
      redirects: TableDef<RedirectRow, 'from_path' | 'to_path'>;
    };
    Views: {
      business_review_stats: { Row: BusinessReviewStatsRow; Relationships: [] };
      whatsapp_groups_public: { Row: WhatsappGroupPublicRow; Relationships: [] };
    };
    Functions: {
      app_role: { Args: Record<string, never>; Returns: string };
      has_role: { Args: { required: string }; Returns: boolean };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      resolve_region: { Args: { label: string }; Returns: string | null };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
