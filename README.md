# EduManage

A multi-school school management SaaS platform (Telangana SSC-focused, extensible to other boards). The React app in `src/` is the only UI client. Authorization and business rules live in Supabase (RLS, RPCs, Edge Functions) — never in the browser and never in Rust. See `docs/spec/EDUMANAGE_SPEC.md` for the full product specification and non-negotiable security/architecture rules, and `docs/status.md` for what's actually built and tested vs. still required.

## Tech stack
- **Frontend**: Vite + React + TypeScript, Tailwind CSS v4, hand-authored shadcn-style UI components (`src/components/ui`), React Router, TanStack Query, react-hook-form + zod.
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions). All authorization and business logic lives server-side (RLS policies + `SECURITY DEFINER` RPCs + Edge Functions) so other clients (desktop, future mobile) can reuse it without reimplementing rules.

## Web
```bash
cp .env.example .env   # public VITE_* keys only — never a service_role key
npm install
npm run dev            # Vite, http://localhost:5173
npm run build           # typecheck + production bundle in dist/
npm run lint
```

Frontend config is `.env` / `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). **Never** put the service-role key or any other secret in a `VITE_*` variable.

For local backend development, install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and run:
```bash
npx supabase start     # starts local Postgres/Auth/Storage/Studio
npx supabase db reset  # applies every migration in supabase/migrations from scratch
```

On Windows PowerShell, invoke npm/npx as `npm.cmd` / `npx.cmd` if the `.ps1` shims are blocked by your execution policy.

## Desktop (Tauri 2)

The desktop app is a native window around **the same** Vite build. `src-tauri/` has no screens, no Supabase client, and no permission checks.

Tauri **2** is pinned (`@tauri-apps/cli` ^2.11.4, `tauri` / `tauri-build` 2) because it is the current stable major, matches the official Vite integration (`frontendDist` / `devUrl`), and Tauri 1 is maintenance-only.

Prerequisites (in addition to Node):
- Rust stable (`rustup`)
- Linux: WebKitGTK 4.1 + GTK 3 (see https://v2.tauri.app/start/prerequisites/)

```bash
npm run tauri:dev      # starts `npm run dev` and opens a 1280×800 window
npm run tauri:build    # runs `npm run build`, then bundles dist/ into a native app
npm run test:desktop   # static config checks only — does not boot the app or call Supabase
```

The desktop webview uses the same `VITE_*` values baked into the web build at `npm run build` time. Icon files under `src-tauri/icons/` are placeholders — replace them before a store release.

`tauri.conf.json` sets a Content-Security-Policy: scripts/styles from the bundled app, images from self plus HTTPS (school logos in Storage), and `connect-src` limited to Tauri IPC, HTTPS/WSS (the Supabase URL is chosen at web-build time via `VITE_*`, including custom domains), and localhost/`127.0.0.1` for `supabase start`. Remote cleartext HTTP is blocked. If you host Postgres Auth on some other scheme/host, add that origin to `app.security.csp` before shipping.

Installers produced here are **unsigned**. Signing (Apple notarization, Windows Authenticode) is not configured.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite web dev server |
| `npm run build` | Web production build |
| `npm run lint` | Oxlint |
| `npm run preview` | Preview `dist/` |
| `npm run tauri:dev` | Desktop dev shell |
| `npm run tauri:build` | Desktop package |
| `npm run test:desktop` | Static Tauri config checks (not a GUI/API test) |

## Project docs
- `docs/spec/EDUMANAGE_SPEC.md` — full product specification (authoritative)
- `docs/plan/PHASE_1_PLAN.md` — current build phase scope and architecture decisions
- `docs/status.md` — live per-module implementation status (Rule 0.15: nothing is CURRENT without a real test)
- `docs/conventions/BACKEND_CONVENTIONS.md` — required patterns for new tables/RLS/RPCs/Edge Functions
- `docs/plan/FOUNDATION_SMOKE_TEST.md` — manual verification checklist for the foundation
- `.agents/skills/edumanage-*` — Warp Agent Skills encoding these rules for AI-assisted development on this repo

## Workflow
Foundation work (auth, multi-tenancy, RBAC, school onboarding, setup wizard) and the desktop shell were built directly and live on `main`. Every PR must pass the gates in `.agents/skills/edumanage-merge-safety` before merging: build, lint, `supabase db reset`, and an RLS/authorization re-check.

## Security model (read before touching auth/RLS/payments)
- RLS is a security boundary, not a UI filter — see `.agents/skills/edumanage-multitenancy`.
- Client-supplied role/school_id/amounts are never trusted — see `.agents/skills/edumanage-rbac` and `.agents/skills/edumanage-financial-integrity`.
- No feature is "done" without an actual test run against a live database — see `.agents/skills/edumanage-testing`.
