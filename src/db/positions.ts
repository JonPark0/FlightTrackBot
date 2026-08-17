import { pool } from "./pool";
import { PositionRow } from "./types";

const MAX_TRACK_POINTS = 30;

export interface NewPosition {
  lat: number | null;
  lon: number | null;
  altFt: number | null;
  onGround: boolean;
  gsKt: number | null;
  trackDeg: number | null;
  vsFpm: number | null;
}

export async function insertPosition(trackingId: number, pos: NewPosition): Promise<void> {
  await pool.query(
    `INSERT INTO positions (tracking_id, lat, lon, alt_ft, on_ground, gs_kt, track_deg, vs_fpm)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [trackingId, pos.lat, pos.lon, pos.altFt, pos.onGround, pos.gsKt, pos.trackDeg, pos.vsFpm],
  );

  // Keep only the most recent MAX_TRACK_POINTS rows per tracking to bound
  // storage and keep the rendered trail short.
  await pool.query(
    `DELETE FROM positions
     WHERE tracking_id = $1
       AND id NOT IN (
         SELECT id FROM positions WHERE tracking_id = $1 ORDER BY observed_at DESC LIMIT $2
       )`,
    [trackingId, MAX_TRACK_POINTS],
  );
}

export async function recentPositions(trackingId: number, limit = MAX_TRACK_POINTS): Promise<PositionRow[]> {
  const { rows } = await pool.query<PositionRow>(
    `SELECT * FROM positions WHERE tracking_id = $1 ORDER BY observed_at DESC LIMIT $2`,
    [trackingId, limit],
  );
  return rows.reverse();
}

/**
 * Most recent position row that actually has coordinates — used as the
 * dead-reckoning anchor when the current tick has no live ADS-B fix.
 */
export async function latestPosition(trackingId: number): Promise<PositionRow | null> {
  const { rows } = await pool.query<PositionRow>(
    `SELECT * FROM positions
     WHERE tracking_id = $1 AND lat IS NOT NULL AND lon IS NOT NULL
     ORDER BY observed_at DESC
     LIMIT 1`,
    [trackingId],
  );
  return rows[0] ?? null;
}
