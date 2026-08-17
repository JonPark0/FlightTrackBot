import { setDefaultResultOrder } from "node:dns";

/**
 * Some hosting environments advertise AAAA (IPv6) records for outbound
 * hosts (adsb.lol, adsb.fi, adsbdb.com, map tile servers) even though the
 * container/host has no actual IPv6 route. Node's default DNS result order
 * ("verbatim") lets Happy Eyeballs try the dead IPv6 candidate first,
 * burning most of the connect timeout before falling back to IPv4 —
 * observed in practice as multi-second stalls on every adsbdb lookup.
 * Preferring IPv4 avoids that without disabling IPv6 outright.
 *
 * Must be imported before any networking code runs, so both entrypoints
 * (index.ts and discord/registerCommands.ts, which can also run
 * standalone via `npm run register-commands`) import this first.
 */
setDefaultResultOrder("ipv4first");
