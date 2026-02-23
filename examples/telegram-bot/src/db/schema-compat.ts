import { sql } from "@/db/client";
import { logger } from "@/observability/logger";

type RequiredColumn = {
  tableName: string;
  columnName: string;
};

const REQUIRED_COLUMNS: RequiredColumn[] = [
  { tableName: "chat_sessions", columnName: "message_thread_id" },
  { tableName: "telegram_chats", columnName: "response_style_override" },
  { tableName: "telegram_chats", columnName: "risk_profile_override" },
  { tableName: "telegram_users", columnName: "default_response_style" },
  { tableName: "telegram_users", columnName: "default_risk_profile" },
  { tableName: "telegram_users", columnName: "default_network" },
  { tableName: "telegram_users", columnName: "default_wallet_link_id" },
  { tableName: "tool_approvals", columnName: "callback_token" },
  { tableName: "tool_approvals", columnName: "telegram_chat_id" },
  { tableName: "tool_approvals", columnName: "message_thread_id" },
  { tableName: "tool_approvals", columnName: "prompt_message_id" },
  { tableName: "tool_approvals", columnName: "risk_profile" },
  { tableName: "wallet_links", columnName: "label" },
  { tableName: "wallet_links", columnName: "is_default" },
];

const REQUIRED_ENUMS = ["response_style", "risk_profile"] as const;

const toKey = (input: RequiredColumn) => `${input.tableName}.${input.columnName}`;

const SCHEMA_COMPAT_REPAIR_SQL = `
DO $$
BEGIN
  CREATE TYPE "public"."response_style" AS ENUM('concise', 'detailed');
EXCEPTION
  WHEN duplicate_object THEN null;
END
$$;

DO $$
BEGIN
  CREATE TYPE "public"."risk_profile" AS ENUM('cautious', 'balanced', 'advanced');
EXCEPTION
  WHEN duplicate_object THEN null;
END
$$;

ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "message_thread_id" integer;
ALTER TABLE "telegram_chats" ADD COLUMN IF NOT EXISTS "response_style_override" "response_style";
ALTER TABLE "telegram_chats" ADD COLUMN IF NOT EXISTS "risk_profile_override" "risk_profile";
ALTER TABLE "telegram_users" ADD COLUMN IF NOT EXISTS "default_response_style" "response_style";
ALTER TABLE "telegram_users" ADD COLUMN IF NOT EXISTS "default_risk_profile" "risk_profile";
ALTER TABLE "telegram_users" ADD COLUMN IF NOT EXISTS "default_network" "ton_network";
ALTER TABLE "telegram_users" ADD COLUMN IF NOT EXISTS "default_wallet_link_id" uuid;
ALTER TABLE "tool_approvals" ADD COLUMN IF NOT EXISTS "callback_token" varchar(32);
ALTER TABLE "tool_approvals" ADD COLUMN IF NOT EXISTS "telegram_chat_id" varchar(32);
ALTER TABLE "tool_approvals" ADD COLUMN IF NOT EXISTS "message_thread_id" integer;
ALTER TABLE "tool_approvals" ADD COLUMN IF NOT EXISTS "prompt_message_id" integer;
ALTER TABLE "tool_approvals" ADD COLUMN IF NOT EXISTS "risk_profile" "risk_profile";
ALTER TABLE "wallet_links" ADD COLUMN IF NOT EXISTS "label" varchar(64);
ALTER TABLE "wallet_links" ADD COLUMN IF NOT EXISTS "is_default" boolean;

UPDATE "telegram_users"
SET "default_response_style" = 'concise'
WHERE "default_response_style" IS NULL;
UPDATE "telegram_users"
SET "default_risk_profile" = 'balanced'
WHERE "default_risk_profile" IS NULL;
UPDATE "telegram_users"
SET "default_network" = 'mainnet'
WHERE "default_network" IS NULL;

ALTER TABLE "telegram_users" ALTER COLUMN "default_response_style" SET DEFAULT 'concise';
ALTER TABLE "telegram_users" ALTER COLUMN "default_response_style" SET NOT NULL;
ALTER TABLE "telegram_users" ALTER COLUMN "default_risk_profile" SET DEFAULT 'balanced';
ALTER TABLE "telegram_users" ALTER COLUMN "default_risk_profile" SET NOT NULL;
ALTER TABLE "telegram_users" ALTER COLUMN "default_network" SET DEFAULT 'mainnet';
ALTER TABLE "telegram_users" ALTER COLUMN "default_network" SET NOT NULL;

UPDATE "tool_approvals"
SET "callback_token" = substring(md5(random()::text || clock_timestamp()::text || "approval_id"), 1, 32)
WHERE "callback_token" IS NULL;
UPDATE "tool_approvals"
SET "telegram_chat_id" = '0'
WHERE "telegram_chat_id" IS NULL;
UPDATE "tool_approvals"
SET "risk_profile" = 'balanced'
WHERE "risk_profile" IS NULL;

ALTER TABLE "tool_approvals" ALTER COLUMN "callback_token" SET NOT NULL;
ALTER TABLE "tool_approvals" ALTER COLUMN "telegram_chat_id" SET NOT NULL;
ALTER TABLE "tool_approvals" ALTER COLUMN "risk_profile" SET DEFAULT 'balanced';
ALTER TABLE "tool_approvals" ALTER COLUMN "risk_profile" SET NOT NULL;

UPDATE "wallet_links"
SET "is_default" = false
WHERE "is_default" IS NULL;
ALTER TABLE "wallet_links" ALTER COLUMN "is_default" SET DEFAULT false;
ALTER TABLE "wallet_links" ALTER COLUMN "is_default" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "chat_sessions_chat_user_thread_idx"
  ON "chat_sessions" USING btree ("telegram_chat_id","telegram_user_id","message_thread_id");
CREATE INDEX IF NOT EXISTS "tool_approvals_callback_token_idx"
  ON "tool_approvals" USING btree ("callback_token");
CREATE INDEX IF NOT EXISTS "wallet_links_default_idx"
  ON "wallet_links" USING btree ("telegram_user_id","is_default");
`;

const listMissingSchemaRequirements = async () => {
  const presentColumns = await sql<{ table_name: string; column_name: string }[]>`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'chat_sessions',
        'telegram_chats',
        'telegram_users',
        'tool_approvals',
        'wallet_links'
      )
  `;

  const presentColumnKeys = new Set(
    presentColumns.map((column) =>
      toKey({
        tableName: column.table_name,
        columnName: column.column_name,
      }),
    ),
  );

  const missingColumns = REQUIRED_COLUMNS.filter(
    (requiredColumn) => !presentColumnKeys.has(toKey(requiredColumn)),
  );

  const presentEnums = await sql<{ enum_name: string }[]>`
    select t.typname as enum_name
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype = 'e'
      and t.typname in ('response_style', 'risk_profile')
  `;
  const presentEnumSet = new Set(presentEnums.map((row) => row.enum_name));
  const missingEnums = REQUIRED_ENUMS.filter(
    (enumName) => !presentEnumSet.has(enumName),
  );

  return {
    missingColumns,
    missingEnums,
  };
};

const formatSchemaCompatibilityError = (input: {
  missingColumns: RequiredColumn[];
  missingEnums: readonly string[];
}) => {
  const parts: string[] = [];
  if (input.missingColumns.length > 0) {
    parts.push(
      `Missing columns: ${input.missingColumns
        .map((column) => `${column.tableName}.${column.columnName}`)
        .join(", ")}`,
    );
  }
  if (input.missingEnums.length > 0) {
    parts.push(`Missing enums: ${input.missingEnums.join(", ")}`);
  }

  return [
    "Database schema is not compatible with this build.",
    ...parts,
    "Run DB migrations before starting workers (e.g. `pnpm db:migrate`).",
  ].join(" ");
};

export const repairDatabaseSchemaCompatibility = async () => {
  const missing = await listMissingSchemaRequirements();
  if (missing.missingColumns.length === 0 && missing.missingEnums.length === 0) {
    return false;
  }

  logger.warn("Database schema compatibility mismatch detected; applying repair.", {
    missingColumns: missing.missingColumns.map((column) =>
      `${column.tableName}.${column.columnName}`,
    ),
    missingEnums: missing.missingEnums,
  });

  await sql.unsafe(SCHEMA_COMPAT_REPAIR_SQL);

  const remaining = await listMissingSchemaRequirements();
  if (remaining.missingColumns.length === 0 && remaining.missingEnums.length === 0) {
    logger.info("Database schema compatibility repair completed.");
    return true;
  }

  throw new Error(
    formatSchemaCompatibilityError({
      missingColumns: remaining.missingColumns,
      missingEnums: remaining.missingEnums,
    }),
  );
};

export const assertDatabaseSchemaCompatibility = async () => {
  const missing = await listMissingSchemaRequirements();
  if (missing.missingColumns.length === 0 && missing.missingEnums.length === 0) {
    return;
  }

  throw new Error(
    formatSchemaCompatibilityError({
      missingColumns: missing.missingColumns,
      missingEnums: missing.missingEnums,
    }),
  );
};
