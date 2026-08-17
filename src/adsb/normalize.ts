import { NormalizedAircraft, RawAircraft } from "./types";

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Converts a raw readsb aircraft record into a safe, strongly-typed shape.
 * Handles the two real-world quirks confirmed against the live API:
 *   - alt_baro is the string "ground" (not a number) when landed
 *   - flight carries trailing padding whitespace ("CFC4243 ")
 * gs/track/lat/lon can also simply be absent (no recent position report).
 */
export function normalizeAircraft(
  raw: RawAircraft,
  source: "adsb.lol" | "adsb.fi",
): NormalizedAircraft {
  const onGround = raw.alt_baro === "ground";
  const altFt = onGround ? 0 : numOrNull(raw.alt_baro) ?? numOrNull(raw.alt_geom);

  return {
    hex: raw.hex ? raw.hex.trim().toUpperCase() : null,
    flight: raw.flight ? raw.flight.trim() : null,
    registration: raw.r ? raw.r.trim().toUpperCase() : null,
    typeCode: raw.t ? raw.t.trim().toUpperCase() : null,
    typeDesc: raw.desc ? raw.desc.trim() : null,
    lat: numOrNull(raw.lat),
    lon: numOrNull(raw.lon),
    altFt,
    onGround,
    gsKt: numOrNull(raw.gs),
    trackDeg: numOrNull(raw.track),
    vsFpm: numOrNull(raw.baro_rate) ?? numOrNull(raw.geom_rate),
    squawk: raw.squawk ? raw.squawk.trim() : null,
    emergency: raw.emergency && raw.emergency !== "none" ? raw.emergency : null,
    category: raw.category ?? null,
    seenPosSec: numOrNull(raw.seen_pos),
    seenSec: numOrNull(raw.seen),
    source,
  };
}
