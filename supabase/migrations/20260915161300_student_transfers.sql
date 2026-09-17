-- EduManage Phase 1 — Cross-school student transfers
-- Spec refs: Section 16, 69, 100. Writes only via SECURITY DEFINER RPCs.

create table public.student_transfers (
  id uuid primary key default gen_random_uuid(),
  source_school_id uuid not null references public.schools (id) on delete restrict,
  destination_school_id uuid not null references public.schools (id) on delete restrict,
  source_student_id uuid not null references public.students (id) on delete restrict,
  destination_student_id uuid references public.students (id) on delete restrict,
  source_enrollment_id uuid references public.student_enrollments (id) on delete restrict,
  destination_enrollment_id uuid references public.student_enrollments (id) on delete restrict,
  status public.transfer_status not null default 'pending',
  reason text,
  rejection_reason text,
  initiated_by uuid references auth.users (id),
  accepted_by uuid references auth.users (id),
  rejected_by uuid references auth.users (id),
  certificate_number text unique,
  certificate_payload jsonb,
  initiated_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_transfers_distinct_schools check (source_school_id <> destination_school_id)
);

create index student_transfers_source_idx on public.student_transfers (source_school_id, status);
create index student_transfers_dest_idx on public.student_transfers (destination_school_id, status);
create index student_transfers_source_student_idx on public.student_transfers (source_student_id);

create unique index student_transfers_one_open_per_student
  on public.student_transfers (source_student_id)
  where status in ('initiated', 'pending', 'accepted');

comment on table public.student_transfers is
  'Privileged cross-school workflow. Client INSERT/UPDATE is denied; initiate/accept/reject RPCs own all writes.';

create trigger student_transfers_set_updated_at
  before update on public.student_transfers
  for each row execute function public.set_updated_at();
