"use client";

import { CheckCircle2, CircleAlert, Info, XCircle } from "lucide-react";
import { useState } from "react";

import { Button, Checkbox, Field, Input, Select, Switch, cx } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import type { MailSecurity, Mailbox } from "@/lib/types";

/** Settings published by each provider (checked on 4 November 2026). Always editable. */
const PRESETS: Record<string, { label: string; imap?: [string, number, MailSecurity]; smtp?: [string, number, MailSecurity]; note?: string }> = {
  other: { label: "Another provider" },
  gmail: {
    label: "Gmail or Google Workspace",
    imap: ["imap.gmail.com", 993, "ssl"],
    smtp: ["smtp.gmail.com", 465, "ssl"],
    note: "Google refuses your normal password here: turn on 2-step verification, then create an app password and use it below.",
  },
  ionos: { label: "IONOS", imap: ["imap.ionos.com", 993, "ssl"], smtp: ["smtp.ionos.com", 465, "ssl"] },
  infomaniak: { label: "Infomaniak", imap: ["mail.infomaniak.com", 993, "ssl"], smtp: ["mail.infomaniak.com", 465, "ssl"] },
};

const DEFAULT_PORT: Record<"imap" | "smtp", Record<MailSecurity, number>> = {
  imap: { ssl: 993, starttls: 143, none: 143 },
  smtp: { ssl: 465, starttls: 587, none: 25 },
};

interface Draft {
  label: string;
  address: string;
  display_name: string;
  imap_host: string;
  imap_port: string;
  imap_security: MailSecurity;
  imap_username: string;
  imap_password: string;
  imap_folder: string;
  smtp_host: string;
  smtp_port: string;
  smtp_security: MailSecurity;
  smtp_username: string;
  smtp_password: string;
  same_login: boolean;
  inbound_enabled: boolean;
  outbound_enabled: boolean;
  import_days: string;
  poll_seconds: string;
}

type TestResult = { imap: { ok: boolean; detail: string } | null; smtp: { ok: boolean; detail: string } | null };

function fromMailbox(m: Mailbox | undefined, companyName: string): Draft {
  return {
    label: m?.label ?? "Main mailbox",
    address: m?.address ?? "",
    display_name: m?.display_name ?? companyName,
    imap_host: m?.imap_host ?? "",
    imap_port: String(m?.imap_port ?? 993),
    imap_security: m?.imap_security ?? "ssl",
    imap_username: m?.imap_username ?? "",
    imap_password: "",
    imap_folder: m?.imap_folder ?? "INBOX",
    smtp_host: m?.smtp_host ?? "",
    smtp_port: String(m?.smtp_port ?? 465),
    smtp_security: m?.smtp_security ?? "ssl",
    smtp_username: m?.smtp_username ?? "",
    smtp_password: "",
    same_login: !m || !m.smtp_username || m.smtp_username === m.imap_username,
    inbound_enabled: m?.inbound_enabled ?? true,
    outbound_enabled: m?.outbound_enabled ?? true,
    import_days: String(m?.import_days ?? 0),
    poll_seconds: String(m?.poll_seconds ?? 120),
  };
}

const HOST = /^[A-Za-z0-9.-]+$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

function problems(d: Draft, existing: Mailbox | undefined): string[] {
  const out: string[] = [];
  if (!EMAIL.test(d.address.trim())) out.push("Give the mailbox's e-mail address.");
  if (d.inbound_enabled) {
    if (!HOST.test(d.imap_host.trim())) out.push("Give the IMAP server (for example imap.example.com).");
    if (!d.imap_username.trim()) out.push("Give the IMAP user name (usually the e-mail address).");
    if (!d.imap_password && !existing?.has_imap_password) out.push("Give the IMAP password.");
  }
  if (d.outbound_enabled) {
    if (!HOST.test(d.smtp_host.trim())) out.push("Give the SMTP server (for example smtp.example.com).");
    const user = d.same_login ? d.imap_username : d.smtp_username;
    const password = d.same_login ? d.imap_password : d.smtp_password;
    if (user.trim() && !password && !existing?.has_smtp_password) out.push("Give the SMTP password.");
  }
  for (const [name, value] of [["IMAP port", d.imap_port], ["SMTP port", d.smtp_port]] as const) {
    if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535) out.push(`${name}: a number between 1 and 65535.`);
  }
  return out;
}

function Section({ title, description, toggle, children }: { title: string; description: string; toggle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-line-soft p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <legend className="text-[13px] font-semibold text-fg">{title}</legend>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
        {toggle}
      </div>
      {children}
    </fieldset>
  );
}

function TestLine({ label, result }: { label: string; result: { ok: boolean; detail: string } | null }) {
  if (!result) return <li className="flex items-start gap-2 text-xs text-faint"><Info className="mt-px size-3.5 shrink-0" aria-hidden />{label}: not set up</li>;
  return (
    <li className={cx("flex items-start gap-2 text-xs", result.ok ? "text-success" : "text-danger")}>
      {result.ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden /> : <XCircle className="mt-px size-3.5 shrink-0" aria-hidden />}
      <span><span className="font-medium">{label}:</span> {result.detail}</span>
    </li>
  );
}

/**
 * Connect a company mailbox: IMAP to read incoming mail, SMTP to send approved replies.
 * Saving tests both connections at once; a test logs in and sends nothing.
 */
export function MailboxForm({ cid, companyName, mailbox, onSaved, submitLabel = "Save and test" }: {
  cid: string;
  companyName: string;
  mailbox?: Mailbox;
  onSaved?: (mailbox: Mailbox, test: TestResult) => void;
  submitLabel?: string;
}) {
  const [draft, setDraft] = useState<Draft>(() => fromMailbox(mailbox, companyName));
  const [preset, setPreset] = useState("other");
  const [saved, setSaved] = useState<Mailbox | undefined>(mailbox);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const applyPreset = (id: string) => {
    setPreset(id);
    const p = PRESETS[id];
    if (!p) return;
    setDraft((d) => ({
      ...d,
      ...(p.imap ? { imap_host: p.imap[0], imap_port: String(p.imap[1]), imap_security: p.imap[2] } : {}),
      ...(p.smtp ? { smtp_host: p.smtp[0], smtp_port: String(p.smtp[1]), smtp_security: p.smtp[2] } : {}),
    }));
  };
  const setSecurity = (kind: "imap" | "smtp", security: MailSecurity) =>
    setDraft((d) => {
      const portKey = `${kind}_port` as const;
      const previous = DEFAULT_PORT[kind][d[`${kind}_security`]];
      const port = d[portKey] === String(previous) ? String(DEFAULT_PORT[kind][security]) : d[portKey];
      return { ...d, [`${kind}_security`]: security, [portKey]: port };
    });
  const setAddress = (value: string) =>
    setDraft((d) => ({ ...d, address: value, imap_username: !d.imap_username || d.imap_username === d.address ? value : d.imap_username }));

  const submit = async () => {
    const found = problems(draft, saved);
    if (found.length) return setError(found.join(" "));
    setBusy(true);
    setError(null);
    setTest(null);
    const body = {
      label: draft.label.trim() || "Mailbox",
      address: draft.address.trim(),
      display_name: draft.display_name.trim(),
      imap_host: draft.imap_host.trim() || null,
      imap_port: Number(draft.imap_port),
      imap_security: draft.imap_security,
      imap_username: draft.imap_username.trim(),
      imap_password: draft.imap_password || null,
      imap_folder: draft.imap_folder.trim() || "INBOX",
      smtp_host: draft.smtp_host.trim() || null,
      smtp_port: Number(draft.smtp_port),
      smtp_security: draft.smtp_security,
      smtp_username: (draft.same_login ? draft.imap_username : draft.smtp_username).trim(),
      smtp_password: (draft.same_login ? draft.imap_password : draft.smtp_password) || null,
      inbound_enabled: draft.inbound_enabled,
      outbound_enabled: draft.outbound_enabled,
      poll_seconds: Math.max(60, Number(draft.poll_seconds) || 120),
      import_days: Math.min(14, Math.max(0, Number(draft.import_days) || 0)),
    };
    try {
      const box = saved
        ? await api<Mailbox>(`/companies/${cid}/mailboxes/${saved.id}`, { method: "PUT", body })
        : await api<Mailbox>(`/companies/${cid}/mailboxes`, { method: "POST", body });
      setSaved(box);
      setDraft((d) => ({ ...d, imap_password: "", smtp_password: "" }));
      const result = await api<TestResult & { mailbox: Mailbox }>(`/companies/${cid}/mailboxes/${box.id}/test`, { method: "POST" });
      setTest(result);
      onSaved?.(result.mailbox, result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const insecure = (draft.inbound_enabled && draft.imap_security === "none") || (draft.outbound_enabled && draft.smtp_security === "none");
  const note = PRESETS[preset]?.note;
  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="E-mail address" htmlFor="mb-address"><Input id="mb-address" type="email" autoComplete="off" value={draft.address} onChange={(e) => setAddress(e.target.value)} placeholder="contact@your-company.com" /></Field>
        <Field label="Sender name" htmlFor="mb-name" hint="What customers see next to the address."><Input id="mb-name" value={draft.display_name} onChange={(e) => set("display_name", e.target.value)} /></Field>
        <Field label="Provider" htmlFor="mb-preset" hint="Fills in the server settings; you can still change them.">
          <Select id="mb-preset" value={preset} onChange={(e) => applyPreset(e.target.value)}>
            {Object.entries(PRESETS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="Label" htmlFor="mb-label"><Input id="mb-label" value={draft.label} onChange={(e) => set("label", e.target.value)} /></Field>
      </div>
      {note && <p className="flex items-start gap-2 rounded-lg border border-line-soft bg-surface-2 px-3 py-2 text-xs text-muted"><Info className="mt-px size-3.5 shrink-0 text-accent" aria-hidden />{note}</p>}

      <Section
        title="Reading — IMAP"
        description="Select reads new mail without marking it read, from the moment you connect."
        toggle={<Switch checked={draft.inbound_enabled} onCheckedChange={(v) => set("inbound_enabled", v)} label="Read incoming mail" />}
      >
        {draft.inbound_enabled && (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_96px_150px]">
            <Field label="Server" htmlFor="imap-host"><Input id="imap-host" value={draft.imap_host} onChange={(e) => set("imap_host", e.target.value)} placeholder="imap.example.com" /></Field>
            <Field label="Port" htmlFor="imap-port"><Input id="imap-port" inputMode="numeric" value={draft.imap_port} onChange={(e) => set("imap_port", e.target.value)} className="tabular" /></Field>
            <Field label="Security" htmlFor="imap-sec">
              <Select id="imap-sec" value={draft.imap_security} onChange={(e) => setSecurity("imap", e.target.value as MailSecurity)}>
                <option value="ssl">SSL/TLS</option><option value="starttls">STARTTLS</option><option value="none">None</option>
              </Select>
            </Field>
            <Field label="User name" htmlFor="imap-user"><Input id="imap-user" autoComplete="off" value={draft.imap_username} onChange={(e) => set("imap_username", e.target.value)} /></Field>
            <div className="sm:col-span-2">
              <Field label="Password" htmlFor="imap-pass" hint={saved?.has_imap_password ? "Stored, encrypted. Leave empty to keep it." : "Stored encrypted; never shown again."}>
                <Input id="imap-pass" type="password" autoComplete="new-password" value={draft.imap_password} onChange={(e) => set("imap_password", e.target.value)} />
              </Field>
            </div>
            <Field label="Folder" htmlFor="imap-folder"><Input id="imap-folder" value={draft.imap_folder} onChange={(e) => set("imap_folder", e.target.value)} /></Field>
            <div className="sm:col-span-2">
              <Field label="Also import the last days" htmlFor="imap-days" hint="0 = only mail that arrives from now on (at most 14)">
                <Input id="imap-days" inputMode="numeric" value={draft.import_days} onChange={(e) => set("import_days", e.target.value)} className="tabular sm:w-24" />
              </Field>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Sending — SMTP"
        description="Only verified replies a person approved, or that an agent's earned licence allows, are sent."
        toggle={<Switch checked={draft.outbound_enabled} onCheckedChange={(v) => set("outbound_enabled", v)} label="Send approved replies" />}
      >
        {draft.outbound_enabled && (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_96px_150px]">
            <Field label="Server" htmlFor="smtp-host"><Input id="smtp-host" value={draft.smtp_host} onChange={(e) => set("smtp_host", e.target.value)} placeholder="smtp.example.com" /></Field>
            <Field label="Port" htmlFor="smtp-port"><Input id="smtp-port" inputMode="numeric" value={draft.smtp_port} onChange={(e) => set("smtp_port", e.target.value)} className="tabular" /></Field>
            <Field label="Security" htmlFor="smtp-sec">
              <Select id="smtp-sec" value={draft.smtp_security} onChange={(e) => setSecurity("smtp", e.target.value as MailSecurity)}>
                <option value="ssl">SSL/TLS</option><option value="starttls">STARTTLS</option><option value="none">None</option>
              </Select>
            </Field>
            <div className="sm:col-span-3">
              <Checkbox label="Same user name and password as for reading" checked={draft.same_login} onChange={(e) => set("same_login", e.target.checked)} />
            </div>
            {!draft.same_login && (
              <>
                <Field label="User name" htmlFor="smtp-user"><Input id="smtp-user" autoComplete="off" value={draft.smtp_username} onChange={(e) => set("smtp_username", e.target.value)} /></Field>
                <div className="sm:col-span-2">
                  <Field label="Password" htmlFor="smtp-pass" hint={saved?.has_smtp_password ? "Stored, encrypted. Leave empty to keep it." : undefined}>
                    <Input id="smtp-pass" type="password" autoComplete="new-password" value={draft.smtp_password} onChange={(e) => set("smtp_password", e.target.value)} />
                  </Field>
                </div>
              </>
            )}
          </div>
        )}
      </Section>

      {insecure && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          Without encryption the password travels in clear text. Use it only for a server on this machine or a network you trust.
        </p>
      )}
      <p className="text-xs text-faint">Microsoft 365 and Outlook.com mailboxes usually require an OAuth sign-in, which Select does not support yet.</p>

      {test && (
        <ul className="space-y-1.5 rounded-lg border border-line-soft px-3 py-2.5" aria-label="Connection test">
          <TestLine label="Reading (IMAP)" result={test.imap} />
          <TestLine label="Sending (SMTP)" result={test.smtp} />
        </ul>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}
