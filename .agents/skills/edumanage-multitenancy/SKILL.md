---
name: edumanage-multitenancy
description: Multi-school tenant isolation rules for EduManage - every table, query, and RPC must be school-scoped and server-enforced. Use when creating a new table, writing a query, or reviewing whether School A can reach School B's data.
---

# EduManage Multi-Tenancy

Central tenant entity: `public.schools`. Every school-owned table MUST carry `school_id uuid not null references public.schools(id)` (Spec Section 4). There is no exception without an explicit documented reason.

## Tenant resolution - never trust the client
Never accept a `school_id` from the request body/query params as authoritative. Resolve it server-side from the authenticated user:
- `public.current_user_school_id()` - the caller's own tenant (assumes one non-super-admin role per user).
- `public.is_school_member(target_school_id)` - is the caller a member of this school (or super_admin)?
- `public.is_school_admin_or_above(target_school_id)` - is the caller school_admin/super_admin for this school?
If a client-supplied `school_id` is present anywhere, validate it against the resolved tenant and reject a mismatch rather than trusting it (Rule 0.5).

## RLS is mandatory, not optional
Every new tenant table: `alter table ... enable row level security;` plus explicit SELECT/INSERT/UPDATE/DELETE policies built from the helpers above (see `supabase/migrations/20260915160700_rls_policies.sql` for the pattern). Never ship a `using (true)` policy on a tenant table, and never rely on a Supabase client `.eq('school_id', ...)` filter in React as the only protection - that is a UI filter, not security (Rule 0.4).

## Cross-school referential integrity
When table A references table B that's also school-scoped (e.g. a future `students.class_id` -> `classes.id`), add a `before insert or update` trigger verifying `B.school_id = A.school_id`, following `enforce_section_school()` / `enforce_class_subjects_school()` in `supabase/migrations/20260915160400_academic_structure.sql`. A mismatch here is a silent cross-tenant data leak.

## Cross-school operations are privileged, not client writes
Anything that legitimately needs to touch two schools (e.g. Student Transfer, Spec Section 16) must go through a secure server-side workflow (a `security definer` RPC or Edge Function) that explicitly validates both schools and the caller's privilege - never a plain client-side write with a different `school_id`. Do not "solve" a transfer feature by relaxing RLS.

## Testing (see also `edumanage-testing`)
Before considering any new table done, verify: a School A user cannot SELECT, INSERT (with School B's id), UPDATE, or DELETE School B's rows. This is SEC-001/002/003 from Spec Section 85 and must be checked against a real Postgres instance (`npx supabase start` + `db reset`), not assumed from reading the policy SQL.
