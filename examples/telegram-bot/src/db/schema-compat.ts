import { sql } from "@/db/client";

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

export const assertDatabaseSchemaCompatibility = async () => {
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

  if (missingColumns.length === 0 && missingEnums.length === 0) {
    return;
  }

  const parts: string[] = [];
  if (missingColumns.length > 0) {
    parts.push(
      `Missing columns: ${missingColumns
        .map((column) => `${column.tableName}.${column.columnName}`)
        .join(", ")}`,
    );
  }
  if (missingEnums.length > 0) {
    parts.push(`Missing enums: ${missingEnums.join(", ")}`);
  }

  throw new Error(
    [
      "Database schema is not compatible with this build.",
      ...parts,
      "Run DB migrations before starting workers (e.g. `node --import tsx src/db/migrate.ts`).",
      "If schema drift persists on an existing volume, run `node --import tsx src/db/repair.ts`.",
    ].join(" "),
  );
};
