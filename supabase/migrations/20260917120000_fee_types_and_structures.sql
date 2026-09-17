-- EduManage Phase 1 — Fees catalog (types + structures)
-- Spec refs: Section 17 (Fees engine), Section 42 (audit), Rule 0.9 / Section 50 (read-only)
--
-- Partial slice: school/class/academic-year catalog only. No students table, no student-linked
-- dues, no fee_payments, no record_fee_payment. Those can FK fee_structures.id later without
-- dropping or rewriting these tables.
--
-- Writes go through SECURITY DEFINER RPCs so they can (1) emit the exact read-only error,
-- (2) write audit_logs, and (3) ignore a client-supplied school_id that does not match the
-- caller. Tables have SELECT RLS only — no INSERT/UPDATE/DELETE policy for authenticated/anon.

create table public.fee_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_types_school_name_key unique (school_id, name),
  constraint fee_types_name_not_blank check (btrim(name) <> '')
);

create index fee_types_school_idx on public.fee_types (school_id);

comment on table public.fee_types is
  'School-scoped fee catalog (Tuition, Transport, …). No student FK. Deactivate via is_active rather than DELETE so later student dues can keep referencing a type.';

create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  fee_type_id uuid not null references public.fee_types (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  amount numeric(12, 2) not null,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_structures_amount_non_negative check (amount >= 0),
  constraint fee_structures_unique unique (school_id, fee_type_id, class_id, academic_year_id)
);

create index fee_structures_school_idx on public.fee_structures (school_id);
create index fee_structures_year_class_idx on public.fee_structures (academic_year_id, class_id);

comment on table public.fee_structures is
  'Catalog amount for one fee type + class + academic year. No student FK. Future student dues/payments should reference fee_structures.id (on delete restrict) rather than copying a mutable amount as the only source of truth. Unique on (school, type, class, year); installment rows can be a child table later without dropping this table.';

create trigger fee_types_set_updated_at before update on public.fee_types
  for each row execute function public.set_updated_at();

create trigger fee_structures_set_updated_at before update on public.fee_structures
  for each row execute function public.set_updated_at();

create or replace function public.enforce_fee_type_school_id_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.school_id is distinct from old.school_id then
    raise exception 'school_id cannot be changed.';
  end if;
  return new;
end;
$$;

create trigger fee_types_school_id_immutable
  before update on public.fee_types
  for each row execute function public.enforce_fee_type_school_id_immutable();

create or replace function public.enforce_fee_structure_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type_school uuid;
  v_class_school uuid;
  v_year_school uuid;
begin
  if tg_op = 'UPDATE' and new.school_id is distinct from old.school_id then
    raise exception 'school_id cannot be changed.';
  end if;

  select school_id into v_type_school from public.fee_types where id = new.fee_type_id;
  select school_id into v_class_school from public.classes where id = new.class_id;
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;

  if v_type_school is null or v_class_school is null or v_year_school is null
     or v_type_school <> new.school_id
     or v_class_school <> new.school_id
     or v_year_school <> new.school_id then
    raise exception 'fee_structures rows must reference a fee type, class, and academic year that all belong to school_id';
  end if;

  return new;
end;
$$;

create trigger fee_structures_enforce_school
  before insert or update on public.fee_structures
  for each row execute function public.enforce_fee_structure_school();

alter table public.fee_types enable row level security;
alter table public.fee_structures enable row level security;

create policy fee_types_select on public.fee_types
  for select using (public.is_school_member(school_id));

create policy fee_structures_select on public.fee_structures
  for select using (public.is_school_member(school_id));

revoke insert, update, delete on public.fee_types from public, authenticated, anon;
revoke insert, update, delete on public.fee_structures from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- Shared write-path guard for fee catalog RPCs
-- ---------------------------------------------------------------------------

create or replace function public.assert_can_manage_fees(p_school_id uuid, p_perm_key text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_school uuid;
begin
  if p_school_id is null then
    raise exception 'This resource is not available.';
  end if;

  if not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'This resource is not available.';
  end if;

  if not public.is_super_admin() then
    v_caller_school := public.current_user_school_id();
    if v_caller_school is null or v_caller_school is distinct from p_school_id then
      raise exception 'This resource is not available.';
    end if;
  end if;

  if not public.has_permission(p_school_id, p_perm_key) then
    raise exception 'You do not have permission to perform this action.';
  end if;

  if public.is_school_read_only(p_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;
end;
$$;

comment on function public.assert_can_manage_fees(uuid, text) is
  'Internal guard for fee catalog RPCs. Re-checks tenant, permission, and read-only. Not a substitute for RLS on SELECT.';

revoke execute on function public.assert_can_manage_fees(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fee type RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_fee_type(
  p_school_id uuid,
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  perform public.assert_can_manage_fees(p_school_id, 'fees.create');

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Fee type name is required.';
  end if;

  if exists (
    select 1 from public.fee_types
    where school_id = p_school_id and name = v_name
  ) then
    raise exception 'A fee type with this name already exists.';
  end if;

  insert into public.fee_types (school_id, name, description)
  values (p_school_id, v_name, nullif(btrim(coalesce(p_description, '')), ''))
  returning id into v_id;

  perform public.write_audit_log(
    p_school_id,
    'fee_type.created',
    'fee_type',
    v_id,
    null,
    jsonb_build_object('name', v_name, 'description', p_description),
    null
  );

  return v_id;
end;
$$;

create or replace function public.update_fee_type(
  p_fee_type_id uuid,
  p_name text default null,
  p_description text default null,
  p_is_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fee_types%rowtype;
  v_name text;
begin
  select * into v_row from public.fee_types where id = p_fee_type_id;
  if not found then
    raise exception 'This resource is not available.';
  end if;

  perform public.assert_can_manage_fees(v_row.school_id, 'fees.update');

  v_name := coalesce(nullif(btrim(coalesce(p_name, '')), ''), v_row.name);

  if exists (
    select 1 from public.fee_types
    where school_id = v_row.school_id and name = v_name and id <> v_row.id
  ) then
    raise exception 'A fee type with this name already exists.';
  end if;

  update public.fee_types
  set
    name = v_name,
    description = case
      when p_description is null then description
      else nullif(btrim(p_description), '')
    end,
    is_active = coalesce(p_is_active, is_active)
  where id = v_row.id;

  perform public.write_audit_log(
    v_row.school_id,
    'fee_type.updated',
    'fee_type',
    v_row.id,
    jsonb_build_object(
      'name', v_row.name,
      'description', v_row.description,
      'is_active', v_row.is_active
    ),
    jsonb_build_object(
      'name', v_name,
      'description', case
        when p_description is null then v_row.description
        else nullif(btrim(p_description), '')
      end,
      'is_active', coalesce(p_is_active, v_row.is_active)
    ),
    null
  );

  return v_row.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fee structure RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_fee_structure(
  p_school_id uuid,
  p_fee_type_id uuid,
  p_class_id uuid,
  p_academic_year_id uuid,
  p_amount numeric,
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_type_active boolean;
begin
  perform public.assert_can_manage_fees(p_school_id, 'fees.create');

  if p_amount is null or p_amount < 0 then
    raise exception 'Fee amount must be zero or greater.';
  end if;

  select is_active into v_type_active
  from public.fee_types
  where id = p_fee_type_id and school_id = p_school_id;

  if v_type_active is null then
    raise exception 'This resource is not available.';
  end if;
  if not v_type_active then
    raise exception 'This fee type is inactive.';
  end if;

  if exists (
    select 1 from public.fee_structures
    where school_id = p_school_id
      and fee_type_id = p_fee_type_id
      and class_id = p_class_id
      and academic_year_id = p_academic_year_id
  ) then
    raise exception 'A fee structure already exists for this fee type, class, and academic year.';
  end if;

  insert into public.fee_structures (
    school_id, fee_type_id, class_id, academic_year_id, amount, due_date
  ) values (
    p_school_id, p_fee_type_id, p_class_id, p_academic_year_id, p_amount, p_due_date
  )
  returning id into v_id;

  perform public.write_audit_log(
    p_school_id,
    'fee_structure.created',
    'fee_structure',
    v_id,
    null,
    jsonb_build_object(
      'fee_type_id', p_fee_type_id,
      'class_id', p_class_id,
      'academic_year_id', p_academic_year_id,
      'amount', p_amount,
      'due_date', p_due_date
    ),
    null
  );

  return v_id;
end;
$$;

create or replace function public.update_fee_structure(
  p_fee_structure_id uuid,
  p_amount numeric default null,
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fee_structures%rowtype;
  v_amount numeric(12, 2);
  v_due date;
begin
  select * into v_row from public.fee_structures where id = p_fee_structure_id;
  if not found then
    raise exception 'This resource is not available.';
  end if;

  perform public.assert_can_manage_fees(v_row.school_id, 'fees.update');

  v_amount := coalesce(p_amount, v_row.amount);
  if v_amount < 0 then
    raise exception 'Fee amount must be zero or greater.';
  end if;

  -- p_due_date: omitted (null) keeps the existing date. There is no "clear due date"
  -- parameter in this slice; add one later if a client needs it.
  v_due := coalesce(p_due_date, v_row.due_date);

  update public.fee_structures
  set amount = v_amount, due_date = v_due
  where id = v_row.id;

  perform public.write_audit_log(
    v_row.school_id,
    'fee_structure.updated',
    'fee_structure',
    v_row.id,
    jsonb_build_object('amount', v_row.amount, 'due_date', v_row.due_date),
    jsonb_build_object('amount', v_amount, 'due_date', v_due),
    null
  );

  return v_row.id;
end;
$$;

comment on function public.create_fee_type(uuid, text, text) is
  'Creates a school-scoped fee type. Caller school_id is re-validated server-side. Audited.';
comment on function public.update_fee_type(uuid, text, text, boolean) is
  'Updates name/description/is_active of a fee type. No DELETE path. Audited.';
comment on function public.create_fee_structure(uuid, uuid, uuid, uuid, numeric, date) is
  'Creates a class+year catalog amount for a fee type. Cross-school FKs are rejected. Audited.';
comment on function public.update_fee_structure(uuid, numeric, date) is
  'Corrects amount/due_date on a catalog row. Student dues (future) should snapshot billed amounts so later catalog edits do not silently rewrite history. Audited.';

revoke execute on function public.create_fee_type(uuid, text, text) from public, anon;
revoke execute on function public.update_fee_type(uuid, text, text, boolean) from public, anon;
revoke execute on function public.create_fee_structure(uuid, uuid, uuid, uuid, numeric, date) from public, anon;
revoke execute on function public.update_fee_structure(uuid, numeric, date) from public, anon;

grant execute on function public.create_fee_type(uuid, text, text) to authenticated;
grant execute on function public.update_fee_type(uuid, text, text, boolean) to authenticated;
grant execute on function public.create_fee_structure(uuid, uuid, uuid, uuid, numeric, date) to authenticated;
grant execute on function public.update_fee_structure(uuid, numeric, date) to authenticated;
