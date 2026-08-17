import { NormalizedAircraft } from "../adsb/types";
import { Tracking, TrackingState } from "../db/types";

const STALE_AFTER_MS = 15 * 60 * 1000; // 15 min without a position report
const PENDING_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours never seen -> ended
const STALE_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours stale -> ended

export interface StateDecision {
  state: TrackingState;
  sawAircraft: boolean;
}

/**
 * Pure state-transition function. Landing is only inferred from an actual
 * on-ground report (never from silence alone — an oceanic coverage gap
 * looks identical to a landing from the outside, so "stale" always means
 * "signal lost", not "landed").
 */
export function nextState(tracking: Tracking, aircraft: NormalizedAircraft | null, now: Date): StateDecision {
  const lastSeenAt = tracking.last_seen_at ? new Date(tracking.last_seen_at) : null;
  const lastStateChangeAt = new Date(tracking.last_state_change_at);

  if (aircraft) {
    if (aircraft.onGround && (tracking.state === "live" || tracking.state === "stale")) {
      return { state: "landed", sawAircraft: true };
    }
    if (aircraft.onGround && tracking.state === "landed") {
      return { state: "landed", sawAircraft: true };
    }
    return { state: "live", sawAircraft: true };
  }

  // No aircraft returned this tick.
  switch (tracking.state) {
    case "pending": {
      const pendingFor = now.getTime() - new Date(tracking.created_at).getTime();
      if (pendingFor > PENDING_TIMEOUT_MS) return { state: "ended", sawAircraft: false };
      return { state: "pending", sawAircraft: false };
    }
    case "live": {
      // Grace period: a single missed poll (cache miss, brief coverage
      // blip) shouldn't immediately flip the badge to "signal lost".
      if (lastSeenAt && now.getTime() - lastSeenAt.getTime() <= STALE_AFTER_MS) {
        return { state: "live", sawAircraft: false };
      }
      return { state: "stale", sawAircraft: false };
    }
    case "stale": {
      const staleFor = now.getTime() - lastStateChangeAt.getTime();
      if (staleFor > STALE_TIMEOUT_MS) return { state: "ended", sawAircraft: false };
      return { state: "stale", sawAircraft: false };
    }
    case "landed": {
      // Landed + no longer reporting at all (taxied out of coverage / shut
      // down transponder) — treat as a normal end of tracking.
      return { state: "ended", sawAircraft: false };
    }
    default:
      return { state: tracking.state, sawAircraft: false };
  }
}
