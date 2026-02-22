# Cursed Arena - Agent Instructions

## Project
Cursed Arena is a 3v3 turn-based PvP gacha RPG inspired by Jujutsu Kaisen.
Web app. React + Vite + TypeScript + Tailwind CSS.

## Visual Reference
- `/reference/home-screen.png` - THE canonical visual reference.
  Every page must look like it belongs in the same app as this screenshot.
- `/reference/design-system-v3.html` - Full design system with all tokens.

## Design System (Critical Rules)
### Colors (CSS Variables)
- Background scale: `#0d0c11` (void) -> `#17151c` (base) -> `#1e1c24` (raised)
  -> `#26242e` (surface) -> `#302e3a` (overlay). Purple undertone, NEVER neutral gray.
- Red (`#fa2742`): Player agency. CTAs, active states, damage, urgency.
  MAX ONE red CTA per viewport. Red is rare.
- Teal (`#05d8bd`): System/supernatural. CE, gacha, buffs, progression, data.
  More frequent than red. AAA contrast on dark backgrounds.
- Text: `#e4e6ef` (primary) -> `#b0b2c0` (secondary) -> `#7a7c8e` (tertiary)
  -> `#4e5060` (disabled). All have cool blue undertone.
- Gold (`#f5a623`): Ultimate gauge, special, premium.
- Purple (`#9b6dff`): Epic rarity only.
- Color ratio: 82% dark / 12% frost text / 4% teal / 2% red.

### Typography
- Bebas Neue: Display. Titles, names, buttons. Always uppercase. Track 0.04-0.08em.
- Syne: Alt display. Skill/technique names ONLY. Weight 700-800. Mixed case.
- Noto Sans: Body. Descriptions, tooltips, UI text. Weight 400-600.
- JetBrains Mono: Data. Stats, numbers, labels, metadata, tags. Weight 400-600.
  Track 0.06-0.12em. Uppercase for labels.

### Layout
- Sidebar nav: 60px wide, left edge, always visible. Icon (22x22) + micro-label.
  Active state: 2px red left-edge bar.
- Top bar: Greeting, currency display (gems + gold), profile avatar.
- Content area fills remaining space.
- 8px base grid. All spacing multiples of 4 or 8.
- Cards: bg-raised (`#1e1c24`), 1px border border-subtle, radius 10px.
- Atmospheric gradients: Radial, off-center, 4-8% opacity. Red from left,
  teal from right. Never centered on same element.

### Component Patterns
- Progress bars: 2-3px height, rounded, bg-highlight track.
  Red fill = combat. Teal fill = system/collection. Gold = premium/XP.
- Tags: JetBrains Mono, 0.5rem, 600 weight, uppercase, colored bg at 12-15%.
- Buttons: Bebas Neue. Primary = red bg, white text. Secondary = bg-overlay,
  frost text, border-default. Ghost = transparent, text-secondary.
- Cards hover: translateY(-2px) + border-color shift + shadow-md, 200ms ease.

### Rarity Colors (Sorcerer Grades)
- Grade 2 (R / Common): `#6b6b80`
- Grade 1 (SR / Rare): `#3b82f6`
- Special Grade (SSR / Legendary): `#fa2742`
- Use these as border/glow colors on character cards.

## Code Conventions
- React functional components with hooks.
- Tailwind for utility classes, CSS variables for design tokens.
- Component files: PascalCase (e.g., `CharacterCard.tsx`).
- Shared layout shell in `/src/components/layout/AppShell.tsx`.
- Page components in `/src/pages/`.
- Reusable components in `/src/components/ui/`.

