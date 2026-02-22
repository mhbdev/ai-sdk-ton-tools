import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const tonNetworkEnum = pgEnum("ton_network", ["mainnet", "testnet"]);
export const responseStyleEnum = pgEnum("response_style", [
  "concise",
  "detailed",
]);
export const riskProfileEnum = pgEnum("risk_profile", [
  "cautious",
  "balanced",
  "advanced",
]);
export const chatTypeEnum = pgEnum("chat_type", [
  "private",
  "group",
  "supergroup",
  "channel",
]);
export const updateStatusEnum = pgEnum("processed_update_status", [
  "received",
  "enqueued",
  "processed",
  "failed",
]);
export const toolApprovalStatusEnum = pgEnum("tool_approval_status", [
  "requested",
  "approved",
  "denied",
  "expired",
  "failed",
]);

export const telegramUsers = pgTable(
  "telegram_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramUserId: varchar("telegram_user_id", { length: 32 }).notNull(),
    username: varchar("username", { length: 64 }),
    firstName: varchar("first_name", { length: 255 }),
    locale: varchar("locale", { length: 16 }),
    defaultResponseStyle: responseStyleEnum("default_response_style")
      .notNull()
      .default("concise"),
    defaultRiskProfile: riskProfileEnum("default_risk_profile")
      .notNull()
      .default("balanced"),
    defaultNetwork: tonNetworkEnum("default_network").notNull().default("mainnet"),
    defaultWalletLinkId: uuid("default_wallet_link_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    telegramUserIdUnique: index("telegram_users_telegram_user_id_idx").on(
      table.telegramUserId,
    ),
  }),
);

export type TelegramUser = InferSelectModel<typeof telegramUsers>;

export const telegramChats = pgTable(
  "telegram_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramChatId: varchar("telegram_chat_id", { length: 32 }).notNull(),
    chatType: chatTypeEnum("chat_type").notNull(),
    network: tonNetworkEnum("network").notNull().default("mainnet"),
    activeModel: varchar("active_model", { length: 128 }).notNull(),
    responseStyleOverride: responseStyleEnum("response_style_override"),
    riskProfileOverride: riskProfileEnum("risk_profile_override"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    telegramChatIdUnique: index("telegram_chats_telegram_chat_id_idx").on(
      table.telegramChatId,
    ),
  }),
);

export type TelegramChat = InferSelectModel<typeof telegramChats>;

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramChatId: varchar("telegram_chat_id", { length: 32 }).notNull(),
    telegramUserId: varchar("telegram_user_id", { length: 32 }).notNull(),
    messageThreadId: integer("message_thread_id"),
    stateJson: jsonb("state_json").notNull().default({}),
    lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    chatUserIdx: index("chat_sessions_chat_user_idx").on(
      table.telegramChatId,
      table.telegramUserId,
    ),
    chatUserThreadIdx: index("chat_sessions_chat_user_thread_idx").on(
      table.telegramChatId,
      table.telegramUserId,
      table.messageThreadId,
    ),
  }),
);

export type ChatSession = InferSelectModel<typeof chatSessions>;

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    role: varchar("role", { length: 16 }).notNull(),
    partsJson: jsonb("parts_json").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    correlationId: varchar("correlation_id", { length: 64 }).notNull(),
  },
  (table) => ({
    sessionCreatedAtIdx: index("agent_messages_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  }),
);

export type AgentMessage = InferSelectModel<typeof agentMessages>;

export const toolApprovals = pgTable(
  "tool_approvals",
  {
    approvalId: varchar("approval_id", { length: 80 }).primaryKey(),
    callbackToken: varchar("callback_token", { length: 32 }).notNull(),
    sessionId: uuid("session_id").notNull(),
    toolName: varchar("tool_name", { length: 120 }).notNull(),
    toolCallId: varchar("tool_call_id", { length: 120 }).notNull(),
    inputJson: jsonb("input_json").notNull(),
    telegramChatId: varchar("telegram_chat_id", { length: 32 }).notNull(),
    messageThreadId: integer("message_thread_id"),
    promptMessageId: integer("prompt_message_id"),
    riskProfile: riskProfileEnum("risk_profile").notNull().default("balanced"),
    status: toolApprovalStatusEnum("status").notNull().default("requested"),
    reason: text("reason"),
    expiresAt: timestamp("expires_at").notNull(),
    decidedAt: timestamp("decided_at"),
    decidedBy: varchar("decided_by", { length: 64 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    approvalSessionIdx: index("tool_approvals_session_idx").on(table.sessionId),
    approvalCallbackTokenIdx: index("tool_approvals_callback_token_idx").on(
      table.callbackToken,
    ),
    approvalExpiryIdx: index("tool_approvals_expiry_idx").on(table.expiresAt),
  }),
);

export type ToolApproval = InferSelectModel<typeof toolApprovals>;

export const walletLinks = pgTable(
  "wallet_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramUserId: varchar("telegram_user_id", { length: 32 }).notNull(),
    address: varchar("address", { length: 128 }).notNull(),
    publicKey: varchar("public_key", { length: 256 }),
    walletApp: varchar("wallet_app", { length: 128 }),
    label: varchar("label", { length: 64 }),
    isDefault: boolean("is_default").notNull().default(false),
    proofHash: varchar("proof_hash", { length: 128 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    walletUserIdx: index("wallet_links_telegram_user_idx").on(table.telegramUserId),
    walletAddressIdx: index("wallet_links_address_idx").on(table.address),
    walletDefaultIdx: index("wallet_links_default_idx").on(
      table.telegramUserId,
      table.isDefault,
    ),
  }),
);

export type WalletLink = InferSelectModel<typeof walletLinks>;

export const processedUpdates = pgTable(
  "processed_updates",
  {
    telegramUpdateId: text("telegram_update_id").notNull(),
    rawUpdateJson: jsonb("raw_update_json").notNull(),
    status: updateStatusEnum("status").notNull().default("received"),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    handledAt: timestamp("handled_at"),
    error: text("error"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.telegramUpdateId] }),
  }),
);

export type ProcessedUpdate = InferSelectModel<typeof processedUpdates>;

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: varchar("actor_type", { length: 32 }).notNull(),
    actorId: varchar("actor_id", { length: 64 }).notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    metadataJson: jsonb("metadata_json").notNull(),
    correlationId: varchar("correlation_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    hashChain: varchar("hash_chain", { length: 128 }).notNull(),
  },
  (table) => ({
    auditCreatedIdx: index("audit_events_created_idx").on(table.createdAt),
    auditCorrelationIdx: index("audit_events_correlation_idx").on(
      table.correlationId,
    ),
  }),
);

export type AuditEvent = InferSelectModel<typeof auditEvents>;
