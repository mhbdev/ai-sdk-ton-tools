import { tool } from "ai";
import { CommandExitError } from "e2b";
import { z } from "zod";
import { getE2BSandboxConfig } from "@/lib/e2b/config";
import { getSandbox, killSandbox } from "@/lib/e2b/sandbox";

const sandboxIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe("Reuse an existing sandbox ID when provided.");

const workdirSchema = z
  .string()
  .min(1)
  .optional()
  .describe("Working directory inside the sandbox.");

const timeoutSchema = z
  .number()
  .int()
  .min(1000)
  .max(900_000)
  .optional()
  .describe("Timeout for the command in milliseconds.");

const projectPathSchema = z
  .string()
  .min(1)
  .describe("Absolute or relative path to the Blueprint project root.");

const sandboxPathSchema = z
  .string()
  .min(1)
  .describe("File or directory path inside the sandbox.");

const depthSchema = z
  .number()
  .int()
  .min(1)
  .max(20)
  .optional()
  .describe("Directory listing depth (default 1).");

const contractTypeSchema = z
  .enum([
    "tolk-empty",
    "func-empty",
    "tact-empty",
    "tolk-counter",
    "func-counter",
    "tact-counter",
  ])
  .describe("Blueprint contract template type.");

const packageManagerSchema = z
  .enum(["npm", "pnpm", "yarn"])
  .default("npm")
  .describe("Package manager to use for Node.js projects.");

const quoteShellArg = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

const isCommandExitError = (error: unknown): error is CommandExitError =>
  error instanceof CommandExitError;

const runSandboxCommand = async ({
  command,
  sandboxId,
  workdir,
  timeoutMs,
  user,
}: {
  command: string;
  sandboxId?: string;
  workdir?: string;
  timeoutMs?: number;
  user?: string;
}) => {
  const sandbox = await getSandbox({ sandboxId });

  try {
    const result = await sandbox.commands.run(command, {
      cwd: workdir,
      timeoutMs,
      user,
    });
    return {
      sandboxId: sandbox.sandboxId,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error ?? null,
    };
  } catch (error: unknown) {
    if (isCommandExitError(error)) {
      return {
        sandboxId: sandbox.sandboxId,
        exitCode: error.exitCode,
        stdout: error.stdout,
        stderr: error.stderr,
        error: error.error ?? error.message,
      };
    }
    throw error;
  }
};

export const createTonSandboxTools = () => ({
  tonSandboxStatus: tool({
    description:
      "Show E2B sandbox configuration status (enabled mode, domain, template, timeouts).",
    inputSchema: z.object({}),
    execute: () => {
      const config = getE2BSandboxConfig();
      return {
        enabled: config.enabled,
        mode: config.mode,
        reason: config.reason ?? null,
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
    },
  }),
  tonSandboxRunCommand: tool({
    description:
      "Run a shell command in an isolated E2B sandbox. Provide sandboxId to reuse the same sandbox.",
    inputSchema: z.object({
      command: z.string().min(1).describe("Shell command to execute."),
      sandboxId: sandboxIdSchema,
      workdir: workdirSchema,
      timeoutMs: timeoutSchema,
      user: z
        .string()
        .min(1)
        .optional()
        .describe("User to run the command as (e.g., root)."),
    }),
    execute: async ({ command, sandboxId, workdir, timeoutMs, user }) =>
      runSandboxCommand({ command, sandboxId, workdir, timeoutMs, user }),
  }),
  tonSandboxWriteFile: tool({
    description:
      "Write a file inside the E2B sandbox. Creates parent directories if needed.",
    inputSchema: z.object({
      path: z.string().min(1).describe("File path to write."),
      content: z.string().describe("File contents."),
      sandboxId: sandboxIdSchema,
    }),
    execute: async ({ path, content, sandboxId }) => {
      const sandbox = await getSandbox({ sandboxId });
      const info = await sandbox.files.write(path, content);
      return {
        sandboxId: sandbox.sandboxId,
        path: info.path,
        name: info.name,
        type: info.type,
      };
    },
  }),
  tonSandboxReadFile: tool({
    description:
      "Read a file from the E2B sandbox. Useful for inspecting contract sources.",
    inputSchema: z.object({
      path: sandboxPathSchema,
      maxChars: z
        .number()
        .int()
        .min(1)
        .max(200_000)
        .optional()
        .describe("Maximum characters to return."),
      sandboxId: sandboxIdSchema,
    }),
    execute: async ({ path, maxChars, sandboxId }) => {
      const sandbox = await getSandbox({ sandboxId });
      const content = await sandbox.files.read(path);
      const limit = maxChars ?? 20_000;
      const truncated = content.length > limit;
      return {
        sandboxId: sandbox.sandboxId,
        path,
        content: truncated ? content.slice(0, limit) : content,
        truncated,
      };
    },
  }),
  tonSandboxNodeInfo: tool({
    description: "Get Node.js and package manager versions in the sandbox.",
    inputSchema: z.object({
      sandboxId: sandboxIdSchema,
    }),
    execute: async ({ sandboxId }) => {
      const sandbox = await getSandbox({ sandboxId });
      const [node, npm, pnpm, yarn] = await Promise.all([
        sandbox.commands.run("node --version").catch(() => null),
        sandbox.commands.run("npm --version").catch(() => null),
        sandbox.commands.run("pnpm --version").catch(() => null),
        sandbox.commands.run("yarn --version").catch(() => null),
      ]);

      return {
        sandboxId: sandbox.sandboxId,
        node: node?.stdout?.trim() ?? null,
        npm: npm?.stdout?.trim() ?? null,
        pnpm: pnpm?.stdout?.trim() ?? null,
        yarn: yarn?.stdout?.trim() ?? null,
      };
    },
  }),
  tonSandboxBootstrapNode: tool({
    description:
      "Install Node.js 20 and pnpm in the sandbox using apt (runs as root).",
    inputSchema: z.object({
      sandboxId: sandboxIdSchema,
      force: z
        .boolean()
        .optional()
        .describe("Force reinstall even if Node.js is present."),
    }),
    execute: ({ sandboxId, force }) => {
      const installScript = [
        "apt-get update",
        "apt-get install -y ca-certificates curl gnupg",
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
        "npm install -g pnpm",
        "corepack enable || true",
      ].join(" && ");

      const ensureScript = force
        ? installScript
        : `command -v node >/dev/null 2>&1 || (${installScript})`;

      const verifyScript = [
        "node --version",
        "npm --version",
        "pnpm --version || true",
      ].join(" && ");

      const command = `bash -lc ${quoteShellArg(
        `${ensureScript} && ${verifyScript}`
      )}`;
      return runSandboxCommand({ command, sandboxId, user: "root" });
    },
  }),
  tonSandboxInitNodeProject: tool({
    description: "Initialize a Node.js project in the sandbox.",
    inputSchema: z.object({
      path: sandboxPathSchema.describe("Directory to initialize in."),
      packageManager: packageManagerSchema,
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ path, packageManager, sandboxId }) => {
      const command =
        packageManager === "pnpm"
          ? "pnpm init"
          : packageManager === "yarn"
            ? "yarn init -y"
            : "npm init -y";
      return runSandboxCommand({ command, sandboxId, workdir: path });
    },
  }),
  tonSandboxInstallPackages: tool({
    description: "Install npm packages in the sandbox.",
    inputSchema: z.object({
      projectPath: projectPathSchema,
      packages: z
        .array(z.string().min(1))
        .min(1)
        .describe("Packages to install."),
      dev: z.boolean().optional().describe("Install as devDependencies."),
      packageManager: packageManagerSchema,
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ projectPath, packages, dev, packageManager, sandboxId }) => {
      const packageArgs = packages.map((name) => quoteShellArg(name)).join(" ");
      const devFlag =
        dev === true
          ? packageManager === "npm"
            ? " --save-dev"
            : " --dev"
          : "";
      const command =
        packageManager === "pnpm"
          ? `pnpm add${devFlag} ${packageArgs}`
          : packageManager === "yarn"
            ? `yarn add${devFlag} ${packageArgs}`
            : `npm install${devFlag} ${packageArgs}`;
      return runSandboxCommand({ command, sandboxId, workdir: projectPath });
    },
  }),
  tonSandboxRunPackageScript: tool({
    description: "Run a package.json script in the sandbox.",
    inputSchema: z.object({
      projectPath: projectPathSchema,
      script: z.string().min(1).describe("Script name to run."),
      packageManager: packageManagerSchema,
      args: z
        .array(z.string().min(1))
        .optional()
        .describe("Extra arguments passed to the script."),
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ projectPath, script, packageManager, args, sandboxId }) => {
      const extraArgs = args?.map((value) => quoteShellArg(value)) ?? [];
      const command =
        packageManager === "pnpm"
          ? ["pnpm run", quoteShellArg(script), ...extraArgs].join(" ")
          : packageManager === "yarn"
            ? ["yarn", quoteShellArg(script), ...extraArgs].join(" ")
            : ["npm run", quoteShellArg(script), "--", ...extraArgs].join(" ");
      return runSandboxCommand({ command, sandboxId, workdir: projectPath });
    },
  }),
  tonSandboxListFiles: tool({
    description: "List files and directories in the sandbox.",
    inputSchema: z.object({
      path: sandboxPathSchema.describe("Directory path to list."),
      depth: depthSchema,
      sandboxId: sandboxIdSchema,
    }),
    execute: async ({ path, depth, sandboxId }) => {
      const sandbox = await getSandbox({ sandboxId });
      const entries = await sandbox.files.list(path, { depth });
      return {
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
      };
    },
  }),
  tonSandboxMakeDir: tool({
    description: "Create a directory inside the sandbox.",
    inputSchema: z.object({
      path: sandboxPathSchema,
      sandboxId: sandboxIdSchema,
    }),
    execute: async ({ path, sandboxId }) => {
      const sandbox = await getSandbox({ sandboxId });
      const created = await sandbox.files.makeDir(path);
      return {
        sandboxId: sandbox.sandboxId,
        path,
        created,
      };
    },
  }),
  tonSandboxMovePath: tool({
    description: "Rename or move a file or directory inside the sandbox.",
    inputSchema: z.object({
      fromPath: sandboxPathSchema.describe("Existing file or directory path."),
      toPath: sandboxPathSchema.describe("Destination path."),
      sandboxId: sandboxIdSchema,
    }),
    execute: async ({ fromPath, toPath, sandboxId }) => {
      const sandbox = await getSandbox({ sandboxId });
      const info = await sandbox.files.rename(fromPath, toPath);
      return {
        sandboxId: sandbox.sandboxId,
        entry: info,
      };
    },
  }),
  tonSandboxRemovePath: tool({
    description: "Remove a file or directory inside the sandbox.",
    inputSchema: z.object({
      path: sandboxPathSchema,
      sandboxId: sandboxIdSchema,
    }),
    execute: async ({ path, sandboxId }) => {
      const sandbox = await getSandbox({ sandboxId });
      await sandbox.files.remove(path);
      return {
        sandboxId: sandbox.sandboxId,
        removed: true,
        path,
      };
    },
  }),
  tonSandboxPathExists: tool({
    description: "Check if a file or directory exists inside the sandbox.",
    inputSchema: z.object({
      path: sandboxPathSchema,
      sandboxId: sandboxIdSchema,
    }),
    execute: async ({ path, sandboxId }) => {
      const sandbox = await getSandbox({ sandboxId });
      const exists = await sandbox.files.exists(path);
      return {
        sandboxId: sandbox.sandboxId,
        path,
        exists,
      };
    },
  }),
  tonSandboxGetInfo: tool({
    description: "Get metadata about a file or directory inside the sandbox.",
    inputSchema: z.object({
      path: sandboxPathSchema,
      sandboxId: sandboxIdSchema,
    }),
    execute: async ({ path, sandboxId }) => {
      const sandbox = await getSandbox({ sandboxId });
      const info = await sandbox.files.getInfo(path);
      return {
        sandboxId: sandbox.sandboxId,
        entry: info,
      };
    },
  }),
  tonBlueprintCreateProject: tool({
    description:
      "Create a new Blueprint project (non-interactive) in the sandbox.",
    inputSchema: z.object({
      projectName: z.string().min(1).describe("Project directory name."),
      template: contractTypeSchema.default("tolk-empty"),
      contractName: z
        .string()
        .min(1)
        .optional()
        .describe("Initial contract name in PascalCase."),
      packageManager: packageManagerSchema.describe(
        "Package manager to run create-ton."
      ),
      skipInstall: z
        .boolean()
        .optional()
        .describe("Skip dependency install and initial contract creation."),
      sandboxId: sandboxIdSchema,
      workdir: workdirSchema,
    }),
    execute: ({
      projectName,
      template,
      contractName,
      packageManager,
      skipInstall,
      sandboxId,
      workdir,
    }) => {
      const baseCommand =
        packageManager === "pnpm"
          ? "pnpm create ton@latest"
          : packageManager === "yarn"
            ? "yarn create ton@latest"
            : "npm create ton@latest";
      const resolvedContractName = contractName ?? "FirstContract";
      const args = [
        "--",
        quoteShellArg(projectName),
        "--type",
        quoteShellArg(template),
        "--contractName",
        quoteShellArg(resolvedContractName),
      ];
      if (skipInstall) {
        args.push("--no-ci");
      }

      const command = `${baseCommand} ${args.join(" ")}`;
      return runSandboxCommand({ command, sandboxId, workdir });
    },
  }),
  tonBlueprintCreateContract: tool({
    description: "Create a new contract inside an existing Blueprint project.",
    inputSchema: z.object({
      projectPath: projectPathSchema,
      contractName: z
        .string()
        .min(1)
        .describe("New contract name in PascalCase."),
      template: contractTypeSchema,
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ projectPath, contractName, template, sandboxId }) => {
      const command = [
        "npx --yes blueprint create",
        quoteShellArg(contractName),
        "--type",
        quoteShellArg(template),
      ].join(" ");
      return runSandboxCommand({ command, sandboxId, workdir: projectPath });
    },
  }),
  tonBlueprintRenameContract: tool({
    description: "Rename a contract inside a Blueprint project.",
    inputSchema: z.object({
      projectPath: projectPathSchema,
      fromName: z.string().min(1).describe("Existing contract name."),
      toName: z.string().min(1).describe("New contract name."),
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ projectPath, fromName, toName, sandboxId }) => {
      const command = [
        "npx --yes blueprint rename",
        quoteShellArg(fromName),
        quoteShellArg(toName),
      ].join(" ");
      return runSandboxCommand({ command, sandboxId, workdir: projectPath });
    },
  }),
  tonBlueprintBuild: tool({
    description: "Build contracts in a Blueprint project.",
    inputSchema: z.object({
      projectPath: projectPathSchema,
      contractName: z
        .string()
        .min(1)
        .optional()
        .describe("Contract name to build (optional)."),
      buildAll: z
        .boolean()
        .optional()
        .describe("Build all contracts in the project."),
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ projectPath, contractName, buildAll, sandboxId }) => {
      const command = buildAll
        ? "npx --yes blueprint build --all"
        : contractName
          ? `npx --yes blueprint build ${quoteShellArg(contractName)}`
          : "npx --yes blueprint build";
      return runSandboxCommand({ command, sandboxId, workdir: projectPath });
    },
  }),
  tonBlueprintTest: tool({
    description: "Run tests in a Blueprint project.",
    inputSchema: z.object({
      projectPath: projectPathSchema,
      testTarget: z
        .string()
        .min(1)
        .optional()
        .describe("Optional test file or contract name to run."),
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ projectPath, testTarget, sandboxId }) => {
      const command = testTarget
        ? `npx --yes blueprint test ${quoteShellArg(testTarget)}`
        : "npx --yes blueprint test";
      return runSandboxCommand({ command, sandboxId, workdir: projectPath });
    },
  }),
  tonBlueprintInstallDependencies: tool({
    description: "Install project dependencies inside a Blueprint project.",
    inputSchema: z.object({
      projectPath: projectPathSchema,
      packageManager: packageManagerSchema.describe(
        "Package manager to run install."
      ),
      ignoreScripts: z
        .boolean()
        .optional()
        .describe("Skip lifecycle scripts during install."),
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ projectPath, packageManager, ignoreScripts, sandboxId }) => {
      const ignoreFlag = ignoreScripts ? " --ignore-scripts" : "";
      const command =
        packageManager === "pnpm"
          ? `pnpm install${ignoreFlag}`
          : packageManager === "yarn"
            ? `yarn install${ignoreFlag}`
            : `npm install${ignoreFlag}`;
      return runSandboxCommand({ command, sandboxId, workdir: projectPath });
    },
  }),
  tonBlueprintRunScript: tool({
    description: "Run a Blueprint script inside a project.",
    inputSchema: z.object({
      projectPath: projectPathSchema,
      scriptName: z.string().min(1).describe("Script name to run."),
      args: z
        .array(z.string().min(1))
        .optional()
        .describe("Additional arguments for the script."),
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ projectPath, scriptName, args, sandboxId }) => {
      const extraArgs = args?.map((value) => quoteShellArg(value)) ?? [];
      const command = [
        "npx --yes blueprint run",
        quoteShellArg(scriptName),
        ...extraArgs,
      ].join(" ");
      return runSandboxCommand({ command, sandboxId, workdir: projectPath });
    },
  }),
  tonBlueprintSetCompiler: tool({
    description: "Update Blueprint compiler versions for a project.",
    inputSchema: z.object({
      projectPath: projectPathSchema,
      compiler: z
        .enum(["tolk", "func", "tact"])
        .describe("Compiler to update."),
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ projectPath, compiler, sandboxId }) => {
      const command = `npx --yes blueprint set ${quoteShellArg(compiler)}`;
      return runSandboxCommand({ command, sandboxId, workdir: projectPath });
    },
  }),
  tonBlueprintHelp: tool({
    description: "Show Blueprint CLI help.",
    inputSchema: z.object({
      sandboxId: sandboxIdSchema,
    }),
    execute: async ({ sandboxId }) =>
      runSandboxCommand({
        command: "npx --yes blueprint help",
        sandboxId,
      }),
  }),
  tonBlueprintCommand: tool({
    description: "Run an arbitrary Blueprint CLI command inside a project.",
    inputSchema: z.object({
      projectPath: projectPathSchema,
      subcommand: z.string().min(1).describe("Blueprint subcommand to run."),
      args: z
        .array(z.string().min(1))
        .optional()
        .describe("Additional arguments for the subcommand."),
      sandboxId: sandboxIdSchema,
    }),
    execute: ({ projectPath, subcommand, args, sandboxId }) => {
      const extraArgs = args?.map((value) => quoteShellArg(value)) ?? [];
      const command = [
        "npx --yes blueprint",
        quoteShellArg(subcommand),
        ...extraArgs,
      ].join(" ");
      return runSandboxCommand({ command, sandboxId, workdir: projectPath });
    },
  }),
  tonSandboxKill: tool({
    description: "Terminate an E2B sandbox by ID.",
    inputSchema: z.object({
      sandboxId: z.string().min(1).describe("Sandbox ID to terminate."),
    }),
    execute: async ({ sandboxId }) => {
      const terminated = await killSandbox(sandboxId);
      return {
        sandboxId,
        status: terminated ? "terminated" : "already_not_found",
      };
    },
  }),
});
