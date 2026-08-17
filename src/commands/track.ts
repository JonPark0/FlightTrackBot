import { ChannelType, ChatInputCommandInteraction, TextChannel } from "discord.js";
import { logger } from "../logger";
import { config } from "../config";
import { identifyQuery } from "../util/identifyQuery";
import { lookupFlightRoute } from "../meta/adsbdb";
import { countActiveTrackings, createTracking, findTrackingByQuery, setThread } from "../db/trackings";
import { QueryType } from "../db/types";
import { createFlightThread } from "../discord/threads";
import { processTrackingTick } from "../service/flightUpdate";
import { botHasChannelPermissions, clampInterval, flightLabel, isValidInterval, replyError, threadLink } from "./shared";
import { safeEditReply } from "../discord/safeReply";

export async function handleTrack(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId || interaction.channel?.type !== ChannelType.GuildText) {
    await replyError(interaction, "이 명령어는 서버의 텍스트 채널에서만 사용할 수 있습니다.");
    return;
  }
  const channel = interaction.channel as TextChannel;

  if (!botHasChannelPermissions(channel)) {
    await replyError(
      interaction,
      "이 채널에서 봇에게 필요한 권한(스레드 생성/전송/파일 첨부 등)이 없습니다. 채널 권한을 확인해주세요.",
    );
    return;
  }

  const rawInput = interaction.options.getString("flight", true);
  const typeOverride = interaction.options.getString("type") as QueryType | null;
  const intervalInput = interaction.options.getInteger("interval");
  const mode = (interaction.options.getString("mode") as "live" | "log" | null) ?? "live";

  const identified = typeOverride
    ? { type: typeOverride, value: rawInput.trim().toUpperCase() }
    : identifyQuery(rawInput);

  if (intervalInput !== null && !isValidInterval(intervalInput)) {
    await replyError(
      interaction,
      `갱신 주기는 ${config.minIntervalSeconds}초~${config.maxIntervalSeconds}초 사이여야 합니다.`,
    );
    return;
  }
  const intervalSeconds = clampInterval(intervalInput ?? config.defaultIntervalSeconds);

  const activeCount = await countActiveTrackings(guildId);
  if (activeCount >= config.maxTrackingsPerGuild) {
    await replyError(
      interaction,
      `이 서버는 최대 ${config.maxTrackingsPerGuild}개까지 동시 추적할 수 있습니다. 먼저 \`/flight untrack\`으로 일부를 정리해주세요.`,
    );
    return;
  }

  const existing = await findTrackingByQuery(guildId, identified.value);
  if (existing) {
    await replyError(interaction, `이미 추적 중입니다: ${flightLabel(existing)} (${threadLink(guildId, existing.thread_id ?? "")})`);
    return;
  }

  await interaction.deferReply();

  // For callsign-type input, try resolving an IATA flight number (e.g.
  // KE855) to its ICAO callsign (KAL855) — ADS-B lookups need the ICAO
  // form. If the input is already an ICAO callsign this just confirms it.
  let resolvedCallsign: string | null = null;
  if (identified.type === "callsign") {
    try {
      const route = await lookupFlightRoute(identified.value);
      resolvedCallsign = route?.callsign_icao ?? null;
    } catch (err) {
      logger.warn({ err }, "route resolution failed during track registration");
    }
  }

  const tracking = await createTracking({
    guildId,
    channelId: channel.id,
    queryType: identified.type,
    queryValue: identified.value,
    resolvedCallsign,
    displayMode: mode,
    intervalSeconds,
    createdBy: interaction.user.id,
  });

  let thread;
  try {
    thread = await createFlightThread(channel, resolvedCallsign ?? identified.value);
  } catch (err) {
    logger.error({ err }, "failed to create thread for tracking");
    await safeEditReply(interaction, "⚠️ 스레드 생성에 실패했습니다. 봇 권한을 확인해주세요.");
    return;
  }
  await setThread(tracking.id, thread.id);
  tracking.thread_id = thread.id;

  await safeEditReply(
    interaction,
    `✅ **${flightLabel(tracking)}** 추적을 시작했습니다. 업데이트는 ${thread} 에서 ${intervalSeconds}초마다 게시됩니다.`,
  );

  // Post the first snapshot immediately instead of waiting for the next
  // scheduler tick, so the user gets instant feedback.
  try {
    await processTrackingTick(interaction.client, tracking);
  } catch (err) {
    logger.error({ err, trackingId: tracking.id }, "initial tick failed after track registration");
  }
}
