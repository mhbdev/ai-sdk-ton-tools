# Telegram TON Agent Bot

Production-grade Telegram bot service for TON tools with:
- `grammY` transport (webhook and polling modes)
- AI SDK `ToolLoopAgent`
- OpenRouter as primary model provider with AI Gateway fallback
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

## Runtime Modes

- `BOT_RUN_MODE=webhook`: enable `POST /telegram/webhook/:secret`.
- `BOT_RUN_MODE=polling`: start long-polling loop.

## Model Provider Routing

- Primary provider: OpenRouter (`OPENROUTER_API_KEY`)
- Fallback provider: AI Gateway (`AI_GATEWAY_API_KEY`)
- Default model selector: `AI_MODEL`
- Optional dedicated fallback model: `AI_GATEWAY_FALLBACK_MODEL`

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
# Observability stack (OTEL Collector + Prometheus + Grafana + exporters)
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
