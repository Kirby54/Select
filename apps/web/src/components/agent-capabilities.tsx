"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LockKeyhole, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { Badge, Button, Card, CardHeader, Field, Input } from "./ui/primitives";

type Grant = {
  id: string;
  task_type: string;
  scope: string;
  risk: string;
  contract_version: number;
  contract_sha256: string;
  created_at: string;
  expires_at: string;
  created_by: string;
  revoked_at: string | null;
  status: "active" | "expired" | "revoked" | "contract_changed";
};
type ListResponse = { grants: Grant[] };
type CheckResponse = { allowed: boolean; scope: string; action: string; reason?: string; grant_id?: string };

const SAMPLES = [
  { action: "code_change", label: "Check code proposal", scope: "" },
  { action: "code_change", label: "Check another repository", scope: "repo:UnrelatedOrg/Production" },
  { action: "send_customer_email", label: "Attempt customer email", scope: "" },
  { action: "modify_production", label: "Attempt production change", scope: "" },
] as const;

export function AgentCapabilities({
  cid, aid, canAdmin, taskTypes, isDemo,
}: { cid: string; aid: string; canAdmin: boolean; taskTypes: string[]; isDemo: boolean }) {
  const base = `/companies/${cid}/agents/${aid}/capabilities`;
  const queryClient = useQueryClient();
  const key = ["c", cid, "capabilities", aid];
  const grants = useQuery({ queryKey: key, queryFn: () => api<ListResponse>(base) });
  const [scope, setScope] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckResponse | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
  };

  const create = async () => {
    setBusy(true); setError(null); setCheck(null);
    try {
      await api(base, { method: "POST", body: { scope: scope.trim(), days } });
      setScope("");
      await refresh();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const revoke = async (grant: Grant) => {
    setBusy(true); setError(null); setCheck(null);
    try {
      await api(`${base}/${grant.id}/revoke`, { method: "POST" });
      await refresh();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const simulate = async (action: string, target: string) => {
    setBusy(true); setError(null); setCheck(null);
    try {
      const response = await api<CheckResponse>(`${base}/check`, {
        method: "POST", body: { action, scope: target },
      });
      setCheck(response);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const active = (grants.data?.grants ?? []).filter((g) => g.status === "active");
  const exampleScope = active[0]?.scope || "repo:Kirby54/Select";

  return (
    <Card>
      <CardHeader title="Permissions & Evidence" />
      <div className="space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted">
          A verified result proves the work passed a specific contract. It never creates new permissions.
          A code proposal requires a separate, expiring, repository-specific grant; sending mail,
          modifying production, executing or pushing code remain outside these grants.
        </p>
        {grants.isPending && <p className="text-xs text-muted">Loading permission boundaries…</p>}
        {grants.isError && <p role="alert" className="text-xs text-danger">{errorMessage(grants.error)}</p>}
        <ul className="space-y-2">
          {(grants.data?.grants ?? []).map((grant) => (
            <li key={grant.id} className="rounded-lg border border-line bg-surface-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-all font-mono text-xs text-fg">{grant.scope}</span>
                <Badge tone={grant.status === "active" ? "success" : grant.status === "revoked" ? "danger" : "warning"}>
                  {grant.status.replaceAll("_", " ")}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted">
                Code proposals only · review required · {grant.risk} risk · contract v{grant.contract_version}
              </p>
              <p className="mt-1 break-all font-mono text-2xs text-faint">
                Contract SHA-256: {grant.contract_sha256.slice(0, 16)}…
              </p>
              <p className="mt-1 text-xs text-faint">
                Expires {new Date(grant.expires_at).toLocaleString()} · granted by {grant.created_by}
              </p>
              {canAdmin && !isDemo && grant.status === "active" && (
                <div className="mt-3">
                  <Button size="sm" disabled={busy} onClick={() => void revoke(grant)}>
                    Revoke access
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {!grants.isPending && (grants.data?.grants.length ?? 0) === 0 && (
          <div className="rounded-lg border border-line-soft bg-surface-2 p-3 text-xs text-muted">
            No repository grants. Code proposals are denied until an admin authorizes an exact repository.
          </div>
        )}
        {canAdmin && !isDemo && (
          <form
            className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_100px_auto]"
            onSubmit={(event) => { event.preventDefault(); void create(); }}
          >
            <Field label="Repository scope" htmlFor="grant-repo" hint="Exact format: repo:owner/name">
              <Input id="grant-repo" value={scope} placeholder="repo:Kirby54/Select" onChange={(e) => setScope(e.target.value)} required />
            </Field>
            <Field label="Expires in (days)" htmlFor="grant-days">
              <Input id="grant-days" type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} required />
            </Field>
            <div className="self-end">
              <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!taskTypes.includes("code_change") || !scope.trim()}>
                Grant access
              </Button>
            </div>
            {!taskTypes.includes("code_change") && (
              <p className="text-xs text-warning sm:col-span-3">Enable the code_change task type on this agent before granting repository access.</p>
            )}
          </form>
        )}
        <div className="rounded-lg border border-line p-3">
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-4 text-muted" aria-hidden />
            <p className="text-xs font-semibold text-fg">Test the boundary (no action performed)</p>
          </div>
          <p className="mt-1 text-xs text-faint">
            These checks only evaluate permissions. They never send an email, run code or change a repository.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SAMPLES.map((sample) => (
              <Button
                key={sample.action + sample.scope}
                size="sm"
                disabled={busy}
                onClick={() => void simulate(sample.action, sample.scope || exampleScope)}
              >
                {sample.label}
              </Button>
            ))}
          </div>
          {check && (
            <div role="status" aria-live="polite" className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs">
              {check.allowed
                ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                : <XCircle className="size-4 shrink-0 text-danger" aria-hidden />}
              <div className="min-w-0">
                <p className="font-semibold text-fg">{check.allowed ? "Allowed: proposal submission only" : "Denied by server"}</p>
                <p className="mt-1 break-all text-muted">{check.action} · {check.scope}</p>
                {check.reason && <p className="mt-1 text-muted">{check.reason}</p>}
              </div>
            </div>
          )}
        </div>
        {error && <p role="alert" className="flex items-center gap-2 text-xs text-danger"><ShieldAlert className="size-4" aria-hidden />{error}</p>}
        <p className="flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          Approval of a code diff records a human decision only. Select cannot apply or push it.
        </p>
      </div>
    </Card>
  );
}
