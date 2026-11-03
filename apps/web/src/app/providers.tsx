"use client";

import * as RTooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ApiError } from "@/lib/api";
import { ToastProvider } from "@/components/ui/feedback";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2_000,
            refetchOnWindowFocus: true,
            // Do not hammer a backend that is down or a request that is forbidden.
            retry: (count, error) => !(error instanceof ApiError && [401, 403, 404, 422].includes(error.status)) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <RTooltip.Provider>
        <ToastProvider>{children}</ToastProvider>
      </RTooltip.Provider>
    </QueryClientProvider>
  );
}
