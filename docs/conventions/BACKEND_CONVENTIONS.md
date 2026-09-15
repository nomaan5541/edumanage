# Backend Conventions (read before adding any module)
These conventions exist so the four Phase 1 modules (students-teachers, fees-subscriptions, attendance-exams, communication-admin) stay consistent with the foundation and with each other. Follow them exactly rather than inventing per-module variants.

## Migrations
- Add new files under `supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`, timestamped **after** `20260915160800` (the last foundation migration) and after each other in the order they must apply.
- Only ADD new tables/functions/policies. Do not edit existing foundation migration files.
- Every tenant table: `school_id uuid not null references public.schools(id) on delete cascade` (or `on delete restrict` if the table is itself referenced by other tables — see `sections`/`class_subjects` for the pattern).
- When a table references another school-scoped table (e.g. a future `students.class_id`), add a `before insert or update` trigger that verifies the referenced row's `school_id` matches the new row's `school_id`, following `enforce_section_school()` / `enforce_class_subjects_school()` in `20260915160400_academic_structure.sql`. Use `on delete restrict` (not `cascade`) for FKs from historical/academic records (students, attendance, exams, fees) to classes/sections/subjects/academic_years — never let deleting a class silently wipe historical data.

## Authorization helpers (already defined — reuse, do not duplicate)
From `20260915160200_auth_helper_functions.sql` and `20260915160300_permissions_and_sub_admin.sql`:
- `public.is_super_admin()`
- `public.has_role_in_school(school_id, role)`
- `public.is_school_admin_or_above(school_id)`
- `public.is_school_member(school_id)`
- `public.current_user_school_id()`
- `public.has_permission(school_id, 'module.action')` — use this (not raw role checks) for anything a Sub-Admin might be granted, e.g. `has_permission(school_id, 'students.create')`. Extend `public.permissions` via a migration `insert ... on conflict (key) do nothing` if you need a new permission key — do not invent ad-hoc strings that aren't in the catalog.
- `public.is_school_read_only(school_id)` — call this in every write-path RLS policy/RPC for your module (attendance entry, exam creation, fee payments, homework posting, etc.) and reject with: `"School is in read-only mode. Subscription renewal is required to make changes."` per Spec Section 50. Reads/exports must keep working even when read-only (Rule 0.9) — do not gate SELECT policies on this.

## RLS pattern
Every new table: `alter table ... enable row level security;` then explicit SELECT/INSERT/UPDATE/DELETE policies (never `using (true)` on a tenant table). Mirror the shape used in `20260915160700_rls_policies.sql`:
```
create policy <table>_select on public.<table> for select using (public.is_school_member(school_id));
create policy <table>_insert on public.<table> for insert with check (public.has_permission(school_id, '<module>.create') and not public.is_school_read_only(school_id));
```
Student-owned tables (e.g. a student viewing their own attendance/fees) additionally need a `user_id = auth.uid()`-style clause — do not let a student read another student's row via a school-wide policy.

## Audit logging
Call `public.write_audit_log(school_id, action, entity_type, entity_id, old_values, new_values, metadata)` from inside your own `security definer` RPCs for every sensitive mutation (Spec Section 42 list — payments, marks, attendance corrections, admissions, promotions, permission changes, etc.). Do not call it directly from the client/Edge Function unless you also use the service-role client — see `EXECUTE` grants in `20260915160600_audit_logs.sql`.

## Money / idempotency (fees-subscriptions module)
Financial mutations must go through a single `security definer` RPC (see the planned `record_fee_payment`) that:
1. Locks the relevant balance row (`select ... for update`).
2. Recomputes `outstanding = total_due + fines - discounts - concessions - verified_payments` inside the same transaction.
3. Rejects if `payment_amount > outstanding` with `"Payment exceeds the remaining balance."`.
4. De-duplicates via an idempotency key column (unique constraint), so retries don't double-insert.
Never compute or trust a balance sent from the client — treat it as a preview only.

## Edge Functions
Place under `supabase/functions/<name>/index.ts`. Follow the header-comment format used in `supabase/functions/create-school-admin/index.ts` (purpose, auth requirement, allowed roles, input/output schema, errors, service-role usage, idempotency, audit, rate limits). Use the caller's JWT (`Authorization` header forwarded to a Supabase client with the anon key) for anything RLS should verify; use the service-role client only for operations that require it (e.g. `auth.admin.*`), never for ordinary table writes that RLS can already authorize.

## Frontend
- Extend `src/types/database.ts` with your new tables/functions (or regenerate via `supabase gen types typescript` once a live DB exists and re-apply the file's existing manual sections).
- Reuse `src/components/ui/*` primitives and the `.glass-surface` utility class; add new primitives following the same hand-authored shadcn pattern (the shadcn CLI is broken in this environment — see docs/status.md) rather than a different styling approach.
- Client-side role/permission checks (e.g. `ProtectedRoute`, hiding buttons) are UX only — the real authorization is the RLS/RPC layer above. Never add a feature whose only protection is a hidden button or disabled nav item (Rule 0.14).
- Treat any client-computed balance/total as a preview; display the server-returned value after a mutation succeeds.
