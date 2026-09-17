-- EduManage: add email to profiles for display purposes (e.g. Sub-Admin list).
-- Added as a new migration rather than editing the original foundation migration,
-- per docs/conventions/BACKEND_CONVENTIONS.md ("only ADD new migrations").

alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Backfill for any profiles created before this migration (harmless no-op on a
-- fresh database).
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;
