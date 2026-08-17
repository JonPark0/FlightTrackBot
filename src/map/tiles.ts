import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { request } from "undici";
import { config } from "../config";
import { logger } from "../logger";

export const TILE_SIZE = 256;

/** Converts lon/lat (WGS84) to continuous (fractional) XYZ tile coordinates. */
export function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

let cacheReady = false;
function ensureCacheDir(): void {
  if (cacheReady) return;
  try {
    mkdirSync(config.tileCacheDir, { recursive: true });
  } catch {
    // best-effort; fall back to no on-disk caching if this fails
  }
  cacheReady = true;
}

function cachePath(z: number, x: number, y: number): string {
  return path.join(config.tileCacheDir, `${z}_${x}_${y}.png`);
}

const memCache = new Map<string, Buffer>();
const MEM_CACHE_MAX = 200;

/** Fetches (with on-disk + in-memory caching) a single raster tile. */
export async function fetchTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const n = 2 ** z;
  const wrappedX = ((x % n) + n) % n;
  if (y < 0 || y >= n) return null;

  const memKey = `${z}/${wrappedX}/${y}`;
  const mem = memCache.get(memKey);
  if (mem) return mem;

  ensureCacheDir();
  const diskFile = cachePath(z, wrappedX, y);
  if (existsSync(diskFile)) {
    try {
      const buf = readFileSync(diskFile);
      memCache.set(memKey, buf);
      return buf;
    } catch {
      // fall through to re-download
    }
  }

  const url = config.mapTileUrlTemplate
    .replace("{z}", String(z))
    .replace("{x}", String(wrappedX))
    .replace("{y}", String(y));

  try {
    const res = await request(url, {
      method: "GET",
      headers: { "user-agent": "flight-tracker-discord-bot/1.0" },
      headersTimeout: 10_000,
      bodyTimeout: 10_000,
    });
    if (res.statusCode >= 400) {
      logger.warn({ url, status: res.statusCode }, "tile fetch failed");
      return null;
    }
    const buf = Buffer.from(await res.body.arrayBuffer());

    if (memCache.size >= MEM_CACHE_MAX) {
      const firstKey = memCache.keys().next().value;
      if (firstKey) memCache.delete(firstKey);
    }
    memCache.set(memKey, buf);

    try {
      writeFileSync(diskFile, buf);
    } catch (err) {
      logger.debug({ err }, "failed to write tile cache to disk");
    }
    return buf;
  } catch (err) {
    logger.warn({ err, url }, "tile fetch errored");
    return null;
  }
}
