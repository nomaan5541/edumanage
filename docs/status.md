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
Student Master + Admissions — CURRENT — impl: admit_student RPC, school-admin Students page with admission form and guardian fields — db: students + student_guardians + student_enrollments, unique (school_id, admission_no) — RLS: students.read/create/update, identity-scoped student SELECT — roles: school_admin, sub_admin with students.*, student (own row) — routes: /admin/students — tests: duplicate admission rejected with "Admission number already exists."; SEC-004 student cannot read another student; UI verified (empty list + admit dialog) — issues: optional student portal-account creation is still invite/link later, not part of admit_student.
Student Documents/Photo — PARTIAL — impl: student_documents table, tenant path schools/{school_id}/students/{student_id}/..., storage bucket student-documents, Documents dialog on Students page — db/RLS: mime/size checks, path trigger, storage policies mirror can_read_student_row — roles: students.create/update — routes: /admin/students (Documents) — tests: migrations applied; no live file-upload acceptance test run — issues: photo/document upload not exercised against Storage in the SQL suite.
Student Promotion — CURRENT — impl: promote_students RPC + /admin/students/promotion — db: inserts a new student_enrollments row; BEFORE UPDATE/DELETE trigger forbids mutating historical enrollments — RLS: students.promote, read-only gated — roles: school_admin / granted sub_admin — routes: /admin/students/promotion — tests: promotion-happy-path (new enrollment created, prior-year row unchanged) — issues: no rollback UI.
Student Transfer — CURRENT — impl: initiate/accept/reject RPCs, lookup_school_for_transfer by school code, structured certificate_payload printable view — db: student_transfers, no client INSERT/UPDATE policy — RLS: either-school SELECT only — roles: students.transfer — routes: /admin/students/transfers — tests: transfer-happy-path (dest student created, source status=transferred, source enrollment preserved, certificate number written); UI verified — issues: none for Phase 1 workflow.
Teacher Management + Assignments — CURRENT — impl: create_teacher RPC, teacher_assignments with cross-school trigger, Teachers page + assignment dialog, create-teacher Edge Function for portal invite — db: teachers, teacher_assignments — RLS: teachers.read/create/update/assign — roles: school_admin / granted sub_admin; teachers see own school staff — routes: /admin/teachers — tests: create_teacher used in SES fixture; UI verified (empty list + add-teacher dialog) — issues: create-teacher Edge Function not invoked against a hosted project in this run.
Teacher One-Session Security — CURRENT — impl: teacher_sessions, register_teacher_session / assert_teacher_session / revoke_current_teacher_session, default reject_new policy, password-reset and deactivation triggers, login/logout hooks — db: teacher_sessions hashed session_id, one-active unique index — RLS: own or school-admin SELECT; teacher student-read requires has_active_teacher_session() — roles: teacher — routes: /login, /teacher — tests: SES-001..005 and SES-003-rls against local Postgres after db reset — issues: none.

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
PWA/offline support — PARTIAL — impl: Vite PWA plugin configured (manifest, safe-caching denylist for API/auth/storage/functions routes) — db: n/a — RLS: n/a — roles: all — routes: n/a — tests: none yet — issues: icons not generated, install prompt UI not built.

## Deferred (Phase 2+, not started, intentionally out of scope)
Online Exam Engine, Report Cards & AI Report Cards, Face Attendance, Meetings + School Calendar, ID Card Studio, Student AI Assistant, AI School Analytics, Google Workspace integration, Flutter Android app, Tauri desktop packaging, automatic/Stripe subscription billing.

## Environment Notes
- Frontend: `npm run build` and `npm run lint` (0 errors) pass on this branch.
- Local Supabase: `npx supabase start` and `npx supabase db reset` both succeeded in this environment (Docker available). Students/teachers acceptance SQL was executed against that instance.
- npm/npx must be invoked as `npm.cmd`/`npx.cmd` in PowerShell on the original Windows machine — the `.ps1` shims are blocked by the execution policy.
- shadcn/ui CLI (`npx shadcn init`) fails with a workspace-config-loading error on this environment across multiple versions (latest, 4.20.0, and Tailwind v4 incompatibility on 2.3.0) — UI primitives in `src/components/ui` are hand-authored shadcn-equivalent code instead.
