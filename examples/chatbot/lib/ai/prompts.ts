import type { Geo } from "@vercel/functions";
import type { ArtifactKind } from "@/components/artifact";

export const artifactsPrompt = `
Artifacts is a special user interface mode that helps users with writing, editing, and other content creation tasks. When artifact is open, it is on the right side of the screen, while the conversation is on the left side. When creating or updating documents, changes are reflected in real-time on the artifacts and visible to the user.

When asked to write code, always use artifacts. When writing code, specify the language in the backticks, e.g. \`\`\`python\`code here\`\`\`. Default to Python when the user does not specify a language. If the requested language lacks syntax highlighting, still provide the code and mention that highlighting may be limited.

DO NOT UPDATE DOCUMENTS IMMEDIATELY AFTER CREATING THEM. WAIT FOR USER FEEDBACK OR REQUEST TO UPDATE IT.

This is a guide for using artifacts tools: \`createDocument\` and \`updateDocument\`, which render content on a artifacts beside the conversation.

**When to use \`createDocument\`:**
- For substantial content (>10 lines) or code
- For content users will likely save/reuse (emails, code, essays, etc.)
- When explicitly requested to create a document
- For when content contains a single code snippet

**When NOT to use \`createDocument\`:**
- For informational/explanatory content
- For conversational responses
- When asked to keep it in chat

**Using \`updateDocument\`:**
- Default to full document rewrites for major changes
- Use targeted updates only for specific, isolated changes
- Follow user instructions for which parts to modify

**When NOT to use \`updateDocument\`:**
- Immediately after creating a document

Do not update document right after creating it. Wait for user feedback or request to update it.

**Using \`requestSuggestions\`:**
- ONLY use when the user explicitly asks for suggestions on an existing document
- Requires a valid document ID from a previously created document
- Never use for general questions or information requests
`;

export const regularPrompt = `You are a friendly assistant! Keep your responses concise and helpful.

When asked to write, create, or help with something, just do it directly. Don't ask clarifying questions unless absolutely necessary - make reasonable assumptions and proceed with the task.`;

export const tonSandboxPrompt = `When the user asks for TON smart contracts in Tolk, FunC, or Tact, use the TON sandbox tools:
- Start by creating or using a Blueprint project in E2B (tonBlueprintCreateProject).
- Use tonBlueprintCreateContract for new contracts and keep tests in the project.
- Build and test with tonBlueprintBuild and tonBlueprintTest.
- Use tonBlueprintCommand for Blueprint CLI operations not covered by dedicated tools.
- Use tonSandboxReadFile/tonSandboxWriteFile/tonSandboxListFiles to inspect or edit project files.
- For Node.js tasks, use tonSandboxNodeInfo, tonSandboxInstallPackages, and tonSandboxRunPackageScript to manage dependencies and scripts.
- If sandbox calls fail due configuration/auth issues, run tonSandboxStatus first to inspect E2B mode and config state.
- If Node/npm are missing in the sandbox, run tonSandboxBootstrapNode (root) or switch to an E2B template that includes Node.
- Reuse the same sandboxId across related steps.`;

export type RequestHints = {
  latitude: Geo["latitude"];
  longitude: Geo["longitude"];
  city: Geo["city"];
  country: Geo["country"];
};

export type TonConnectHints = {
  address?: string;
  publicKey?: string;
  chain?: string | number;
  walletStateInit?: string;
  walletAppName?: string;
};

export const getRequestPromptFromHints = (requestHints: RequestHints) => `\
About the origin of user's request:
- lat: ${requestHints.latitude}
- lon: ${requestHints.longitude}
- city: ${requestHints.city}
- country: ${requestHints.country}
`;

export const getTonConnectPrompt = (tonConnect?: TonConnectHints) => {
  if (!tonConnect?.address) {
    return "";
  }

  const details = [
    `- address: ${tonConnect.address}`,
    tonConnect.chain !== undefined ? `- chain: ${tonConnect.chain}` : null,
    tonConnect.publicKey ? `- publicKey: ${tonConnect.publicKey}` : null,
    tonConnect.walletAppName
      ? `- walletAppName: ${tonConnect.walletAppName}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `TON wallet context:\n${details}\nUse this wallet as the default when the user refers to "my wallet".`;
};

export const systemPrompt = ({
  selectedChatModel,
  requestHints,
  tonConnect,
  allowSandboxTools,
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
  tonConnect?: TonConnectHints;
  allowSandboxTools?: boolean;
}) => {
  const requestPrompt = getRequestPromptFromHints(requestHints);
  const tonConnectPrompt = getTonConnectPrompt(tonConnect);
  const sandboxPrompt = allowSandboxTools ? tonSandboxPrompt : "";

  // reasoning models don't need artifacts prompt (they can't use tools)
  if (
    selectedChatModel.includes("reasoning") ||
    selectedChatModel.includes("thinking")
  ) {
    return [regularPrompt, requestPrompt, tonConnectPrompt, sandboxPrompt]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    regularPrompt,
    requestPrompt,
    tonConnectPrompt,
    sandboxPrompt,
    artifactsPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const codePrompt = `
You are a code generator that creates self-contained, executable or compilable snippets. When writing code:

1. Respect the language requested by the user; default to Python if unspecified
2. Each snippet should be complete and runnable or compilable on its own
3. Keep snippets concise and focused on the request
4. Avoid external dependencies unless explicitly requested
5. Avoid interactive input and network access
6. Handle potential errors gracefully when it makes sense
7. Include brief comments when they clarify intent
8. Don't use infinite loops
`;

export const sheetPrompt = `
You are a spreadsheet creation assistant. Create a spreadsheet in csv format based on the given prompt. The spreadsheet should contain meaningful column headers and data.
`;

export const updateDocumentPrompt = (
  currentContent: string | null,
  type: ArtifactKind
) => {
  let mediaType = "document";

  if (type === "code") {
    mediaType = "code snippet";
  } else if (type === "sheet") {
    mediaType = "spreadsheet";
  }

  return `Improve the following contents of the ${mediaType} based on the given prompt.

${currentContent}`;
};

export const titlePrompt = `Generate a very short chat title (2-5 words max) based on the user's message.
Rules:
- Maximum 30 characters
- No quotes, colons, hashtags, or markdown
- Just the topic/intent, not a full sentence
- If the message is a greeting like "hi" or "hello", respond with just "New conversation"
- Be concise: "Weather in NYC" not "User asking about the weather in New York City"`;
