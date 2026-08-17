/**
 * Discord's API sits behind Cloudflare. An idle pooled keep-alive socket can
 * be closed server-side at (almost) any moment; if a request happens to
 * reuse that exact socket right as the FIN arrives, undici surfaces it as
 * "SocketError: other side closed" (UND_ERR_SOCKET) instead of transparently
 * retrying on a fresh connection. This has been observed recurring in
 * production. It's a one-shot connection race, not a real outage — a retry
 * on a new connection succeeds essentially every time.
 */
export function isTransientSocketError(err: unknown): boolean {
  const e = err as { code?: string; name?: string } | undefined;
  return e?.code === "UND_ERR_SOCKET" || e?.name === "SocketError" || e?.code === "ECONNRESET";
}
