# Foundation Smoke Test Checklist
Run this once Docker Desktop is installed and `npx supabase start` succeeds, before fanning out the Phase 1 child agents. Update `docs/status.md` with the actual results (Rule 0.15 — no CURRENT status without real tests).

## 1. Migrations apply cleanly
- `npx supabase start`
- `npx supabase db reset` — must apply all `supabase/migrations/*.sql` with no errors.

## 2. Generate real TypeScript types
- `npx supabase gen types typescript --local > src/types/database.ts` (then re-apply the header comment and any manual notes if the generator drops them).
- `npm run build` must still pass.

## 3. Auth + role bootstrap (SEC/SES groundwork)
- Create a first user directly via `supabase.auth.admin.createUser` (Studio UI at the local URL, or `npx supabase` Studio) and manually insert a `user_roles` row with `role = 'super_admin'`, `school_id = null` (only way to seed the very first Super Admin — there is no UI for this, by design, since only Super Admin creates schools/admins).
- Log in via `/login` as that user; confirm redirect to `/super-admin`.

## 4. School + School Admin onboarding (Section 10, SEC-007)
- From `/super-admin/schools`, create a school + School Admin email. Requires the Edge Function to be served locally: `npx supabase functions serve create-school-admin` (with `SUPABASE_SERVICE_ROLE_KEY` etc. available to the local functions runtime — the Supabase CLI injects local secrets automatically).
- Confirm: school row created, `user_roles` row with `role='school_admin'` created, invite email visible in the local Inbucket/mail trap the CLI prints a URL for.
- Attempt the same creation while authenticated as a non-super-admin (e.g. after logging in as the new School Admin) — must be rejected with 403 (SEC-007: School Admin cannot create a school).

## 5. Cross-tenant isolation (SEC-001/002/003)
- Create a second school the same way.
- While authenticated as School A's admin, attempt `select * from schools` — must return only School A.
- Attempt `update schools set name = 'x' where id = '<school B id>'` — must affect 0 rows / be denied.
- Attempt `insert into user_roles (user_id, role, school_id) values (auth.uid(), 'teacher', '<school B id>')` — must be denied (can_assign_role fails).

## 6. Setup Wizard (Section 11)
- Log in as the new School Admin, confirm redirect to `/admin` and the "Finish setting up your school" prompt.
- Run through `/admin/setup`: create academic year, classes, sections, subjects with the Telangana defaults; confirm counts update on `/admin`.
- Confirm a second academic year cannot be created with `is_active = true` while the first remains active without first setting the first to `is_active = false` (unique partial index) — expected: unique constraint violation surfaces as a clear error.

## 7. Read-only enforcement scaffold (Rule 0.9, SUBS-001..004)
- As Super Admin (via SQL, since there is no UI yet — flagged in docs/status.md), insert a `subscriptions` row for School A with `status = 'expired'`.
- Confirm `select public.is_school_read_only('<school A id>')` returns `true`.
- Attempt to create a class for School A — must now be rejected with the read-only error (RLS `not public.is_school_read_only(school_id)` clause).
- Confirm School A can still `select` existing classes/academic years (reads remain allowed).

## 8. Sub-Admin permission scaffold (SUB-001..005)
- Create a `sub_admin` user_roles row for a third user in School A.
- Confirm `select public.has_permission('<school A id>', 'students.read')` is `false` before any grant.
- Insert a `role_permissions` row granting `students.read` to that user; confirm `has_permission` now returns `true`.
- Attempt to grant a permission to a `teacher`-role user instead — must be rejected by `enforce_role_permission_target`.

Record pass/fail for each numbered check in `docs/status.md` under each affected module before marking anything CURRENT.
