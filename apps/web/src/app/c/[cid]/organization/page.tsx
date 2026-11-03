"use client";

import { ArrowLeft, ArrowRight, Maximize2, Minus, Move, Network, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";

import { AgentFormDialog } from "@/components/agent-form";
import { AgentAvatar, AgentStatus, AutonomyLevel, LEVEL_LABEL, LevelMeter, providerLabel } from "@/components/domain";
import { PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { DetailPanel } from "@/components/ui/overlay";
import { Button, Field, IconButton, Select, cx } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { taskTypeLabel } from "@/lib/format";
import { useAction, useAgents, useCompany, useCompanyId } from "@/lib/queries";
import type { Agent, Level } from "@/lib/types";

const W = 240;
const H = 108;
const GX = 28;
const GY = 72;

interface Placed { agent: Agent; x: number; y: number }

/** Tidy tree: each subtree is as wide as its children, parents are centred above them. */
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

/** Orthogonal connector with softened corners. */
function connector(p: Placed, c: Placed): string {
  const x1 = p.x + W / 2, y1 = p.y + H, x2 = c.x + W / 2, y2 = c.y, my = y1 + GY / 2;
  if (Math.abs(x2 - x1) < 1) return `M${x1} ${y1} V${y2}`;
  const r = Math.min(10, Math.abs(x2 - x1) / 2);
  const s = x2 > x1 ? 1 : -1;
  return `M${x1} ${y1} V${my - r} Q${x1} ${my} ${x1 + s * r} ${my} H${x2 - s * r} Q${x2} ${my} ${x2} ${my + r} V${y2}`;
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
  const [creating, setCreating] = useState<{ manager?: string } | null>(null);
  const [view, setView] = useState({ x: 24, y: 24, k: 1 });
  const [panning, setPanning] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; active: boolean; target: string | null; sx: number; sy: number } | null>(null);
  const justDragged = useRef(false);
  const canAdmin = !!company.data && ["owner", "admin"].includes(company.data.role);

  const list = useMemo(() => agents.data ?? [], [agents.data]);
  const byId = useMemo(() => new Map(list.map((a) => [a.id, a])), [list]);
  const tree = useMemo(() => layout(list), [list]);

  const isDescendant = useCallback((candidate: Agent, of: Agent): boolean => {
    let current: Agent | undefined = candidate;
    while (current) {
      if (current.id === of.id) return true;
      current = current.manager_id ? byId.get(current.manager_id) : undefined;
    }
    return false;
  }, [byId]);

  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el || tree.nodes.length === 0) return;
    const k = Math.min(1.05, Math.max(0.35, Math.min((el.clientWidth - 64) / tree.width, (el.clientHeight - 96) / tree.height)));
    setView({ k, x: (el.clientWidth - tree.width * k) / 2, y: Math.max(32, (el.clientHeight - tree.height * k) / 2 - 16) });
  }, [tree]);
  useEffect(() => { fit(); }, [fit]);

  const reorder = useAction(cid, (items: { id: string; manager_id: string | null; position: number }[]) =>
    api(`/companies/${cid}/org/reorder`, { method: "POST", body: items }), { success: "Organization saved" });

  const zoom = (factor: number) => setView((v) => ({ ...v, k: Math.min(2, Math.max(0.3, v.k * factor)) }));
  const onCanvasDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    setPanning(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onCanvasMove = (e: RPointerEvent) => {
    if (!pan.current) return;
    const d = pan.current;
    setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  };
  const onCanvasUp = () => { pan.current = null; setPanning(false); };
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) setView((v) => ({ ...v, k: Math.min(2, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.08 : 0.92))) }));
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [agents.data]);

  // Drag a post onto another to change who it reports to. The panel's "Reports to" field is the keyboard path.
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      setDrag((d) => {
        if (!d) return d;
        const active = d.active || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6;
        const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-agent-id]")?.dataset.agentId ?? null;
        const moving = byId.get(d.id);
        const target = over && moving && over !== d.id && !isDescendant(byId.get(over)!, moving) ? over : null;
        return { ...d, x: e.clientX, y: e.clientY, active, target };
      });
    };
    const onUp = () => {
      setDrag((d) => {
        if (d?.active) {
          justDragged.current = true;
          const moving = byId.get(d.id);
          if (d.target && moving && d.target !== moving.manager_id) {
            const siblings = list.filter((a) => a.manager_id === d.target);
            reorder.mutate([{ id: d.id, manager_id: d.target, position: siblings.length }]);
          }
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners live for one drag gesture
  }, [drag?.id]);

  const agent = selected ? byId.get(selected) : undefined;
  const siblings = agent ? list.filter((a) => a.manager_id === agent.manager_id).sort((p, q) => p.position - q.position) : [];
  const move = (direction: -1 | 1) => {
    if (!agent) return;
    const index = siblings.findIndex((s) => s.id === agent.id);
    const swap = siblings[index + direction];
    if (!swap) return;
    reorder.mutate(siblings.map((s, i) => ({ id: s.id, manager_id: s.manager_id, position: s.id === agent.id ? index + direction : s.id === swap.id ? index : i })));
  };

  // Chain of the selected post: its managers up to the top, and its direct reports.
  const highlighted = useMemo(() => {
    const ids = new Set<string>();
    if (!agent) return ids;
    let current: Agent | undefined = agent;
    while (current?.manager_id) { ids.add(current.id); current = byId.get(current.manager_id); }
    for (const a of list) if (a.manager_id === agent.id) ids.add(a.id);
    return ids;
  }, [agent, byId, list]);

  const focusAgent = (id: string | undefined) => { if (id) document.querySelector<HTMLElement>(`[data-agent-id="${id}"]`)?.focus(); };
  const onNodeKey = (e: KeyboardEvent, a: Agent) => {
    const kids = list.filter((x) => x.manager_id === a.id).sort((p, q) => p.position - q.position);
    const sibs = list.filter((x) => x.manager_id === a.manager_id).sort((p, q) => p.position - q.position);
    const i = sibs.findIndex((s) => s.id === a.id);
    const target = { ArrowUp: a.manager_id ?? undefined, ArrowDown: kids[0]?.id, ArrowLeft: sibs[i - 1]?.id, ArrowRight: sibs[i + 1]?.id }[e.key];
    if (e.key.startsWith("Arrow")) { e.preventDefault(); focusAgent(target); }
  };

  const draggingAgent = drag?.active ? byId.get(drag.id) : undefined;

  return (
    <div className="flex min-h-[520px] flex-1 flex-col">
      <PageHeader
        title="Organization"
        description="Who reports to whom, which model holds each post, and how much autonomy it has earned"
        actions={canAdmin && <Button size="sm" variant="primary" icon={<UserPlus className="size-3.5" aria-hidden />} onClick={() => setCreating({})}>Add agent</Button>}
      />
      {agents.isPending ? <LoadingRows /> : agents.isError ? <ErrorState error={agents.error} retry={() => void agents.refetch()} /> :
        list.length === 0 ? (
          <EmptyState icon={<Network />} title="No organization yet" description="Add a first agent; the others will report to it or to each other."
            action={canAdmin ? <Button size="sm" variant="primary" onClick={() => setCreating({})}>Add agent</Button> : undefined} />
        ) : (
          <div className="relative min-h-0 flex-1">
            <div className="absolute right-4 bottom-4 z-10 flex items-center gap-0.5 rounded-xl bg-raised/90 p-1 shadow-[var(--shadow-popover)] backdrop-blur-md">
              <IconButton label="Zoom out" onClick={() => zoom(0.85)}><Minus className="size-4" aria-hidden /></IconButton>
              <span className="w-11 text-center text-xs text-muted tabular" aria-live="polite">{Math.round(view.k * 100)} %</span>
              <IconButton label="Zoom in" onClick={() => zoom(1.15)}><Plus className="size-4" aria-hidden /></IconButton>
              <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
              <IconButton label="Fit to screen" onClick={fit}><Maximize2 className="size-4" aria-hidden /></IconButton>
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden items-center gap-3 rounded-lg bg-canvas/70 px-2.5 py-1.5 text-xs text-faint backdrop-blur-sm md:flex">
              <span className="inline-flex items-center gap-1.5"><Move className="size-3.5" aria-hidden />Drag the canvas to move, Ctrl + scroll to zoom</span>
              {canAdmin && <span>· Drag a post onto another to change its manager</span>}
            </div>
            <div
              ref={viewport}
              className={cx("h-full touch-none overflow-hidden bg-[radial-gradient(circle,rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:22px_22px]", panning ? "cursor-grabbing" : "cursor-grab")}
              onPointerDown={onCanvasDown}
              onPointerMove={onCanvasMove}
              onPointerUp={onCanvasUp}
              role="application"
              aria-label="Organization chart. Use Tab to reach a post, arrow keys to move between manager, reports and siblings, Enter to open it."
            >
              <div
                className={cx("relative origin-top-left", !panning && !drag && "transition-transform duration-[320ms] ease-spring")}
                style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: tree.width, height: tree.height }}
              >
                <svg className="pointer-events-none absolute inset-0 overflow-visible" width={tree.width} height={tree.height} aria-hidden>
                  {tree.edges.map(([p, c]) => {
                    const lit = highlighted.has(c.agent.id) && (c.agent.manager_id === p.agent.id);
                    return <path key={c.agent.id} d={connector(p, c)} fill="none" stroke={lit ? "var(--color-accent)" : "var(--color-line-strong)"} strokeOpacity={lit ? 0.9 : 1} strokeWidth={lit ? 1.75 : 1.25} />;
                  })}
                </svg>
                {tree.nodes.map(({ agent: a, x, y }) => {
                  const level = bestLevel(a);
                  const isSelected = selected === a.id;
                  const isTarget = drag?.target === a.id;
                  const draggable = canAdmin && !a.is_demo_agent;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      data-agent-id={a.id}
                      onClick={() => { if (justDragged.current) { justDragged.current = false; return; } setSelected(a.id); }}
                      onKeyDown={(e) => onNodeKey(e, a)}
                      onPointerDown={(e) => { if (draggable && e.button === 0) setDrag({ id: a.id, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, active: false, target: null }); }}
                      className={cx(
                        "absolute flex flex-col rounded-xl border bg-surface p-3 text-left shadow-[var(--shadow-sheen)] transition-[border-color,box-shadow,opacity] duration-[160ms]",
                        "hover:border-line-strong focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(165_180_200/0.35)]",
                        isSelected ? "border-accent/80 shadow-[0_0_0_3px_rgb(165_180_200/0.16)]" : "border-line",
                        isTarget && "border-accent shadow-[0_0_0_4px_rgb(165_180_200/0.25)]",
                        drag?.active && drag.id === a.id && "opacity-40",
                        a.status !== "active" && "opacity-60",
                      )}
                      style={{ left: x, top: y, width: W, height: H }}
                      aria-label={`${a.name}, ${a.role}${level ? `, highest licence ${LEVEL_LABEL[level]}` : ""}`}
                    >
                      <span className="flex items-center gap-2.5">
                        <AgentAvatar name={a.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-fg">{a.name}</span>
                          <span className="block truncate text-xs text-muted">{a.role}</span>
                        </span>
                      </span>
                      <span className="mt-2 truncate font-mono text-2xs text-faint">
                        {a.is_demo_agent ? "recorded outputs" : a.provider ? `${providerLabel(a.provider)} · ${a.model}` : "no model · API submissions"}
                      </span>
                      <span className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                        <AgentStatus agent={a} />
                        {level ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted"><LevelMeter level={level} />{LEVEL_LABEL[level]}</span>
                        ) : (
                          <span className="text-2xs text-faint">No licence yet</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {draggingAgent && drag && (
              <div className="pointer-events-none fixed z-[70] rounded-lg bg-raised px-2.5 py-1.5 text-xs text-fg shadow-[var(--shadow-popover)]" style={{ left: drag.x + 14, top: drag.y + 14 }}>
                {drag.target ? <>Move <b className="font-semibold">{draggingAgent.name}</b> under <b className="font-semibold">{byId.get(drag.target)?.name}</b></> : <>Drop {draggingAgent.name} on its new manager</>}
              </div>
            )}
          </div>
        )}
      <DetailPanel
        open={!!agent}
        onOpenChange={(o) => !o && setSelected(null)}
        title={agent?.name ?? ""}
        subtitle={agent?.role}
        actions={agent && <Link href={`/c/${cid}/agents/${agent.id}`} className="mr-1 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-hover hover:text-accent-strong">Open agent</Link>}
        footer={agent && canAdmin ? <Button size="sm" icon={<UserPlus className="size-3.5" aria-hidden />} onClick={() => setCreating({ manager: agent.id })}>Add a report to {agent.name}</Button> : undefined}
      >
        {agent && (
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <AgentStatus agent={agent} />
              <span className="font-mono text-xs text-muted">{agent.provider ? `${providerLabel(agent.provider)} · ${agent.model}` : agent.is_demo_agent ? "recorded outputs" : "no model"}</span>
            </div>
            {canAdmin && !agent.is_demo_agent ? (
              <div className="space-y-3 rounded-xl border border-line-soft bg-canvas/40 p-4">
                <Field label="Reports to" htmlFor="org-manager" hint="Saved immediately. A loop in the hierarchy is refused.">
                  <Select id="org-manager" value={agent.manager_id ?? ""} disabled={reorder.isPending}
                    onChange={(e) => reorder.mutate([{ id: agent.id, manager_id: e.target.value || null, position: agent.position }])}>
                    <option value="">Nobody (top)</option>
                    {list.filter((m) => m.id !== agent.id && !isDescendant(m, agent)).map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
                  </Select>
                </Field>
                <div className="flex gap-2">
                  <Button size="sm" icon={<ArrowLeft className="size-3.5" aria-hidden />} disabled={siblings[0]?.id === agent.id || reorder.isPending} onClick={() => move(-1)}>Move left</Button>
                  <Button size="sm" disabled={siblings.at(-1)?.id === agent.id || reorder.isPending} onClick={() => move(1)}>Move right <ArrowRight className="size-3.5" aria-hidden /></Button>
                </div>
              </div>
            ) : agent.is_demo_agent ? (
              <p className="text-xs text-faint">Demo posts keep their place so the recorded week stays reproducible.</p>
            ) : null}
            <section>
              <h3 className="mb-2 text-xs font-medium text-muted">Autonomy by task type</h3>
              <ul className="divide-y divide-line-soft rounded-xl border border-line-soft">
                {agent.task_types.map((type) => {
                  const t = agent.trust.find((x) => x.task_type === type);
                  return (
                    <li key={type} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                      <span className="text-fg">{taskTypeLabel(type)}</span>
                      <AutonomyLevel level={t?.level ?? "supervised"} frozen={t?.frozen} />
                    </li>
                  );
                })}
                {agent.task_types.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No task type allowed.</li>}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-medium text-muted">Permissions</h3>
              <p className="text-[13px] text-muted">{agent.permissions.length ? agent.permissions.join(", ").replaceAll("_", " ") : "None"}. Sending, paying or signing is never a permission: the server enforces approvals.</p>
            </section>
          </div>
        )}
      </DetailPanel>
      <AgentFormDialog cid={cid} open={!!creating} onOpenChange={(o) => !o && setCreating(null)} defaultManagerId={creating?.manager} />
    </div>
  );
}
