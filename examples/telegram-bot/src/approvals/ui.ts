import { InlineKeyboard } from "grammy";

export type ApprovalCallbackAction =
  | "approve"
  | "deny"
  | "details"
  | "refresh";

export const buildApprovalCallbackData = (
  callbackToken: string,
  action: ApprovalCallbackAction,
) => `ap:${callbackToken}:${action}`;

export const createApprovalPendingKeyboard = (callbackToken: string) =>
  new InlineKeyboard()
    .text("Approve", buildApprovalCallbackData(callbackToken, "approve"))
    .text("Deny", buildApprovalCallbackData(callbackToken, "deny"))
    .row()
    .text("Details", buildApprovalCallbackData(callbackToken, "details"))
    .text("Refresh", buildApprovalCallbackData(callbackToken, "refresh"));
