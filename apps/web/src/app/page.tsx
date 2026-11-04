"use client";

import { ArrowRight, ChevronRight, Play } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { Logo } from "@/components/shell/logo";
import { ErrorState, LoadingRows, useToast } from "@/components/ui/feedback";
import { Button, Card, DemoTag } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { useAuthState, useCompanies } from "@/lib/queries";
import type { Company } from "@/lib/types";

function Home() {
  const companies = useCompanies();
  const auth = useAuthState();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const opening = useRef(false);
  const [openingDemo, setOpeningDemo] = useState(false);

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

  const real = (companies.data ?? []).filter((c) => !c.is_demo);
  const demo = (companies.data ?? []).find((c) => c.is_demo);
  const name = auth.data?.mode === "password" ? auth.data.user?.name : null;

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
        <h1 className="mt-8 text-xl font-semibold tracking-[-0.02em]">{name ? `Welcome, ${name}.` : "Run your company with AI agents, and keep the proof."}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Agents from any provider read your mail, prepare quotes and replies, and do the work you assign. Every result is checked by code
          against a contract; an agent only stops needing your approval once its record proves it can.
        </p>

        <Card className="mt-6">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-semibold">Set up your company</p>
              <p className="mt-0.5 text-xs text-muted">Country and VAT, a starting team, your AI key, your mailbox and your catalog. About five minutes.</p>
            </div>
            <Link href="/new" className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[9px] bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors duration-[120ms] hover:bg-accent-strong sm:h-9">
              Start <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </Card>

        <section className="mt-6" aria-labelledby="companies-title">
          <h2 id="companies-title" className="px-1 text-xs font-medium text-muted">Your companies</h2>
          {companies.isPending ? (
            <LoadingRows rows={2} className="px-0" />
          ) : companies.isError ? (
            <ErrorState error={companies.error} retry={() => void companies.refetch()} compact />
          ) : real.length === 0 ? (
            <p className="mt-2 px-1 text-[13px] text-faint">None yet. Set one up above.</p>
          ) : (
            <Card className="mt-2 overflow-hidden">
              <ul className="divide-y divide-line-soft">
                {real.map((c) => (
                  <li key={c.id}>
                    <Link href={`/c/${c.id}/overview`} className="group flex items-center gap-3 px-4 py-2.5 transition-colors duration-[120ms] hover:bg-hover">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-surface-2 text-xs font-semibold text-muted">{c.name.slice(0, 1).toUpperCase()}</span>
                      <span className="flex-1 truncate text-[13px]">{c.name}</span>
                      <span className="text-xs text-faint">{c.country} · <span className="capitalize">{c.role}</span></span>
                      <ChevronRight className="size-4 text-ghost transition-colors group-hover:text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section className="mt-6" aria-labelledby="demo-title">
          <h2 id="demo-title" className="px-1 text-xs font-medium text-muted">Demo</h2>
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-line-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              <span className="mr-1.5 inline-flex align-middle"><DemoTag /></span>
              A workshop replays a recorded week. No model is called and nothing is sent; every figure is tagged Demo.
            </p>
            <Button
              size="sm"
              loading={openingDemo || params.get("demo") === "1"}
              onClick={async () => { setOpeningDemo(true); if (!(await openDemo())) setOpeningDemo(false); }}
              icon={<Play className="size-3.5" aria-hidden />}
            >
              {demo ? "Open the demo" : "Try the demo"}
            </Button>
          </div>
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
