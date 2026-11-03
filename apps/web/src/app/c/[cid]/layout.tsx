"use client";

import { use, type ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";

export default function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ cid: string }> }) {
  const { cid } = use(params);
  return <AppShell cid={cid}>{children}</AppShell>;
}
