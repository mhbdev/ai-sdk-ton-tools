import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getChatById } from "@/lib/db/queries";
import { toE2BErrorResponse } from "@/lib/e2b/errors";
import { ChatSDKError } from "@/lib/errors";
import { getSandbox } from "@/lib/e2b/sandbox";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chatId = searchParams.get("chatId");
  const sandboxId = searchParams.get("sandboxId");
  const path = searchParams.get("path");
  const maxChars = searchParams.get("maxChars");

  if (!chatId || !sandboxId || !path) {
    return new ChatSDKError(
      "bad_request:api",
      "chatId, sandboxId, and path are required."
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

  const parsedLimit =
    maxChars === null || maxChars === undefined || maxChars.trim() === ""
      ? 20_000
      : Number.parseInt(maxChars, 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 200_000) {
    return new ChatSDKError(
      "bad_request:api",
      "maxChars must be an integer between 1 and 200000."
    ).toResponse();
  }

  try {
    const sandbox = await getSandbox({ sandboxId, createIfMissing: false });
    const content = await sandbox.files.read(path);
    const truncated = content.length > parsedLimit;

    return Response.json({
      sandboxId: sandbox.sandboxId,
      path,
      content: truncated ? content.slice(0, parsedLimit) : content,
      truncated,
    });
  } catch (error: unknown) {
    return toE2BErrorResponse(error);
  }
}
