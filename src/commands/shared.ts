import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, TextChannel } from "discord.js";
import { config } from "../config";
import { Tracking } from "../db/types";

export const REQUIRED_BOT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ManageThreads,
];

export function clampInterval(seconds: number): number {
  return Math.min(config.maxIntervalSeconds, Math.max(config.minIntervalSeconds, seconds));
}

export function isValidInterval(seconds: number): boolean {
  return seconds >= config.minIntervalSeconds && seconds <= config.maxIntervalSeconds;
}

/** Ensures the bot has what it needs in a target text channel before acting. */
export function botHasChannelPermissions(channel: TextChannel): boolean {
  const me = channel.guild.members.me;
  if (!me) return false;
  const perms = channel.permissionsFor(me);
  if (!perms) return false;
  return REQUIRED_BOT_PERMISSIONS.every((p) => perms.has(p));
}

/**
 * Only call this before deferReply()/reply() — once a reply is deferred
 * publicly, Discord does not allow retroactively making the edit
 * ephemeral. All current call sites (validation checks in track/move/etc.)
 * run before any defer, so this is always a fresh ephemeral reply.
 */
export async function replyError(interaction: ChatInputCommandInteraction, message: string): Promise<void> {
  const content = `⚠️ ${message}`;
  if (interaction.deferred || interaction.replied) {
    // editReply cannot retroactively add the ephemeral flag — only relevant
    // if a call site starts calling this after a public defer/reply.
    await interaction.editReply({ content });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

export function flightLabel(tracking: Tracking): string {
  return tracking.resolved_callsign ?? tracking.query_value;
}

export function threadLink(guildId: string, threadId: string): string {
  return `https://discord.com/channels/${guildId}/${threadId}`;
}
