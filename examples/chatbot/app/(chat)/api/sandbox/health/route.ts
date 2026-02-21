import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getE2BSandboxConfig, getE2BSandboxStatus } from "@/lib/e2b/config";
import { toE2BErrorResponse } from "@/lib/e2b/errors";
import { getSandbox } from "@/lib/e2b/sandbox";
import { ChatSDKError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const probe = request.nextUrl.searchParams.get("probe") === "true";
  const status = getE2BSandboxStatus();
  const config = getE2BSandboxConfig();

  const payload = {
    enabled: status.enabled,
    mode: status.mode,
    reason: status.reason ?? null,
    hasApiKey: Boolean(config.apiKey),
    hasAccessToken: Boolean(config.accessToken),
    domain: config.domain ?? null,
    apiUrl: config.apiUrl ?? null,
    sandboxUrl: config.sandboxUrl ?? null,
    template: config.template ?? null,
    timeoutMs: config.timeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
    debug: config.debug,
  };

  if (!probe || !status.enabled) {
    return Response.json({ ...payload, probe: null });
  }

  try {
    const sandbox = await getSandbox({ timeoutMs: 90_000 });
    await sandbox.kill();

    return Response.json({
      ...payload,
      probe: {
        ok: true,
        sandboxId: sandbox.sandboxId,
      },
    });
  } catch (error: unknown) {
    return toE2BErrorResponse(error);
  }
}
