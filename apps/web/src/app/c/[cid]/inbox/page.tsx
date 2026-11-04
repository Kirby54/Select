"use client";

import { ArrowDownRight, ChevronRight, CircleSlash, ClipboardCheck, Inbox, Mail, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { Card, DemoTag, Segmented, cx } from "@/components/ui/primitives";
import { inboxHref, relative } from "@/lib/format";
import { useCompanyId, useInbox } from "@/lib/queries";
import type { InboxItem } from "@/lib/types";

const KIND: Record<InboxItem["kind"], { icon: typeof ClipboardCheck; tone: string; label: string; plural: string }> = {
  approval: { icon: ClipboardCheck, tone: "bg-supervised/12 text-supervised", label: "Approval", plural: "Approvals waiting" },
  blocked: { icon: CircleSlash, tone: "bg-danger/12 text-danger", label: "Blocked", plural: "Blocked tasks" },
  demotion: { icon: ArrowDownRight, tone: "bg-danger/12 text-danger", label: "Demotion", plural: "Lost autonomy this week" },
  message: { icon: Mail, tone: "bg-accent/12 text-accent", label: "E-mail", plural: "E-mails for a person" },
  delivery: { icon: Send, tone: "bg-warning/12 text-warning", label: "Outgoing", plural: "E-mails not sent yet" },
};
const ORDER: InboxItem["kind"][] = ["approval", "message", "delivery", "blocked", "demotion"];

export default function InboxPage() {
  const cid = useCompanyId();
  const inbox = useInbox(cid);
  const [filter, setFilter] = useState<"all" | InboxItem["kind"]>("all");
  const items = (inbox.data?.items ?? []).filter(
    (i) => filter === "all" || i.kind === filter || (filter === "message" && i.kind === "delivery"),
  );
  const count = (k: InboxItem["kind"]) => (inbox.data?.items ?? []).filter((i) => i.kind === k).length;
  return (
    <>
      <PageHeader
        title="Inbox"
        description="Decisions only a human can make: approvals, e-mails for a person, blocked work, lost autonomy"
        actions={
          <Segmented
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "approval", label: <>Approvals <span className="text-faint tabular">{count("approval")}</span></> },
              { value: "message", label: <>E-mails <span className="text-faint tabular">{count("message") + count("delivery")}</span></> },
              { value: "blocked", label: <>Blocked <span className="text-faint tabular">{count("blocked")}</span></> },
              { value: "demotion", label: <>Demotions <span className="text-faint tabular">{count("demotion")}</span></> },
            ]}
          />
        }
      />
      <PageBody className="max-w-4xl">
        {inbox.isPending ? (
          <Card><LoadingRows /></Card>
        ) : inbox.isError ? (
          <Card><ErrorState error={inbox.error} retry={() => void inbox.refetch()} /></Card>
        ) : items.length === 0 ? (
          <Card><EmptyState icon={<Inbox />} title="Nothing needs you" description="Approvals, e-mails for a person, blocked tasks and demotions appear here as soon as they happen." /></Card>
        ) : (
          ORDER.filter((k) => items.some((i) => i.kind === k)).map((k) => {
            const meta = KIND[k];
            return (
              <section key={k} aria-label={meta.plural} className="space-y-2">
                <h2 className="px-1 text-xs font-medium text-muted">{meta.plural} <span className="text-faint tabular">{items.filter((i) => i.kind === k).length}</span></h2>
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-line-soft">
                    {items.filter((i) => i.kind === k).map((item) => {
                      const href = inboxHref(cid, item);
                      return (
                        <li key={`${item.kind}-${item.id}`}>
                          <Link href={href} className="group flex items-start gap-3 px-4 py-3 transition-colors duration-[120ms] hover:bg-hover">
                            <span className={cx("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", meta.tone)} aria-hidden><meta.icon className="size-3.5" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] text-fg">{item.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.detail}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {item.is_demo && <DemoTag />}
                              <span className="text-xs text-faint">{relative(item.created_at)}</span>
                              <ChevronRight className="size-4 text-ghost transition-colors group-hover:text-muted" aria-hidden />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            );
          })
        )}
      </PageBody>
    </>
  );
}
