/**
 * Raw shape returned by readsb-based APIs (adsb.lol / adsb.fi share the same
 * schema). Numeric fields can legitimately arrive as strings (e.g.
 * alt_baro: "ground") or be entirely absent, so everything is optional /
 * loosely typed here — normalize.ts is responsible for producing a safe,
 * strongly-typed value.
 */
export interface RawAircraft {
  hex?: string;
  flight?: string;
  r?: string; // registration
  t?: string; // ICAO type code
  desc?: string;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  category?: string;
  lat?: number;
  lon?: number;
  seen_pos?: number;
  seen?: number;
  messages?: number;
  rssi?: number;
}

export interface RawAircraftResponse {
  ac?: RawAircraft[];
  msg?: string;
  total?: number;
}

export interface NormalizedAircraft {
  hex: string | null;
  flight: string | null;
  registration: string | null;
  typeCode: string | null;
  typeDesc: string | null;
  lat: number | null;
  lon: number | null;
  altFt: number | null;
  onGround: boolean;
  gsKt: number | null;
  trackDeg: number | null;
  vsFpm: number | null;
  squawk: string | null;
  emergency: string | null;
  category: string | null;
  seenPosSec: number | null;
  seenSec: number | null;
  source: "adsb.lol" | "adsb.fi";
}
