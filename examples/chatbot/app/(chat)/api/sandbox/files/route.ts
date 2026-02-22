import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getChatById } from "@/lib/db/queries";
import { toE2BErrorResponse } from "@/lib/e2b/errors";
import { getSandbox } from "@/lib/e2b/sandbox";
import { ChatSDKError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chatId = searchParams.get("chatId");
  const sandboxId = searchParams.get("sandboxId");
  const path = searchParams.get("path") ?? "/";
  const depth = searchParams.get("depth");

  if (!chatId || !sandboxId) {
    return new ChatSDKError(
      "bad_request:api",
      "chatId and sandboxId are required."
    ).toResponse();
  }

  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id: chatId });
  if (!chat) {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const parsedDepth =
    depth === null || depth === undefined || depth.trim() === ""
      ? undefined
      : Number.parseInt(depth, 10);

  if (
    parsedDepth !== undefined &&
    (!Number.isFinite(parsedDepth) || parsedDepth < 1 || parsedDepth > 20)
  ) {
    return new ChatSDKError(
      "bad_request:api",
      "depth must be an integer between 1 and 20."
    ).toResponse();
  }

  try {
    const sandbox = await getSandbox({ sandboxId, createIfMissing: false });
    const entries = await sandbox.files.list(path, {
      depth: parsedDepth,
    });

    return Response.json({
      sandboxId: sandbox.sandboxId,
      path,
      entries: entries.map((entry) => ({
        name: entry.name,
        type: entry.type,
        path: entry.path,
        size: entry.size,
        permissions: entry.permissions,
        owner: entry.owner,
        group: entry.group,
        modifiedTime: entry.modifiedTime,
        symlinkTarget: entry.symlinkTarget ?? null,
      })),
    });
  } catch (error: unknown) {
    return toE2BErrorResponse(error);
  }
}
