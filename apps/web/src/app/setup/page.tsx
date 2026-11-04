"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthFrame, FormError } from "@/components/auth-frame";
import { LoadingRows } from "@/components/ui/feedback";
import { Button, Field, Input } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { useAuthState } from "@/lib/queries";

/** First visit of a fresh installation: the person creating the first account becomes its owner. */
export default function SetupPage() {
  const auth = useAuthState();
  const router = useRouter();
  const client = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.data && !auth.data.needs_setup) router.replace(auth.data.user || auth.data.mode !== "password" ? "/" : "/login");
  }, [auth.data, router]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const problem =
    !form.name.trim() ? "Give your name." :
    !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(form.email.trim()) ? "Give a valid e-mail address." :
    form.password.length < 10 ? "Choose a password of at least 10 characters." :
    form.password !== form.confirm ? "The two passwords differ." : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api("/auth/setup", { method: "POST", body: { name: form.name.trim(), email: form.email.trim(), password: form.password } });
      client.clear();
      router.replace("/new");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (auth.isPending) return <LoadingRows rows={3} />;
  return (
    <AuthFrame
      title="Create the owner account"
      description="This is a new Select installation. The first account owns it; you invite the others later from Settings."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={error} />
        <Field label="Your name" htmlFor="name"><Input id="name" autoComplete="name" autoFocus value={form.name} onChange={set("name")} /></Field>
        <Field label="E-mail" htmlFor="email"><Input id="email" type="email" autoComplete="username" value={form.email} onChange={set("email")} /></Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters. A sentence is easier to remember than symbols.">
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        <Field label="Password again" htmlFor="confirm"><Input id="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} /></Field>
        <Button type="submit" variant="primary" touch loading={busy} className="w-full">Create account</Button>
      </form>
    </AuthFrame>
  );
}
