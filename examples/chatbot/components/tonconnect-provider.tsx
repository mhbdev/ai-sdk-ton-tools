"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import type { ReactNode } from "react";
import { useMemo } from "react";

export function TonConnectProvider({ children }: { children: ReactNode }) {
  const manifestUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const defaultManifestUrl = new URL(
      "/tonconnect-manifest.json",
      window.location.origin
    ).toString();

    const configuredManifestUrl =
      process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL?.trim();

    if (!configuredManifestUrl) {
      return defaultManifestUrl;
    }

    try {
      const parsedConfiguredManifestUrl = new URL(
        configuredManifestUrl,
        window.location.origin
      );
      const isConfiguredManifestLocalhost =
        parsedConfiguredManifestUrl.hostname === "localhost" ||
        parsedConfiguredManifestUrl.hostname === "127.0.0.1";
      const isAppLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      if (isConfiguredManifestLocalhost && !isAppLocalhost) {
        return defaultManifestUrl;
      }

      return parsedConfiguredManifestUrl.toString();
    } catch {
      return defaultManifestUrl;
    }
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
