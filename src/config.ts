function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    // eslint-disable-next-line no-console
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,

  databaseUrl: required("DATABASE_URL"),

  nodeEnv: process.env.NODE_ENV ?? "production",
  logLevel: process.env.LOG_LEVEL ?? "info",

  defaultIntervalSeconds: optionalInt("DEFAULT_UPDATE_INTERVAL_SECONDS", 300),
  minIntervalSeconds: optionalInt("MIN_UPDATE_INTERVAL_SECONDS", 60),
  maxIntervalSeconds: optionalInt("MAX_UPDATE_INTERVAL_SECONDS", 3600),
  maxTrackingsPerGuild: optionalInt("MAX_TRACKINGS_PER_GUILD", 15),

  adsbPrimaryUrl: (process.env.ADSB_PRIMARY_URL ?? "https://api.adsb.lol").replace(/\/$/, ""),
  adsbFallbackUrl: (process.env.ADSB_FALLBACK_URL ?? "https://opendata.adsb.fi/api").replace(/\/$/, ""),
  adsbMetaUrl: (process.env.ADSB_META_URL ?? "https://api.adsbdb.com/v0").replace(/\/$/, ""),
  adsbRateLimitPerSec: optionalFloat("ADSB_RATE_LIMIT_PER_SEC", 1),

  mapTileUrlTemplate:
    process.env.MAP_TILE_URL_TEMPLATE ??
    "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  mapAttribution: process.env.MAP_ATTRIBUTION ?? "(c) OpenStreetMap contributors (c) CARTO",
  tileCacheDir: process.env.TILE_CACHE_DIR ?? ".tilecache",
};
