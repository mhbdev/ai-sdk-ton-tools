export type BotRunMode = "webhook" | "polling";
export type TonNetwork = "mainnet" | "testnet";
export type ChatType = "private" | "group" | "supergroup" | "channel";

export type ApprovalStatus =
  | "requested"
  | "approved"
  | "denied"
  | "expired"
  | "failed";

export type ProcessedUpdateStatus =
  | "received"
  | "enqueued"
  | "processed"
  | "failed";

export type QueueName =
  | "updates"
  | "agent-turns"
  | "approval-timeouts"
  | "retry-deadletter";

export type BotUpdateJob = {
  updateId: number;
  correlationId: string;
};

export type TurnExecutionRequest = {
  correlationId: string;
  sessionId: string;
  telegramUserId: number;
  telegramChatId: number;
  messageThreadId?: number;
  replyToMessageId?: number;
  chatType: ChatType;
  text: string;
  network: TonNetwork;
  walletAddress?: string;
  modelId: string;
  approvalResponse?: {
    approvalId: string;
    approved: boolean;
    reason?: string;
  };
};

export type ToolApprovalRecord = {
  approvalId: string;
  sessionId: string;
  toolName: string;
  toolCallId: string;
  inputJson: unknown;
  status: ApprovalStatus;
  reason?: string;
  expiresAt: Date;
  decidedAt?: Date;
  decidedBy?: string;
};

export type NetworkContext = {
  network: TonNetwork;
};

export type WalletContext = {
  address?: string;
  publicKey?: string;
  walletApp?: string;
  walletStateInit?: string;
};

export type AuditEventRecord = {
  actorType: "system" | "telegram_user" | "admin";
  actorId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  correlationId: string;
};

export type UpdateProcessingResult = {
  shouldQueueTurn: boolean;
  turnRequest?: TurnExecutionRequest;
};
