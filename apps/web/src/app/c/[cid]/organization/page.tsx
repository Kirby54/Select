"use client";

import { ArrowLeft, ArrowRight, Maximize2, Minus, Network, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";

import { AgentFormDialog } from "@/components/agent-form";
import { AgentAvatar, AgentStatus, AutonomyLevel } from "@/components/domain";
import { PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { DetailPanel } from "@/components/ui/overlay";
import { Button, Field, IconButton, Select, cx } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { taskTypeLabel } from "@/lib/format";
import { useAction, useAgents, useCompany, useCompanyId } from "@/lib/queries";
import type { Agent, Level } from "@/lib/types";

const W = 208;
const H = 96;
const GX = 24;
const GY = 64;

interface Placed { agent: Agent; x: number; y: number }

/** Simple tidy-tree layout: each subtree gets the width of its children, parents are centred above them. */
function layout(agents: Agent[]): { nodes: Placed[]; edges: [Placed, Placed][]; width: number; height: number } {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const children = new Map<string, Agent[]>();
  const roots: Agent[] = [];
  for (const a of agents) {
    if (a.manager_id && byId.has(a.manager_id)) children.set(a.manager_id, [...(children.get(a.manager_id) ?? []), a]);
    else roots.push(a);
  }
  const sort = (list: Agent[]) => [...list].sort((p, q) => p.position - q.position || p.name.localeCompare(q.name));
  const widthOf = new Map<string, number>();
  const measure = (a: Agent): number => {
    const kids = sort(children.get(a.id) ?? []);
    const w = kids.length ? Math.max(W, kids.reduce((sum, k) => sum + measure(k), 0) + GX * (kids.length - 1)) : W;
    widthOf.set(a.id, w);
    return w;
  };
  const nodes: Placed[] = [];
  const edges: [Placed, Placed][] = [];
  let maxDepth = 0;
  const place = (a: Agent, left: number, depth: number): Placed => {
    maxDepth = Math.max(maxDepth, depth);
    const w = widthOf.get(a.id) ?? W;
    const node = { agent: a, x: left + (w - W) / 2, y: depth * (H + GY) };
    nodes.push(node);
    let cursor = left;
    for (const kid of sort(children.get(a.id) ?? [])) {
      const child = place(kid, cursor, depth + 1);
      edges.push([node, child]);
      cursor += (widthOf.get(kid.id) ?? W) + GX;
    }
    return node;
  };
  let offset = 0;
  for (const root of sort(roots)) {
    measure(root);
    place(root, offset, 0);
    offset += (widthOf.get(root.id) ?? W) + GX * 2;
  }
  return { nodes, edges, width: Math.max(offset - GX * 2, W), height: (maxDepth + 1) * (H + GY) - GY };
}

const LEVEL_RANK: Record<Level, number> = { supervised: 0, sampled: 1, autonomous: 2 };

function bestLevel(a: Agent): Level | null {
  if (a.trust.length === 0) return null;
  return a.trust.reduce<Level>((best, t) => (LEVEL_RANK[t.level] > LEVEL_RANK[best] ? t.level : best), "supervised");
}

export default function OrganizationPage() {
  const cid = useCompanyId();
  const company = useCompany(cid);
  const agents = useAgents(cid);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState({ x: 24, y: 24, k: 1 });
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const canAdmin = company.data && ["owner", "admin"].includes(company.data.role);

  const tree = useMemo(() => layout(agents.data ?? []), [agents.data]);

  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el || tree.nodes.length === 0) return;
    const k = Math.min(1.1, Math.max(0.35, Math.min((el.clientWidth - 48) / tree.width, (el.clientHeight - 48) / tree.height)));
    setView({ k, x: (el.clientWidth - tree.width * k) / 2, y: 24 });
  }, [tree]);
  useEffect(() => { fit(); }, [fit]);

  const reorder = useAction(cid, (items: { id: string; manager_id: string | null; position: number }[]) =>
    api(`/companies/${cid}/org/reorder`, { method: "POST", body: items }), { success: "Organization saved" });

  const zoom = (factor: number) => setView((v) => ({ ...v, k: Math.min(2, Math.max(0.3, v.k * factor)) }));
  const onPointerDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent) => {
    if (!drag.current) return;
    const d = drag.current;
    setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  };
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setView((v) => ({ ...v, k: Math.min(2, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.1 : 0.9))) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const agent = agents.data?.find((a) => a.id === selected);
  const siblings = agent ? (agents.data ?? []).filter((a) => a.manager_id === agent.manager_id).sort((p, q) => p.position - q.position) : [];
  const move = (direction: -1 | 1) => {
    if (!agent) return;
    const index = siblings.findIndex((s) => s.id === agent.id);
    const swap = siblings[index + direction];
    if (!swap) return;
    reorder.mutate(siblings.map((s, i) => ({
      id: s.id,
      manager_id: s.manager_id,
      position: s.id === agent.id ? index + direction : s.id === swap.id ? index : i,
    })));
  };
  const isDescendant = (candidate: Agent, of: Agent): boolean => {
    let current: Agent | undefined = candidate;
    const byId = new Map((agents.data ?? []).map((a) => [a.id, a]));
    while (current) {
      if (current.id === of.id) return true;
      current = current.manager_id ? byId.get(current.manager_id) : undefined;
    }
    return false;
  };

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      <PageHeader
        title="Organization"
        description="Who reports to whom, which model holds each role, and how much autonomy each has earned."
        actions={canAdmin && <Button size="sm" variant="primary" icon={<UserPlus className="size-3.5" aria-hidden />} onClick={() => setCreating(true)}>Add agent</Button>}
      />
      {agents.isPending ? <LoadingRows /> : agents.isError ? <ErrorState error={agents.error} retry={() => void agents.refetch()} /> :
        agents.data.length === 0 ? (
          <EmptyState icon={<Network />} title="No organization yet" description="Add a first agent; the others will report to it or to each other."
            action={canAdmin ? <Button size="sm" variant="primary" onClick={() => setCreating(true)}>Add agent</Button> : undefined} />
        ) : (
          <div className="relative min-h-0 flex-1">
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-md border border-line bg-card p-1">
              <IconButton label="Zoom out" onClick={() => zoom(0.85)}><Minus className="size-4" aria-hidden /></IconButton>
              <span className="w-10 text-center text-2xs text-muted tabular" aria-live="polite">{Math.round(view.k * 100)} %</span>
              <IconButton label="Zoom in" onClick={() => zoom(1.15)}><Plus className="size-4" aria-hidden /></IconButton>
              <IconButton label="Fit to screen" onClick={fit}><Maximize2 className="size-4" aria-hidden /></IconButton>
            </div>
            <div
              ref={viewport}
              className="h-full cursor-grab touch-none overflow-hidden bg-[radial-gradient(circle,var(--color-line)_1px,transparent_1px)] [background-size:24px_24px] active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => { drag.current = null; }}
              role="application"
              aria-label="Organization chart. Drag to move, Ctrl and scroll to zoom. Use Tab to move between agents."
            >
              <div className="relative origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: tree.width, height: tree.height }}>
                <svg className="pointer-events-none absolute inset-0 overflow-visible" width={tree.width} height={tree.height} aria-hidden>
                  {tree.edges.map(([p, c]) => {
                    const x1 = p.x + W / 2, y1 = p.y + H, x2 = c.x + W / 2, y2 = c.y, my = y1 + GY / 2;
                    return <path key={c.agent.id} d={`M${x1} ${y1} V${my} H${x2} V${y2}`} fill="none" stroke="var(--color-line-strong)" strokeWidth="1.25" />;
                  })}
                </svg>
                {tree.nodes.map(({ agent: a, x, y }) => {
                  const level = bestLevel(a);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelected(a.id)}
                      className={cx(
                        "absolute flex flex-col rounded-lg border bg-card p-3 text-left transition-colors hover:border-line-strong",
                        selected === a.id ? "border-accent" : "border-line",
                        a.status !== "active" && "opacity-60",
                      )}
                      style={{ left: x, top: y, width: W, height: H }}
                      aria-label={`${a.name}, ${a.role}${level ? `, best licence ${level}` : ""}`}
                    >
                      <span className="flex items-center gap-2.5">
                        <AgentAvatar name={a.name} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-fg">{a.name}</span>
                          <span className="block truncate text-xs text-muted">{a.role}</span>
                        </span>
                      </span>
                      <span className="mt-auto flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-2xs text-faint">{a.provider ? a.model : a.is_demo_agent ? "recorded" : "no model"}</span>
                        {level && <AutonomyLevel level={level} compact />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      <DetailPanel open={!!agent} onOpenChange={(o) => !o && setSelected(null)} title={agent?.name ?? ""} subtitle={agent?.role}
        actions={agent && <Link href={`/c/${cid}/agents/${agent.id}`} className="text-xs text-accent hover:text-accent-strong">Open agent page</Link>}>
        {agent && (
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-2"><AgentStatus agent={agent} />{agent.provider && <span className="font-mono text-xs text-muted">{agent.provider}/{agent.model}</span>}</div>
            {canAdmin && !agent.is_demo_agent && (
              <div className="space-y-3 rounded-lg border border-line p-4">
                <Field label="Reports to" htmlFor="org-manager" hint="Saved immediately. A loop in the hierarchy is refused.">
                  <Select id="org-manager" value={agent.manager_id ?? ""} disabled={reorder.isPending}
                    onChange={(e) => reorder.mutate([{ id: agent.id, manager_id: e.target.value || null, position: agent.position }])}>
                    <option value="">Nobody (top)</option>
                    {(agents.data ?? []).filter((m) => m.id !== agent.id && !isDescendant(m, agent)).map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
                  </Select>
                </Field>
                <div className="flex gap-2">
                  <Button size="sm" icon={<ArrowLeft className="size-3.5" aria-hidden />} disabled={siblings[0]?.id === agent.id || reorder.isPending} onClick={() => move(-1)}>Move left</Button>
                  <Button size="sm" disabled={siblings.at(-1)?.id === agent.id || reorder.isPending} onClick={() => move(1)}>Move right <ArrowRight className="size-3.5" aria-hidden /></Button>
                </div>
              </div>
            )}
            <section>
              <h3 className="mb-2 text-xs font-medium text-muted">Autonomy by task type</h3>
              <ul className="space-y-2">
                {agent.task_types.map((type) => {
                  const t = agent.trust.find((x) => x.task_type === type);
                  return (
                    <li key={type} className="flex items-center justify-between text-sm">
                      <span>{taskTypeLabel(type)}</span>
                      <AutonomyLevel level={t?.level ?? "supervised"} frozen={t?.frozen} />
                    </li>
                  );
                })}
                {agent.task_types.length === 0 && <li className="text-sm text-muted">No task type allowed.</li>}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-medium text-muted">Permissions</h3>
              <p className="text-sm text-muted">{agent.permissions.length ? agent.permissions.join(", ") : "None"}. Sending, paying or signing is never a permission: the server enforces approvals.</p>
            </section>
          </div>
        )}
      </DetailPanel>
      <AgentFormDialog cid={cid} open={creating} onOpenChange={setCreating} />
    </div>
  );
}
