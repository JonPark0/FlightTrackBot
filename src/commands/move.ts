import { ChannelType, ChatInputCommandInteraction, TextChannel } from "discord.js";
import { logger } from "../logger";
import { findTrackingByQuery, setChannelAndThread } from "../db/trackings";
import { createFlightThread, fetchThread, postStateNotice, archiveThread } from "../discord/threads";
import { botHasChannelPermissions, flightLabel, replyError, threadLink } from "./shared";
import { safeEditReply } from "../discord/safeReply";

/**
 * Discord threads cannot be moved between channels via the API, so "move"
 * is implemented as: create a fresh thread under the target channel, point
 * the tracking at it, and archive the old thread with a link forward.
 */
export async function handleMove(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await replyError(interaction, "이 명령어는 서버에서만 사용할 수 있습니다.");
    return;
  }

  const rawInput = interaction.options.getString("flight", true).trim().toUpperCase();
  const targetChannel = interaction.options.getChannel("channel", true);

  if (targetChannel.type !== ChannelType.GuildText) {
    await replyError(interaction, "대상 채널은 일반 텍스트 채널이어야 합니다.");
    return;
  }

  const tracking = await findTrackingByQuery(guildId, rawInput);
  if (!tracking) {
    await replyError(interaction, `추적 중인 항공편을 찾을 수 없습니다: ${rawInput}`);
    return;
  }

  const channel = (await interaction.guild?.channels.fetch(targetChannel.id)) as TextChannel | null;
  if (!channel) {
    await replyError(interaction, "대상 채널을 찾을 수 없습니다.");
    return;
  }
  if (!botHasChannelPermissions(channel)) {
    await replyError(interaction, "대상 채널에서 봇에게 필요한 권한이 없습니다.");
    return;
  }

  await interaction.deferReply();

  let newThread;
  try {
    newThread = await createFlightThread(channel, flightLabel(tracking));
  } catch (err) {
    logger.error({ err }, "failed to create thread while moving tracking");
    await safeEditReply(interaction, "⚠️ 새 스레드 생성에 실패했습니다.");
    return;
  }

  const oldThread = tracking.thread_id ? await fetchThread(interaction.client, tracking.thread_id) : null;

  await setChannelAndThread(tracking.id, channel.id, newThread.id);

  if (oldThread) {
    await postStateNotice(oldThread, `\u{27A1}️ 이 항공편의 추적이 ${threadLink(guildId, newThread.id)} (으)로 이동했습니다.`);
    await archiveThread(oldThread, "Tracking moved to another channel");
  }
  await newThread.send(`\u{2705} **${flightLabel(tracking)}** 추적이 이 스레드로 이동했습니다.`);

  await safeEditReply(interaction, `✅ 추적을 ${channel} 로 이동했습니다: ${newThread}`);
}
