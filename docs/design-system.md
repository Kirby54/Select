# Design system — SELECT Graphite Edition

A dark graphite interface that should feel like a native desktop app: calm, dense where work happens, precise everywhere.
Tokens live in [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css) (`@theme`). Components never use raw hex values.

## How it was chosen

The direction was researched with the **UI UX Pro Max** skill (data pinned at commit `623a9a9`), then adapted to Select:

| Skill result | Decision |
| --- | --- |
| Design-system generator: glassmorphism, blue + orange palette, Plus Jakarta Sans | **Rejected.** It targets marketing pages and contradicts the brief (no electric blue, no glass everywhere). |
| Style search: *Minimalism & Swiss Style* (enterprise apps, one accent, no decoration) | **Adopted** as the base. |
| Style search: *Data-Dense Dashboard* (8–12 px padding, ~36 px rows) | **Adopted** for tables, lists and the status strip. |
| Style search: *Dark Mode (OLED)* | Dark only; its neon glows **rejected**. |
| Typography: *Minimal Swiss* pairing (Inter only, weights for hierarchy) | **Adopted**, self-hosted, so no request leaves to Google. |
| Chart guidance: waffle / unit chart for a share of a whole | **Adopted** as `TaskWeek`, the signature autonomy view. |
| UX rules: skip link, visible focus, reduced motion, confirmation of irreversible actions, deep links, 24 px web targets | **Applied**, see Accessibility. |
| Pro-rules checklist (written for native mobile) | Used for the phone layout: tab bar, 44 px main actions, no content under fixed bars. |

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | #111214 | app background |
| `sidebar` | #161719 | navigation |
| `surface` | #1B1D20 | cards, panels, sheets |
| `surface-2` | #222428 | fields, segmented controls, table group headers |
| `raised` | #2A2D32 | menus, popovers, tooltips, toasts |
| `line` / `line-soft` / `line-strong` | #303238 / #26282C / #3E4148 | card borders / row separators / field hover |
| `fg` / `muted` / `faint` | #F5F5F7 / #A1A1A6 / #94949B | text: primary, secondary, tertiary |
| `ghost` | #707077 | disabled and decorative marks only |
| `accent` / `accent-strong` | #A5B4C8 / #BCC8D8 | primary action, focus ring, selection |
| `supervised` / `sampled` / `autonomous` | #D9B26A / #7DB4C8 / #7CC59E | autonomy levels only |
| `danger` | #ED948C | failures, demotions, destructive actions |
| `hover` / `press` / `selected` | white 4.5 % / white 7.5 % / accent 14 % | interaction layers valid on any surface |

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
