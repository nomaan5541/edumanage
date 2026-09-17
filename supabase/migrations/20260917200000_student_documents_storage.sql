-- EduManage: Storage bucket for student_documents (closes a gap noted in
-- docs/status.md since the Students & Teachers module landed).
-- Path convention: student-documents/{school_id}/{student_id}/{filename}
-- (Spec Section 43: tenant-scoped storage paths).

insert into storage.buckets (id, name, public)
values ('student-documents', 'student-documents', false)
on conflict (id) do nothing;

create policy student_documents_storage_select on storage.objects
  for select using (
    bucket_id = 'student-documents'
    and (
      public.has_permission((storage.foldername(name))[1]::uuid, 'students.read')
      or exists (
        select 1 from public.students s
        where s.id = nullif((storage.foldername(name))[2], '')::uuid and s.user_id = auth.uid()
      )
    )
  );

create policy student_documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'student-documents'
    and public.has_permission((storage.foldername(name))[1]::uuid, 'students.update')
  );

create policy student_documents_storage_delete on storage.objects
  for delete using (
    bucket_id = 'student-documents'
    and public.has_permission((storage.foldername(name))[1]::uuid, 'students.update')
  );
