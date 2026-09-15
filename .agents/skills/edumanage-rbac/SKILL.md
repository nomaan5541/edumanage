---
name: edumanage-rbac
description: Canonical role architecture and permission rules for EduManage (super_admin, school_admin, sub_admin, teacher, student). Use when building any feature that creates accounts, assigns roles, checks permissions, or gates a route/action by role.
---

# EduManage RBAC

Canonical roles (Postgres enum `public.app_role`, `supabase/migrations/20260915160000_extensions_and_enums.sql`): `super_admin`, `school_admin`, `sub_admin`, `teacher`, `student`. Never introduce a new role name without a migration updating this enum - don't encode roles as free-text strings anywhere.

## Assignment rules (Rule 0.8, enforced by `public.can_assign_role` in `20260915160200_auth_helper_functions.sql`)
- `super_admin`: only another `super_admin` can create one (in practice, seeded manually - there is no UI for it by design).
- `school_admin`: only `super_admin` can create one, via the `create-school-admin` Edge Function + `create_school_bootstrap` RPC.
- `sub_admin` / `teacher` / `student`: `school_admin` (or `super_admin`) can create these, scoped to their own school only.
- A `sub_admin` or any non-admin role can NEVER create/promote another user to `school_admin` or `super_admin`. Enforce this server-side (RLS `WITH CHECK` + RPC guard), never only in the UI.

## Sub-Admin granular permissions
`sub_admin` capability is NOT role-based, it's permission-based via `public.role_permissions` + the `public.has_permission(school_id, 'module.action')` helper (`20260915160300_permissions_and_sub_admin.sql`). When building a feature a Sub-Admin might use:
1. Check whether the needed permission key already exists in `public.permissions` (seeded in that migration).
2. If not, add it via a new migration (`insert into public.permissions ... on conflict (key) do nothing`) - don't invent a permission string that isn't in the catalog.
3. Gate the RLS policy/RPC with `public.has_permission(school_id, 'your.key')`, not a raw `role = 'sub_admin'` check, so School Admin/Super Admin implicitly pass and only the intended Sub-Admins with an explicit grant get access.

## Never trust the frontend for authorization
`ProtectedRoute` and role-based nav (`src/components/auth/ProtectedRoute.tsx`) are UX only - they decide what a user *sees*, not what they can *do*. Every actual mutation must be independently protected by RLS or an RPC guard using `public.is_super_admin()`, `public.has_role_in_school()`, `public.is_school_admin_or_above()`, or `public.has_permission()` (Rule 0.14). A hidden button is not authorization.

## Teacher and Student scope
Teachers are assignment-scoped (only their assigned classes/sections/subjects/students, unless explicitly granted more - see `edumanage-teacher-session-security` for the one-session rule too). Students are identity-scoped (only their own records). Never build a query that lets a teacher or student read another user's row via a school-wide policy alone - add a `user_id = auth.uid()` (or equivalent assignment-table join) clause.
