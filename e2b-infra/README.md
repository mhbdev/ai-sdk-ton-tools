# E2B Infra Runner

This folder provides a pinned Docker toolchain for running the official
[`e2b-dev/infra`](https://github.com/e2b-dev/infra) deployment workflow.

It is a runner only. The source of truth for infrastructure steps is:
- https://github.com/e2b-dev/infra/blob/main/self-host.md
- https://e2b.dev/docs

## 1) Prepare the runner

1. Clone the official infra repo into this folder:

```bash
git clone https://github.com/e2b-dev/infra e2b-infra/infra
```

2. Copy local compose overrides and adjust host paths if needed:

```bash
cp e2b-infra/.env.example e2b-infra/.env
```

Set `E2B_GCLOUD_CONFIG_DIR` and `E2B_SSH_DIR` to absolute host paths in
`e2b-infra/.env` before running docker compose.

3. Create your infra env file:

```bash
cp e2b-infra/infra/.env.template e2b-infra/infra/.env.dev
```

4. Fill required values in `e2b-infra/infra/.env.dev` (`GCP_PROJECT_ID`,
`GCP_REGION`, `GCP_ZONE`, `DOMAIN_NAME`, `POSTGRES_CONNECTION_STRING`, etc.).

## 2) Deploy self-hosted E2B (inside runner)

Start the container:

```bash
cd e2b-infra
docker compose run --rm e2b-infra
```

Then run the official flow from `/workspace/infra`:

```bash
make set-env ENV=dev
make provider-login
make init
make build-and-upload
make copy-public-builds
make plan-without-jobs
make apply
make plan
make apply
```

Required secret versions must be added in GCP Secret Manager before the final
`plan/apply` succeeds (Cloudflare token, Postgres connection string, optional
Supabase/Posthog secrets) as documented in `self-host.md`.

Initialize cluster data:

```bash
cd packages/shared
make prep-cluster
```

## 3) Wire the example app

In `examples/chatbot/.env.local`:

```env
E2B_API_KEY=your_api_key
E2B_SELF_HOSTED=true
E2B_DOMAIN=your-e2b-domain.example.com
# Optional explicit endpoints
# E2B_API_URL=https://api.your-e2b-domain.example.com
# E2B_SANDBOX_URL=https://sandbox-proxy.your-e2b-domain.example.com
```

You can also set:
- `E2B_TEMPLATE` for a custom template
- `E2B_SANDBOX_TIMEOUT_MS` for sandbox TTL
- `E2B_REQUEST_TIMEOUT_MS` for API request timeout

## 4) Production checklist

- Use Terraform `v1.5.7` (as required by upstream infra repo).
- Confirm GCP quotas before deployment (SSD and CPU quotas in `self-host.md`).
- Keep `e2b-infra/infra/.env.*` out of git.
- Rotate Cloudflare/Postgres/API credentials regularly.
- Pin and update runner dependencies deliberately (Terraform, Packer, gcloud).
- Verify the example app can create and use a sandbox after deployment.
