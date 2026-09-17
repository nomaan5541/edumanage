-- EduManage: Notification RPCs

create or replace function public.send_notification(
  p_school_id uuid,
  p_title text,
  p_body text,
  p_target_type text,
  p_notification_type text default 'general',
  p_target_role public.app_role default null,
  p_target_class_id uuid default null,
  p_target_section_id uuid default null,
  p_target_student_id uuid default null,
  p_target_teacher_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_authorized boolean;
begin
  v_authorized := public.has_permission(p_school_id, 'notifications.create')
    or (p_target_type = 'class' and public._is_authorized_for_class(p_school_id, p_target_class_id, null, 'notifications.create'))
    or (p_target_type = 'section' and exists (
      select 1 from public.teacher_assignments ta join public.teachers t on t.id = ta.teacher_id
      where t.user_id = auth.uid() and t.school_id = p_school_id and ta.section_id = p_target_section_id
    ));
  if not v_authorized then
    raise exception 'You do not have permission to send notifications for this school.';
  end if;

  insert into public.notifications (
    school_id, sender_id, title, body, notification_type, target_type,
    target_role, target_class_id, target_section_id, target_student_id, target_teacher_id
  ) values (
    p_school_id, auth.uid(), p_title, p_body, coalesce(p_notification_type, 'general'), p_target_type,
    p_target_role, p_target_class_id, p_target_section_id, p_target_student_id, p_target_teacher_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.send_notification(uuid, text, text, text, text, public.app_role, uuid, uuid, uuid, uuid) is
  'Single write path for notifications - the constraint notifications_target_shape (checked at insert) guarantees the target_* column matching target_type is always populated, so the RLS select policy and every client can rely on that shape.';

revoke execute on function public.send_notification(uuid, text, text, text, text, public.app_role, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.send_notification(uuid, text, text, text, text, public.app_role, uuid, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_notifications: the caller's own visible notifications (RLS already
-- restricts to ones targeted at them) joined with their own read state.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_notifications(p_school_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  title text,
  body text,
  notification_type text,
  target_type text,
  created_at timestamptz,
  is_read boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    n.id, n.title, n.body, n.notification_type, n.target_type, n.created_at,
    (nr.id is not null) as is_read
  from public.notifications n
  left join public.notification_reads nr on nr.notification_id = n.id and nr.user_id = auth.uid()
  where n.school_id = p_school_id
  order by n.created_at desc
  limit coalesce(p_limit, 50);
$$;

comment on function public.get_my_notifications(uuid, integer) is
  'security invoker (not definer): relies entirely on the caller''s own notifications_select RLS policy to determine which rows are visible - this function only adds the read-state join.';

revoke execute on function public.get_my_notifications(uuid, integer) from public, anon;
grant execute on function public.get_my_notifications(uuid, integer) to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.notification_reads (notification_id, user_id)
  values (p_notification_id, auth.uid())
  on conflict (notification_id, user_id) do nothing;
end;
$$;

revoke execute on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
