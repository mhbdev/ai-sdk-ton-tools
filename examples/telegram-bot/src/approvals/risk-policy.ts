import type {
  ApprovalRiskLevel,
  RiskProfile,
} from "@/types/contracts";

export type ApprovalEstimateConfidence = "high" | "medium" | "low";

export type ApprovalAssessment = {
  level: ApprovalRiskLevel;
  reasons: string[];
  valueTon: number | null;
  gasTon: number | null;
  confidence: ApprovalEstimateConfidence;
};

type NumberCandidate = {
  key: string;
  path: string;
  value: number;
};

const BASE_RISK_BY_TOOL: Record<string, ApprovalRiskLevel> = {
  tonSendBlockchainMessage: "high",
  tonSendBlockchainMessageBatch: "critical",
  tonBuildAndSendExternalMessage: "high",
  tonTonConnectProof: "medium",
};

const VALUE_HINTS = [
  "amount",
  "value",
  "ton",
  "coins",
  "send",
];
const GAS_HINTS = [
  "gas",
  "fee",
  "fwd_fee",
  "forward_fee",
  "storage_fee",
];

const parseNumberish = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const walkNumericCandidates = (
  value: unknown,
  path = "",
  result: NumberCandidate[] = [],
): NumberCandidate[] => {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      walkNumericCandidates(value[index], `${path}[${index}]`, result);
    }
    return result;
  }

  if (value && typeof value === "object") {
    for (const [entryKey, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const nextPath = path.length > 0 ? `${path}.${entryKey}` : entryKey;
      const numberValue = parseNumberish(entryValue);
      if (numberValue !== null) {
        result.push({
          key: entryKey.toLowerCase(),
          path: nextPath.toLowerCase(),
          value: numberValue,
        });
      }
      walkNumericCandidates(entryValue, nextPath, result);
    }
  }

  return result;
};

const toTonValue = (candidate: NumberCandidate) => {
  if (
    candidate.key.includes("nano") ||
    candidate.path.includes("nano") ||
    candidate.path.includes("nanoton")
  ) {
    return candidate.value / 1_000_000_000;
  }
  return candidate.value;
};

const pickEstimate = (candidates: NumberCandidate[], hints: string[]) => {
  const matching = candidates.filter((candidate) =>
    hints.some((hint) => candidate.key.includes(hint) || candidate.path.includes(hint)),
  );
  if (matching.length === 0) {
    return null;
  }

  return matching
    .map(toTonValue)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => right - left)[0] ?? null;
};

const riskToScore = (risk: ApprovalRiskLevel) => {
  switch (risk) {
    case "low":
      return 0;
    case "medium":
      return 1;
    case "high":
      return 2;
    case "critical":
      return 3;
  }
};

const scoreToRisk = (score: number): ApprovalRiskLevel => {
  if (score <= 0) {
    return "low";
  }
  if (score === 1) {
    return "medium";
  }
  if (score === 2) {
    return "high";
  }
  return "critical";
};

const applyRiskProfileAdjustment = (input: {
  baseRisk: ApprovalRiskLevel;
  profile: RiskProfile;
  valueTon: number | null;
}) => {
  let score = riskToScore(input.baseRisk);

  if (input.profile === "cautious") {
    score += 1;
  } else if (input.profile === "advanced" && score > 0) {
    score -= 1;
  }

  if ((input.valueTon ?? 0) >= 100) {
    score = Math.max(score, 3);
  } else if ((input.valueTon ?? 0) >= 10) {
    score = Math.max(score, 2);
  } else if ((input.valueTon ?? 0) >= 1) {
    score = Math.max(score, 1);
  }

  return scoreToRisk(Math.min(3, Math.max(0, score)));
};

const inferBatchItemCount = (input: unknown): number => {
  if (!input || typeof input !== "object") {
    return 0;
  }

  const entries =
    (input as { messages?: unknown; transfers?: unknown }).messages ??
    (input as { transfers?: unknown }).transfers;
  if (Array.isArray(entries)) {
    return entries.length;
  }
  return 0;
};

export const assessApproval = (input: {
  toolName: string;
  toolInput: unknown;
  riskProfile: RiskProfile;
}): ApprovalAssessment => {
  const numericCandidates = walkNumericCandidates(input.toolInput);
  const valueTon = pickEstimate(numericCandidates, VALUE_HINTS);
  const gasTon =
    pickEstimate(numericCandidates, GAS_HINTS) ??
    (input.toolName === "tonSendBlockchainMessageBatch" ? 0.05 : 0.02);

  const reasons = [
    `Tool request: ${input.toolName}.`,
  ];

  const batchCount = inferBatchItemCount(input.toolInput);
  if (batchCount > 1) {
    reasons.push(`Batch operation contains ${batchCount} item(s).`);
  }
  if (valueTon !== null) {
    reasons.push(`Estimated transfer value is ${valueTon.toFixed(6)} TON.`);
  } else {
    reasons.push("Transfer value could not be determined with high confidence.");
  }
  if (gasTon !== null) {
    reasons.push(`Estimated gas/fees are ${gasTon.toFixed(6)} TON.`);
  }

  let baseRisk = BASE_RISK_BY_TOOL[input.toolName] ?? "medium";
  if (batchCount >= 5) {
    baseRisk = "critical";
    reasons.push("Large batch size increased risk.");
  }

  const adjustedRisk = applyRiskProfileAdjustment({
    baseRisk,
    profile: input.riskProfile,
    valueTon,
  });

  const confidence: ApprovalEstimateConfidence =
    valueTon !== null && gasTon !== null
      ? "high"
      : valueTon !== null || gasTon !== null
        ? "medium"
        : "low";

  return {
    level: adjustedRisk,
    reasons,
    valueTon,
    gasTon,
    confidence,
  };
};
