---
name: edumanage-design-system
description: Enforces EduManage's premium iOS-inspired glass UI design language and reusable component set. Use when building or editing any React page/component so the app stays visually consistent across modules built by different agents.
---

# EduManage Design System

Design language (Spec Section 53): translucent surfaces, subtle backdrop blur, layered depth, soft shadows, rounded corners, restrained gradients, premium spacing, high-quality empty/loading/error states. Professional, calm, fast, trustworthy. DO NOT use harsh neon, excessive glow, childish graphics, cluttered dashboards, unnecessary animation, or low-contrast text.

## Reuse, do not reinvent
The shadcn/ui CLI is broken in this environment (workspace-config bug across versions - see `docs/status.md`), so `src/components/ui/*` is hand-authored shadcn-equivalent code. Before creating any new UI primitive:
1. Check `src/components/ui/` for an existing component (`button`, `card`, `input`, `label`, `badge`, `separator`, `dialog`, `tabs`, `avatar`).
2. If it doesn't exist, author it by hand following the exact same pattern (Radix primitive + `cva` variants + `cn()` from `src/lib/utils.ts` + Tailwind tokens from `src/index.css`) - do not introduce a different styling approach (no inline styles, no CSS modules, no styled-components).
3. Use the `.glass-surface` utility class (defined in `src/index.css`) for card/panel/modal backgrounds instead of ad-hoc `bg-white/70 backdrop-blur` combinations.

## Tokens
Color, spacing, and radius tokens are CSS variables defined in `src/index.css` under `@theme inline` (e.g. `--color-primary`, `--color-card`, `--radius-lg`). Use Tailwind utility classes that map to them (`bg-primary`, `rounded-lg`, `text-muted-foreground`) rather than hard-coded hex colors or pixel values.

## Layout
`AppShell` (`src/components/layout/AppShell.tsx`) + `RoleLayout` provide the sidebar/topbar shell per role. New role-scoped pages go under `src/pages/<role>/` and are added to that role's `Route` tree in `src/App.tsx` plus its nav item list - do not build a parallel layout system.

## Responsiveness & accessibility (Spec Section 54-55)
Desktop: full sidebar. Mobile: the shell already collapses the sidebar - keep page content in a single responsive column that reflows, and turn wide tables into cards or horizontally-scrollable regions on small screens. Use semantic HTML, visible focus states, and don't rely on color alone (pair status colors with text/icons, as `Badge` variants already do).

## No placeholder UI
If a module's data isn't available yet, show an honest empty/pending state (see `TeacherDashboardPage.tsx` / `StudentDashboardPage.tsx` for the pattern) rather than fake numbers or dead buttons (Rule 82).
