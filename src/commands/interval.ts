import { ChatInputCommandInteraction } from "discord.js";
import { config } from "../config";
import { findTrackingByQuery, setInterval_ } from "../db/trackings";
import { flightLabel, isValidInterval, replyError } from "./shared";

export async function handleInterval(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await replyError(interaction, "이 명령어는 서버에서만 사용할 수 있습니다.");
    return;
  }

  const rawInput = interaction.options.getString("flight", true).trim().toUpperCase();
  const seconds = interaction.options.getInteger("seconds", true);

  if (!isValidInterval(seconds)) {
    await replyError(
      interaction,
      `갱신 주기는 ${config.minIntervalSeconds}초~${config.maxIntervalSeconds}초 사이여야 합니다.`,
    );
    return;
  }

  const tracking = await findTrackingByQuery(guildId, rawInput);
  if (!tracking) {
    await replyError(interaction, `추적 중인 항공편을 찾을 수 없습니다: ${rawInput}`);
    return;
  }

  await setInterval_(tracking.id, seconds);
  await interaction.reply(`✅ **${flightLabel(tracking)}**의 갱신 주기를 ${seconds}초로 변경했습니다.`);
}
