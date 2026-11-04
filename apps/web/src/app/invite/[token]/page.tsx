"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { AuthFrame, FormError } from "@/components/auth-frame";
import { ErrorState, LoadingRows } from "@/components/ui/feedback";
import { Button, Field, Input } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";

interface InvitationInfo {
  company_name: string | null;
  email: string;
  role: string;
  invited_by: string | null;
  expires_at: string;
  state: "valid" | "used" | "expired" | "revoked";
  account_exists: boolean;
  signed_in_as: string | null;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const client = useQueryClient();
  const info = useQuery({ queryKey: ["invitation", token], queryFn: () => api<InvitationInfo>(`/invitations/${token}`), retry: false });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accept = async (body: Record<string, string>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ company_id: string }>(`/invitations/${token}/accept`, { method: "POST", body });
      client.clear();
      router.replace(`/c/${result.company_id}/overview`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (info.isPending) return <LoadingRows rows={3} />;
  if (info.isError) {
    return (
      <AuthFrame title="Invitation">
        <ErrorState error={info.error} retry={() => void info.refetch()} compact />
      </AuthFrame>
    );
  }
  const i = info.data;
  const heading = `Join ${i.company_name ?? "a company"} on Select`;
  const description = <>{i.invited_by ? `${i.invited_by} invited ` : "You are invited as "}<span className="text-fg">{i.email}</span>{i.invited_by ? " to join as " : " "}<span className="text-fg">{i.role}</span>.</>;

  if (i.state !== "valid") {
    return (
      <AuthFrame title={heading} description={description}>
        <p className="text-[13px] text-muted">This invitation is {i.state}. Ask the person who invited you for a new link.</p>
      </AuthFrame>
    );
  }
  if (i.signed_in_as) {
    const same = i.signed_in_as.toLowerCase() === i.email.toLowerCase();
    return (
      <AuthFrame title={heading} description={description}>
        <div className="space-y-4">
          <FormError message={error} />
          {same ? (
            <Button variant="primary" touch loading={busy} className="w-full" onClick={() => void accept({})}>Join {i.company_name}</Button>
          ) : (
            <p className="text-[13px] text-muted">You are signed in as {i.signed_in_as}. Sign out, then open this link again to accept it as {i.email}.</p>
          )}
        </div>
      </AuthFrame>
    );
  }
  if (i.account_exists) {
    return (
      <AuthFrame title={heading} description={description}>
        <p className="text-[13px] text-muted">An account already exists for {i.email}. Sign in, and this page will let you join.</p>
        <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-[9px] bg-accent text-[13px] font-medium text-on-accent hover:bg-accent-strong">Sign in</Link>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title={heading} description={description}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setError("Give your name.");
          if (password.length < 10) return setError("Choose a password of at least 10 characters.");
          void accept({ name: name.trim(), password });
        }}
      >
        <FormError message={error} />
        <Field label="Your name" htmlFor="name"><Input id="name" autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="E-mail" htmlFor="email"><Input id="email" type="email" autoComplete="username" value={i.email} readOnly /></Field>
        <Field label="Choose a password" htmlFor="password" hint="At least 10 characters.">
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" touch loading={busy} className="w-full">Create my account and join</Button>
      </form>
    </AuthFrame>
  );
}
