---
name: edumanage-merge-safety
description: Validation gates required before merging any EduManage branch or Factory pull request into main. Use before merging work from a child agent, a Factory task, or your own feature branch.
---

# EduManage Merge Safety

Never merge a branch or approve a PR into `main` solely because it "looks done." Run every applicable gate below first, and record which ones actually ran (Rule 0.15) - a claimed pass without an executed check is not a pass.

## Required gates
1. `npm run build` (TypeScript typecheck + Vite build) - must pass with no errors.
2. `npm run lint` - must have no new errors (warnings from the pre-existing shadcn/react-refresh pattern are acceptable).
3. `npx supabase db reset` - every migration in `supabase/migrations/` must apply cleanly from scratch, in order, including the new branch's migrations layered on top of the foundation.
4. New/changed RLS policies and RPCs re-checked against `edumanage-multitenancy`, `edumanage-rbac`, and `edumanage-supabase-security` - specifically: no `using (true)` on a tenant table, no client-trusted `school_id`/role, every write path checks `is_school_read_only()` where applicable.
5. Manual or scripted acceptance check for the feature area per `edumanage-testing` (at minimum the cross-school-denied check for any new tenant table).
6. `docs/status.md` updated to reflect the real, tested status of what's being merged - not left stale.

## Merge order for parallel work
When multiple branches/tasks touch the schema independently (e.g. the four Phase 1 module branches), merge one at a time, re-running gates 1-4 after each merge, not just once at the end - a clean individual branch can still conflict or break once layered on another branch's migrations.

## Conflicts
Resolve migration filename collisions by re-timestamping (never edit another module's already-applied migration in place); resolve RLS/policy naming collisions by renaming, not by deleting one side's policy. When in doubt about which side is correct, prefer the safer (more restrictive) authorization behavior and ask rather than guessing.

## Factory PRs specifically
If work arrives as a Factory-produced pull request (Review agent stage), still apply gates 1-6 yourself before merge - the Factory's own Review/scorer agents are a first pass, not a substitute for these repo-specific checks.
