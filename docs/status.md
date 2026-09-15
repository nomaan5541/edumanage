# EduManage — Master Implementation Status
Per Spec Section 114. Statuses: CURRENT, PARTIAL, REQUIRED, LEGACY, BROKEN, CONFLICTING, DEPRECATED.
A module is only CURRENT after implementation + database verification + authorization verification + error handling + UI verification + acceptance test all pass (Rule 0.15). Do not edit a module's status to CURRENT without noting which checks were actually run.

## Foundation
Authentication — PARTIAL — impl: Supabase Auth via supabase-js, login page, session/role context, sign-out — db: profiles auto-created via handle_new_user trigger — RLS: profiles/user_roles policies written — roles: all — routes: /login, /unauthorized, role home redirects — tests: none run (no live DB yet) — issues: no password-reset flow yet; not verified against a live Postgres/Auth instance.
Multi-tenancy — PARTIAL — impl: school_id on every tenant table, is_school_member/is_school_admin_or_above helpers — db: schools table + FKs — RLS: written for all foundation tables — roles: all — routes: n/a — tests: none run yet — issues: cross-school RLS (SEC-001/002/003) not yet executed against a real DB.
RBAC — PARTIAL — impl: app_role enum, user_roles table, can_assign_role/has_role_in_school helpers, create_school_bootstrap RPC — db: written — RLS: written — roles: all — routes: n/a — tests: none run yet — issues: same as above.
Sub-Admin Permissions — PARTIAL — impl: permissions catalog + role_permissions table + has_permission() helper + enforce_role_permission_target trigger — db: written — RLS: written — roles: school_admin, sub_admin — routes: no dedicated UI yet (only the DB/RPC layer) — tests: none run yet — issues: no School Admin UI to grant/revoke Sub-Admin permissions yet (SUB-001..005 untested).
School Management + Setup Wizard — PARTIAL — impl: Super Admin Schools page (list + create dialog), create-school-admin Edge Function (invite flow), School Admin Setup Wizard (academic year → classes → sections → subjects) — db: schools/create_school_bootstrap RPC written — RLS: written — roles: super_admin, school_admin — routes: /super-admin/schools, /admin/setup — tests: none run yet (no live DB/Edge Function deploy) — issues: Edge Function not deployed/invoked against a real project yet.
Academic Years/Classes/Sections/Subjects — PARTIAL — impl: full CRUD via Setup Wizard + School Admin dashboard counts — db: written incl. cross-school consistency triggers — RLS: written — roles: school_admin — routes: /admin, /admin/setup — tests: none run yet — issues: no standalone "Academics" management page yet (only initial creation via wizard).
Audit Logs — PARTIAL — impl: write_audit_log() RPC, called from create_school_bootstrap — db: audit_logs table, append-only grants — RLS: select-only policy written — roles: super_admin, school_admin — routes: no viewer UI yet — issues: no audit log viewer page yet.

## Student & Teacher
Student Master + Admissions — REQUIRED — not started.
Student Documents/Photo — REQUIRED — not started.
Student Promotion — REQUIRED — not started.
Student Transfer — REQUIRED — not started.
Teacher Management + Assignments — REQUIRED — not started.
Teacher One-Session Security — REQUIRED — not started.

## Financial
Fees/Fee Structures/Payments — REQUIRED — not started.
Receipts (PDF) — REQUIRED — not started.
Subscription (manual Super Admin activation) — REQUIRED — not started.

## Assessment/Attendance
Attendance — REQUIRED — not started.
Offline Exams + Marks — REQUIRED — not started.

## Communication/Admin Tooling
Homework + Study Materials — REQUIRED — not started.
Timetable — REQUIRED — not started.
Notifications (in-app/email; SMS/push stubbed) — REQUIRED — not started.
Backup/Restore — REQUIRED — not started.
Reports & Exports — REQUIRED — not started.
Super Admin Platform Dashboard — REQUIRED — not started.
PWA/offline support — PARTIAL — impl: Vite PWA plugin configured (manifest, safe-caching denylist for API/auth/storage/functions routes) — db: n/a — RLS: n/a — roles: all — routes: n/a — tests: none yet — issues: icons not generated, install prompt UI not built.

## Deferred (Phase 2+, not started, intentionally out of scope)
Online Exam Engine, Report Cards & AI Report Cards, Face Attendance, Meetings + School Calendar, ID Card Studio, Student AI Assistant, AI School Analytics, Google Workspace integration, Flutter Android app, Tauri desktop packaging, automatic/Stripe subscription billing.

## Environment Notes
- Frontend foundation (Vite/React/TS/Tailwind/shadcn-style UI/routing/auth context) builds cleanly: `npm run build` and `npm run lint` both pass as of this writing.
- No Docker / local Postgres detected in the dev environment — Supabase CLI (`npx supabase`) works, but `supabase start`/`db reset` require Docker Desktop, which is not installed. Migrations are being written and reviewed but NOT executed/verified against a real Postgres instance yet. This must be resolved (install Docker Desktop, or connect a hosted Supabase project) before any module can be marked CURRENT, per Rule 0.15.
- npm/npx must be invoked as `npm.cmd`/`npx.cmd` in PowerShell on this machine — the `.ps1` shims are blocked by the execution policy.
- shadcn/ui CLI (`npx shadcn init`) fails with a workspace-config-loading error on this environment across multiple versions (latest, 4.20.0, and Tailwind v4 incompatibility on 2.3.0) — UI primitives in `src/components/ui` are hand-authored shadcn-equivalent code instead.
