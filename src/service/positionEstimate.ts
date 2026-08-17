import { NormalizedAircraft } from "../adsb/types";
import { FlightRoute } from "../meta/adsbdb";
import { PositionRow, TrackingState } from "../db/types";
import { greatCircleInterpolate, haversineDistanceKm, initialBearingDeg, LatLon } from "../geo";

const DEFAULT_CRUISE_SPEED_KMH = 800; // used when we have no last-known ground speed to dead-reckon with
const KT_TO_KMH = 1.852;
const ARRIVAL_THRESHOLD_KM = 5;

export type EstimateKind = "live" | "enroute" | "origin" | "destination";

export interface PositionEstimate {
  kind: EstimateKind;
  lat: number;
  lon: number;
  /** Direction of travel in degrees, or null for a stationary airport marker. */
  headingDeg: number | null;
  /** 0-100 for enroute/destination, 0 for origin, null when not meaningful. */
  progressPct: number | null;
  note: string;
}

export interface ResolveDisplayPositionInput {
  aircraft: NormalizedAircraft | null;
  /** Most recent REAL ADS-B fix on record (from the positions table), if any. */
  lastPosition: PositionRow | null;
  route: FlightRoute | null;
  state: TrackingState;
}

/**
 * Decides what position to show when there's no live ADS-B fix this tick:
 *   - in-flight with a known last fix -> dead-reckon along the great circle
 *     from that fix toward the destination airport
 *   - never seen airborne yet (pending) -> sit at the departure airport
 *   - no longer flying (landed/ended) with no fresher fix -> sit at the
 *     arrival airport
 * Returns null when there's truly nothing to base a position on (e.g. no
 * route data resolved at all).
 */
export function resolveDisplayPosition(input: ResolveDisplayPositionInput): PositionEstimate | null {
  const { aircraft, lastPosition, route, state } = input;

  if (aircraft && aircraft.lat !== null && aircraft.lon !== null) {
    return {
      kind: "live",
      lat: aircraft.lat,
      lon: aircraft.lon,
      headingDeg: aircraft.trackDeg,
      progressPct: null,
      note: "실시간 ADS-B 신호",
    };
  }

  const destPoint = toLatLon(route?.destination);
  const originPoint = toLatLon(route?.origin);

  // In-flight but currently no signal: dead-reckon from the last real fix
  // toward the destination along the great-circle route.
  if (lastPosition?.lat != null && lastPosition?.lon != null && destPoint && (state === "live" || state === "stale")) {
    const lastPoint: LatLon = { lat: lastPosition.lat, lon: lastPosition.lon };
    const remainingKm = haversineDistanceKm(lastPoint, destPoint);

    if (remainingKm < ARRIVAL_THRESHOLD_KM) {
      return {
        kind: "destination",
        lat: destPoint.lat,
        lon: destPoint.lon,
        headingDeg: null,
        progressPct: 100,
        note: "목적지 도착 직전으로 추정됩니다 (실시간 신호 없음).",
      };
    }

    const elapsedHours = Math.max(0, (Date.now() - new Date(lastPosition.observed_at).getTime()) / 3_600_000);
    const speedKmh = lastPosition.gs_kt ? lastPosition.gs_kt * KT_TO_KMH : DEFAULT_CRUISE_SPEED_KMH;
    const traveledKm = speedKmh * elapsedHours;
    const fraction = Math.min(1, traveledKm / remainingKm);

    if (fraction >= 0.98) {
      return {
        kind: "destination",
        lat: destPoint.lat,
        lon: destPoint.lon,
        headingDeg: null,
        progressPct: 100,
        note: "예정된 비행시간이 지나 목적지 인근에 도착했을 것으로 추정됩니다 (실시간 신호 없음).",
      };
    }

    const estimated = greatCircleInterpolate(lastPoint, destPoint, fraction);
    const headingDeg = initialBearingDeg(estimated, destPoint);
    const progressPct = Math.round(fraction * 100);
    return {
      kind: "enroute",
      lat: estimated.lat,
      lon: estimated.lon,
      headingDeg,
      progressPct,
      note: `마지막 신호(${formatElapsed(elapsedHours)} 전) 이후 대권항로 기준 추정 위치입니다 · 진행률 약 ${progressPct}%`,
    };
  }

  // Never seen in the air. Note this deliberately doesn't claim "hasn't
  // departed yet" — we have no schedule data, so a flight that departed
  // and was never in ADS-B coverage looks identical to one that hasn't
  // taken off. The origin airport is shown as a reference point either way.
  if (state === "pending" && originPoint) {
    return {
      kind: "origin",
      lat: originPoint.lat,
      lon: originPoint.lon,
      headingDeg: null,
      progressPct: 0,
      note: "아직 실시간 신호를 받지 못했습니다 (출발 전이거나 커버리지 밖일 수 있음) — 참고용으로 출발 공항 위치를 표시합니다.",
    };
  }

  // No longer flying and we have no fresher fix to show -> arrival airport.
  if ((state === "landed" || state === "ended") && destPoint) {
    return {
      kind: "destination",
      lat: destPoint.lat,
      lon: destPoint.lon,
      headingDeg: null,
      progressPct: 100,
      note: "더 이상 신호가 없어 도착(예상) 공항 위치를 표시합니다.",
    };
  }

  return null;
}

function toLatLon(a: FlightRoute["origin"] | FlightRoute["destination"] | undefined | null): LatLon | null {
  if (!a || a.latitude == null || a.longitude == null) return null;
  return { lat: a.latitude, lon: a.longitude };
}

function formatElapsed(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}분`;
  return `${hours.toFixed(1)}시간`;
}
