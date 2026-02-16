import { cookies } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { TonConnectProvider } from "@/components/tonconnect-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "../(auth)/auth";

const resolvePyodideBaseUrl = (value?: string) => {
  const baseUrl =
    value && value.trim().length > 0
      ? value.trim()
      : "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/";
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const pyodideBaseUrl = resolvePyodideBaseUrl(
    process.env.NEXT_PUBLIC_PYODIDE_INDEX_URL
  );

  return (
    <>
      <Script
        src={`${pyodideBaseUrl}pyodide.js`}
        strategy="beforeInteractive"
      />
      <TonConnectProvider>
        <DataStreamProvider>
          <Suspense fallback={<div className="flex h-dvh" />}>
            <SidebarWrapper>{children}</SidebarWrapper>
          </Suspense>
        </DataStreamProvider>
      </TonConnectProvider>
    </>
  );
}

async function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <AppSidebar user={session?.user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
