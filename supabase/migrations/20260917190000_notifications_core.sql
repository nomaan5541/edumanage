-- EduManage: Notification System
-- Spec refs: Section 30 (Notification System), 59 (Notification Delivery)
-- Phase 1 scope: in-app channel only. Email/SMS/web push are stubbed (no
-- delivery integration) - notification_deliveries/delivery-state tracking is
-- deferred until a real email/SMS provider is configured.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  sender_id uuid references auth.users (id),
  title text not null,
  body text not null,
  notification_type text not null default 'general',
  target_type text not null check (target_type in ('school', 'role', 'class', 'section', 'student', 'teacher')),
  target_role public.app_role,
  target_class_id uuid references public.classes (id) on delete cascade,
  target_section_id uuid references public.sections (id) on delete cascade,
  target_student_id uuid references public.students (id) on delete cascade,
  target_teacher_id uuid references public.teachers (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint notifications_target_shape check (
    (target_type = 'school')
    or (target_type = 'role' and target_role is not null)
    or (target_type = 'class' and target_class_id is not null)
    or (target_type = 'section' and target_section_id is not null)
    or (target_type = 'student' and target_student_id is not null)
    or (target_type = 'teacher' and target_teacher_id is not null)
  )
);

create index notifications_school_idx on public.notifications (school_id, created_at desc);

comment on table public.notifications is 'In-app notifications only in Phase 1 (Spec Section 30/59) - email/SMS/web push channels are not implemented, so there is no delivery-state tracking table yet.';

-- Per-user read state, kept separate from the notification row itself so one
-- broadcast notification can be independently read/unread per recipient.
create table public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  constraint notification_reads_unique unique (notification_id, user_id)
);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

create policy notifications_select on public.notifications
  for select
  using (
    (target_type = 'school' and public.is_school_member(school_id))
    or (target_type = 'role' and public.has_role_in_school(school_id, target_role))
    or (target_type = 'class' and (
      exists (
        select 1 from public.student_enrollments se join public.students s on s.id = se.student_id
        where s.user_id = auth.uid() and se.class_id = target_class_id and se.status = 'active'
      )
      or exists (
        select 1 from public.teacher_assignments ta join public.teachers t on t.id = ta.teacher_id
        where t.user_id = auth.uid() and ta.class_id = target_class_id
      )
    ))
    or (target_type = 'section' and (
      exists (
        select 1 from public.student_enrollments se join public.students s on s.id = se.student_id
        where s.user_id = auth.uid() and se.section_id = target_section_id and se.status = 'active'
      )
      or exists (
        select 1 from public.teacher_assignments ta join public.teachers t on t.id = ta.teacher_id
        where t.user_id = auth.uid() and ta.section_id = target_section_id
      )
    ))
    or (target_type = 'student' and exists (
      select 1 from public.students where id = target_student_id and user_id = auth.uid()
    ))
    or (target_type = 'teacher' and exists (
      select 1 from public.teachers where id = target_teacher_id and user_id = auth.uid()
    ))
    or public.has_permission(school_id, 'notifications.create')
  );
-- No direct insert policy: writes go through send_notification() so the
-- target shape is validated consistently and the sender is always recorded.

create policy notification_reads_select on public.notification_reads
  for select using (user_id = auth.uid());
create policy notification_reads_insert on public.notification_reads
  for insert with check (user_id = auth.uid());
