"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AuthFrame, FormError } from "@/components/auth-frame";
import { LoadingRows } from "@/components/ui/feedback";
import { Button, Field, Input } from "@/components/ui/primitives";
import { api, errorMessage, safeNext } from "@/lib/api";
import { useAuthState } from "@/lib/queries";

function Login() {
  const auth = useAuthState();
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth.data) return;
    if (auth.data.needs_setup) router.replace(`/setup?next=${encodeURIComponent(next)}`);
    else if (auth.data.mode !== "password" || auth.data.user) router.replace(next);
  }, [auth.data, next, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) return setError("Give your e-mail and your password.");
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: { email: email.trim(), password } });
      client.clear();
      router.replace(next);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (auth.isPending) return <LoadingRows rows={3} />;
  return (
    <AuthFrame title="Sign in" description="Use the e-mail and password of your Select account." footer="Forgot your password? An owner can set a new one with: select-api reset-password --email you@example.com">
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={error} />
        <Field label="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" touch loading={busy} className="w-full">Sign in</Button>
      </form>
    </AuthFrame>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingRows rows={3} />}>
      <Login />
    </Suspense>
  );
}
