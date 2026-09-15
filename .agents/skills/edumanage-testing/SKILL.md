---
name: edumanage-testing
description: Required acceptance-test coverage for EduManage before any feature can be marked CURRENT in docs/status.md. Use before declaring a feature complete, and when writing or reviewing tests for security, payments, sessions, or subscriptions.
---

# EduManage Testing

Rule 0.15: a feature is COMPLETE only after implementation + database verification + authorization verification + error handling + UI verification + an actual acceptance test - not because a page loads or a migration was written. Never mark something CURRENT in `docs/status.md` without saying which of these checks actually ran.

## Prerequisite: a live database
Tests that involve RLS/RPC behavior must run against a real Postgres instance (`npx supabase start`, then `npx supabase db reset`), not just be inferred from reading SQL. If Docker/a live DB isn't available, say so explicitly instead of claiming untested SQL is correct (see `docs/plan/FOUNDATION_SMOKE_TEST.md` for the manual walkthrough pattern).

## Minimum acceptance coverage per domain (Spec Section 85-91)
- **Security (SEC-001..010)**: School A cannot read/insert/update School B's rows; a student can't read another student's data; a teacher can't reach another school's class; a Sub-Admin can't escalate permissions; a School Admin can't create a school; Super Admin actions aren't accidentally scoped as a tenant user; no service-role key in the frontend bundle; exam answers aren't exposed pre-submission.
- **Payments (PAY-001..007)**: create fee, partial payment reduces balance, over-limit payment rejected, duplicate request is idempotent, two simultaneous payments can't jointly overpay, receipts are unique, refunds reflect in the ledger.
- **Sessions (SES-001..005)**: teacher login on device A, login on device B (reject or revoke per policy), old device's next request is rejected, logout revokes session, password reset revokes all sessions.
- **Sub-Admin (SUB-001..005)**: create Sub-Admin, grant one permission works, an ungranted permission is blocked both in UI and via a direct API/RPC call, school creation is rejected.
- **Subscriptions (SUBS-001..005)**: expired subscription is read-only for writes but reads/exports/receipts still work; only Super Admin can renew; write access is restored after renewal.
- **Academic (attendance/exam happy path)**: duplicate attendance for the same student/date/year is rejected; unpublished exam results aren't visible to students; promotion doesn't touch prior-year records.

## Format
Prefer a runnable check (SQL script, Edge Function test call, or a scripted UI flow) over a purely manual description when practical, but a documented manual walkthrough (like `docs/plan/FOUNDATION_SMOKE_TEST.md`) is acceptable for Phase 1 given the environment constraints - as long as it's actually executed and the result is recorded, not assumed.

## Reporting
When you finish a task, use the Change Report format from Spec Section 111: CHANGED / SECURITY / DATABASE / TESTED (what passed, what failed) / KNOWN LIMITATIONS. Never claim success if testing wasn't performed.
