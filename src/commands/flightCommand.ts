import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { logger } from "../logger";
import { handleTrack } from "./track";
import { handleUntrack } from "./untrack";
import { handleList } from "./list";
import { handleInfo } from "./info";
import { handleInterval } from "./interval";
import { handleMove } from "./move";
import { handleMode } from "./mode";

const TYPE_CHOICES = [
  { name: "콜사인/편명 (자동, IATA 가능)", value: "callsign" },
  { name: "등록번호 (Tail Number)", value: "registration" },
  { name: "ICAO24 Hex", value: "hex" },
] as const;

export const flightCommandData = new SlashCommandBuilder()
  .setName("flight")
  .setDescription("항공편 실시간 위치 추적")
  .addSubcommand((sub) =>
    sub
      .setName("track")
      .setDescription("항공편 추적을 시작하고 이 채널에 업데이트 스레드를 만듭니다")
      .addStringOption((opt) =>
        opt.setName("flight").setDescription("콜사인/편명/등록번호/hex (예: KE855, N12345, C2B571)").setRequired(true),
      )
      .addIntegerOption((opt) => opt.setName("interval").setDescription("갱신 주기 (초)").setRequired(false))
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("게시 방식")
          .addChoices({ name: "실시간 메시지 편집 (live)", value: "live" }, { name: "매번 새 메시지 (log)", value: "log" })
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName("type").setDescription("식별자 종류 (자동 판별을 강제로 지정)").addChoices(...TYPE_CHOICES).setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("untrack")
      .setDescription("항공편 추적을 종료합니다")
      .addStringOption((opt) => opt.setName("flight").setDescription("추적 중인 콜사인/편명/등록번호/hex").setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("이 서버에서 추적 중인 항공편 목록을 봅니다"))
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("등록 없이 항공편 정보를 즉시 조회합니다")
      .addStringOption((opt) => opt.setName("flight").setDescription("콜사인/편명/등록번호/hex").setRequired(true))
      .addStringOption((opt) =>
        opt.setName("type").setDescription("식별자 종류 (자동 판별을 강제로 지정)").addChoices(...TYPE_CHOICES).setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("interval")
      .setDescription("추적 중인 항공편의 갱신 주기를 변경합니다")
      .addStringOption((opt) => opt.setName("flight").setDescription("추적 중인 콜사인/편명/등록번호/hex").setRequired(true))
      .addIntegerOption((opt) => opt.setName("seconds").setDescription("새 갱신 주기 (초)").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("move")
      .setDescription("추적 스레드를 다른 채널로 옮깁니다 (새 스레드를 만들고 기존 스레드는 보관됩니다)")
      .addStringOption((opt) => opt.setName("flight").setDescription("추적 중인 콜사인/편명/등록번호/hex").setRequired(true))
      .addChannelOption((opt) => opt.setName("channel").setDescription("이동할 대상 텍스트 채널").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("mode")
      .setDescription("추적 중인 항공편의 게시 방식을 변경합니다")
      .addStringOption((opt) => opt.setName("flight").setDescription("추적 중인 콜사인/편명/등록번호/hex").setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("게시 방식")
          .addChoices({ name: "실시간 메시지 편집 (live)", value: "live" }, { name: "매번 새 메시지 (log)", value: "log" })
          .setRequired(true),
      ),
  );

export async function dispatchFlightCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  try {
    switch (sub) {
      case "track":
        return await handleTrack(interaction);
      case "untrack":
        return await handleUntrack(interaction);
      case "list":
        return await handleList(interaction);
      case "info":
        return await handleInfo(interaction);
      case "interval":
        return await handleInterval(interaction);
      case "move":
        return await handleMove(interaction);
      case "mode":
        return await handleMode(interaction);
      default:
        await interaction.reply({ content: "알 수 없는 명령어입니다.", flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    logger.error({ err, sub }, "command handler threw");
    const content = "⚠️ 명령어 처리 중 오류가 발생했습니다.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content }).catch(() => undefined);
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  }
}
