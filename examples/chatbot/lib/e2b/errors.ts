import {
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
} from "e2b";
import { ChatSDKError, type ErrorCode } from "@/lib/errors";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
};

export const toE2BChatError = (
  error: unknown,
  fallbackCode: ErrorCode = "offline:chat"
) => {
  if (error instanceof ChatSDKError) {
    return error;
  }

  const message = getErrorMessage(error);

  if (error instanceof AuthenticationError) {
    return new ChatSDKError(
      "unauthorized:chat",
      `E2B authentication failed: ${message}`
    );
  }

  if (error instanceof NotFoundError) {
    return new ChatSDKError("not_found:chat", `E2B resource not found: ${message}`);
  }

  if (error instanceof RateLimitError) {
    return new ChatSDKError("rate_limit:chat", `E2B rate limit hit: ${message}`);
  }

  if (error instanceof TimeoutError) {
    return new ChatSDKError("offline:chat", `E2B request timed out: ${message}`);
  }

  return new ChatSDKError(fallbackCode, `E2B request failed: ${message}`);
};

export const toE2BErrorResponse = (
  error: unknown,
  fallbackCode: ErrorCode = "offline:chat"
) => toE2BChatError(error, fallbackCode).toResponse();

