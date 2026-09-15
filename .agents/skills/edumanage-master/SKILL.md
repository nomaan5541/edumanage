---
name: edumanage-master
description: Authoritative EduManage project brain - Phase 1 scope, deferred Phase 2 features, roles, architecture, tech stack, and non-negotiable rules. Use for ANY task touching this repo, before writing code, to confirm scope and constraints.
---

# EduManage Master

Read `docs/spec/EDUMANAGE_SPEC.md` (full spec, 115 sections) and `docs/plan/PHASE_1_PLAN.md` (current phase scope) before starting non-trivial work. Read `docs/status.md` for live per-module status - do not assume a module is done because a page exists.

## Non-negotiable rules (Spec Section 0, 113 - highest priority)
- Never weaken, bypass, or remove Row Level Security (RLS). It is a security boundary, not a UI filter.
- Never trust client input for role, school_id, payment amount, subscription status, or permissions.
- Never expose the Supabase service-role key to frontend code, `VITE_*` env vars, or the browser bundle.
- No Parent Portal, ever, unless the product owner explicitly changes this.
- Super Admin creates School + School Admin only - never Teacher/Student directly.
- Every mutation must answer: who, which school, what resource, what permission, is the school active/not-read-only, is it auditable.
- No fake buttons, fake statistics, placeholder dashboards, or "coming soon" labels presented as real. If a feature is unbuilt, say so.
- Do not claim a feature is COMPLETE without implementation + database verification + authorization verification + error handling + UI verification + an actual acceptance test (Rule 0.15).

## Phase 1 scope (current)
Foundation (done): auth, multi-tenancy/RLS, RBAC + Sub-Admin permissions, school setup wizard, academic years/classes/sections/subjects, audit logs.
Remaining Phase 1: Student Master/Admissions/Documents/Promotion/Transfer, Teacher Management/Assignments/One-Session Security, Fees/Payments/Receipts + manual Subscription activation, Attendance + offline Exams, Homework/Study Materials/Timetable/Notifications/Backup-Restore/Reports/Super-Admin-dashboard, PWA.
Deferred to Phase 2+ (do not build unless asked): Online Exam Engine, Report Cards/AI Report Cards, Face Attendance, Meetings/Calendar, ID Card Studio, Student AI Assistant, AI School Analytics, Google Workspace, the actual Flutter Android app, the actual Tauri desktop packaging, automatic/Stripe subscription billing.

## Architecture
Vite + React + TypeScript frontend (thin client), Supabase (Postgres + Auth + Storage + Edge Functions) backend. ALL business logic, validation, and authorization lives server-side (RLS + `SECURITY DEFINER` RPCs + Edge Functions) so a future Flutter app and a Tauri-wrapped build of this same React app can reuse it without reimplementing rules. Client-side calculations are previews only, re-validated server-side.

## When in doubt
Prefer the other `edumanage-*` skills for their specific domain (RBAC, multitenancy, Supabase security, financial integrity, teacher sessions, academic rules, testing, design system, spec compliance, merge safety). This skill is the index and the source of non-negotiable rules that override convenience in every other skill.
