-- EduManage Phase 1 — tenant-scoped student document storage
-- Spec refs: Section 43. Paths: schools/{school_id}/students/{student_id}/{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-documents',
  'student-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create or replace function public.storage_school_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_part text;
begin
  v_part := split_part(p_name, '/', 2);
  if split_part(p_name, '/', 1) <> 'schools' or v_part !~* '^[0-9a-f-]{36}$' then
    return null;
  end if;
  return v_part::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.storage_student_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_part text;
begin
  v_part := split_part(p_name, '/', 4);
  if split_part(p_name, '/', 3) <> 'students' or v_part !~* '^[0-9a-f-]{36}$' then
    return null;
  end if;
  return v_part::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create policy student_documents_storage_select
  on storage.objects
  for select
  using (
    bucket_id = 'student-documents'
    and public.storage_school_id(name) is not null
    and public.can_read_student_row(
      public.storage_school_id(name),
      public.storage_student_id(name),
      (select s.user_id from public.students s where s.id = public.storage_student_id(name))
    )
  );

create policy student_documents_storage_insert
  on storage.objects
  for insert
  with check (
    bucket_id = 'student-documents'
    and public.storage_school_id(name) is not null
    and public.storage_student_id(name) is not null
    and name like ('schools/' || public.storage_school_id(name)::text || '/students/' || public.storage_student_id(name)::text || '/%')
    and (
      public.has_permission(public.storage_school_id(name), 'students.create')
      or public.has_permission(public.storage_school_id(name), 'students.update')
    )
    and not public.is_school_read_only(public.storage_school_id(name))
  );

create policy student_documents_storage_delete
  on storage.objects
  for delete
  using (
    bucket_id = 'student-documents'
    and public.has_permission(public.storage_school_id(name), 'students.update')
    and not public.is_school_read_only(public.storage_school_id(name))
  );
