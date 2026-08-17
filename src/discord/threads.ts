import {
  AnyThreadChannel,
  ChannelType,
  Client,
  EmbedBuilder,
  Message,
  TextChannel,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { logger } from "../logger";

/** Creates a public thread under a text channel for a newly tracked flight. */
export async function createFlightThread(
  channel: TextChannel,
  flightLabel: string,
): Promise<AnyThreadChannel> {
  const name = `✈ ${flightLabel}`.slice(0, 100);
  return channel.threads.create({
    name,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    reason: `Flight tracking started for ${flightLabel}`,
  });
}

export async function fetchThread(client: Client, threadId: string): Promise<AnyThreadChannel | null> {
  try {
    const channel = await client.channels.fetch(threadId);
    if (channel && channel.isThread()) return channel;
    return null;
  } catch (err) {
    logger.warn({ err, threadId }, "failed to fetch thread");
    return null;
  }
}

export async function fetchTextChannel(client: Client, channelId: string): Promise<TextChannel | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.type === ChannelType.GuildText) return channel as TextChannel;
    return null;
  } catch (err) {
    logger.warn({ err, channelId }, "failed to fetch channel");
    return null;
  }
}

export interface UpdatePayload {
  embeds: EmbedBuilder[];
  files: { attachment: Buffer; name: string }[];
}

/**
 * Posts a fresh message ("log" mode, or the first post of "live" mode).
 */
export async function postNewMessage(
  thread: AnyThreadChannel,
  payload: UpdatePayload,
): Promise<Message> {
  if (thread.archived) {
    await thread.setArchived(false, "Resuming flight update posts");
  }
  return thread.send({ embeds: payload.embeds, files: payload.files });
}

/**
 * Edits the existing live-mode message in place. Explicitly clears prior
 * attachments and uses a unique file name per update — reusing a filename
 * across edits can leave the previous image visible/ambiguous in clients.
 */
export async function editLiveMessage(
  thread: AnyThreadChannel,
  messageId: string,
  payload: UpdatePayload,
): Promise<Message | null> {
  try {
    const message = await thread.messages.fetch(messageId);
    return await message.edit({ embeds: payload.embeds, files: payload.files, attachments: [] });
  } catch (err) {
    logger.warn({ err, messageId }, "failed to edit live message, will post a new one");
    return null;
  }
}

export async function postStateNotice(thread: AnyThreadChannel, text: string): Promise<void> {
  try {
    if (thread.archived) {
      await thread.setArchived(false, "Posting state change notice");
    }
    await thread.send({ content: text });
  } catch (err) {
    logger.warn({ err }, "failed to post state notice");
  }
}

export async function archiveThread(thread: AnyThreadChannel, reason: string): Promise<void> {
  try {
    await thread.setArchived(true, reason);
  } catch (err) {
    logger.warn({ err }, "failed to archive thread");
  }
}
