# Design system — "Dark Graphite"

Tokens live in `apps/web/src/app/globals.css` (`@theme`). Components never use raw hex values.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | #101215 | page background |
| `sidebar` | #14171B | navigation |
| `surface` | #1A1E23 | inputs, panels |
| `card` | #20242A | cards |
| `raised` | #282D35 | menus, hover backgrounds |
| `line` | #30363F | borders |
| `fg` / `muted` / `faint` | #F1F2F4 / #A1A7B0 / #858D99 | text: primary, secondary, discreet |
| `accent` | #9AAEC9 | primary action, focus ring |
| `supervised` / `sampled` / `autonomous` / `danger` | amber / blue-grey / soft green / muted red | autonomy levels and errors only |

`faint` is lighter than the brief's #717985 so that small text keeps a 4.5:1 contrast on cards (WCAG AA). Colour carries meaning: status colours appear only where they inform.

## Type

Inter (variable) for text, JetBrains Mono for ids, hashes and evidence; both self-hosted through Fontsource, so no request leaves to Google. Body 14 px, numbers `tabular-nums`.

## Components

| Component | File | Notes |
| --- | --- | --- |
| Button, IconButton | `ui/primitives.tsx` | variants primary, secondary, ghost, danger; sizes sm (28 px) and md (36 px); `touch` grows to 44 px on phones; `loading` blocks double submits |
| Input, Textarea, Select, Checkbox, Field | `ui/primitives.tsx` | `Field` wires label, hint and error (`role=alert`) |
| Badge, Skeleton, Progress, Kbd, Card, CardHeader, Stat | `ui/primitives.tsx` | |
| Dialog, ConfirmDialog, DetailPanel, Dropdown, Tooltip, Popover | `ui/overlay.tsx` | Radix primitives: focus trap, Escape, ARIA |
| Toast, EmptyState, ErrorState, LoadingRows, DemoBanner | `ui/feedback.tsx` | `ErrorState` explains offline, forbidden and generic errors and offers Retry |
| DataTable, Pagination, Tabs | `ui/data.tsx` | tables collapse to cards under 768 px |
| AgentAvatar, AgentStatus, AutonomyLevel, LevelSteps, TaskStatusBadge, ReceiptStatus, VerificationReceipt, ApprovalCard, CostMetric, ActivityTimeline | `domain.tsx` | |
| Sidebar, AppShell, PageHeader, PageBody, CommandPalette | `shell/` | Ctrl/Cmd K opens the palette, Ctrl/Cmd B collapses the sidebar |
| AutonomyChart, AmountChart | `charts.tsx` | hand-made SVG with a hidden data table for screen readers |

`cx()` merges classes with `tailwind-merge`, so a caller's `w-40` reliably overrides a component's `w-full`.

## Rules

No gradients, no glass effects, no large shadows. One button family. Motion under 200 ms and disabled by `prefers-reduced-motion`. Every async action shows progress and cannot be submitted twice.
