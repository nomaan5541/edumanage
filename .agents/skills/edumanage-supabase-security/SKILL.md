---
name: edumanage-supabase-security
description: Supabase-specific security conventions for EduManage - Auth, Postgres RLS, SECURITY DEFINER functions, Edge Functions, Storage, and secret handling. Use when writing any migration, RPC, Edge Function, or storage-touching code.
---

# EduManage Supabase Security

## Auth
Use Supabase Auth via `supabase-js` (`src/lib/supabase.ts`) with only the anon/publishable key in the frontend. Profile rows are created automatically by the `handle_new_user` trigger on `auth.users` insert - never insert into `public.profiles` directly from the client.

## SECURITY DEFINER functions
Helper/authorization functions (`is_super_admin`, `has_permission`, `is_school_read_only`, etc. in `supabase/migrations/2026091516*`) are `security definer` + `stable` + `set search_path = public` so they can safely read tables like `user_roles` from inside that same table's RLS policy without infinite recursion (the function runs as its owner, which bypasses RLS). Follow this exact pattern for new helpers; never make an authorization helper `security invoker`.

## RPCs for privileged/transactional work
Anything that needs a transaction, row lock, or multi-table write with an audit trail (payments, promotions, role bootstrapping) should be a single `security definer` RPC, following `create_school_bootstrap` in `supabase/migrations/20260915160800_school_onboarding_rpc.sql`:
1. Re-check authorization inside the function itself (`if not public.is_...() then raise exception ...`) - never rely solely on RLS or an Edge Function's own check.
2. Do the writes.
3. Call `public.write_audit_log(...)` for anything in the Spec Section 42 audit list.
4. `revoke execute ... from public, anon;` then `grant execute ... to authenticated;` (or narrower) explicitly - don't rely on default grants.

## Audit logging
`public.audit_logs` is append-only: `insert/update/delete` are revoked from `authenticated`/`anon`, and `public.write_audit_log(...)` itself has `execute` revoked from `authenticated`/`anon` too (only `service_role` and same-owner internal calls can use it). Call it from inside your own RPC, not directly from the client or an Edge Function's user-scoped client.

## Edge Functions
Follow the header-comment contract in `supabase/functions/create-school-admin/index.ts` (purpose, auth requirement, allowed roles, input/output schema, errors, service-role usage, idempotency, audit, rate limits). Use a client built from the caller's forwarded JWT + anon key for anything RLS should verify; use the service-role client ONLY for operations that require it (e.g. `auth.admin.*`). Never use the service-role client for an ordinary table write that RLS could already authorize - that throws away defense in depth.

## Secrets (Rule 0.6, Spec Section 94)
Frontend `.env`/`VITE_*` vars: public config only (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`). Service-role keys, SMS/email provider secrets, AI provider keys, and OAuth secrets live only in Supabase Edge Function secrets (`supabase secrets set`) - never in a committed file, never in a client bundle. `.env` is gitignored; only `.env.example` (placeholders) is tracked.

## Storage
Paths must be tenant-scoped, e.g. `schools/{school_id}/students/{student_id}/photo.ext`, with storage policies mirroring the equivalent table's RLS. Validate file extension, MIME type, and size server-side, not just in the upload widget.
