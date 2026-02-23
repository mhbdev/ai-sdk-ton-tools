# Telegram TON Agent Bot

Production-grade Telegram bot service for TON tools with:
- `grammY` transport (webhook and polling modes)
- AI SDK `ToolLoopAgent`
- OpenRouter as primary model provider with AI Gateway fallback
- Telegram native token-level streaming responses (`ToolLoopAgent.stream` + `sendMessageDraft`)
- thread/topic auto-creation with LLM-generated title + emoji for new prompts
- one-tap wallet connection via `/wallet connect` (button-based TonConnect flow with status updates)
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

For faster local update pickup, keep `BOT_RUN_MODE=polling` and set `TELEGRAM_POLLING_TIMEOUT_SECONDS=2` in `.env.local`.

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
- TonConnect icon is served from `public/tonconnect-icon.png` at `/tonconnect-icon.png` and referenced by `/tonconnect-manifest.json`.

## Rate Limits

- Chat anti-spam applies to every incoming text message: `RATE_LIMIT_CHAT_MINUTE_MAX` per `RATE_LIMIT_MINUTE_WINDOW_SECONDS`.
- User quota is charged only for messages that can enqueue AI turns.
- Non-turn commands are exempt from user quota: `/start`, `/settings`, `/network`, `/wallet`, `/cancel`.
- Free tier defaults: `RATE_LIMIT_FREE_BURST_MAX=3` per `RATE_LIMIT_BURST_WINDOW_SECONDS=3`, `RATE_LIMIT_FREE_MINUTE_MAX=10` per `RATE_LIMIT_MINUTE_WINDOW_SECONDS=60`, `RATE_LIMIT_FREE_DAILY_MAX=300` per UTC day.
- Trusted tier is selected by `RATE_LIMIT_TRUSTED_USER_IDS` (comma-separated Telegram user IDs) and scaled by `RATE_LIMIT_TRUSTED_MULTIPLIER` (default `5`).
- Daily quota resets at `00:00 UTC`.
- Rate-limit warning messages are cooldown-gated by `RATE_LIMIT_NOTICE_COOLDOWN_SECONDS` (default `20`).

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

1. Copy the unified env template and set all required values.

```bash
cp .env.example .env
```

2. Start core production stack (bot + migration + Postgres + Redis):

```bash
docker compose up -d --build
```

This compose file does not publish host ports by default. In Dokploy, map your domain to the service container port (bot: `8787`, optional grafana: `3000`, prometheus: `9090`) via Traefik/domain routing.

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
# Through your mapped domain (recommended in Dokploy)
curl https://bot.example.com/healthz
curl https://bot.example.com/readyz

# Or from inside the container network
docker compose exec telegram-bot node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>r.text()).then(t=>console.log(t))"
```

## Health Endpoints

- `GET /healthz`
- `GET /readyz`
- `POST /internal/replay-update` (requires admin bearer token)

## Security Notes

- Critical TON write operations require explicit user approval.
- Sensitive key-generation/signing tools are disabled in Telegram v1.
- Wallet custody is non-custodial only.

## License

`examples/telegram-bot/` is licensed under Apache License 2.0. See `LICENSE` in this directory.
