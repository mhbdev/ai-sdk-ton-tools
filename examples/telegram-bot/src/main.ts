import { logger } from "@/observability/logger";
import { initTelemetry } from "@/observability/telemetry";
const telemetry = initTelemetry();

const boot = async () => {
  const { startRuntime } = await import("@/runtime");
  await startRuntime({
    telemetry,
  });
};

boot().catch(async (error) => {
  logger.error("Fatal startup error.", { error: String(error) });
  await telemetry.shutdown();
  process.exit(1);
});
