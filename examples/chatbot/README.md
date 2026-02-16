<a href="https://chat.vercel.ai/">
  <img alt="Next.js 14 and App Router-ready AI chatbot." src="app/(chat)/opengraph-image.png">
  <h1 align="center">Chat SDK</h1>
</a>

<p align="center">
    Chat SDK is a free, open-source template built with Next.js and the AI SDK that helps you quickly build powerful chatbot applications.
</p>

<p align="center">
  <a href="https://chat-sdk.dev"><strong>Read Docs</strong></a> ·
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#model-providers"><strong>Model Providers</strong></a> ·
  <a href="#deploy-your-own"><strong>Deploy Your Own</strong></a> ·
  <a href="#running-locally"><strong>Running locally</strong></a>
</p>
<br/>

## Features

- [Next.js](https://nextjs.org) App Router
  - Advanced routing for seamless navigation and performance
  - React Server Components (RSCs) and Server Actions for server-side rendering and increased performance
- [AI SDK](https://ai-sdk.dev/docs/introduction)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
  - Supports xAI (default), OpenAI, Fireworks, and other model providers
- TON tools via TonAPI (`ai-sdk-ton-tools`)
- TonConnect wallet integration (optional)
- E2B sandboxed TON dev tools (Blueprint, Tolk, FunC) for logged-in users
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility
- Data Persistence
  - [Neon Serverless Postgres](https://vercel.com/marketplace/neon) for saving chat history and user data
  - [Vercel Blob](https://vercel.com/storage/blob) for efficient file storage
- [Auth.js](https://authjs.dev)
  - Simple and secure authentication

## Model Providers

This template uses the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) to access multiple AI models through a unified interface. The default configuration includes [xAI](https://x.ai) models (`grok-2-vision-1212`, `grok-3-mini`) routed through the gateway.

### AI Gateway Authentication

**For Vercel deployments**: Authentication is handled automatically via OIDC tokens.

**For non-Vercel deployments**: You need to provide an AI Gateway API key by setting the `AI_GATEWAY_API_KEY` environment variable in your `.env.local` file.

With the [AI SDK](https://ai-sdk.dev/docs/introduction), you can also switch to direct LLM providers like [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), [Cohere](https://cohere.com/), and [many more](https://ai-sdk.dev/providers/ai-sdk-providers) with just a few lines of code.

This example includes an optional API key dialog in the UI. Keys are stored in
your browser and sent only with requests for the selected provider. You can
also set provider keys via `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`GOOGLE_API_KEY`, and `XAI_API_KEY` in your environment.

## Deploy Your Own

You can deploy your own version of the Next.js AI Chatbot to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/templates/next.js/nextjs-ai-chatbot)

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run Next.js AI Chatbot. It's recommended you use [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) for this, but a `.env` file is all that is necessary.

> Note: You should not commit your `.env` file or it will expose secrets that will allow others to control access to your various AI and authentication provider accounts.

1. Install Vercel CLI: `npm i -g vercel`
2. Link local instance with Vercel and GitHub accounts (creates `.vercel` directory): `vercel link`
3. Download your environment variables: `vercel env pull`

If you want the TON tools available in chat, add `TONAPI_API_KEY` to your
environment variables.

For TonConnect wallet support, set `NEXT_PUBLIC_TONCONNECT_MANIFEST_URL` to a
publicly accessible `tonconnect-manifest.json` (a starter manifest lives in
`public/tonconnect-manifest.json`).
Update the manifest `url` and `iconUrl` values to match your deployed domain.

The code artifact Run button executes Python via Pyodide. If you need to host
Pyodide yourself, set `NEXT_PUBLIC_PYODIDE_INDEX_URL` to the base URL where
`pyodide.js` and its assets live.

For TON dev sandbox tools, set either `E2B_API_KEY` or `E2B_ACCESS_TOKEN`.
For self-hosted E2B, set:
- `E2B_SELF_HOSTED=true`
- `E2B_DOMAIN=<your-domain-without-protocol>`
- optionally `E2B_API_URL`, `E2B_SANDBOX_URL`, `E2B_TEMPLATE`
- optionally `E2B_SANDBOX_TIMEOUT_MS`, `E2B_REQUEST_TIMEOUT_MS`

These tools are only enabled for logged-in (non-guest) users and valid E2B
configuration.

Self-hosting reference:
- https://github.com/e2b-dev/infra/blob/main/self-host.md

You can check runtime wiring with:
- `GET /api/sandbox/health`
- `GET /api/sandbox/health?probe=true` (creates and immediately kills a test sandbox)

The E2B SDK requires a modern Node.js runtime (check the package for exact minimums).

Available TON dev tools include:
- Blueprint: create project/contract, rename, build, test, run scripts, install deps, set compiler, and generic CLI command.
- Sandbox: run commands, read/write/list files, inspect filesystem metadata, manage Node/npm workflows, and bootstrap Node.js if missing.

The chat UI includes a Sandbox Files panel (logged-in users) to browse files
for the current chat's sandbox.

```bash
pnpm install
pnpm db:migrate # Setup database or apply latest database changes
pnpm dev
```

Your app template should now be running on [localhost:3000](http://localhost:3000).
