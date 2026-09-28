-- =============================================================================
-- Parity foundation 6/7: row-level security
--
-- Model:
--   * anon + members read PUBLISHED content.
--   * members read/write only their own profile and event registrations, and
--     read their own orders / payments / memberships (those are written by the
--     server with the service-role key during checkout).
--   * pros (business owners) edit their own business (guard trigger protects
--     moderation/billing columns) and read reviews + leads of that business.
--   * editors + admins (public.is_staff()) have full access everywhere.
--   * anyone may INSERT a lead.
--   * service_role bypasses RLS (Supabase default) — server-only usage.
--
-- Every policy is dropped first so the file is re-runnable.
-- =============================================================================

-- Helper: enable RLS + the standard "staff full access" policy on a table.
create or replace function public._parity_enable_rls(tbl regclass)
returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('drop policy if exists "staff full access" on %s', tbl);
  execute format(
    'create policy "staff full access" on %s for all to authenticated '
    'using (public.is_staff()) with check (public.is_staff())', tbl);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
  'public.regions', 'public.profiles',
  'public.post_categories', 'public.posts', 'public.post_category_assignments', 'public.pages',
  'public.videos',
  'public.specialties', 'public.businesses', 'public.business_specialties',
  'public.business_regions', 'public.reviews',
  'public.events', 'public.membership_tiers', 'public.products', 'public.orders',
  'public.order_items', 'public.payments', 'public.memberships', 'public.event_registrations',
  'public.leads', 'public.redirects'
] loop
    perform public._parity_enable_rls(t::regclass);
  end loop;
end;
$$;

drop function public._parity_enable_rls(regclass);

-- ---------------------------------------------------------------------------
-- Lookup tables: public read
-- ---------------------------------------------------------------------------
drop policy if exists "public read" on public.regions;
create policy "public read" on public.regions for select using (true);

drop policy if exists "public read" on public.specialties;
create policy "public read" on public.specialties for select using (true);

drop policy if exists "public read" on public.post_categories;
create policy "public read" on public.post_categories for select using (true);

drop policy if exists "public read active" on public.membership_tiers;
create policy "public read active" on public.membership_tiers for select using (is_active);

-- Redirects are public by nature (they are served to every visitor); the
-- middleware reads them with the anon key.
drop policy if exists "public read active" on public.redirects;
create policy "public read active" on public.redirects for select using (is_active);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles
  for insert to authenticated with check (id = auth.uid() and role = 'member');

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- (role changes are blocked by the profiles_guard_role trigger)

-- ---------------------------------------------------------------------------
-- Content: posts, pages, videos
-- ---------------------------------------------------------------------------
drop policy if exists "public read published" on public.posts;
create policy "public read published" on public.posts
  for select using (status = 'published' and (published_at is null or published_at <= now()));

drop policy if exists "public read published" on public.pages;
create policy "public read published" on public.pages
  for select using (status = 'published' and (published_at is null or published_at <= now()));

drop policy if exists "public read" on public.post_category_assignments;
create policy "public read" on public.post_category_assignments
  for select using (
    exists (select 1 from public.posts p
            where p.id = post_id
              and p.status = 'published'
              and (p.published_at is null or p.published_at <= now()))
  );

-- videos: existing rows get status = 'published' via the column default.
drop policy if exists "public read published" on public.videos;
create policy "public read published" on public.videos
  for select using (status = 'published');

-- ---------------------------------------------------------------------------
-- Directory: businesses, joins, reviews
-- ---------------------------------------------------------------------------
drop policy if exists "public read published" on public.businesses;
create policy "public read published" on public.businesses
  for select using (status = 'published');

drop policy if exists "owner read" on public.businesses;
create policy "owner read" on public.businesses
  for select to authenticated using (owner_member_id = auth.uid());

-- Any signed-in user may submit a business (join-as-pro); the guard trigger
-- forces owner = caller, status = 'pending', tier = 'free'.
drop policy if exists "member submit" on public.businesses;
create policy "member submit" on public.businesses
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists "owner update" on public.businesses;
create policy "owner update" on public.businesses
  for update to authenticated
  using (owner_member_id = auth.uid())
  with check (owner_member_id = auth.uid());

-- Join tables: public read for published businesses; owners manage their own.
drop policy if exists "public read" on public.business_specialties;
create policy "public read" on public.business_specialties
  for select using (
    exists (select 1 from public.businesses b
            where b.id = business_id and (b.status = 'published' or b.owner_member_id = auth.uid()))
  );

drop policy if exists "owner manage" on public.business_specialties;
create policy "owner manage" on public.business_specialties
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_member_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_member_id = auth.uid()));

drop policy if exists "public read" on public.business_regions;
create policy "public read" on public.business_regions
  for select using (
    exists (select 1 from public.businesses b
            where b.id = business_id and (b.status = 'published' or b.owner_member_id = auth.uid()))
  );

drop policy if exists "owner manage" on public.business_regions;
create policy "owner manage" on public.business_regions
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_member_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_member_id = auth.uid()));

-- Reviews
drop policy if exists "public read approved" on public.reviews;
create policy "public read approved" on public.reviews
  for select using (
    status = 'approved'
    and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published')
  );

drop policy if exists "author read own" on public.reviews;
create policy "author read own" on public.reviews
  for select to authenticated using (member_id = auth.uid());

drop policy if exists "business owner read" on public.reviews;
create policy "business owner read" on public.reviews
  for select to authenticated using (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_member_id = auth.uid())
  );

-- Members submit reviews (guard trigger forces pending/member/caller). An
-- owner cannot review their own business.
drop policy if exists "member submit" on public.reviews;
create policy "member submit" on public.reviews
  for insert to authenticated with check (
    auth.uid() is not null
    and exists (select 1 from public.businesses b
                where b.id = business_id
                  and b.status = 'published'
                  and b.owner_member_id is distinct from auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Commerce
-- ---------------------------------------------------------------------------
drop policy if exists "public read published" on public.products;
create policy "public read published" on public.products
  for select using (status = 'published');

drop policy if exists "own orders read" on public.orders;
create policy "own orders read" on public.orders
  for select to authenticated using (member_id = auth.uid());

drop policy if exists "own order items read" on public.order_items;
create policy "own order items read" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.member_id = auth.uid())
  );

drop policy if exists "own payments read" on public.payments;
create policy "own payments read" on public.payments
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.member_id = auth.uid())
  );

drop policy if exists "own memberships read" on public.memberships;
create policy "own memberships read" on public.memberships
  for select to authenticated using (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
drop policy if exists "public read published" on public.events;
create policy "public read published" on public.events
  for select using (status in ('published', 'cancelled'));

drop policy if exists "own registrations read" on public.event_registrations;
create policy "own registrations read" on public.event_registrations
  for select to authenticated using (member_id = auth.uid());

-- Direct self-registration only for FREE, open, published events. Paid events
-- go through checkout (server, service role).
drop policy if exists "own registrations insert" on public.event_registrations;
create policy "own registrations insert" on public.event_registrations
  for insert to authenticated with check (
    auth.uid() is not null
    and exists (select 1 from public.events e
                where e.id = event_id
                  and e.status = 'published'
                  and e.registration_open
                  and e.price_agorot = 0)
  );

drop policy if exists "own registrations update" on public.event_registrations;
create policy "own registrations update" on public.event_registrations
  for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Leads: anyone can insert; staff read (via "staff full access");
-- pros read leads addressed to their business.
-- ---------------------------------------------------------------------------
drop policy if exists "anyone insert" on public.leads;
create policy "anyone insert" on public.leads
  for insert to anon, authenticated with check (true);

drop policy if exists "business owner read" on public.leads;
create policy "business owner read" on public.leads
  for select to authenticated using (
    business_id is not null
    and exists (select 1 from public.businesses b where b.id = business_id and b.owner_member_id = auth.uid())
  );
