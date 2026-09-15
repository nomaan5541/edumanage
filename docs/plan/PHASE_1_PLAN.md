# EduManage Phase 1 — Greenfield Multi-Tenant School SaaS Build
This is the in-repo copy of the approved Phase 1 plan. See `docs/spec/EDUMANAGE_SPEC.md` for the full product specification this plan implements a subset of, and `docs/status.md` for live module status.

## Problem & Scope
Build EduManage from scratch per the Master Specification. This plan covers **Phase 1** only.
Phase 2+ (online exams, AI features, Google Workspace, meetings/calendar, ID cards, report cards, face attendance, the actual Flutter/Tauri client apps) is explicitly deferred.
Spec Section 0 and Section 113 (non-negotiable rules) apply throughout: RLS mandatory, no Parent Portal, Super Admin creates only School/School Admin, server-side authorization for every mutation, no fake/placeholder functionality.

## Architecture Decisions
**Cross-platform requirement**: business logic must not be duplicated per client (web now, Flutter Android and Tauri desktop later).
- All authorization, validation, and business rules live server-side in Postgres (RLS policies, CHECK constraints, `SECURITY DEFINER` RPC functions) and Supabase Edge Functions, exposed over HTTPS/PostgREST so any future client calls the exact same endpoints.
- The React web app is a thin client: UI + calls to RPC/Edge Functions + TanStack Query caching. Client-side calculations (e.g. fee balance preview) are explicitly previews, re-validated server-side.
- Tauri desktop (Phase 2+) wraps this same React build. Flutter (Phase 2+) calls the same RPC/Edge Function contracts; an API contract doc keeps them in sync.

## Repository & Tech Stack
- Vite + React + TypeScript, Tailwind CSS v4 + hand-authored shadcn-style components (`src/components/ui`), React Router, TanStack Query, react-hook-form + zod.
- Supabase (Postgres + Auth + Storage + Edge Functions). SQL migrations under `supabase/migrations`.
- PWA via `vite-plugin-pwa`.
- `docs/spec/EDUMANAGE_SPEC.md` (full spec) + `docs/status.md` (Section 114 status table) are the source of truth for scope and progress, not chat history.

## Phase 1 Module Scope
Foundation: Auth, multi-tenancy + RLS, RBAC + Sub-Admin granular permissions, School management + Setup Wizard, Academic Years/Classes/Sections/Subjects + mapping, Audit Logs.
Student & Teacher: Student Master + Admissions, Documents/Photo, Promotion, Transfer (secure server-side cross-school workflow), Teacher Management + Assignments, Teacher One-Session Security.
Financial: Fees/Fee Structures/Payments with server-side overpayment protection + idempotency, PDF Receipts. Subscription is **manual, Super-Admin-only** activation/extension (no in-app billing).
Assessment/Attendance: Attendance (present/absent/late/excused, corrections, audit, teacher scoped to assigned classes), offline Exams (FA1/FA2/MID/FA3/FA4/FINAL) with marks entry, draft→published state.
Communication/Admin tooling: Homework + Study Materials, Timetable (conflict detection), Notifications (in-app + email; SMS/push stubbed behind provider interface), Backup/Restore, Reports & Exports, Super Admin platform dashboard, global search/filtering.
Cross-cutting: PWA/offline support.

## Deferred to Later Phases
Online Exam Engine, Report Cards & AI Report Cards, Face Attendance, Meetings + School Calendar, ID Card Studio, Student AI Assistant, AI School Analytics, Google Workspace integration, Flutter Android app, Tauri desktop packaging, automatic/Stripe subscription billing.

## Database & Security Approach
- Every tenant table: `school_id uuid not null references schools(id)`, RLS enabled, policies resolve tenant from the authenticated user server-side — never from client-supplied `school_id`.
- Canonical roles: `super_admin, school_admin, sub_admin, teacher, student`. Sub-Admin permissions via `permissions`/`role_permissions`, checked in RLS helper functions and RPC/Edge Function guards.
- Fee payments go through a single `record_fee_payment` RPC that locks the balance row, recomputes `outstanding = total_due + fines - discounts - concessions - verified_payments` inside the transaction, rejects overpayment, and de-duplicates via idempotency key.
- Teacher one-session security via `teacher_sessions` + guard checked on every protected teacher request.
- Append-only `audit_logs`, protected from ordinary UPDATE/DELETE by RLS.
- Storage paths tenant-scoped (`schools/{school_id}/...`) with matching storage policies.

## Execution Sequence
1. Orchestrator scaffolds the repo and builds the **foundation** (schema+RLS+RPCs+Auth+RBAC+Setup Wizard+design system) end-to-end first.
2. Fan out remaining Phase 1 modules to parallel local child agents on separate git worktrees/branches.
3. Orchestrator merges each branch sequentially into `main`, re-running build/lint/typecheck after each merge.
4. Final validation pass against the relevant Spec acceptance tests; update `docs/status.md`.

## Orchestration
Foundation is built by the orchestrator first; four child agents (`students-teachers`, `fees-subscriptions`, `attendance-exams`, `communication-admin`) then build independent modules in parallel local git worktrees, each adding only new files/migrations. Orchestrator merges sequentially and validates.

## Validation & Acceptance
- `npm run build`, typecheck, lint after every merge.
- Local Supabase migrations must apply cleanly from scratch.
- Manual acceptance pass: cross-school denied, role escalation denied, overpayment rejected, duplicate payment idempotent, teacher single-session enforced, expired-subscription school read-only but can view/export.
- `docs/status.md` updated — no module marked CURRENT without checks passing.

## Open Items / Assumptions
- No Docker/local Postgres available in this environment as of Phase 1 kickoff — migrations are written and reviewed but not yet executed/verified locally. Needs Docker Desktop (for `supabase start`) or a hosted Supabase project + credentials to actually run and test them.
- No hosted Supabase project exists yet.
- SMS/push notification providers unspecified — data model + in-app/email implemented fully; SMS/push behind a stub provider interface.
