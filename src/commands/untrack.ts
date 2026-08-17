import { ChatInputCommandInteraction } from "discord.js";
import { logger } from "../logger";
import { endTracking, findTrackingByQuery } from "../db/trackings";
import { fetchThread, postStateNotice, archiveThread } from "../discord/threads";
import { flightLabel, replyError } from "./shared";

export async function handleUntrack(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await replyError(interaction, "이 명령어는 서버에서만 사용할 수 있습니다.");
    return;
  }

  const rawInput = interaction.options.getString("flight", true).trim().toUpperCase();
  const tracking = await findTrackingByQuery(guildId, rawInput);
  if (!tracking) {
    await replyError(interaction, `추적 중인 항공편을 찾을 수 없습니다: ${rawInput}`);
    return;
  }

  await endTracking(tracking.id);

  if (tracking.thread_id) {
    const thread = await fetchThread(interaction.client, tracking.thread_id);
    if (thread) {
      await postStateNotice(thread, "⏹️ 사용자 요청으로 추적이 종료되었습니다.");
      await archiveThread(thread, "Tracking stopped by user");
    }
  }

  await interaction.reply(`✅ **${flightLabel(tracking)}** 추적을 종료했습니다.`);
  logger.info({ trackingId: tracking.id, by: interaction.user.id }, "tracking ended by user");
}
