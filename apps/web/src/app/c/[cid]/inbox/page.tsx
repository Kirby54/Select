"use client";

import { ArrowDownRight, CircleSlash, ClipboardCheck, Inbox } from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/feedback";
import { Badge, Card } from "@/components/ui/primitives";
import { relative } from "@/lib/format";
import { useCompanyId, useInbox } from "@/lib/queries";

const ICON = { approval: ClipboardCheck, blocked: CircleSlash, demotion: ArrowDownRight } as const;
const TONE = { approval: "text-supervised", blocked: "text-danger", demotion: "text-danger" } as const;

export default function InboxPage() {
  const cid = useCompanyId();
  const inbox = useInbox(cid);
  return (
    <>
      <PageHeader title="Inbox" description="Approvals waiting for you, blocked tasks and agents that lost autonomy this week." />
      <PageBody>
        <Card>
          {inbox.isPending ? (
            <LoadingRows />
          ) : inbox.isError ? (
            <ErrorState error={inbox.error} retry={() => void inbox.refetch()} />
          ) : inbox.data.items.length === 0 ? (
            <EmptyState icon={<Inbox />} title="Nothing needs you" description="Approvals, blocked tasks and demotions appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {inbox.data.items.map((item) => {
                const Icon = ICON[item.kind];
                const href = item.kind === "approval" ? `/c/${cid}/approvals` : item.task_id ? `/c/${cid}/tasks/${item.task_id}` : `/c/${cid}/agents/${item.agent_id}`;
                return (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link href={href} className="flex items-start gap-3 px-4 py-3 hover:bg-raised/60">
                      <Icon className={`mt-0.5 size-4 shrink-0 ${TONE[item.kind]}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-fg">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.detail}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-xs text-faint">{relative(item.created_at)}</span>
                        {item.is_demo && <Badge tone="sampled">Demo</Badge>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
