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
3. Copy `.env.example` to `.env.local` if you are wiring Supabase locally
4. `npm run dev`

## Scripts

- `npm run dev` - local development
- `npm run build` - typecheck + production build
- `npm run typecheck` - TypeScript only
- `npm run lint` - ESLint
- `npm run preview` - preview production build
- `npm test` - Vitest suite

## Deploy + Auth

For Vercel:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- `vercel.json` already rewrites all routes to `index.html` for SPA routing

For Supabase:

- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project settings
- Set Supabase Auth `SITE_URL` to your production Vercel domain
- Add local and preview redirect URLs in Supabase Auth for `http://localhost:5173/*` and your `*.vercel.app` preview domain pattern
- Client bootstrap lives in `src/lib/supabase.ts`

## Structure

- `AGENTS.md` - project rules Codex should follow
- `reference/` - screenshot + design-system source docs
- `src/components/layout/` - shared shell (`AppShell`, `SidebarNav`, `TopBar`)
- `src/components/ui/` - reusable UI primitives
- `src/features/` - feature state and battle logic
- `src/lib/supabase.ts` - Supabase client bootstrap
- `src/pages/` - page screens and placeholders
- `src/styles/tokens.css` - extracted CSS variables from the design system
