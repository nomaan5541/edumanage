-- EduManage Phase 1: Students & Teachers RPCs
-- Spec refs: Section 12 (Admission), Section 15 (Promotion), Section 16 (Transfer)

-- ---------------------------------------------------------------------------
-- create_student_admission: creates the student identity row + first
-- enrollment row atomically. All student mutations should go through this
-- (not a raw client insert into student_enrollments) so the pair stays
-- consistent.
-- ---------------------------------------------------------------------------
create or replace function public.create_student_admission(
  p_school_id uuid,
  p_student jsonb,
  p_academic_year_id uuid,
  p_class_id uuid,
  p_section_id uuid,
  p_roll_no text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
begin
  if not public.has_permission(p_school_id, 'students.create') then
    raise exception 'You do not have permission to admit students for this school.';
  end if;
  if public.is_school_read_only(p_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;

  if p_student ->> 'admission_no' is null or btrim(p_student ->> 'admission_no') = '' then
    raise exception 'admission_no is required.';
  end if;
  if p_student ->> 'first_name' is null or btrim(p_student ->> 'first_name') = '' then
    raise exception 'first_name is required.';
  end if;

  if exists (
    select 1 from public.students
    where school_id = p_school_id and admission_no = p_student ->> 'admission_no'
  ) then
    raise exception 'A student with admission number "%" already exists in this school.', p_student ->> 'admission_no';
  end if;

  insert into public.students (
    school_id, admission_no, admission_date, first_name, middle_name, last_name,
    date_of_birth, gender, blood_group, nationality, address, phone, email, photo_url,
    guardian_name, guardian_phone, guardian_email, guardian_relationship
  ) values (
    p_school_id,
    p_student ->> 'admission_no',
    coalesce((p_student ->> 'admission_date')::date, current_date),
    p_student ->> 'first_name',
    p_student ->> 'middle_name',
    p_student ->> 'last_name',
    (p_student ->> 'date_of_birth')::date,
    p_student ->> 'gender',
    p_student ->> 'blood_group',
    p_student ->> 'nationality',
    p_student ->> 'address',
    p_student ->> 'phone',
    p_student ->> 'email',
    p_student ->> 'photo_url',
    p_student ->> 'guardian_name',
    p_student ->> 'guardian_phone',
    p_student ->> 'guardian_email',
    p_student ->> 'guardian_relationship'
  )
  returning id into v_student_id;

  insert into public.student_enrollments (
    school_id, student_id, academic_year_id, class_id, section_id, roll_no, status
  ) values (
    p_school_id, v_student_id, p_academic_year_id, p_class_id, p_section_id, p_roll_no, 'active'
  );

  perform public.write_audit_log(
    p_school_id, 'student.admitted', 'student', v_student_id,
    null, p_student,
    jsonb_build_object('academic_year_id', p_academic_year_id, 'class_id', p_class_id, 'section_id', p_section_id)
  );

  return v_student_id;
end;
$$;

comment on function public.create_student_admission(uuid, jsonb, uuid, uuid, uuid, text) is
  'Creates a student + its first student_enrollments row atomically. Re-checks has_permission/is_school_read_only itself - never rely solely on RLS for this multi-table write.';

revoke execute on function public.create_student_admission(uuid, jsonb, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.create_student_admission(uuid, jsonb, uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- promote_students: bulk promotion. The old enrollment row is marked
-- 'promoted' (never deleted/overwritten) and a new enrollment row is
-- inserted for the destination year/class/section (Rule 0.12, Section 15).
-- ---------------------------------------------------------------------------
create or replace function public.promote_students(
  p_school_id uuid,
  p_student_ids uuid[],
  p_dest_academic_year_id uuid,
  p_dest_class_id uuid,
  p_dest_section_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_old_enrollment record;
  v_count integer := 0;
begin
  if not public.has_permission(p_school_id, 'students.update') then
    raise exception 'You do not have permission to promote students for this school.';
  end if;
  if public.is_school_read_only(p_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;

  foreach v_student_id in array coalesce(p_student_ids, array[]::uuid[])
  loop
    select * into v_old_enrollment
    from public.student_enrollments
    where student_id = v_student_id and school_id = p_school_id and status = 'active'
    order by created_at desc
    limit 1;

    if v_old_enrollment.id is null then
      raise exception 'Student % has no active enrollment to promote from.', v_student_id;
    end if;

    if v_old_enrollment.academic_year_id = p_dest_academic_year_id then
      raise exception 'Destination academic year must differ from the student''s current academic year.';
    end if;

    update public.student_enrollments
    set status = 'promoted'
    where id = v_old_enrollment.id;

    insert into public.student_enrollments (
      school_id, student_id, academic_year_id, class_id, section_id, status
    ) values (
      p_school_id, v_student_id, p_dest_academic_year_id, p_dest_class_id, p_dest_section_id, 'active'
    );

    perform public.write_audit_log(
      p_school_id, 'student.promoted', 'student', v_student_id,
      to_jsonb(v_old_enrollment),
      jsonb_build_object(
        'academic_year_id', p_dest_academic_year_id,
        'class_id', p_dest_class_id,
        'section_id', p_dest_section_id
      ),
      null
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.promote_students(uuid, uuid[], uuid, uuid, uuid) is
  'Bulk-promotes students into a destination academic_year/class/section. Never mutates the old enrollment''s class/section - marks it status=promoted and inserts a new row, so historical placement stays queryable.';

revoke execute on function public.promote_students(uuid, uuid[], uuid, uuid, uuid) from public, anon;
grant execute on function public.promote_students(uuid, uuid[], uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- student_transfers: cross-school transfer workflow (Spec Section 16).
-- The source school initiates; the destination school accepts (creating a
-- new student record there with a new admission_no) or rejects.
-- ---------------------------------------------------------------------------
create table public.student_transfers (
  id uuid primary key default gen_random_uuid(),
  source_school_id uuid not null references public.schools (id) on delete cascade,
  destination_school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  destination_student_id uuid references public.students (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  notes text,
  requested_by uuid references auth.users (id),
  resolved_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint student_transfers_diff_schools check (source_school_id <> destination_school_id)
);

create index student_transfers_source_idx on public.student_transfers (source_school_id);
create index student_transfers_dest_idx on public.student_transfers (destination_school_id);
create index student_transfers_student_idx on public.student_transfers (student_id);

alter table public.student_transfers enable row level security;

create policy student_transfers_select on public.student_transfers
  for select
  using (
    public.has_permission(source_school_id, 'students.read')
    or public.has_permission(destination_school_id, 'students.read')
  );

-- No direct insert/update/delete policies: all writes go through the RPCs
-- below, which re-verify authorization and keep the student rows consistent.

create or replace function public.initiate_student_transfer(
  p_source_school_id uuid,
  p_student_id uuid,
  p_destination_school_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer_id uuid;
begin
  if not public.has_permission(p_source_school_id, 'students.update') then
    raise exception 'You do not have permission to transfer students from this school.';
  end if;
  if public.is_school_read_only(p_source_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;
  if p_source_school_id = p_destination_school_id then
    raise exception 'Destination school must differ from the source school.';
  end if;
  if not exists (
    select 1 from public.students
    where id = p_student_id and school_id = p_source_school_id and status = 'active'
  ) then
    raise exception 'Student not found or not active in the source school.';
  end if;
  if not exists (select 1 from public.schools where id = p_destination_school_id) then
    raise exception 'Destination school not found.';
  end if;

  insert into public.student_transfers (
    source_school_id, destination_school_id, student_id, notes, requested_by
  ) values (
    p_source_school_id, p_destination_school_id, p_student_id, p_notes, auth.uid()
  )
  returning id into v_transfer_id;

  perform public.write_audit_log(
    p_source_school_id, 'student.transfer_initiated', 'student', p_student_id,
    null, jsonb_build_object('destination_school_id', p_destination_school_id),
    jsonb_build_object('transfer_id', v_transfer_id)
  );

  return v_transfer_id;
end;
$$;

revoke execute on function public.initiate_student_transfer(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.initiate_student_transfer(uuid, uuid, uuid, text) to authenticated;

create or replace function public.accept_student_transfer(
  p_transfer_id uuid,
  p_new_admission_no text,
  p_academic_year_id uuid,
  p_class_id uuid,
  p_section_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer record;
  v_source_student record;
  v_new_student_id uuid;
begin
  select * into v_transfer from public.student_transfers where id = p_transfer_id;
  if v_transfer.id is null then
    raise exception 'Transfer request not found.';
  end if;
  if v_transfer.status <> 'pending' then
    raise exception 'This transfer request has already been resolved.';
  end if;
  if not public.has_permission(v_transfer.destination_school_id, 'students.create') then
    raise exception 'You do not have permission to accept transfers into this school.';
  end if;
  if public.is_school_read_only(v_transfer.destination_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;
  if exists (
    select 1 from public.students
    where school_id = v_transfer.destination_school_id and admission_no = p_new_admission_no
  ) then
    raise exception 'A student with admission number "%" already exists in this school.', p_new_admission_no;
  end if;

  select * into v_source_student from public.students where id = v_transfer.student_id;

  insert into public.students (
    school_id, admission_no, first_name, middle_name, last_name, date_of_birth, gender,
    blood_group, nationality, address, phone, email, photo_url,
    guardian_name, guardian_phone, guardian_email, guardian_relationship
  ) values (
    v_transfer.destination_school_id, p_new_admission_no, v_source_student.first_name,
    v_source_student.middle_name, v_source_student.last_name, v_source_student.date_of_birth,
    v_source_student.gender, v_source_student.blood_group, v_source_student.nationality,
    v_source_student.address, v_source_student.phone, v_source_student.email, v_source_student.photo_url,
    v_source_student.guardian_name, v_source_student.guardian_phone, v_source_student.guardian_email,
    v_source_student.guardian_relationship
  )
  returning id into v_new_student_id;

  insert into public.student_enrollments (
    school_id, student_id, academic_year_id, class_id, section_id, status
  ) values (
    v_transfer.destination_school_id, v_new_student_id, p_academic_year_id, p_class_id, p_section_id, 'active'
  );

  update public.students set status = 'transferred' where id = v_transfer.student_id;
  update public.student_enrollments set status = 'transferred'
    where student_id = v_transfer.student_id and status = 'active';

  update public.student_transfers
  set status = 'accepted', destination_student_id = v_new_student_id, resolved_by = auth.uid(), resolved_at = now()
  where id = p_transfer_id;

  perform public.write_audit_log(
    v_transfer.destination_school_id, 'student.transfer_accepted', 'student', v_new_student_id,
    null, jsonb_build_object('source_school_id', v_transfer.source_school_id, 'source_student_id', v_transfer.student_id),
    jsonb_build_object('transfer_id', p_transfer_id)
  );
  perform public.write_audit_log(
    v_transfer.source_school_id, 'student.transfer_completed', 'student', v_transfer.student_id,
    null, jsonb_build_object('destination_school_id', v_transfer.destination_school_id, 'destination_student_id', v_new_student_id),
    jsonb_build_object('transfer_id', p_transfer_id)
  );

  return v_new_student_id;
end;
$$;

revoke execute on function public.accept_student_transfer(uuid, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.accept_student_transfer(uuid, text, uuid, uuid, uuid) to authenticated;

create or replace function public.reject_student_transfer(
  p_transfer_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer record;
begin
  select * into v_transfer from public.student_transfers where id = p_transfer_id;
  if v_transfer.id is null then
    raise exception 'Transfer request not found.';
  end if;
  if v_transfer.status <> 'pending' then
    raise exception 'This transfer request has already been resolved.';
  end if;
  if not public.has_permission(v_transfer.destination_school_id, 'students.create') then
    raise exception 'You do not have permission to reject transfers into this school.';
  end if;

  update public.student_transfers
  set status = 'rejected', notes = coalesce(p_reason, notes), resolved_by = auth.uid(), resolved_at = now()
  where id = p_transfer_id;

  perform public.write_audit_log(
    v_transfer.source_school_id, 'student.transfer_rejected', 'student', v_transfer.student_id,
    null, jsonb_build_object('destination_school_id', v_transfer.destination_school_id, 'reason', p_reason),
    jsonb_build_object('transfer_id', p_transfer_id)
  );
end;
$$;

revoke execute on function public.reject_student_transfer(uuid, text) from public, anon;
grant execute on function public.reject_student_transfer(uuid, text) to authenticated;
