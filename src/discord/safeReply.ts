import { ChatInputCommandInteraction, InteractionEditReplyOptions, InteractionReplyOptions } from "discord.js";
import { withSocketErrorRetry } from "./transientError";

/** editReply, retried with backoff if it hits transient Cloudflare socket errors. */
export async function safeEditReply(
  interaction: ChatInputCommandInteraction,
  payload: string | InteractionEditReplyOptions,
): Promise<void> {
  await withSocketErrorRetry("editReply", () => interaction.editReply(payload));
}

/** reply, retried with backoff if it hits transient Cloudflare socket errors. */
export async function safeReply(
  interaction: ChatInputCommandInteraction,
  payload: string | InteractionReplyOptions,
): Promise<void> {
  await withSocketErrorRetry("reply", () => interaction.reply(payload));
}
