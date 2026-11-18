# ScreenIQ — Design Spec (v3 "Signal")

**Direction:** a premium, calm SaaS *workspace* for technical recruiters and hiring managers, in the
family of Linear, Vercel, Raycast and Stripe Dashboard. It is a **tool**, not a marketing site.
Identity comes from one confident **indigo → violet** brand, a crafted logo mark, layered depth and
tight display typography — never from decoration.

Source of truth: `src/app/globals.css` (tokens + global primitives) and `src/components/common.tsx`
(shared React primitives). Page styles live in a CSS module next to the page/component and use
**tokens only**.

---

## 1. Principles
1. **Quiet chrome, colour for meaning.** Neutrals + one brand accent. Green / amber / red appear only
   for scores, verdicts and alerts.
2. **Brand gradient is a spice.** `--brand-gradient` is allowed only on: logo, active nav indicator,
   primary CTA (via `--cta-*`), the *one* accent card per view (`.card.accent`), active/complete step
   markers, the single hero metric of a page, and selected-state bars. Never on large backgrounds,
   body text, or more than ~3 places per screen.
3. **Depth has an order:** canvas (`--bg` + atmosphere) < card (`--shadow-card`) < raised
   (`--shadow-md`) < popover/modal (`--shadow-lg`). Don't skip levels or stack shadows.
4. **Use the width.** Content is left-aligned next to the sidebar (`.page`, max 1600px, no auto side
   margins). Fill it with balanced grids (main + aside), not a narrow centred column.
5. **8px grid.** Spacing 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48. Card padding 20–24 px, section
   padding 24–28 px.
6. **Every state is designed:** loading (skeletons shaped like the content), empty, error, success,
   busy. Busy states show progress (indeterminate bar + live step list), not just a spinner.
7. **Numbers are data:** `.nums` (tabular figures), right-aligned numeric columns, units always
   ("6.8 / 10", "21 s"). Big numbers use the display face (`.kpi-value`).
8. **Accessible:** real `<button>`s, `aria-*` on custom controls, visible focus ring, contrast ≥ 4.5:1
   for text (`--faint` is for meta/placeholder only), works at 390 px, `prefers-reduced-motion`
   honoured globally.

## 2. Tokens (never hard-code colours)

### Typography
| Token | Use |
|---|---|
| `--font-sans` (Inter) | All UI text. Body 14px / 1.55. Secondary 13px, meta 12px. |
| `--font-display` (Inter Tight) | `h1`, `h2`, KPI values, score numbers, wordmark. Auto-applied to `h1/h2`. |
| `--font-mono` | Code, IDs. |

Scale: `h1` 26/34 600 (22 on mobile) · `h2` 18/26 · `h3` 14/20 · `h4` 13/18 · KPI value 28/34.

### Surfaces & text
| Token | Use |
|---|---|
| `--bg` | Canvas |
| `--bg-subtle` | Sidebar, mobile bar |
| `--surface` | Cards, inputs, popovers |
| `--surface-2` | Inset areas, table heads, card footers |
| `--surface-3` | Tracks, chips, segmented background |
| `--surface-hover` | Hover fill |
| `--border` / `--border-strong` | Hairlines / inputs + outline buttons |
| `--text` / `--text-2` / `--muted` / `--faint` | Primary / body / secondary / meta only |

### Brand & accent
| Token | Use |
|---|---|
| `--primary` | Accent text, icons, focus, links (in dark it is a light indigo) |
| `--primary-fg` | Text on a solid `--primary` fill |
| `--primary-hover` | Link hover |
| `--primary-soft`, `--primary-soft-2` | Tinted backgrounds (selected rows, chips) |
| `--primary-border` | Border of tinted elements |
| `--primary-ring` | Focus / live glow ring |
| `--brand-1/2/3`, `--brand-gradient` | Logo, indicators (see rule 2) |
| `--brand-gradient-soft` | Very light brand wash (selected file row, brand alert, dropzone hover) |
| `--cta-bg`, `--cta-bg-hover`, `--cta-fg`, `--cta-glow` | Primary button only |
| `--violet` | Secondary accent text (rare) |

### Status (meaning only)
`--good|warn|bad` text · `--*-strong` fills (bars, rings, dots) · `--*-soft` backgrounds ·
`--info`, `--info-soft`.

### Charts
Categorical order: `--chart-1` indigo, `--chart-2` sky, `--chart-3` violet, `--chart-4` teal,
`--chart-5` amber. `--chart-grid` for gridlines, `--chart-axis` for axis labels (11px, class
`.chart-axis` on SVG text). Scores on charts use status colours via `scoreTone()`.

### Shape, depth, motion, layout
- Radii: `--radius-xs` 6 · `--radius-sm` 8 · `--radius` 10 (controls, inner panels) ·
  `--radius-lg` 14 (cards) · `--radius-xl` 18 · `--radius-full`.
- Shadows: `--shadow-xs` (inputs) · `--shadow-card` (cards) · `--shadow-sm` (raised controls, active
  segment) · `--shadow-md` (hover-raised cards, icon tiles) · `--shadow-lg` (popovers, menus).
  `--highlight` = 1px inner top highlight for raised controls.
- Motion: `--dur` 160ms, `--ease`. Hover/colour transitions 150–200 ms; meters 0.5–0.7 s.
- Layout: `--sidebar-w` 264px, `--content-max` 1600px.

Dark mode is tuned, not inverted: cool near-black canvas, lifted surfaces, softer borders, brighter
`--primary`, glowing CTA. Toggle sets `html[data-theme]`; tokens switch automatically, so modules
never need dark overrides.

## 3. App shell
- **Sidebar** (`Sidebar.tsx` + `Sidebar.module.css`): logo → nav (`New screening`, `Sessions` with
  count) → **Knowledge base card** ("6 of 7 books indexed · 4,998 passages", progress bar, "View books
  by role" disclosure grouped by the 3 roles) → footer (live system status dot + Light/Dark segmented
  toggle). Active nav = raised item + gradient indicator bar on the left edge.
- **Mobile (≤ 900px):** sticky blurred top bar with logo, New / Sessions (with `aria-current`),
  theme button. `.app` switches to a column.
- **Canvas:** `.main::before` paints a soft brand glow + faint 32px grid that fades out under the
  header. Pages do nothing to get it.
- **Content:** `.page` — left-aligned, max 1600px, padding 32/40 (48 ≥ 1440px, 16 on mobile).

## 4. Page-header pattern
Every page starts with `<PageHeader>`:
```tsx
<PageHeader
  crumbs={[{ label: "Sessions", href: "/sessions" }, { label: name }]}  // detail pages
  eyebrow={<><Sparkles size={13} /> AI technical screening</>}           // optional, brand-coloured
  icon={<FileText size={18} />}                                          // optional title icon tile
  title="New screening"
  subtitle="One sentence of value, ≤ 2 lines."
  actions={<Link className="btn btn-primary" …>…</Link>}                 // one primary max
/>
```
Session pages render `<Stepper current={n} />` (pill progress) above the header. The setup page uses
`current={0}` so the lifecycle reads as one wizard.

## 5. Primitives (global classes — reuse, don't re-invent)
- **Layout:** `.grid .grid-2|3|4`, `.stack|.stack-sm|.stack-lg`, `.row(.nowrap)`, `.col`, `.spacer`.
  Main + aside: `grid-template-columns: minmax(0,1fr) 320px` in your module; collapse ≤ 1080px.
  Prefer **container queries** inside cards whose width depends on an aside.
- **Card:** `.card` + `.card-header` (`h3` + optional `.desc`, actions right) + `.card-body` +
  `.card-footer`. Modifiers: `.accent` (gradient top hairline — max one per view), `.raised`,
  `.interactive` (hover lift for clickable cards), `.inset` (flat, `--surface-2`).
- **Buttons:** `.btn` + `.btn-primary|secondary|ghost|danger`, sizes `.btn-sm|.btn-lg|.btn-icon`.
  `.kbd` for keyboard hints.
- **Badges** (pill): `.badge` neutral · `.primary` · `.brand` (solid gradient, rare) · `.good|warn|bad`
  · `.outline` · `.square` · `.badge .dot`. **Tags:** `.tag`, `.tag.primary`.
- **Status dot:** `.status-dot.good|warn|bad` (+ `.live` for a pulse).
- **Forms:** `.label` (+ `.optional` span), `.input` (also textarea), `.input-group` (leading icon),
  `.hint`, `.segmented` (`.active` or `aria-checked/selected="true"`), `.switch`.
- **Feedback:** `.alert.error|warn|info|success|brand`, `.spinner(.light)`, `.skeleton` (+ `.text`,
  `.circle`), `.progress` (gradient fill; `.thin`, `.indeterminate`), `.empty-state`.
- **Data display:** `table.table` in `.table-wrap` (`th.right/td.right` for numbers) · `.dl` ·
  `.meter` (fill colour = status via inline style) · `.difficulty(.lg)` · `.avatar(.sm|.lg|.brand)` ·
  `.icon-tile` (+ `.primary|brand|raised|good|warn|bad`) · `.section-label` (uppercase eyebrow) ·
  `.divider`.
- **Patterns:** KPI tiles `.kpi-grid > .kpi` (`.kpi-label`, `.kpi-value`, `.kpi-unit`, `.kpi-delta`);
  vertical timeline `ol.timeline > li.tl-item.done|active|pending > .tl-marker`; chart legend
  `.legend > .legend-item > .swatch`; `.text-gradient` (logo / one hero number only).
- **Motion:** `.fade-in` on mount, `.stagger` on a list container for a 40 ms cascade.

### Shared React components (`src/components/common.tsx` — import, don't copy)
`PageHeader` (now also `eyebrow`, `icon`), `Logo`, `LogoMark`, `Kpi`, `EmptyState`, `ScoreRing`
(soft halo, display numerals), `ScoreBadge`, `Meter`, `Difficulty`, `Sources`, `ErrorAlert`,
`PageLoader` (page-shaped skeleton), `Spinner`; helpers `scoreTone`, `initials`, `formatDuration`,
`QUESTION_TYPE_LABEL`, `VERDICT_LABEL`.

### Role picker
`RoleSelect` is a compact listbox dropdown showing **role names only** (client requirement — no
descriptions or counts inside it). Put the "Questions from: …" hint under it, outside the dropdown.

## 6. Page rules
- **Never** a marketing hero, giant gradient headline or feature grid inside the app.
- **Icons:** lucide 14–16px (18 in tiles), `currentColor`. Icon tiles anchor sections, KPIs, empty
  states and timelines — not every line.
- **Charts:** plain SVG, 1px gridlines `--chart-grid`, 11px `--chart-axis` labels, 2px lines, bars
  with radius 3, legend in the card header.
- **Page-specific styles** go in a CSS module next to the component, tokens only. Do not edit
  `globals.css` — ask the lead for new primitives.

### Do / Don't
| Do | Don't |
|---|---|
| One `.btn-primary` per view | Two gradient buttons side by side |
| `.card.accent` on the main working card | Accent hairline on every card |
| Status colours for scores/verdicts | Green/red as decoration |
| Skeletons shaped like the final layout | Centred spinner on a blank page |
| Fill the width with main + aside grids | Narrow centred column with empty bands |
| `color-mix()` with tokens for tints | New hex values in modules |

## 7. Backwards compatibility (v2 → v3)
All v2 class names still work: `.sidebar`, `.sidebar-brand`, `.brand-mark`, `.sidebar-section`,
`.nav-item(.active) .count`, `.sidebar-footer`, `.kb-item` (legacy, unused by the new sidebar),
`.mobile-bar`, `.page`, `.page-header .titles|.subtitle|.actions`, `.breadcrumb`, `.stepper`, `.step`,
`.step-sep`, every primitive and utility listed in v2. `--shadow-xs/sm/md/lg`, `--chart-1/2`,
`--chart-grid` keep their meaning.

## 8. Voice
Short, precise, product-like copy: "New screening", "Analyse resume", "Submit answer", "End
interview", "Export PDF". No exclamation marks. Sentence case everywhere.
