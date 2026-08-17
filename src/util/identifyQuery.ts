import { QueryType } from "../db/types";

const HEX_RE = /^[0-9A-F]{6}$/;
// Very small set of registration prefixes that are unambiguous (no country
// uses these as an airline callsign prefix), used only to bias the
// best-effort heuristic. Anything not caught here still works fine — users
// can force the type with the `type` command option.
const REG_HINT_RE = /^([A-Z]-[A-Z0-9]{3,5}|N[0-9][0-9A-Z]{0,5}|[A-Z]{2}-[A-Z0-9]{2,5})$/;

/**
 * Best-effort auto-detection of whether a user-supplied string is a
 * callsign/flight number, a tail (registration) number, or an ICAO24 hex
 * address. Ambiguous by nature (registrations and callsigns can look
 * alike) — callers should also expose an explicit override option.
 */
export function identifyQuery(raw: string): { type: QueryType; value: string } {
  const value = raw.trim().toUpperCase();

  if (HEX_RE.test(value)) {
    return { type: "hex", value };
  }
  if (REG_HINT_RE.test(value)) {
    return { type: "registration", value };
  }
  return { type: "callsign", value };
}
