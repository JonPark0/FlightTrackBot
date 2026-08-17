import { ChatInputCommandInteraction } from "discord.js";
import { findTrackingByQuery, setDisplayMode } from "../db/trackings";
import { DisplayMode } from "../db/types";
import { flightLabel, replyError } from "./shared";

export async function handleMode(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await replyError(interaction, "이 명령어는 서버에서만 사용할 수 있습니다.");
    return;
  }

  const rawInput = interaction.options.getString("flight", true).trim().toUpperCase();
  const mode = interaction.options.getString("mode", true) as DisplayMode;

  const tracking = await findTrackingByQuery(guildId, rawInput);
  if (!tracking) {
    await replyError(interaction, `추적 중인 항공편을 찾을 수 없습니다: ${rawInput}`);
    return;
  }

  await setDisplayMode(tracking.id, mode);
  const desc = mode === "live" ? "실시간 메시지 편집(live)" : "매번 새 메시지(log)";
  await interaction.reply(`✅ **${flightLabel(tracking)}**의 게시 방식을 ${desc}으로 변경했습니다.`);
}
