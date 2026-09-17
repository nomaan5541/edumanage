# EduManage

Multi-school school management SaaS. The React app in `src/` is the only UI client. Authorization and business rules live in Supabase (RLS, RPCs, Edge Functions), not in the browser and not in Rust.

## Web

```bash
cp .env.example .env   # public VITE_* keys only — never a service_role key
npm install
npm run dev            # Vite, http://localhost:5173
npm run build          # typecheck + production bundle in dist/
npm run lint
```

Frontend config is `.env` / `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`).

## Desktop (Tauri 2)

The desktop app is a native window around **the same** Vite build. `src-tauri/` has no screens, no Supabase client, and no permission checks.

Tauri **2** is pinned (`@tauri-apps/cli` ^2.11.4, `tauri` / `tauri-build` 2) because it is the current stable major, matches the official Vite integration (`frontendDist` / `devUrl`), and Tauri 1 is maintenance-only.

Prerequisites (in addition to Node):

- Rust stable (`rustup`)
- Linux: WebKitGTK 4.1 + GTK 3 (see https://v2.tauri.app/start/prerequisites/)

```bash
npm run tauri:dev      # starts `npm run dev` and opens a 1280×800 window
npm run tauri:build    # runs `npm run build`, then bundles dist/ into a native app
npm run test:desktop   # config checks (same dist, Tauri 2, no Rust data crates)
```

The desktop webview uses the same `VITE_*` values baked into the web build at `npm run build` time. Icon files under `src-tauri/icons/` are placeholders — replace them before a store release.

`tauri.conf.json` leaves CSP unset (`null`, Tauri’s default) so the Vite module bundle can load and the app can `connect-src` to the env-driven Supabase HTTPS/WSS URL. Tightening CSP is a follow-up, not done here.

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
| `npm run test:desktop` | Tauri config validation |
