import { request } from "undici";
import { config } from "../config";
import { logger } from "../logger";
import { getCachedMeta, setCachedMeta } from "../db/metaCache";

export interface AirportInfo {
  icao_code: string | null;
  iata_code: string | null;
  name: string | null;
  municipality: string | null;
  country_name: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface FlightRoute {
  callsign_icao: string | null;
  callsign_iata: string | null;
  airline_name: string | null;
  origin: AirportInfo | null;
  destination: AirportInfo | null;
}

export interface AircraftInfo {
  type: string | null;
  icao_type: string | null;
  manufacturer: string | null;
  registration: string | null;
  registered_owner: string | null;
  registered_owner_country: string | null;
  url_photo: string | null;
}

function toAirport(a: any | undefined): AirportInfo | null {
  if (!a) return null;
  return {
    icao_code: a.icao_code ?? null,
    iata_code: a.iata_code ?? null,
    name: a.name ?? null,
    municipality: a.municipality ?? null,
    country_name: a.country_name ?? null,
    latitude: typeof a.latitude === "number" ? a.latitude : null,
    longitude: typeof a.longitude === "number" ? a.longitude : null,
  };
}

async function getJson(path: string): Promise<any | null> {
  try {
    const res = await request(`${config.adsbMetaUrl}${path}`, {
      method: "GET",
      headers: { "user-agent": "flight-tracker-discord-bot/1.0" },
      headersTimeout: 8_000,
      bodyTimeout: 8_000,
    });
    if (res.statusCode === 404) return null;
    if (res.statusCode >= 400) {
      logger.warn({ path, status: res.statusCode }, "adsbdb request failed");
      return null;
    }
    return await res.body.json();
  } catch (err) {
    logger.warn({ err, path }, "adsbdb request errored");
    return null;
  }
}

/**
 * Resolves a callsign (ICAO like "KAL855" or IATA like "KE855" — adsbdb
 * accepts both and returns the ICAO form) to airline + route info.
 * Cached in aircraft_meta for a week; a miss is cached too (as null-ish
 * empty payload) is avoided so a not-yet-scheduled flight can resolve once
 * data appears.
 */
export async function lookupFlightRoute(callsign: string): Promise<FlightRoute | null> {
  const key = `cs:${callsign.toUpperCase()}`;
  const cached = await getCachedMeta<FlightRoute>(key);
  if (cached) return cached;

  const body = await getJson(`/callsign/${encodeURIComponent(callsign)}`);
  const fr = body?.response?.flightroute;
  if (!fr) return null;

  const route: FlightRoute = {
    callsign_icao: fr.callsign_icao ?? null,
    callsign_iata: fr.callsign_iata ?? null,
    airline_name: fr.airline?.name ?? null,
    origin: toAirport(fr.origin),
    destination: toAirport(fr.destination),
  };
  await setCachedMeta(key, route);
  return route;
}

/**
 * Resolves an aircraft by ICAO24 hex or registration to type/owner info.
 */
export async function lookupAircraftInfo(hexOrReg: string): Promise<AircraftInfo | null> {
  const key = `ac:${hexOrReg.toUpperCase()}`;
  const cached = await getCachedMeta<AircraftInfo>(key);
  if (cached) return cached;

  const body = await getJson(`/aircraft/${encodeURIComponent(hexOrReg)}`);
  const ac = body?.response?.aircraft;
  if (!ac) return null;

  const info: AircraftInfo = {
    type: ac.type ?? null,
    icao_type: ac.icao_type ?? null,
    manufacturer: ac.manufacturer ?? null,
    registration: ac.registration ?? null,
    registered_owner: ac.registered_owner ?? null,
    registered_owner_country: ac.registered_owner_country_name ?? null,
    url_photo: ac.url_photo ?? null,
  };
  await setCachedMeta(key, info);
  return info;
}
