import "@fontsource-variable/inter";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Select", template: "%s · Select" },
  description: "Run your company with AI agents that earn their autonomy.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#111214", colorScheme: "dark", viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
