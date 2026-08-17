import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { listTrackings } from "../db/trackings";
import { flightLabel, threadLink } from "./shared";
import { replyError } from "./shared";
import { safeReply } from "../discord/safeReply";

const STATE_EMOJI: Record<string, string> = {
  pending: "\u{1F7E1}",
  live: "\u{1F7E2}",
  stale: "\u{26AA}",
  landed: "\u{1F535}",
};

export async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await replyError(interaction, "이 명령어는 서버에서만 사용할 수 있습니다.");
    return;
  }

  const trackings = await listTrackings(guildId);
  if (trackings.length === 0) {
    await safeReply(interaction, { content: "현재 이 서버에서 추적 중인 항공편이 없습니다.", flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("✈️ 추적 중인 항공편")
    .setColor(0x3b82f6)
    .setDescription(
      trackings
        .map((t) => {
          const emoji = STATE_EMOJI[t.state] ?? "⚫";
          const thread = t.thread_id ? threadLink(guildId, t.thread_id) : "스레드 없음";
          return `${emoji} **${flightLabel(t)}** — ${t.interval_seconds}초 주기, ${t.display_mode} 모드\n${thread}`;
        })
        .join("\n\n"),
    );

  await safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}
