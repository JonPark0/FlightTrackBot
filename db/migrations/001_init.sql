-- Initial schema for flight tracker bot

CREATE TABLE IF NOT EXISTS trackings (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,          -- parent channel the update thread lives under
  thread_id TEXT,                    -- thread where updates are posted
  live_message_id TEXT,              -- message edited in-place when display_mode = 'live'
  query_type TEXT NOT NULL CHECK (query_type IN ('callsign', 'registration', 'hex')),
  query_value TEXT NOT NULL,         -- normalized (trimmed, uppercased) lookup value
  resolved_callsign TEXT,            -- ICAO callsign resolved from an IATA flight number, if any
  display_mode TEXT NOT NULL DEFAULT 'live' CHECK (display_mode IN ('live', 'log')),
  interval_seconds INT NOT NULL DEFAULT 300,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'live', 'stale', 'landed', 'ended')),
  next_update_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  last_state_change_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fail_count INT NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index (not a table-level UNIQUE) so a flight can be
-- re-tracked after a previous tracking of it has ended — only one *active*
-- tracking per (guild, query) is enforced. This must match the state
-- predicate used by findTrackingByQuery (state <> 'ended').
CREATE UNIQUE INDEX IF NOT EXISTS trackings_active_unique
  ON trackings (guild_id, query_type, query_value)
  WHERE state <> 'ended';

CREATE INDEX IF NOT EXISTS trackings_next_update_idx
  ON trackings (next_update_at)
  WHERE state <> 'ended';

CREATE INDEX IF NOT EXISTS trackings_guild_idx ON trackings (guild_id);

CREATE TABLE IF NOT EXISTS positions (
  id BIGSERIAL PRIMARY KEY,
  tracking_id BIGINT NOT NULL REFERENCES trackings(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  alt_ft INT,
  on_ground BOOLEAN NOT NULL DEFAULT FALSE,
  gs_kt REAL,
  track_deg REAL,
  vs_fpm INT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS positions_tracking_idx
  ON positions (tracking_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS aircraft_meta (
  key TEXT PRIMARY KEY,              -- e.g. 'cs:KAL855' or 'ac:C2B571'
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
