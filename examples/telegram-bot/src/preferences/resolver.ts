import type { TelegramChat, TelegramUser } from "@/db/schema";
import type {
  ResolvedPreferences,
  ResponseStyle,
  RiskProfile,
  TonNetwork,
} from "@/types/contracts";

export const DEFAULT_RESPONSE_STYLE: ResponseStyle = "concise";
export const DEFAULT_RISK_PROFILE: RiskProfile = "balanced";
export const DEFAULT_NETWORK: TonNetwork = "mainnet";

export const resolveEffectivePreferences = (input: {
  user?: TelegramUser | null;
  chat?: TelegramChat | null;
}): ResolvedPreferences => ({
  responseStyle:
    input.chat?.responseStyleOverride ??
    input.user?.defaultResponseStyle ??
    DEFAULT_RESPONSE_STYLE,
  riskProfile:
    input.chat?.riskProfileOverride ??
    input.user?.defaultRiskProfile ??
    DEFAULT_RISK_PROFILE,
  network: input.chat?.network ?? input.user?.defaultNetwork ?? DEFAULT_NETWORK,
});
