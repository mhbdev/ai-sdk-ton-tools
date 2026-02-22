# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=telegram-bot-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod=false

FROM base AS runtime

ENV NODE_ENV=production
ENV TSX_DISABLE_CACHE=1
ENV TZ=UTC
ENV PNPM_DISABLE_SELF_UPDATE_CHECK=true

COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY docker/runtime/entrypoint.sh /usr/local/bin/entrypoint

RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --create-home --home-dir /home/app --shell /usr/sbin/nologin app \
    && chmod 0755 /usr/local/bin/entrypoint \
    && chown -R 10001:10001 /app /home/app

USER 10001:10001

EXPOSE 8787

ENTRYPOINT ["entrypoint"]
CMD ["node", "--import", "tsx", "src/main.ts"]
