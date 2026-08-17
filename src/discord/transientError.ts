import { logger } from "../logger";

/**
 * Discord's API sits behind Cloudflare. An idle pooled keep-alive socket can
 * be closed server-side at (almost) any moment; if a request happens to
 * reuse that exact socket right as the FIN arrives, undici surfaces it as
 * "SocketError: other side closed" (UND_ERR_SOCKET) instead of transparently
 * retrying on a fresh connection. In production this has been observed
 * hitting two *separate* fresh connections (different local ports, different
 * Cloudflare edge IPs) seconds apart, so a single immediate retry isn't
 * always enough — treat it as a short blip and retry a few times with
 * backoff rather than a real outage.
 */
export function isTransientSocketError(err: unknown): boolean {
  const e = err as { code?: string; name?: string } | undefined;
  return e?.code === "UND_ERR_SOCKET" || e?.name === "SocketError" || e?.code === "ECONNRESET";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [250, 750, 1500];

/** Runs `attempt`, retrying with backoff on transient Cloudflare socket errors. */
export async function withSocketErrorRetry<T>(label: string, attempt: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      if (!isTransientSocketError(err) || i === MAX_ATTEMPTS - 1) throw err;
      const delay = RETRY_DELAYS_MS[i] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      logger.warn({ err, attempt: i + 1, delay }, `${label} hit a transient socket error, retrying`);
      await sleep(delay);
    }
  }
  // Unreachable (loop always returns or throws), but keeps TS satisfied.
  throw lastErr;
}
