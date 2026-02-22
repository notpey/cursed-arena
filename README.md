# Cursed Arena

Prompt-kit Step 0 scaffold for a long-lived UI codebase:

- Vite + React + TypeScript
- Tailwind CSS v4 (Vite plugin)
- Shared `AppShell` (sidebar + top bar)
- Route-based page structure
- Extracted design tokens from `reference/design-system-v3.html`

## First-time setup

1. Save your canonical screenshot to `reference/home-screen.png`
2. `npm install`
3. `npm run dev`

## Scripts

- `npm run dev` - local development
- `npm run build` - typecheck + production build
- `npm run typecheck` - TypeScript only
- `npm run lint` - ESLint
- `npm run preview` - preview production build

## Structure

- `AGENTS.md` - project rules Codex should follow
- `reference/` - screenshot + design-system source docs
- `src/components/layout/` - shared shell (`AppShell`, `SidebarNav`, `TopBar`)
- `src/components/ui/` - reusable UI primitives
- `src/pages/` - page screens and placeholders
- `src/styles/tokens.css` - extracted CSS variables from the design system

