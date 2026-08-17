import { request } from "undici";
import { config } from "../config";
import { logger } from "../logger";
import { TokenBucket } from "./rateLimiter";
import { normalizeAircraft } from "./normalize";
import { NormalizedAircraft, RawAircraftResponse } from "./types";
import { QueryType } from "../db/types";

const bucket = new TokenBucket(config.adsbRateLimitPerSec);

const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { at: number; result: NormalizedAircraft[] }>();

// adsb.lol accepts both "reg" and "registration"; adsb.fi only accepts the
// full "registration" spelling (confirmed live — "reg" 400s on adsb.fi).
// Use the spelling both sources agree on.
const PATH_SEGMENT: Record<QueryType, string> = {
  callsign: "callsign",
  registration: "registration",
  hex: "hex",
};

async function fetchFrom(
  baseUrl: string,
  source: "adsb.lol" | "adsb.fi",
  type: QueryType,
  value: string,
): Promise<NormalizedAircraft[]> {
  await bucket.take();
  const url = `${baseUrl}/v2/${PATH_SEGMENT[type]}/${encodeURIComponent(value)}`;
  const res = await request(url, {
    method: "GET",
    headers: { "user-agent": "flight-tracker-discord-bot/1.0" },
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
  });
  if (res.statusCode >= 400) {
    throw new Error(`${source} responded ${res.statusCode} for ${type}/${value}`);
  }
  const body = (await res.body.json()) as RawAircraftResponse;
  return (body.ac ?? []).map((raw) => normalizeAircraft(raw, source));
}

/**
 * Looks up an aircraft by callsign/registration/hex. Tries adsb.lol first;
 * on error OR an empty (but successful) result, falls back to adsb.fi so a
 * gap in one network's coverage doesn't read as "flight not found".
 * Results are cached briefly since the same flight can be polled by
 * multiple trackings/guilds around the same tick.
 */
export async function lookupAircraft(
  type: QueryType,
  value: string,
): Promise<NormalizedAircraft[]> {
  const cacheKey = `${type}:${value}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }

  let result: NormalizedAircraft[] = [];
  try {
    result = await fetchFrom(config.adsbPrimaryUrl, "adsb.lol", type, value);
  } catch (err) {
    logger.warn({ err, type, value }, "adsb.lol lookup failed, trying fallback");
  }

  if (result.length === 0) {
    try {
      result = await fetchFrom(config.adsbFallbackUrl, "adsb.fi", type, value);
    } catch (err) {
      logger.warn({ err, type, value }, "adsb.fi fallback lookup failed");
    }
  }

  cache.set(cacheKey, { at: Date.now(), result });
  return result;
}
