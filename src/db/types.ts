export type QueryType = "callsign" | "registration" | "hex";
export type DisplayMode = "live" | "log";
export type TrackingState = "pending" | "live" | "stale" | "landed" | "ended";

export interface Tracking {
  id: number;
  guild_id: string;
  channel_id: string;
  thread_id: string | null;
  live_message_id: string | null;
  query_type: QueryType;
  query_value: string;
  resolved_callsign: string | null;
  display_mode: DisplayMode;
  interval_seconds: number;
  state: TrackingState;
  next_update_at: string;
  last_seen_at: string | null;
  last_state_change_at: string;
  fail_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PositionRow {
  id: number;
  tracking_id: number;
  lat: number | null;
  lon: number | null;
  alt_ft: number | null;
  on_ground: boolean;
  gs_kt: number | null;
  track_deg: number | null;
  vs_fpm: number | null;
  observed_at: string;
}
