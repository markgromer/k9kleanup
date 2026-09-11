import { getIntegrationConnection } from "@/lib/admin-platform";
import { requestSweepAndGo, SweepAndGoError, type SweepAndGoMethod } from "@/lib/sweep-and-go-transport";

export { SweepAndGoError, type SweepAndGoMethod } from "@/lib/sweep-and-go-transport";

export type SweepAndGoConnection = Awaited<ReturnType<typeof getIntegrationConnection>>;
export async function getSweepAndGoConnection() {
  const connection = await getIntegrationConnection("sweep-and-go").catch(() => null);
  assertSweepAndGoConnection(connection);
  return connection;
}

export function assertSweepAndGoConnection(connection: SweepAndGoConnection | null): asserts connection is SweepAndGoConnection {
  if (!connection?.enabled || !clean(connection.values.apiToken)) {
    throw new SweepAndGoError("Sweep & Go is not connected.", "not_configured", 503);
  }
}

export async function sweepAndGoRequest<T = Record<string, unknown>>(
  connection: SweepAndGoConnection,
  path: string,
  options: { method?: SweepAndGoMethod; query?: Record<string, string | number | undefined>; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  assertSweepAndGoConnection(connection);
  return requestSweepAndGo<T>({ baseUrl: clean(connection.values.baseUrl), apiToken: clean(connection.values.apiToken) }, path, options);
}

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
