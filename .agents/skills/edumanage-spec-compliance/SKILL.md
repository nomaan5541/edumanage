---
name: edumanage-spec-compliance
description: Compares EduManage's current implementation against docs/spec/EDUMANAGE_SPEC.md and docs/status.md to find missing requirements, incorrect behavior, and security deviations. Use after implementing a feature, and periodically to audit drift between the spec and the codebase.
---

# EduManage Spec Compliance

Works alongside the general `check-impl-against-spec` skill, scoped specifically to this project's two authoritative documents: `docs/spec/EDUMANAGE_SPEC.md` (the full 115-section spec + Phase 1 addendum) and `docs/plan/PHASE_1_PLAN.md` (current phase scope). `docs/status.md` is the live tracker - treat a mismatch between it and reality as a bug in itself.

## Procedure
1. Identify which spec section(s) govern the feature being checked (e.g. Section 17-20 for fees, Section 39 for subscription expiry).
2. Re-read that section verbatim - don't rely on paraphrased memory of it.
3. Walk the actual implementation: migrations, RLS policies, RPCs, Edge Functions, and the React pages/components involved.
4. For each requirement in the section, classify it as CURRENT (implemented + tested), PARTIAL (implemented but untested or incomplete), or REQUIRED (not built), per Spec Section 98. Do not upgrade a status without saying what test proves it.
5. Flag any BROKEN or CONFLICTING implementation explicitly - e.g. a feature that technically works but violates a non-negotiable rule (RLS bypass, client-trusted role, service-role key exposure) is CONFLICTING, not CURRENT, no matter how functional it looks.
6. Update `docs/status.md` to reflect the real state, including newly discovered issues in its "known issues" column.

## Known intentional deviations - do not "fix" these
- No Parent Portal (Rule 0.7) - do not add one to "complete" a feature that seems to want it.
- Subscription billing is manual/Super-Admin-only in Phase 1, not automatic Stripe checkout (Phase 1 addendum) - do not build automatic billing to match the base spec's Section 38 wording.
- Phase 2+ modules (Online Exam Engine, AI features, Google Workspace, ID Card Studio, Report Cards, Face Attendance, Meetings/Calendar, Flutter/Tauri apps) are intentionally not built - listing them as "missing" is correct; building them without being asked is not.

## When you find a real conflict
Per Spec Section 100/115: do not silently pick a side. State the existing behavior, the spec's required behavior, the security implication, and the recommended resolution, then implement the safest spec-compliant option (favor the non-negotiable rules in `edumanage-master` over convenience).
