-- EduManage: Fees Engine + Subscription renewal workflow
-- Spec refs: Section 17 (Fees Engine), 18 (Overpayment Protection), 19 (Idempotency),
-- 20 (Receipts), 38/39 (Subscription System/Expiry)

-- ---------------------------------------------------------------------------
-- fee_types: catalog of fee categories a school charges (Tuition, Transport...)
-- ---------------------------------------------------------------------------
create table public.fee_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint fee_types_name_unique unique (school_id, name)
);

create index fee_types_school_idx on public.fee_types (school_id);

-- ---------------------------------------------------------------------------
-- fee_structures: how much a class owes for a fee type in a given academic
-- year. This is the "total_due" side of the OUTSTANDING formula.
-- ---------------------------------------------------------------------------
create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  fee_type_id uuid not null references public.fee_types (id) on delete restrict,
  amount numeric(12, 2) not null check (amount >= 0),
  due_date date,
  created_at timestamptz not null default now(),
  constraint fee_structures_unique unique (academic_year_id, class_id, fee_type_id)
);

create index fee_structures_school_idx on public.fee_structures (school_id);

create or replace function public.enforce_fee_structure_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_school uuid;
  v_class_school uuid;
  v_type_school uuid;
begin
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
  select school_id into v_class_school from public.classes where id = new.class_id;
  select school_id into v_type_school from public.fee_types where id = new.fee_type_id;
  if v_year_school is null or v_class_school is null or v_type_school is null
     or v_year_school <> new.school_id or v_class_school <> new.school_id or v_type_school <> new.school_id then
    raise exception 'fee_structures rows must reference an academic_year, class, and fee_type that all belong to school_id';
  end if;
  return new;
end;
$$;

create trigger fee_structures_enforce_school
  before insert or update on public.fee_structures
  for each row execute function public.enforce_fee_structure_school();

-- ---------------------------------------------------------------------------
-- student_fee_adjustments: per-student discount/concession/fine against a fee
-- type for a given academic year. Optional row - absence means all zero.
-- ---------------------------------------------------------------------------
create table public.student_fee_adjustments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  fee_type_id uuid not null references public.fee_types (id) on delete restrict,
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  concession_amount numeric(12, 2) not null default 0 check (concession_amount >= 0),
  fine_amount numeric(12, 2) not null default 0 check (fine_amount >= 0),
  reason text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint student_fee_adjustments_unique unique (student_id, academic_year_id, fee_type_id)
);

create index student_fee_adjustments_school_idx on public.student_fee_adjustments (school_id);
create index student_fee_adjustments_student_idx on public.student_fee_adjustments (student_id);

create or replace function public.enforce_fee_adjustment_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_school uuid;
  v_year_school uuid;
  v_type_school uuid;
begin
  select school_id into v_student_school from public.students where id = new.student_id;
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
  select school_id into v_type_school from public.fee_types where id = new.fee_type_id;
  if v_student_school is null or v_year_school is null or v_type_school is null
     or v_student_school <> new.school_id or v_year_school <> new.school_id or v_type_school <> new.school_id then
    raise exception 'student_fee_adjustments rows must reference a student, academic_year, and fee_type that all belong to school_id';
  end if;
  return new;
end;
$$;

create trigger student_fee_adjustments_enforce_school
  before insert or update on public.student_fee_adjustments
  for each row execute function public.enforce_fee_adjustment_school();

-- ---------------------------------------------------------------------------
-- fee_payments: append-only payment ledger. All writes go through
-- record_fee_payment() - never insert directly from the client (Spec Section
-- 18/19: overpayment protection + idempotency must be server-enforced).
-- ---------------------------------------------------------------------------
create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  fee_type_id uuid not null references public.fee_types (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  payment_mode text not null default 'cash' check (payment_mode in ('cash', 'card', 'upi', 'bank_transfer', 'cheque', 'other')),
  status text not null default 'paid' check (status in ('paid', 'refunded', 'cancelled')),
  idempotency_key text,
  receipt_no text not null unique,
  recorded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint fee_payments_idempotency_unique unique (school_id, idempotency_key)
);

create index fee_payments_school_idx on public.fee_payments (school_id);
create index fee_payments_student_idx on public.fee_payments (student_id);

comment on table public.fee_payments is 'Append-only ledger. Insert only via record_fee_payment() RPC - never directly from the client. status transitions (refunded/cancelled) also require a future dedicated RPC; Phase 1 only writes status=paid.';

-- Internal counter used to generate human-readable, per-school-sequential
-- receipt numbers. Never exposed directly to clients (no RLS policies - only
-- the security-definer record_fee_payment() RPC touches this table).
create table public.fee_receipt_sequences (
  school_id uuid primary key references public.schools (id) on delete cascade,
  last_number bigint not null default 0
);

-- ---------------------------------------------------------------------------
-- subscription_requests: School Admin requests renewal/activation; Super
-- Admin manually approves (Rule 0.8 addendum - no automatic/Stripe billing).
-- ---------------------------------------------------------------------------
create table public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  plan_name text not null default 'default',
  requested_by uuid references auth.users (id),
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  resolution_notes text
);

create index subscription_requests_school_idx on public.subscription_requests (school_id);
create index subscription_requests_status_idx on public.subscription_requests (status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.fee_types enable row level security;
alter table public.fee_structures enable row level security;
alter table public.student_fee_adjustments enable row level security;
alter table public.fee_payments enable row level security;
alter table public.fee_receipt_sequences enable row level security;
alter table public.subscription_requests enable row level security;

create policy fee_types_select on public.fee_types
  for select using (public.is_school_member(school_id));
create policy fee_types_insert on public.fee_types
  for insert with check (public.has_permission(school_id, 'fees.create') and not public.is_school_read_only(school_id));
create policy fee_types_update on public.fee_types
  for update using (public.has_permission(school_id, 'fees.update'))
  with check (public.has_permission(school_id, 'fees.update') and not public.is_school_read_only(school_id));

create policy fee_structures_select on public.fee_structures
  for select using (public.is_school_member(school_id));
create policy fee_structures_insert on public.fee_structures
  for insert with check (public.has_permission(school_id, 'fees.create') and not public.is_school_read_only(school_id));
create policy fee_structures_update on public.fee_structures
  for update using (public.has_permission(school_id, 'fees.update'))
  with check (public.has_permission(school_id, 'fees.update') and not public.is_school_read_only(school_id));

create policy student_fee_adjustments_select on public.student_fee_adjustments
  for select using (
    public.has_permission(school_id, 'fees.read')
    or exists (select 1 from public.students s where s.id = student_fee_adjustments.student_id and s.user_id = auth.uid())
  );
create policy student_fee_adjustments_insert on public.student_fee_adjustments
  for insert with check (public.has_permission(school_id, 'fees.update') and not public.is_school_read_only(school_id));
create policy student_fee_adjustments_update on public.student_fee_adjustments
  for update using (public.has_permission(school_id, 'fees.update'))
  with check (public.has_permission(school_id, 'fees.update') and not public.is_school_read_only(school_id));

create policy fee_payments_select on public.fee_payments
  for select using (
    public.has_permission(school_id, 'fees.read')
    or exists (select 1 from public.students s where s.id = fee_payments.student_id and s.user_id = auth.uid())
  );
-- No insert/update/delete policy: all writes go through record_fee_payment().

create policy subscription_requests_select on public.subscription_requests
  for select using (public.is_super_admin() or public.is_school_admin_or_above(school_id));
-- No insert/update policy: all writes go through request/approve/reject_subscription_renewal().
