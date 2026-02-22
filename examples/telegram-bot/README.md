# Telegram TON Agent Bot

Production-grade Telegram bot service for TON tools with:
- `grammY` transport (webhook and polling modes)
- AI SDK `ToolLoopAgent`
- OpenRouter as primary model provider with AI Gateway fallback
- Telegram native draft-style streaming responses (`sendMessageDraft`)
- thread/topic auto-creation with LLM-generated title + emoji for new prompts
- strict approval workflow for critical actions
- queue-based processing with idempotency
- PostgreSQL persistence + Redis queues/locks
- non-custodial wallet posture

## Quick Start

1. Copy `.env.example` to `.env` and fill required values.
2. Install dependencies:

```bash
pnpm install
```

3. Generate migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

4. Start bot:

```bash
pnpm dev
```

## Local Dev (Host Bot + Docker Infra)

This mode keeps the bot process on your host machine (`pnpm dev`) for fast reloads and realtime update handling.

One-line bootstrap (recommended):

```bash
pnpm dev:local:bootstrap
```

This command runs pre-checks, prepares local env files if missing, starts local infra, waits for health, runs migrations, and starts the bot in watch mode.

1. Prepare local env files:

```bash
cp .env.local.example .env.local
cp .env.local.infra.example .env.local.infra
```

2. Start local infra only (Postgres + Redis + OTEL Collector; no bot container):

```bash
pnpm infra:local:up
```

3. Run migrations against local infra:

```bash
pnpm db:migrate:local
```

4. Start the bot on host with local env:

```bash
pnpm dev:local
```

5. Optional local DB UI:

```bash
pnpm infra:local:tools
```

6. OTEL endpoint for local host-run bot:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

## Runtime Modes

- `BOT_RUN_MODE=webhook`: enable `POST /telegram/webhook/:secret`.
- `BOT_RUN_MODE=polling`: start long-polling loop.

## Model Provider Routing

- Primary provider: OpenRouter (`OPENROUTER_API_KEY`)
- Optional fallback provider: AI Gateway (`AI_GATEWAY_API_KEY`)
- Default model selector: `AI_MODEL`
- Optional dedicated fallback model (used only when AI Gateway key is set): `AI_GATEWAY_FALLBACK_MODEL`
- Topic naming model: `AI_TOPIC_MODEL` (low-cost model recommended)

## Native AI Chat UX

- Draft streaming is controlled by `TELEGRAM_ENABLE_STREAM_DRAFTS`.
- Topic auto-create is controlled by `TOPIC_AUTOCREATE_ENABLED`.
- Per Telegram Bot API behavior, draft streaming is used for private chats only and requires bot topics mode.

## OpenTelemetry Endpoint

- Self-hosted local infra (host-run bot): `http://localhost:4318`
- Docker production stack (container-run bot): `http://otel-collector:4318`
- Managed vendor OTLP endpoints are provided in the telemetry vendor dashboard (OTLP/HTTP endpoint).

## Docker Compose (Production Baseline)

1. Copy Docker env template and set all required values.

```bash
cp .env.docker.example .env
```

2. Start core production stack (bot + migration + Postgres + Redis):

```bash
docker compose up -d --build
```

3. Optional profiles:

```bash
# Observability stack (Prometheus + Grafana + exporters)
docker compose --profile observability up -d

# Postgres local backup service
docker compose --profile backups up -d

# Polling fallback mode (run only when webhook mode is not running)
docker compose --profile polling-fallback up -d telegram-bot-polling
```

4. Verify service readiness:

```bash
curl http://localhost:8787/healthz
curl http://localhost:8787/readyz
```

## Health Endpoints

- `GET /healthz`
- `GET /readyz`
- `POST /internal/replay-update` (requires admin bearer token)

## Security Notes

- Critical TON write operations require explicit user approval.
- Sensitive key-generation/signing tools are disabled in Telegram v1.
- Wallet custody is non-custodial only.
