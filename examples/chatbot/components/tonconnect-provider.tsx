"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import type { ReactNode } from "react";
import { useMemo } from "react";

export function TonConnectProvider({ children }: { children: ReactNode }) {
  const manifestUrl = useMemo(() => {
    if (process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL) {
      return process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL;
    }

    if (typeof window === "undefined") {
      return "";
    }

    return new URL(
      "/tonconnect-manifest.json",
      window.location.origin
    ).toString();
  }, []);

  if (!manifestUrl) {
    return <>{children}</>;
  }

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
}
