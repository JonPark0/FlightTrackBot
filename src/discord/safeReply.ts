import { ChatInputCommandInteraction, InteractionEditReplyOptions, InteractionReplyOptions } from "discord.js";
import { logger } from "../logger";
import { isTransientSocketError } from "./transientError";

/** editReply, retried once if the first attempt hits a transient socket error. */
export async function safeEditReply(
  interaction: ChatInputCommandInteraction,
  payload: string | InteractionEditReplyOptions,
): Promise<void> {
  try {
    await interaction.editReply(payload);
  } catch (err) {
    if (!isTransientSocketError(err)) throw err;
    logger.warn({ err }, "editReply hit a transient socket error, retrying once");
    await interaction.editReply(payload);
  }
}

/** reply, retried once if the first attempt hits a transient socket error. */
export async function safeReply(
  interaction: ChatInputCommandInteraction,
  payload: string | InteractionReplyOptions,
): Promise<void> {
  try {
    await interaction.reply(payload);
  } catch (err) {
    if (!isTransientSocketError(err)) throw err;
    logger.warn({ err }, "reply hit a transient socket error, retrying once");
    await interaction.reply(payload);
  }
}
