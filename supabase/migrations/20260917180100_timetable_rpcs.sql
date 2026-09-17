-- EduManage: Timetable RPCs

create or replace function public.create_timetable_entry(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_slot_id uuid,
  p_class_id uuid,
  p_section_id uuid,
  p_subject_id uuid,
  p_teacher_id uuid,
  p_room text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
begin
  if not public.has_permission(p_school_id, 'timetable.create') then
    raise exception 'You do not have permission to edit the timetable for this school.';
  end if;
  if public.is_school_read_only(p_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;

  begin
    insert into public.timetable_entries (
      school_id, academic_year_id, slot_id, class_id, section_id, subject_id, teacher_id, room, created_by
    ) values (
      p_school_id, p_academic_year_id, p_slot_id, p_class_id, p_section_id, p_subject_id, p_teacher_id, p_room, auth.uid()
    )
    returning id into v_entry_id;
  exception
    when unique_violation then
      if sqlerrm ilike '%timetable_entries_no_teacher_clash%' then
        raise exception 'This teacher is already assigned to another class at this time.';
      elsif sqlerrm ilike '%timetable_entries_no_class_clash%' then
        raise exception 'This class/section already has a subject scheduled at this time.';
      elsif sqlerrm ilike '%timetable_entries_no_room_clash%' then
        raise exception 'This room is already in use at this time.';
      else
        raise exception 'This timetable slot conflicts with an existing entry.';
      end if;
  end;

  return v_entry_id;
end;
$$;

comment on function public.create_timetable_entry(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text) is
  'Wraps the insert into timetable_entries so unique_violation errors from the conflict-detection constraints (Spec Section 27) are translated into human-readable messages instead of raw SQL errors (Spec Section 50).';

revoke execute on function public.create_timetable_entry(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.create_timetable_entry(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text) to authenticated;
