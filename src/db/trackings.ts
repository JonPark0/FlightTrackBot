import { pool } from "./pool";
import { DisplayMode, QueryType, Tracking, TrackingState } from "./types";

export interface CreateTrackingInput {
  guildId: string;
  channelId: string;
  queryType: QueryType;
  queryValue: string;
  resolvedCallsign: string | null;
  displayMode: DisplayMode;
  intervalSeconds: number;
  createdBy: string;
}

export async function createTracking(input: CreateTrackingInput): Promise<Tracking> {
  const { rows } = await pool.query<Tracking>(
    `INSERT INTO trackings
       (guild_id, channel_id, query_type, query_value, resolved_callsign,
        display_mode, interval_seconds, created_by, next_update_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     RETURNING *`,
    [
      input.guildId,
      input.channelId,
      input.queryType,
      input.queryValue,
      input.resolvedCallsign,
      input.displayMode,
      input.intervalSeconds,
      input.createdBy,
    ],
  );
  return rows[0];
}

export async function findTrackingByQuery(
  guildId: string,
  queryValue: string,
): Promise<Tracking | null> {
  const { rows } = await pool.query<Tracking>(
    `SELECT * FROM trackings
     WHERE guild_id = $1
       AND (query_value = $2 OR resolved_callsign = $2)
       AND state <> 'ended'
     ORDER BY created_at DESC
     LIMIT 1`,
    [guildId, queryValue],
  );
  return rows[0] ?? null;
}

export async function countActiveTrackings(guildId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM trackings WHERE guild_id = $1 AND state <> 'ended'`,
    [guildId],
  );
  return Number.parseInt(rows[0]?.count ?? "0", 10);
}

export async function listTrackings(guildId: string): Promise<Tracking[]> {
  const { rows } = await pool.query<Tracking>(
    `SELECT * FROM trackings WHERE guild_id = $1 AND state <> 'ended' ORDER BY created_at ASC`,
    [guildId],
  );
  return rows;
}

export async function setThread(id: number, threadId: string): Promise<void> {
  await pool.query(`UPDATE trackings SET thread_id = $2, updated_at = now() WHERE id = $1`, [
    id,
    threadId,
  ]);
}

export async function setChannelAndThread(
  id: number,
  channelId: string,
  threadId: string,
): Promise<void> {
  await pool.query(
    `UPDATE trackings SET channel_id = $2, thread_id = $3, live_message_id = NULL, updated_at = now() WHERE id = $1`,
    [id, channelId, threadId],
  );
}

export async function setLiveMessageId(id: number, messageId: string | null): Promise<void> {
  await pool.query(`UPDATE trackings SET live_message_id = $2, updated_at = now() WHERE id = $1`, [
    id,
    messageId,
  ]);
}

export async function setDisplayMode(id: number, mode: DisplayMode): Promise<void> {
  await pool.query(
    `UPDATE trackings SET display_mode = $2, live_message_id = NULL, updated_at = now() WHERE id = $1`,
    [id, mode],
  );
}

export async function setInterval_(id: number, seconds: number): Promise<void> {
  await pool.query(`UPDATE trackings SET interval_seconds = $2, updated_at = now() WHERE id = $1`, [
    id,
    seconds,
  ]);
}

export async function endTracking(id: number): Promise<void> {
  await pool.query(
    `UPDATE trackings SET state = 'ended', updated_at = now(), last_state_change_at = now() WHERE id = $1`,
    [id],
  );
}

// The scheduler runs a single non-overlapping setInterval tick (see
// scheduler/tick.ts), so there is never more than one reader/writer of the
// due-tracking queue at a time and a simple SELECT is sufficient — no
// cross-process locking needed.
export async function claimDueTrackings(limit: number): Promise<Tracking[]> {
  const { rows } = await pool.query<Tracking>(
    `SELECT * FROM trackings
     WHERE state <> 'ended' AND next_update_at <= now()
     ORDER BY next_update_at ASC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

export interface TickResult {
  state: TrackingState;
  lastSeenAt: string | null;
  failCount: number;
}

export async function applyTickResult(
  id: number,
  nextUpdateAt: Date,
  result: TickResult,
): Promise<void> {
  await pool.query(
    `UPDATE trackings
     SET next_update_at = $2,
         state = $3,
         last_seen_at = COALESCE($4, last_seen_at),
         fail_count = $5,
         last_state_change_at = CASE WHEN state <> $3 THEN now() ELSE last_state_change_at END,
         updated_at = now()
     WHERE id = $1`,
    [id, nextUpdateAt.toISOString(), result.state, result.lastSeenAt, result.failCount],
  );
}
