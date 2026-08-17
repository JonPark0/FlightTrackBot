import { setDefaultResultOrder } from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";

/**
 * Some hosting environments advertise AAAA (IPv6) records for outbound
 * hosts (adsb.lol, adsb.fi, adsbdb.com, map tile servers) even though the
 * container/host has no actual IPv6 route — confirmed against adsbdb.com,
 * which resolves both an A and an AAAA record while the AAAA is
 * unreachable (ENETUNREACH).
 *
 * Just reordering DNS results (ipv4first) is not enough: Node's Happy
 * Eyeballs (RFC 8305) still races the IPv6 candidate in parallel if the
 * IPv4 connect hasn't completed within ~250ms, so a merely slow IPv4
 * connect still ends up paying for the dead IPv6 attempt too — this was
 * observed in production as an AggregateError combining an IPv4 ETIMEDOUT
 * with an IPv6 ENETUNREACH. Pinning the global undici dispatcher to
 * `family: 4` skips IPv6 resolution/connection entirely, which is the
 * actual fix; setDefaultResultOrder is kept as a harmless belt-and-braces
 * default for any networking that doesn't go through this dispatcher.
 *
 * Must be imported before any networking code runs, so both entrypoints
 * (index.ts and discord/registerCommands.ts, which can also run
 * standalone via `npm run register-commands`) import this first.
 */
setDefaultResultOrder("ipv4first");
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
