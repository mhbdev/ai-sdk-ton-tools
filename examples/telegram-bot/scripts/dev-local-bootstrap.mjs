#!/usr/bin/env node

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const projectDir = fileURLToPath(new URL("..", import.meta.url));
const envLocalPath = join(projectDir, ".env.local");
const envLocalTemplatePath = join(projectDir, ".env.local.example");
const envLocalInfraPath = join(projectDir, ".env.local.infra");
const envLocalInfraTemplatePath = join(projectDir, ".env.local.infra.example");

const composeArgs = [
  "compose",
  "-f",
  "docker-compose.local.yml",
  "--env-file",
  ".env.local.infra",
];

const placeholderPatterns = [
  "replace_me",
  "****",
  "replace_with_32_byte_base64",
];

const requiredLocalEnvVars = [
  "TELEGRAM_BOT_TOKEN",
  "TONAPI_API_KEY",
  "OPENROUTER_API_KEY",
  "ENCRYPTION_MASTER_KEY",
];

const log = (message) => {
  console.log(`[local-dev] ${message}`);
};

const fail = (message) => {
  console.error(`[local-dev] ${message}`);
  process.exit(1);
};

const runSync = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectDir,
    stdio: options.captureOutput ? "pipe" : "inherit",
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    const stdout = (result.stdout ?? "").trim();
    const details = stderr || stdout;
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}${
        details.length > 0 ? `\n${details}` : ""
      }`,
    );
  }

  return options.captureOutput ? (result.stdout ?? "").trim() : "";
};

const ensureFileFromTemplate = (filePath, templatePath) => {
  if (existsSync(filePath)) {
    return false;
  }
  if (!existsSync(templatePath)) {
    throw new Error(`Missing template file: ${templatePath}`);
  }

  copyFileSync(templatePath, filePath);
  return true;
};

const parseDotEnv = (filePath) => {
  const output = {};
  if (!existsSync(filePath)) {
    return output;
  }

  const source = readFileSync(filePath, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key.length === 0) {
      continue;
    }

    const unquoted =
      value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1)
        : value.startsWith("'") && value.endsWith("'")
          ? value.slice(1, -1)
          : value;

    output[key] = unquoted;
  }

  return output;
};

const isPlaceholderValue = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return true;
  }
  const lower = value.trim().toLowerCase();
  return placeholderPatterns.some((pattern) => lower.includes(pattern));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForTcpPort = async (port, timeoutMs, name) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const reachable = await new Promise((resolve) => {
      const socket = net.createConnection({
        host: "127.0.0.1",
        port,
      });

      socket.setTimeout(2000);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (reachable) {
      log(`${name} is reachable on port ${port}.`);
      return;
    }
    await sleep(1500);
  }

  throw new Error(`${name} did not become reachable on port ${port} in time.`);
};

const waitForOtelHealth = async (port, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        log(`OTEL collector health endpoint is ready at ${url}.`);
        return;
      }
    } catch {
      // Retry.
    }
    await sleep(1500);
  }

  throw new Error(`OTEL collector health endpoint did not become ready: ${url}`);
};

const parsePort = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const main = async () => {
  log("Running local development bootstrap pre-checks.");

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (Number.isNaN(nodeMajor) || nodeMajor < 20) {
    fail(`Node.js 20+ is required. Detected: ${process.version}`);
  }

  try {
    runSync("docker", ["--version"]);
    runSync("docker", ["compose", "version"]);
    runSync("docker", ["info"], { captureOutput: true });
  } catch (error) {
    fail(
      `Docker pre-check failed. Ensure Docker Desktop/daemon is running.\n${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const createdLocal = ensureFileFromTemplate(envLocalPath, envLocalTemplatePath);
  const createdInfra = ensureFileFromTemplate(
    envLocalInfraPath,
    envLocalInfraTemplatePath,
  );

  if (createdLocal) {
    log("Created .env.local from template.");
  }
  if (createdInfra) {
    log("Created .env.local.infra from template.");
  }

  const envLocal = parseDotEnv(envLocalPath);
  const invalidVars = requiredLocalEnvVars.filter((key) =>
    isPlaceholderValue(envLocal[key]),
  );
  if (invalidVars.length > 0) {
    fail(
      `Update .env.local with real values for: ${invalidVars.join(", ")}.`,
    );
  }

  if ((envLocal.BOT_RUN_MODE ?? "polling") !== "polling") {
    log(
      "BOT_RUN_MODE is not 'polling'. Local host-run mode typically works best with polling.",
    );
  }

  if (isPlaceholderValue(envLocal.AI_GATEWAY_API_KEY)) {
    log("AI Gateway fallback is disabled (AI_GATEWAY_API_KEY not set).");
  }

  const envInfra = parseDotEnv(envLocalInfraPath);
  const postgresPort = parsePort(envInfra.LOCAL_POSTGRES_PORT, 5432);
  const redisPort = parsePort(envInfra.LOCAL_REDIS_PORT, 6379);
  const otelHealthPort = parsePort(envInfra.LOCAL_OTEL_HEALTH_PORT, 13133);

  log("Starting local infrastructure stack (Postgres, Redis, OTEL Collector).");
  runSync("docker", [...composeArgs, "up", "-d"]);

  log("Waiting for infrastructure readiness checks.");
  await waitForTcpPort(postgresPort, 120_000, "Postgres");
  await waitForTcpPort(redisPort, 120_000, "Redis");
  await waitForOtelHealth(otelHealthPort, 120_000);

  log("Running local database migrations.");
  runSync("node", ["--env-file=.env.local", "--import", "tsx", "src/db/migrate.ts"]);

  log("Starting bot in watch mode (host process). Press Ctrl+C to stop.");
  const child = spawn(
    "node",
    ["--env-file=.env.local", "--import", "tsx", "--watch", "src/main.ts"],
    {
      cwd: projectDir,
      stdio: "inherit",
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
