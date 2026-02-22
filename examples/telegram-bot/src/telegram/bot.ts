import { Bot } from "grammy";
import { getEnv } from "@/config/env";
import { logger } from "@/observability/logger";
import { chunkTelegramMessage } from "@/utils/chunk";

let botInstance: Bot | null = null;

export const getBot = () => {
  if (botInstance) {
    return botInstance;
  }

  const env = getEnv();
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  bot.catch((error) => {
    logger.error("Unhandled grammY error.", { error: String(error.error) });
  });
  botInstance = bot;
  return bot;
};

export const sendTelegramText = async (chatId: string, text: string) => {
  const bot = getBot();
  const numericChatId = Number(chatId);
  for (const chunk of chunkTelegramMessage(text)) {
    await bot.api.sendMessage(numericChatId, chunk);
  }
};

