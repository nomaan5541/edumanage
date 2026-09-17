-- EduManage: Homework + Study Materials
-- Spec refs: Section 28 (Homework), 29 (Study Materials), 43 (Storage Security)

-- Fix: _is_authorized_for_class (added in the attendance migration) was
-- revoked from `authenticated` because it was only ever called from inside
-- other SECURITY DEFINER RPCs (where the nested call runs as the function
-- owner, bypassing the revoke). RLS policies are different: their expressions
-- run directly as the querying role, so a policy that calls this function
-- needs its own EXECUTE grant. Safe to grant broadly - the function is a
-- read-only authorization check with no side effects.
grant execute on function public._is_authorized_for_class(uuid, uuid, uuid, text) to authenticated;

insert into public.permissions (key, module, description) values
  ('homework.read', 'homework', 'View homework'),
  ('homework.create', 'homework', 'Create homework'),
  ('homework.update', 'homework', 'Edit/delete homework'),
  ('study_materials.read', 'study_materials', 'View study materials'),
  ('study_materials.create', 'study_materials', 'Upload study materials'),
  ('study_materials.update', 'study_materials', 'Delete study materials')
on conflict (key) do nothing;

create table public.homework (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  section_id uuid references public.sections (id) on delete restrict,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  title text not null,
  description text,
  due_date date,
  attachment_url text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index homework_school_idx on public.homework (school_id);
create index homework_class_idx on public.homework (school_id, class_id, academic_year_id);

create or replace function public.enforce_homework_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_school uuid;
  v_class_school uuid;
  v_section_school uuid;
  v_subject_school uuid;
begin
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
  select school_id into v_class_school from public.classes where id = new.class_id;
  select school_id into v_subject_school from public.subjects where id = new.subject_id;
  v_section_school := new.school_id;
  if new.section_id is not null then
    select school_id into v_section_school from public.sections where id = new.section_id;
  end if;
  if v_year_school is null or v_class_school is null or v_subject_school is null or v_section_school is null
     or v_year_school <> new.school_id or v_class_school <> new.school_id
     or v_subject_school <> new.school_id or v_section_school <> new.school_id then
    raise exception 'homework rows must reference an academic_year, class, section, and subject that all belong to school_id';
  end if;
  return new;
end;
$$;

create trigger homework_enforce_school
  before insert or update on public.homework
  for each row execute function public.enforce_homework_school();

create table public.study_materials (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  class_id uuid references public.classes (id) on delete restrict,
  section_id uuid references public.sections (id) on delete restrict,
  subject_id uuid references public.subjects (id) on delete restrict,
  title text not null,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index study_materials_school_idx on public.study_materials (school_id);

alter table public.homework enable row level security;
alter table public.study_materials enable row level security;

-- Homework is visible to the whole school (students need to see it - Spec
-- Section 28); writes are teacher-assignment-scoped or homework.* permission.
create policy homework_select on public.homework
  for select using (public.is_school_member(school_id));
create policy homework_insert on public.homework
  for insert with check (
    public._is_authorized_for_class(school_id, class_id, section_id, 'homework.create')
    and not public.is_school_read_only(school_id)
  );
create policy homework_update on public.homework
  for update
  using (created_by = auth.uid() or public.has_permission(school_id, 'homework.update'))
  with check (not public.is_school_read_only(school_id));
create policy homework_delete on public.homework
  for delete using (created_by = auth.uid() or public.has_permission(school_id, 'homework.update'));

create policy study_materials_select on public.study_materials
  for select using (public.is_school_member(school_id));
create policy study_materials_insert on public.study_materials
  for insert with check (
    public._is_authorized_for_class(school_id, class_id, section_id, 'study_materials.create')
    and not public.is_school_read_only(school_id)
  );
create policy study_materials_delete on public.study_materials
  for delete using (uploaded_by = auth.uid() or public.has_permission(school_id, 'study_materials.update'));

-- ---------------------------------------------------------------------------
-- Storage: tenant-scoped bucket for study material files. Path convention:
-- study-materials/{school_id}/{material_id}/{filename} (Spec Section 43).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('study-materials', 'study-materials', false)
on conflict (id) do nothing;

create policy study_materials_storage_select on storage.objects
  for select using (
    bucket_id = 'study-materials'
    and public.is_school_member((storage.foldername(name))[1]::uuid)
  );

create policy study_materials_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'study-materials'
    and public._is_authorized_for_class(
      (storage.foldername(name))[1]::uuid,
      nullif((storage.foldername(name))[2], '')::uuid,
      null,
      'study_materials.create'
    )
  );

create policy study_materials_storage_delete on storage.objects
  for delete using (
    bucket_id = 'study-materials'
    and (owner = auth.uid() or public.has_permission((storage.foldername(name))[1]::uuid, 'study_materials.update'))
  );

comment on policy study_materials_storage_insert on storage.objects is
  'Path convention: study-materials/{school_id}/{class_id}/{filename}. Reuses _is_authorized_for_class so the same teacher-assignment-or-permission rule applies to both the file and its public.study_materials metadata row.';
