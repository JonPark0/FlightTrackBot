import "../net"; // no-op if index.ts already imported it; needed when this file runs standalone
import { REST, Routes } from "discord.js";
import { config } from "../config";
import { logger } from "../logger";
import { flightCommandData } from "../commands/flightCommand";

export async function registerSlashCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const body = [flightCommandData.toJSON()];

  if (config.discordGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), { body });
    logger.info({ guildId: config.discordGuildId }, "Registered guild slash commands (instant)");
  } else {
    await rest.put(Routes.applicationCommands(config.discordClientId), { body });
    logger.info("Registered global slash commands (may take up to ~1 hour to propagate)");
  }
}

// Allow running this file standalone via `npm run register-commands`.
if (require.main === module) {
  registerSlashCommands().catch((err) => {
    logger.error({ err }, "Failed to register slash commands");
    process.exit(1);
  });
}
