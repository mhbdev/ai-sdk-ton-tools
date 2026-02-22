import type { Config } from "drizzle-kit";

const postgresUrl =
  process.env.POSTGRES_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/telegram_bot";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: postgresUrl,
  },
} satisfies Config;
