import "./net"; // must run before any networking code (see file for why)
import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";
import { logger } from "./logger";
import { runMigrations } from "./db/migrate";
import { pool } from "./db/pool";
import { dispatchFlightCommand } from "./commands/flightCommand";
import { registerSlashCommands } from "./discord/registerCommands";
import { startScheduler } from "./scheduler/tick";

async function main(): Promise<void> {
  logger.info("Running database migrations...");
  await runMigrations();
  logger.info("Migrations up to date.");

  try {
    await registerSlashCommands();
  } catch (err) {
    logger.warn({ err }, "Slash command registration failed at startup (will retry on next restart)");
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    // Default REST timeout (15s) was getting hit by /flight info replies
    // when map rendering ran long (e.g. cold tile cache); the tile-fetch
    // parallelization in map/render.ts addresses the root cause, this is
    // just a safety margin on top of that.
    rest: { timeout: 30_000 },
  });

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Discord client ready");
    startScheduler(c);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "flight") return;
    void dispatchFlightCommand(interaction);
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  await client.login(config.discordToken);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down...");
    client.destroy();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
