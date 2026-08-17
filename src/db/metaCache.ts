import { pool } from "./pool";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getCachedMeta<T>(key: string): Promise<T | null> {
  const { rows } = await pool.query<{ payload: T; fetched_at: string }>(
    `SELECT payload, fetched_at FROM aircraft_meta WHERE key = $1`,
    [key],
  );
  const row = rows[0];
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  if (age > TTL_MS) return null;
  return row.payload;
}

export async function setCachedMeta<T>(key: string, payload: T): Promise<void> {
  await pool.query(
    `INSERT INTO aircraft_meta (key, payload, fetched_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET payload = $2, fetched_at = now()`,
    [key, JSON.stringify(payload)],
  );
}
