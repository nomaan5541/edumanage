# EduManage

A multi-school school management SaaS platform (Telangana SSC-focused, extensible to other boards). See `docs/spec/EDUMANAGE_SPEC.md` for the full product specification and non-negotiable security/architecture rules, and `docs/status.md` for what's actually built and tested vs. still required.

## Tech stack
- **Frontend**: Vite + React + TypeScript, Tailwind CSS v4, hand-authored shadcn-style UI components (`src/components/ui`), React Router, TanStack Query, react-hook-form + zod.
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions). All authorization and business logic lives server-side (RLS policies + `SECURITY DEFINER` RPCs + Edge Functions) so future non-web clients can reuse it without reimplementing rules.

## Local setup
1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in your Supabase project's URL and anon/publishable key. **Never** put the service-role key or any other secret in a `VITE_*` variable.
3. For local backend development, install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and run:
   ```
   npx supabase start   # starts local Postgres/Auth/Storage/Studio
   npx supabase db reset  # applies every migration in supabase/migrations from scratch
   ```
4. Run the frontend: `npm run dev`

On Windows PowerShell, invoke npm/npx as `npm.cmd` / `npx.cmd` if the `.ps1` shims are blocked by your execution policy.

## Scripts
- `npm run dev` — Vite dev server
- `npm run build` — TypeScript typecheck + production build
- `npm run lint` — oxlint
- `npm run preview` — preview a production build locally

## Project docs
- `docs/spec/EDUMANAGE_SPEC.md` — full product specification (authoritative)
- `docs/plan/PHASE_1_PLAN.md` — current build phase scope and architecture decisions
- `docs/status.md` — live per-module implementation status (Rule 0.15: nothing is CURRENT without a real test)
- `docs/conventions/BACKEND_CONVENTIONS.md` — required patterns for new tables/RLS/RPCs/Edge Functions
- `docs/plan/FOUNDATION_SMOKE_TEST.md` — manual verification checklist for the foundation
- `.agents/skills/edumanage-*` — Warp Agent Skills encoding these rules for AI-assisted development on this repo

## Workflow
This repo is connected to a Warp Factory (`EduManage`) that builds out the remaining modules as separate tasks (see `docs/status.md` for links to in-flight runs and PRs). Foundation work (auth, multi-tenancy, RBAC, school onboarding, setup wizard) was built directly and lives on `main`. Every PR — whether from the Factory or a direct commit — must pass the gates in `.agents/skills/edumanage-merge-safety` before merging: build, lint, `supabase db reset`, and an RLS/authorization re-check.

## Security model (read before touching auth/RLS/payments)
- RLS is a security boundary, not a UI filter — see `.agents/skills/edumanage-multitenancy`.
- Client-supplied role/school_id/amounts are never trusted — see `.agents/skills/edumanage-rbac` and `.agents/skills/edumanage-financial-integrity`.
- No feature is "done" without an actual test run against a live database — see `.agents/skills/edumanage-testing`.
