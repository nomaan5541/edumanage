# EduManage — Master Implementation Status
Per Spec Section 114. Statuses: CURRENT, PARTIAL, REQUIRED, LEGACY, BROKEN, CONFLICTING, DEPRECATED.
A module is only CURRENT after implementation + database verification + authorization verification + error handling + UI verification + acceptance test all pass (Rule 0.15). Do not edit a module's status to CURRENT without noting which checks were actually run.

## Foundation
Authentication — PARTIAL — impl: Supabase Auth via supabase-js, login page, session/role context, sign-out, forgot/reset password flow — db: profiles auto-created via handle_new_user trigger (now includes email) — RLS: profiles/user_roles policies written — roles: all — routes: /login, /forgot-password, /reset-password, /unauthorized, role home redirects — tests: none run (no live DB yet) — issues: not verified against a live Postgres/Auth instance.
Multi-tenancy — PARTIAL — impl: school_id on every tenant table, is_school_member/is_school_admin_or_above helpers — db: schools table + FKs — RLS: written for all foundation tables — roles: all — routes: n/a — tests: none run yet — issues: cross-school RLS (SEC-001/002/003) not yet executed against a real DB.
RBAC — PARTIAL — impl: app_role enum, user_roles table, can_assign_role/has_role_in_school helpers, create_school_bootstrap RPC — db: written — RLS: written — roles: all — routes: n/a — tests: none run yet — issues: same as above.
Sub-Admin Permissions — PARTIAL — impl: permissions catalog + role_permissions table + has_permission() helper + enforce_role_permission_target trigger + invite-school-sub-admin Edge Function + SubAdminsPage UI (invite, per-permission checkbox editor) — db: written — RLS: written — roles: school_admin, sub_admin — routes: /admin/sub-admins — tests: none run yet (no live DB/Edge Function deploy) — issues: SUB-001..005 untested against a live database.
School Management + Setup Wizard — PARTIAL — impl: Super Admin Schools page (list + create dialog), create-school-admin Edge Function (invite flow), School Admin Setup Wizard (academic year → classes → sections → subjects) — db: schools/create_school_bootstrap RPC written — RLS: written — roles: super_admin, school_admin — routes: /super-admin/schools, /admin/setup — tests: none run yet (no live DB/Edge Function deploy) — issues: Edge Function not deployed/invoked against a real project yet.
Academic Years/Classes/Sections/Subjects — PARTIAL — impl: full CRUD via Setup Wizard + standalone AcademicsPage (tabs for years/classes/sections/subjects + Subject Mapping tab binding subjects to classes per academic year via class_subjects) + School Admin dashboard counts — db: written incl. cross-school consistency triggers — RLS: written — roles: school_admin — routes: /admin, /admin/setup, /admin/academics — tests: none run yet — issues: set-active-year is two sequential client calls, not a single transaction (acceptable for one admin at a time, could race with concurrent admins).
Audit Logs — PARTIAL — impl: write_audit_log() RPC, called from create_school_bootstrap; AuditLogPage viewer UI — db: audit_logs table, append-only grants — RLS: select-only policy written — roles: super_admin, school_admin — routes: /admin/audit-log, /super-admin/audit-log — tests: none run yet — issues: only school/school_admin creation currently writes audit events; other modules' RPCs (owned by Factory tasks) still need to call write_audit_log per docs/conventions/BACKEND_CONVENTIONS.md.

## Student & Teacher
Student Master + Admissions — REQUIRED — dispatched to Warp Factory task (run https://platform.warp.dev/sLAxqZv4PNlhFvGfh0jCrk/runs/01a0a622-91d2-7755-ba6d-4ff8bdfc10d1, "Students & Teachers module").
Student Documents/Photo — REQUIRED — same Factory task as above.
Student Promotion — REQUIRED — same Factory task as above.
Student Transfer — REQUIRED — same Factory task as above.
Teacher Management + Assignments — REQUIRED — same Factory task as above.
Teacher One-Session Security — REQUIRED — same Factory task as above.

## Financial
Fees/Fee Structures/Payments — REQUIRED — dispatched to Warp Factory task (run https://platform.warp.dev/sLAxqZv4PNlhFvGfh0jCrk/runs/01a0a622-c3d5-70cf-b94d-cfa8f6ce3bcf, "Fees & Subscriptions module").
Receipts (PDF) — REQUIRED — same Factory task as above.
Subscription (manual Super Admin activation) — REQUIRED — same Factory task as above.

## Assessment/Attendance
Attendance — REQUIRED — dispatched to Warp Factory task (run https://platform.warp.dev/sLAxqZv4PNlhFvGfh0jCrk/runs/01a0a622-fa4e-7c57-bfd6-831730f4776a, "Attendance & Offline Exams module").
Offline Exams + Marks — REQUIRED — same Factory task as above.

## Communication/Admin Tooling
Homework + Study Materials — REQUIRED — dispatched to Warp Factory task (run https://platform.warp.dev/sLAxqZv4PNlhFvGfh0jCrk/runs/01a0a623-30cb-7478-8446-6da7235bd4dd, "Communication & Admin Tooling module").
Timetable — REQUIRED — same Factory task as above.
Notifications (in-app/email; SMS/push stubbed) — REQUIRED — same Factory task as above.
Backup/Restore — REQUIRED — same Factory task as above.
Reports & Exports — REQUIRED — same Factory task as above.
Super Admin Platform Dashboard — REQUIRED — same Factory task as above.
PWA/offline support — PARTIAL — impl: Vite PWA plugin configured (manifest, safe-caching denylist for API/auth/storage/functions routes), branded SVG app icon (any/maskable), InstallPromptButton wired into AppShell — db: n/a — RLS: n/a — roles: all — routes: n/a — tests: manual install flow not yet verified in a real browser — issues: icon is a placeholder monogram (SVG), not designed PNG/maskable assets - swap in real brand icons later; offline indication UI not built.

## Phase 2 (in progress via Warp Factory, dispatched 2026-09-15)
Meetings + School Calendar — REQUIRED — dispatched (run https://platform.warp.dev/sLAxqZv4PNlhFvGfh0jCrk/runs/01a0a627-e619-7540-80c2-bb57eaff6b98). Independent of unmerged Phase 1 tables.
ID Card Studio (template engine foundation, 5-10 real starter templates, no student data-binding yet) — REQUIRED — dispatched (run https://platform.warp.dev/sLAxqZv4PNlhFvGfh0jCrk/runs/01a0a628-2079-7173-81d4-f7d9928cd5ef). Data-binding to real students deferred until Students & Teachers task merges.
Tauri desktop packaging — REQUIRED — dispatched (run https://platform.warp.dev/sLAxqZv4PNlhFvGfh0jCrk/runs/01a0a628-5187-7389-9ba8-5b988bcb0f72). Wraps the existing web build, no new business logic.

## Phase 2 (blocked on Phase 1 merge, not yet dispatched)
Online Exam Engine — REQUIRED — depends on Student + offline Exam tables from the still-in-progress Students & Teachers / Attendance & Offline Exams Factory tasks. Dispatch once those merge to main.
Report Cards (non-AI) — REQUIRED — depends on Student + Marks/Attendance data. Dispatch once Phase 1 merges.

## Explicitly declined for now (product owner decision, 2026-09-15)
Student AI Assistant, AI Report Cards, AI School Analytics — SKIPPED — requires a real LLM provider API key the product owner has not provided; revisit once one is available and the underlying student/exam data exists.
Google Workspace integration (Calendar/Drive/Docs/Sheets) — SKIPPED — requires a Google Cloud OAuth app/credentials not yet created.
Automatic/Stripe subscription billing — SKIPPED BY DESIGN — Phase 1 intentionally uses manual Super-Admin-only activation instead (Rule 0.8 addendum); do not add Stripe checkout without an explicit future request + real Stripe keys.
Face Attendance — SKIPPED — biometric data has real privacy/legal implications the product owner chose not to take on now; manual/QR attendance (in the Attendance & Offline Exams task) covers the need.
Flutter Android app — SKIPPED FOR NOW — separate native codebase/toolchain; product owner wants the web app finished and stabilized first.

## Environment Notes
- Frontend foundation (Vite/React/TS/Tailwind/shadcn-style UI/routing/auth context) builds cleanly: `npm run build` and `npm run lint` both pass as of this writing.
- No Docker / local Postgres detected in the dev environment — Supabase CLI (`npx supabase`) works, but `supabase start`/`db reset` require Docker Desktop, which is not installed. Migrations are being written and reviewed but NOT executed/verified against a real Postgres instance yet. This must be resolved (install Docker Desktop, or connect a hosted Supabase project) before any module can be marked CURRENT, per Rule 0.15.
- npm/npx must be invoked as `npm.cmd`/`npx.cmd` in PowerShell on this machine — the `.ps1` shims are blocked by the execution policy.
- shadcn/ui CLI (`npx shadcn init`) fails with a workspace-config-loading error on this environment across multiple versions (latest, 4.20.0, and Tailwind v4 incompatibility on 2.3.0) — UI primitives in `src/components/ui` are hand-authored shadcn-equivalent code instead.
