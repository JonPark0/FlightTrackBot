import sharp, { OverlayOptions } from "sharp";
import { config } from "../config";
import { fetchTile, lonLatToTile, TILE_SIZE } from "./tiles";

const GRID = 3; // 3x3 tile mosaic
const OUTPUT_W = 640;
const OUTPUT_H = 420;

export interface TrailPoint {
  lat: number;
  lon: number;
}

/**
 * "live": the real, current ADS-B fix (solid red heading arrow).
 * "estimated": a dead-reckoned in-flight position (dashed amber arrow) —
 *   see src/service/positionEstimate.ts.
 * "airport": a stationary marker at a departure/arrival airport (blue pin,
 *   not rotated) for flights that aren't currently airborne.
 */
export type MarkerStyle = "live" | "estimated" | "airport";

export interface RenderFlightMapInput {
  lat: number;
  lon: number;
  trackDeg: number | null;
  onGround: boolean;
  altFt: number | null;
  gsKt: number | null;
  trail: TrailPoint[];
  markerStyle?: MarkerStyle;
  /** Overrides the altitude-based zoom heuristic (used for airport/estimate views). */
  fixedZoom?: number;
}

/** Picks a reasonable zoom level based on how "fast" the situation is. */
function pickZoom(input: RenderFlightMapInput): number {
  if (input.fixedZoom !== undefined) return input.fixedZoom;
  if (input.onGround) return 12;
  const alt = input.altFt ?? 0;
  if (alt < 5000) return 10;
  if (alt < 15000) return 8;
  if (alt < 30000) return 7;
  return 6;
}

function tileToWorldPx(tileCoord: number): number {
  return tileCoord * TILE_SIZE;
}

/**
 * Renders a PNG snapshot: a 3x3 tile mosaic centered on the aircraft,
 * cropped to a fixed output size, with the recent track trail and a
 * heading-rotated aircraft marker drawn on top.
 */
export async function renderFlightMap(input: RenderFlightMapInput): Promise<Buffer> {
  const zoom = pickZoom(input);
  const center = lonLatToTile(input.lon, input.lat, zoom);
  const centerTileX = Math.floor(center.x);
  const centerTileY = Math.floor(center.y);
  const originTileX = centerTileX - Math.floor(GRID / 2);
  const originTileY = centerTileY - Math.floor(GRID / 2);
  const originWorldPxX = tileToWorldPx(originTileX);
  const originWorldPxY = tileToWorldPx(originTileY);

  const mosaicSize = GRID * TILE_SIZE;

  // Fetch all 9 mosaic tiles concurrently rather than one at a time — with a
  // cold cache this was previously up to 9 sequential round-trips (each with
  // its own up-to-10s timeout), easily pushing total command latency past
  // Discord's ~15s per-request timeout and aborting the reply.
  const tileJobs: Promise<{ dx: number; dy: number; tile: Buffer | null }>[] = [];
  for (let dx = 0; dx < GRID; dx++) {
    for (let dy = 0; dy < GRID; dy++) {
      tileJobs.push(
        fetchTile(zoom, originTileX + dx, originTileY + dy).then((tile) => ({ dx, dy, tile })),
      );
    }
  }
  const tileResults = await Promise.all(tileJobs);

  const composites: OverlayOptions[] = [];
  for (const { dx, dy, tile } of tileResults) {
    if (tile) {
      composites.push({ input: tile, left: dx * TILE_SIZE, top: dy * TILE_SIZE });
    }
  }

  // Render the tile mosaic to a plain buffer first, then crop, then
  // composite the overlay on the cropped result. Chaining extract() after
  // composite() on the same pipeline re-applies the composite against the
  // post-extract (smaller) canvas in sharp, which throws a dimension
  // mismatch — so each step gets its own buffer instead.
  const mosaicBuffer = await sharp({
    create: {
      width: mosaicSize,
      height: mosaicSize,
      channels: 3,
      background: { r: 226, g: 232, b: 240 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const aircraftPx = {
    x: tileToWorldPx(center.x) - originWorldPxX,
    y: tileToWorldPx(center.y) - originWorldPxY,
  };

  const trailPx = input.trail.map((p) => {
    const t = lonLatToTile(p.lon, p.lat, zoom);
    return { x: tileToWorldPx(t.x) - originWorldPxX, y: tileToWorldPx(t.y) - originWorldPxY };
  });

  // Crop a fixed-size window centered on the aircraft, clamped to the
  // mosaic bounds.
  const cropLeft = Math.min(Math.max(0, Math.round(aircraftPx.x - OUTPUT_W / 2)), mosaicSize - OUTPUT_W);
  const cropTop = Math.min(Math.max(0, Math.round(aircraftPx.y - OUTPUT_H / 2)), mosaicSize - OUTPUT_H);
  const cropWidth = Math.min(OUTPUT_W, mosaicSize);
  const cropHeight = Math.min(OUTPUT_H, mosaicSize);

  const croppedBuffer = await sharp(mosaicBuffer)
    .extract({ left: Math.max(0, cropLeft), top: Math.max(0, cropTop), width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  const overlaySvg = buildOverlaySvg(
    cropWidth,
    cropHeight,
    { x: aircraftPx.x - cropLeft, y: aircraftPx.y - cropTop },
    trailPx.map((p) => ({ x: p.x - cropLeft, y: p.y - cropTop })),
    input.trackDeg ?? 0,
    input.markerStyle ?? "live",
  );

  return sharp(croppedBuffer)
    .composite([{ input: Buffer.from(overlaySvg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

function buildOverlaySvg(
  width: number,
  height: number,
  aircraft: { x: number; y: number },
  trail: { x: number; y: number }[],
  headingDeg: number,
  markerStyle: MarkerStyle,
): string {
  const points = trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const polyline =
    trail.length > 1
      ? `<polyline points="${points}" fill="none" stroke="#2563eb" stroke-width="3" stroke-opacity="0.75" stroke-linecap="round" stroke-linejoin="round" />`
      : "";

  const marker = buildMarkerSvg(aircraft, headingDeg, markerStyle);

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${polyline}
    ${marker}
  </svg>`;
}

function buildMarkerSvg(pos: { x: number; y: number }, headingDeg: number, style: MarkerStyle): string {
  if (style === "airport") {
    // Stationary pin — no heading, since it marks a fixed airport location.
    return `
    <g transform="translate(${pos.x},${pos.y})">
      <circle r="16" fill="#2563eb" fill-opacity="0.18" stroke="#2563eb" stroke-width="1.5" />
      <circle r="7" fill="#2563eb" stroke="#1e3a8a" stroke-width="2" />
    </g>`;
  }
  if (style === "estimated") {
    // Same heading-arrow shape as "live", but dashed/translucent amber to
    // visually mark it as a dead-reckoned guess rather than a real fix.
    return `
    <g transform="translate(${pos.x},${pos.y}) rotate(${headingDeg})">
      <polygon points="0,-11 8,10 0,5 -8,10" fill="#f59e0b" fill-opacity="0.55" stroke="#b45309" stroke-width="1.5" stroke-dasharray="3,2" />
    </g>`;
  }
  // "live": solid red heading arrow, nose pointing "up" before rotation.
  return `
    <g transform="translate(${pos.x},${pos.y}) rotate(${headingDeg})">
      <polygon points="0,-11 8,10 0,5 -8,10" fill="#ef4444" stroke="#7f1d1d" stroke-width="1.5" />
    </g>`;
}

/** Attribution strip appended below the map so the tile source is credited. */
export async function withAttribution(mapPng: Buffer): Promise<Buffer> {
  const meta = await sharp(mapPng).metadata();
  const w = meta.width ?? OUTPUT_W;
  const stripH = 20;

  const svg = `<svg width="${w}" height="${stripH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${stripH}" fill="#0f172a" />
    <text x="6" y="${stripH - 6}" font-family="sans-serif" font-size="11" fill="#cbd5e1">${escapeXml(
      config.mapAttribution,
    )}</text>
  </svg>`;

  return sharp({
    create: { width: w, height: (meta.height ?? OUTPUT_H) + stripH, channels: 3, background: "#0f172a" },
  })
    .composite([
      { input: mapPng, left: 0, top: 0 },
      { input: Buffer.from(svg), left: 0, top: meta.height ?? OUTPUT_H },
    ])
    .png()
    .toBuffer();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
