"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, Play } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Logo } from "@/components/shell/logo";
import { ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { Button, Card, DemoTag, Field, Input } from "@/components/ui/primitives";
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
  const [openingDemo, setOpeningDemo] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: "", monthly_budget: "100" } });

  /** Opens (or creates) the demo company. Returns false when it failed, so the caller can reset its spinner. */
  const openDemo = async (): Promise<boolean> => {
    if (opening.current) return true;
    opening.current = true;
    try {
      const demo = await api<Company>("/demo", { method: "POST" });
      router.push(`/c/${demo.id}/overview`);
      return true;
    } catch (error) {
      toast.show({ tone: "error", title: errorMessage(error) });
      opening.current = false;
      return false;
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
    <main id="main" className="flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center sm:py-16">
      <div className="w-full max-w-[520px] animate-rise-in">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-fg text-canvas shadow-[var(--shadow-popover)]">
            <Logo className="size-5" title="" />
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em]">Select</p>
            <p className="text-xs text-muted">Agents that earn their autonomy</p>
          </div>
        </div>
        <h1 className="mt-8 text-xl font-semibold tracking-[-0.02em]">Run your company with AI agents, and keep the proof.</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Agents from any provider work in an organization you design. Every result is checked by code against a contract,
          and an agent only stops needing your approval once its record proves it can.
        </p>

        <Card className="mt-6">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-semibold">See it work in two minutes, no API key</p>
              <p className="mt-0.5 text-xs text-muted">A workshop with five agents replays a recorded week: checks, receipts, promotions and one injected error.</p>
            </div>
            <Button
              variant="primary"
              touch
              loading={openingDemo || params.get("demo") === "1"}
              onClick={async () => { setOpeningDemo(true); if (!(await openDemo())) setOpeningDemo(false); }}
              icon={<Play className="size-3.5" aria-hidden />}
            >
              Open the demo
            </Button>
          </div>
        </Card>

        <section className="mt-6" aria-labelledby="companies-title">
          <h2 id="companies-title" className="px-1 text-xs font-medium text-muted">Your companies</h2>
          {companies.isPending ? (
            <LoadingRows rows={2} className="px-0" />
          ) : companies.isError ? (
            <ErrorState error={companies.error} retry={() => void companies.refetch()} compact />
          ) : companies.data.length === 0 ? (
            <p className="mt-2 px-1 text-[13px] text-faint">None yet. Create one below, or open the demo.</p>
          ) : (
            <Card className="mt-2 overflow-hidden">
              <ul className="divide-y divide-line-soft">
                {companies.data.map((c) => (
                  <li key={c.id}>
                    <Link href={`/c/${c.id}/overview`} className="group flex items-center gap-3 px-4 py-2.5 transition-colors duration-[120ms] hover:bg-hover">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-surface-2 text-xs font-semibold text-muted">{c.name.slice(0, 1).toUpperCase()}</span>
                      <span className="flex-1 truncate text-[13px]">{c.name}</span>
                      {c.is_demo && <DemoTag />}
                      <span className="text-xs text-faint capitalize">{c.role}</span>
                      <ChevronRight className="size-4 text-ghost transition-colors group-hover:text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section className="mt-6" aria-labelledby="create-title">
          <h2 id="create-title" className="px-1 text-xs font-medium text-muted">Create a company</h2>
          <Card className="mt-2">
            <form onSubmit={onSubmit} noValidate className="grid gap-4 p-4 sm:grid-cols-[1fr_140px] sm:items-start">
              <Field label="Name" htmlFor="name" error={form.formState.errors.name?.message} required>
                <Input id="name" autoComplete="organization" aria-invalid={!!form.formState.errors.name} {...form.register("name")} />
              </Field>
              <Field label="Monthly budget" htmlFor="budget" error={form.formState.errors.monthly_budget?.message} hint="Live runs stop here">
                <Input id="budget" inputMode="decimal" aria-invalid={!!form.formState.errors.monthly_budget} {...form.register("monthly_budget")} className="text-right tabular" />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" variant="primary" touch loading={form.formState.isSubmitting}>Create</Button>
              </div>
            </form>
          </Card>
        </section>
      </div>
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
