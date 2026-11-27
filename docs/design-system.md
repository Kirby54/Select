# Design system — SELECT Desert Edition

Pure black, hairlines and one violet accent (the look of the Whale journal), with a live 3D scene behind the app and
Apple-style liquid glass on every panel. Tokens live in [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css)
(`@theme`). Components never use raw hex values; three.js palettes are data, kept next to the scene code.

## The scene and the glass

- **Scene** (`components/pyramid-scene.tsx`, mounted once by `components/scene-backdrop.tsx`): three Giza-like pyramids of
  particles, coloured by height from orange (apex) to violet (base), with bright ridges; white sand carried by the wind, which
  always blows left to right on screen; dunes and stars. It turns at Whale's pace (0.072 rad/s) and keeps moving even with
  reduced motion, at the owner's request. Full strength on Home; dimmed to 32 %, 1x resolution and 30 fps behind other pages;
  hidden on the org chart, which draws its own 3D pyramid. If the machine stays under ~40 fps, it drops to 1x by itself.
- **Legend**: the Home legend lists task statuses; hovering a row lights that layer of the pyramids in its status colour.
- **Glass** (`.glass`, style *liquid-glass* from UI UX Pro Max): a 22 % dark tint, 5–7 px blur with saturation, a specular
  rim, and on Home only an SVG lens (`#liquid-lens`, Chromium and the desktop window; other browsers keep the blur). Outside
  Home the tint rises to 58 % and the blur to 16 px so text keeps 4.5:1. `.glass-menu` (74 % tint, 30 px blur) is for menus,
  dialogs, side panels, the palette and toasts. `.glass-bar` is the sidebar and top bar.
- **Light from the pointer** (`components/liquid-glass.tsx`): the rim of every glass panel lights up on the side nearest the
  mouse, even before the pointer is over it.
- **Reduced transparency**: with `prefers-reduced-transparency`, every glass surface becomes opaque.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | black 50 % (the page itself is #000) | backgrounds that let the scene through |
| `surface` / `card` | rgb(14 14 18) at 50 % | panels without the glass class |
| `surface-2` | white 6 % | fields, segmented controls, table group headers |
| `raised` | rgb(26 26 32) at 86 % | small floating chips |
| `line` / `line-soft` / `line-strong` / `line-control` | #1F1F1F / #161616 / #2A2A2A / #3A3A3A | borders, separators, the search box |
| `fg` / `muted` / `faint` | #DCDDDE / #999999 / #8A8A8A | text: primary, secondary, tertiary |
| `ghost` | #666666 | disabled and decorative marks only |
| `accent` / `accent-strong` | #A68BFF / #C4B5FF | primary action, focus ring, selection |
| `nav` / `nav-active` / `brand-sub` | #E6E6E6 / #F87171 / #CFCFCF | sidebar links, the red bar on the current page, the light word of the brand |
| `live` | #4ADE80 | "agents running now" pulse |
| `supervised` / `sampled` / `autonomous` | #D29922 / #58A6FF / #3FB950 | autonomy levels only |
| `danger` | #F85149 | failures, demotions, destructive actions |
| `window-close` | #C42B1C | close button of the desktop title bar |

Measured contrast (WCAG 2.2 AA): `fg` ≥ 12.6:1, `muted` ≥ 5.3:1 and `faint` ≥ 4.5:1 on every surface. The brief's tertiary grey
`#707077` measures 3.4:1 on cards, so it is kept as `ghost` for non-text marks. Supervised and autonomous have almost the same
lightness, so a level is **never** shown by colour alone: it always comes with its label and the 1-2-3 `LevelMeter`.

## Type

Inter (variable, self-hosted) for every word; the system monospace (SF Mono, Menlo, Consolas…) for task keys, ids, hashes and
evidence. One weight per job:

| Weight | Use |
| --- | --- |
| Bold 700 | Big titles: page titles in the top bar, set-up and sign-in headings, the large figures |
| SemiBold 600 | Card titles and section headings |
| Regular 400 | Descriptions and body text |
| Medium 500 | Buttons, tabs, navigation rows and badges |

Sizes: body 14 px; navigation and dense rows 13 px (`text-compact`); labels 12 px; badges 11 px (`text-micro`); section labels
10 px in capitals with wide tracking (`text-nano`, monospace). Page titles of the six places are set in capitals with
`tracking-wider`; a detail page (a task, an agent) shows its own name in normal case after a breadcrumb. Every number is
`tabular-nums`.

## Space, radius, depth

4/8 px rhythm: rows 36 px (48 px when two lines), controls 28/32/36 px, page gutters 16 px (phone) and 24 px (desktop).
Radii: badges 6 · small buttons and menu items 8 · fields and buttons 9 · cards 12 · dialogs and sheets 16.
Cards have a 1 px line and a 1 px inner top sheen, no shadow. Only overlays float: a hairline ring plus a soft dark shadow.

## Motion

| Token | Value | Where |
| --- | --- | --- |
| hover | 120 ms ease-out | colour changes, row highlights |
| menus | 180 ms `--ease-out`, leave 120 ms | dropdowns, popovers, palette, dialogs (`pop-in`) |
| panels | 300 ms `--ease-spring` | inspector sheets, mobile drawer, org chart fit and zoom |
| springs | CSS `linear()` curves generated from a damped spring (k = 300, ζ = 0.82) | no animation library |

Things arrive slower than they leave. `prefers-reduced-motion` turns every animation and transition off.

## Components

| Component | File | Notes |
| --- | --- | --- |
| Button, IconButton | `ui/primitives.tsx` | primary, secondary, ghost, danger, link; sm/md/lg; `touch` = 44 px on phones; `loading` blocks double submits |
| Input, Textarea, Select, Checkbox, Switch, Segmented, Field | `ui/primitives.tsx` | native controls restyled; `Switch` is a real `role="switch"`, `Segmented` a radiogroup with arrow keys |
| Badge, DemoTag, StatusDot, Spinner, Skeleton, Progress, Kbd, Card, CardHeader, Stat | `ui/primitives.tsx` | `DemoTag` marks every figure that includes recorded demo data |
| Dialog, ConfirmDialog, DetailPanel, Dropdown, Tooltip, Popover | `ui/overlay.tsx` | Radix: focus trap, Escape, ARIA. `ConfirmDialog` can require typing a value (high-risk approvals) |
| Toast, EmptyState, ErrorState, LoadingRows, DemoBanner | `ui/feedback.tsx` | errors explain offline, forbidden and generic cases with Retry |
| DataTable, Pagination, Tabs | `ui/data.tsx` | table from 768 px, cards below; one layout mounted at a time |
| AgentAvatar, AgentStatus, AutonomyLevel, LevelMeter, LevelSteps, LicenceLadder, LicenceNextStep | `domain.tsx` | autonomy reads without colour |
| StatusIcon, TaskStatusBadge, PriorityIcon | `domain.tsx` | Linear-style glyphs on one 14 px grid |
| VerificationReceipt, ReceiptStatus | `domain.tsx` | plain-language checks; failed evidence open by default; "Technical view" shows hashes and raw evidence |
| ApprovalCard | `domain.tsx` | who asks, why you, checks, what happens after approval, exact content |
| ActivityTimeline, CostMetric | `domain.tsx` | |
| TaskWeek, AutonomyChart, AmountChart | `charts.tsx` | hand-made SVG/HTML with a hidden data table for screen readers |
| Sidebar, AppShell, PageHeader, PageBody, CommandPalette | `shell/` | page title and actions live in the 48 px topbar |

## Navigation and keyboard

Six places in the sidebar: Home, Approvals, Tasks, Messages (shown once a mailbox is connected), Team, Settings, after a
**New task** button. Every other page belongs to a place: Tasks shows Routines, Projects and Goals as tabs; Team shows the org
chart, Agents and Autonomy; Settings links Connections, Costs, Verification and the activity log; Home links the inbox and
the activity log. Below the places, the agents (an icon for their role, a blue pulse while one works) and the open projects
(a colour dot each, which filters Tasks). Under 1024 px the sidebar becomes a drawer and phones get a tab bar (Home,
Approvals, Tasks, Messages or Team, More).

Agents get an icon from their role, read in English, French or German (a crown for a CEO, a chip for a CTO, angle brackets
for a developer, a headset for support…); unknown roles keep their initials. Projects get one of eight colours from their
id, always next to their name, never colour alone.

`Ctrl/⌘ K` palette · `Ctrl/⌘ B` sidebar · `C` new task · `G` then a letter to jump (H home, A approvals, T tasks, M messages,
O org chart, E agents, U autonomy, R routines, P projects, I inbox, Y activity, C costs, V verification, N connections,
S settings) · `J`/`K` or arrows to move, `Enter` to preview, `O` to open, `/` to search · `?` lists all shortcuts.

## Accessibility

Skip link; visible 2 px focus ring; one `h1` per page; icon-only controls named; status and level never by colour alone;
dialogs trap focus and return it; drag and drop in the org chart has a select-and-buttons alternative; web targets ≥ 24 px and
main phone actions 44 px; fixed bars never cover focused content; reduced motion respected.

## Rules

No gradients, no glows, no glass except the scrim behind overlays and the palette. One primary action per screen.
Colour only where it carries meaning. Every async action shows progress and cannot be submitted twice. Numbers from demo data
are tagged "Demo".
