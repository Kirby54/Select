"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Building2, Play, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Logo } from "@/components/shell/logo";
import { ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { Badge, Button, Card, Field, Input } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { useCompanies } from "@/lib/queries";
import type { Company } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "Give your company a name").max(120, "120 characters at most"),
  monthly_budget: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Use a number such as 200 or 200.00"),
});
type FormValues = z.infer<typeof schema>;

function Home() {
  const companies = useCompanies();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const opening = useRef(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: "", monthly_budget: "100" } });

  const openDemo = async () => {
    if (opening.current) return;
    opening.current = true;
    try {
      const demo = await api<Company>("/demo", { method: "POST" });
      router.push(`/c/${demo.id}/overview`);
    } catch (error) {
      toast.show({ tone: "error", title: errorMessage(error) });
      opening.current = false;
    }
  };

  useEffect(() => {
    if (params.get("demo") === "1") void openDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the ?demo=1 shortcut
  }, [params]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const company = await api<Company>("/companies", { method: "POST", body: values });
      router.push(`/c/${company.id}/overview`);
    } catch (error) {
      toast.show({ tone: "error", title: errorMessage(error) });
    }
  });

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-10 sm:py-16">
      <div className="flex items-center gap-2.5">
        <Logo className="size-7" />
        <span className="text-lg font-semibold tracking-tight">Select</span>
      </div>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight sm:text-3xl">Run your company with AI agents that earn their autonomy.</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Agents from any provider work in an organization you design. Every result is checked by code against a contract,
        and an agent only stops needing your approval once its record proves it can.
      </p>

      <Card className="mt-8">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-autonomous" aria-hidden />
            <div>
              <p className="font-medium">See it work in two minutes, no API key</p>
              <p className="mt-0.5 text-sm text-muted">A workshop with five agents replays a recorded week: checks, receipts, promotions and one injected error.</p>
            </div>
          </div>
          <Button variant="primary" touch onClick={openDemo} icon={<Play className="size-4" aria-hidden />}>Open the demo</Button>
        </div>
      </Card>

      <section className="mt-8" aria-labelledby="companies-title">
        <h2 id="companies-title" className="text-sm font-semibold">Your companies</h2>
        {companies.isPending ? (
          <LoadingRows rows={2} />
        ) : companies.isError ? (
          <ErrorState error={companies.error} retry={() => void companies.refetch()} compact />
        ) : companies.data.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None yet. Create one below.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-card">
            {companies.data.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.id}/overview`} className="flex items-center gap-3 px-4 py-3 hover:bg-raised/60">
                  <Building2 className="size-4 text-faint" aria-hidden />
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.is_demo && <Badge tone="sampled">Demo</Badge>}
                  <span className="text-xs text-faint">{c.role}</span>
                  <ArrowRight className="size-4 text-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="create-title">
        <h2 id="create-title" className="text-sm font-semibold">Create a company</h2>
        <form onSubmit={onSubmit} noValidate className="mt-3 grid gap-4 rounded-lg border border-line bg-card p-5 sm:grid-cols-[1fr_160px_auto] sm:items-end">
          <Field label="Name" htmlFor="name" error={form.formState.errors.name?.message} required>
            <Input id="name" autoComplete="organization" aria-invalid={!!form.formState.errors.name} {...form.register("name")} />
          </Field>
          <Field label="Monthly budget" htmlFor="budget" error={form.formState.errors.monthly_budget?.message} hint="Live runs stop when reached">
            <Input id="budget" inputMode="decimal" aria-invalid={!!form.formState.errors.monthly_budget} {...form.register("monthly_budget")} />
          </Field>
          <Button type="submit" variant="primary" touch loading={form.formState.isSubmitting} className="sm:mb-[22px]">Create</Button>
        </form>
      </section>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingRows rows={4} />}>
      <Home />
    </Suspense>
  );
}
