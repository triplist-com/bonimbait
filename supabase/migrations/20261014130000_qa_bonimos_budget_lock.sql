-- QA (Wave C): close the budget-integrity gaps in managed (Bonim.Os) projects.
--
-- P2-1  In a managed project the approved budget belongs to the project
--       manager. bonimos_budget_version_guard only ran BEFORE INSERT, while the
--       hub's "hub members access" policies are FOR ALL, so a client could still
--       PATCH/DELETE through the API (and delete through /my-home):
--         - an approved budget version (basis manual or quotes), e.g. flip its
--           basis to 'calculator' to hide it;
--         - planned lines (the approved plan per category);
--         - the paid line a payment approval recorded
--           (bonimos_payment_requests.budget_item_id);
--       and could delete the whole managed project, which cascades away the
--       payment-approval log. Now, for anyone but a manager of the project (or
--       the service role): those rows are read-only, planned lines can't be
--       added once a budget is approved, and a managed project can't be deleted.
--       A client's own quotes and payments stay fully editable, as in the hub.
-- P3-3  hub_budget_versions.inputs is capped at 4 KB (it holds the planner's
--       inputs, sent from the browser).
-- P3-5  bonimos_payment_transition requires a managed project, like
--       bonimos_request_payment does.
--
-- Idempotent: create or replace, drop ... if exists.

-- ---------------------------------------------------------------------------
-- Budget versions: an approved version is the manager's
-- ---------------------------------------------------------------------------
create or replace function public.bonimos_budget_versions_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid := coalesce(new.project_id, old.project_id);
begin
  if not public.hub_is_service()
     and public.bonimos_is_managed(v_project)
     and public.hub_project_role(v_project) is distinct from 'manager'
     and (old.basis in ('manual', 'quotes') or (tg_op = 'UPDATE' and new.basis in ('manual', 'quotes'))) then
    raise exception 'In a managed project the approved budget is updated by the project manager' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists bonimos_budget_versions_lock on public.hub_budget_versions;
create trigger bonimos_budget_versions_lock
  before update or delete on public.hub_budget_versions
  for each row execute function public.bonimos_budget_versions_lock();

-- ---------------------------------------------------------------------------
-- Budget lines: planned lines and approval-recorded payments are the manager's
-- ---------------------------------------------------------------------------
create or replace function public.bonimos_budget_items_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid := coalesce(new.project_id, old.project_id);
begin
  if public.hub_is_service()
     or not public.bonimos_is_managed(v_project)
     or public.hub_project_role(v_project) is not distinct from 'manager' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.kind = 'planned' and exists (
      select 1 from public.hub_budget_versions v
      where v.project_id = v_project and v.basis in ('manual', 'quotes')
    ) then
      raise exception 'In a managed project the approved budget is updated by the project manager' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.kind = 'planned' or (tg_op = 'UPDATE' and new.kind = 'planned') then
    raise exception 'In a managed project the approved budget is updated by the project manager' using errcode = '42501';
  end if;
  if exists (select 1 from public.bonimos_payment_requests r where r.budget_item_id = old.id) then
    raise exception 'This line was recorded from a payment approval; the project manager updates it' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists bonimos_budget_items_lock on public.hub_budget_items;
create trigger bonimos_budget_items_lock
  before insert or update or delete on public.hub_budget_items
  for each row execute function public.bonimos_budget_items_lock();

-- ---------------------------------------------------------------------------
-- A managed project (and its payment-approval log) is closed by the team:
-- admin ends the management first (/admin/bonimos/, service role).
-- ---------------------------------------------------------------------------
create or replace function public.bonimos_project_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.mode = 'managed' and not public.hub_is_service() then
    raise exception 'A managed project is closed by the Bonim Bait team' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists bonimos_project_delete_guard on public.hub_projects;
create trigger bonimos_project_delete_guard
  before delete on public.hub_projects
  for each row execute function public.bonimos_project_delete_guard();

revoke all on function public.bonimos_budget_versions_lock() from public, anon, authenticated;
revoke all on function public.bonimos_budget_items_lock() from public, anon, authenticated;
revoke all on function public.bonimos_project_delete_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- P3-3: the planner's inputs on a budget version stay small
-- ---------------------------------------------------------------------------
alter table public.hub_budget_versions drop constraint if exists hub_budget_versions_inputs_size;
alter table public.hub_budget_versions
  add constraint hub_budget_versions_inputs_size check (pg_column_size(inputs) <= 4096);

-- ---------------------------------------------------------------------------
-- P3-5: the payment state machine runs only in a managed project.
-- Identical to 20261014126000_bonimos_core.sql, plus the managed-mode check.
-- ---------------------------------------------------------------------------
create or replace function public.bonimos_payment_transition(
  p_request       uuid,
  p_action        text,
  p_amount_agorot bigint default null,
  p_note          text default null,
  p_paid_on       date default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.bonimos_payment_requests%rowtype;
  v_role   text;
  v_to     text;
  v_amount bigint;
  v_paid   date;
  v_item   uuid;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into r from public.bonimos_payment_requests where id = p_request for update;
  if not found then
    raise exception 'Payment request not found' using errcode = '42501';
  end if;
  v_role := public.hub_project_role(r.project_id);
  if v_role is null then
    raise exception 'Payment request not found' using errcode = '42501';
  end if;
  if not public.bonimos_is_managed(r.project_id) then
    raise exception 'Payment approvals are part of a managed project' using errcode = '42501';
  end if;

  if p_action = 'review_approve' then
    if v_role <> 'manager' then
      raise exception 'Only the project manager reviews a payment request' using errcode = '42501';
    end if;
    if r.status <> 'pending_review' then
      raise exception 'This request is not waiting for review' using errcode = '55000';
    end if;
    v_amount := coalesce(p_amount_agorot, r.requested_agorot);
    if v_amount < 100 or v_amount > r.requested_agorot then
      raise exception 'The approved amount must be positive and at most the requested amount' using errcode = '22023';
    end if;
    v_to := 'pending_client';
    update public.bonimos_payment_requests set status = v_to, approved_agorot = v_amount where id = r.id;

  elsif p_action = 'review_reject' then
    if v_role <> 'manager' then
      raise exception 'Only the project manager reviews a payment request' using errcode = '42501';
    end if;
    if r.status <> 'pending_review' then
      raise exception 'This request is not waiting for review' using errcode = '55000';
    end if;
    if v_note is null then
      raise exception 'Say why the request is rejected' using errcode = '22023';
    end if;
    v_to := 'rejected';
    update public.bonimos_payment_requests set status = v_to where id = r.id;

  elsif p_action = 'client_approve' then
    if v_role <> 'owner' then
      raise exception 'Only the client approves a payment' using errcode = '42501';
    end if;
    if r.status <> 'pending_client' then
      raise exception 'This request is not waiting for the client' using errcode = '55000';
    end if;
    v_amount := r.approved_agorot;
    v_to := 'approved';
    update public.bonimos_payment_requests set status = v_to where id = r.id;

  elsif p_action = 'client_return' then
    if v_role <> 'owner' then
      raise exception 'Only the client sends a request back' using errcode = '42501';
    end if;
    if r.status <> 'pending_client' then
      raise exception 'This request is not waiting for the client' using errcode = '55000';
    end if;
    if v_note is null then
      raise exception 'Say what the manager should check' using errcode = '22023';
    end if;
    v_to := 'pending_review';
    update public.bonimos_payment_requests set status = v_to, approved_agorot = null where id = r.id;

  elsif p_action = 'mark_paid' then
    if r.status <> 'approved' then
      raise exception 'Only an approved request can be marked paid' using errcode = '55000';
    end if;
    v_paid := coalesce(p_paid_on, public.bonimos_today());
    if v_paid > public.bonimos_today() or v_paid < r.created_at::date - 365 then
      raise exception 'The payment date is out of range' using errcode = '22023';
    end if;
    v_amount := r.approved_agorot;
    insert into public.hub_budget_items
      (project_id, kind, category, label, amount_agorot, vendor, status, occurred_on, note)
    values
      (r.project_id, 'actual', r.category, left(format('בקשת תשלום #%s: %s', r.number, r.title), 120),
       v_amount, left(r.contractor, 120), 'paid', v_paid, 'נרשם מאישור תשלום ב-Bonim.Os')
    returning id into v_item;
    v_to := 'paid';
    update public.bonimos_payment_requests
      set status = v_to, paid_on = v_paid, budget_item_id = v_item
      where id = r.id;

  elsif p_action = 'cancel' then
    if not (v_role = 'manager' or r.created_by = auth.uid()) then
      raise exception 'Only the manager or whoever recorded it can cancel a request' using errcode = '42501';
    end if;
    if r.status not in ('pending_review', 'pending_client') then
      raise exception 'This request can no longer be cancelled' using errcode = '55000';
    end if;
    v_to := 'cancelled';
    update public.bonimos_payment_requests set status = v_to where id = r.id;

  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;

  insert into public.bonimos_payment_events
    (request_id, project_id, action, from_status, to_status, actor_id, actor_role, amount_agorot, note)
  values
    (r.id, r.project_id, p_action, r.status, v_to, auth.uid(), v_role, v_amount, v_note);

  return v_to;
end;
$$;

revoke all on function public.bonimos_payment_transition(uuid, text, bigint, text, date) from public, anon;
grant execute on function public.bonimos_payment_transition(uuid, text, bigint, text, date) to authenticated, service_role;
