import { NotFoundError, Sandbox, type SandboxConnectOpts } from "e2b";
import { ChatSDKError } from "@/lib/errors";
import { getE2BSandboxConfig } from "./config";
import { toE2BChatError } from "./errors";

type SandboxCreateOptions = SandboxConnectOpts & { timeoutMs?: number };

const getValidatedConfig = () => {
  const config = getE2BSandboxConfig();
  if (!config.enabled) {
    throw new ChatSDKError(
      "bad_request:api",
      config.reason ?? "E2B sandbox tools are not configured."
    );
  }

  return config;
};

const buildConnectionOptions = (): SandboxConnectOpts => {
  const config = getValidatedConfig();

  return {
    apiKey: config.apiKey,
    accessToken: config.accessToken,
    domain: config.domain,
    apiUrl: config.apiUrl,
    sandboxUrl: config.sandboxUrl,
    debug: config.debug,
    requestTimeoutMs: config.requestTimeoutMs,
  };
};

const resolveTimeoutMs = (override: number | undefined, fallback: number) => {
  if (override === undefined) {
    return fallback;
  }

  if (Number.isFinite(override) && Number.isInteger(override) && override > 0) {
    return override;
  }

  throw new ChatSDKError(
    "bad_request:api",
    "timeoutMs must be a positive integer."
  );
};

export type SandboxRequestOptions = {
  sandboxId?: string;
  timeoutMs?: number;
  createIfMissing?: boolean;
};

export const getSandbox = async ({
  sandboxId,
  timeoutMs,
  createIfMissing = true,
}: SandboxRequestOptions = {}) => {
  const config = getValidatedConfig();
  const connectionOptions = buildConnectionOptions();
  const trimmedSandboxId = sandboxId?.trim();
  const resolvedTimeoutMs = resolveTimeoutMs(timeoutMs, config.timeoutMs);

  if (!trimmedSandboxId && !createIfMissing) {
    throw new ChatSDKError(
      "bad_request:api",
      "sandboxId is required when createIfMissing is false."
    );
  }

  if (trimmedSandboxId) {
    try {
      return await Sandbox.connect(trimmedSandboxId, {
        ...connectionOptions,
        timeoutMs: resolvedTimeoutMs,
      });
    } catch (error: unknown) {
      if (error instanceof NotFoundError) {
        if (!createIfMissing) {
          throw toE2BChatError(error, "not_found:chat");
        }
      } else {
        throw toE2BChatError(error, "offline:chat");
      }
    }
  }

  const createOptions: SandboxCreateOptions = {
    ...connectionOptions,
    timeoutMs: resolvedTimeoutMs,
  };

  try {
    return config.template
      ? await Sandbox.create(config.template, createOptions)
      : await Sandbox.create(createOptions);
  } catch (error: unknown) {
    throw toE2BChatError(error);
  }
};

export const killSandbox = async (sandboxId: string): Promise<boolean> => {
  const trimmedSandboxId = sandboxId.trim();
  if (!trimmedSandboxId) {
    throw new ChatSDKError("bad_request:api", "sandboxId is required.");
  }

  try {
    const sandbox = await Sandbox.connect(trimmedSandboxId, buildConnectionOptions());
    await sandbox.kill();
    return true;
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      return false;
    }
    throw toE2BChatError(error, "bad_request:api");
  }
};
