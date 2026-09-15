---
name: edumanage-teacher-session-security
description: Enforces EduManage's one-active-session-per-teacher rule (Spec Section 9). Use when building teacher login/logout, session revocation, password reset, or any teacher-facing protected endpoint.
---

# EduManage Teacher One-Session Security

A teacher may have only ONE active authenticated session at a time. This must be enforced server-side - never implement it only by disabling a "login" button in React (Rule 0.4).

## Data model
Add a `teacher_sessions` table (school-scoped, following the multi-tenancy skill's conventions): `id, teacher_id, user_id, school_id, session_token_hash, device_identifier, created_at, last_seen_at, expires_at, revoked_at, ip_hash, user_agent_hash, status`. Hash tokens/IPs/user-agents at rest - never store raw tokens.

## Login sequence
1. Teacher authenticates via Supabase Auth normally.
2. A `security definer` RPC (or Edge Function) checks for an existing active `teacher_sessions` row for that `teacher_id`.
3. Apply the school's configured policy - either (a) reject the new login with "Your teacher account is active on another device." or (b) revoke the previous session and activate the new one. Make this configurable per school, but secure by default (do not silently allow N concurrent sessions).
4. Insert the new session row only after the policy check passes.

## Enforcement on every protected teacher request
Every RLS policy / RPC guard on teacher-only mutations should also verify the caller's current session is still the active one in `teacher_sessions` (not just that they hold a valid JWT) - a revoked-but-not-yet-expired JWT must still be rejected once its session row is revoked.

## Revocation triggers
Revoke the active session row (set `revoked_at`) on: explicit logout, session timeout/expiry, password reset (revoke ALL of that teacher's sessions), and teacher account deactivation. These must all be server-side triggers/RPCs, not client-only sign-out calls.

## Testing before calling this done
Verify SES-001..005 from Spec Section 87 against a real database: login on device A, login on device B (reject or revoke A per policy), old device A's next API call is rejected once revoked, logout revokes the session, and password reset revokes all of that teacher's active sessions.
