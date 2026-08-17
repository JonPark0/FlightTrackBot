import { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { identifyQuery } from "../util/identifyQuery";
import { lookupAircraft } from "../adsb/client";
import { lookupFlightRoute, lookupAircraftInfo } from "../meta/adsbdb";
import { renderFlightMap, withAttribution } from "../map/render";
import { buildFlightEmbed } from "../embeds/flightEmbed";
import { Tracking, QueryType } from "../db/types";

/** One-off lookup, no tracking registered. Reuses the same embed builder. */
export async function handleInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawInput = interaction.options.getString("flight", true);
  const typeOverride = interaction.options.getString("type") as QueryType | null;
  const identified = typeOverride
    ? { type: typeOverride, value: rawInput.trim().toUpperCase() }
    : identifyQuery(rawInput);

  await interaction.deferReply();

  // For callsign-type input, resolve an IATA flight number (e.g. OZ222) to
  // its ICAO callsign (AAR222) *before* querying ADS-B — transponders only
  // ever broadcast the ICAO form, so querying with the raw IATA input
  // would silently return nothing even for an airborne flight. If the
  // input is already an ICAO callsign this just confirms it and also
  // gives us the route for display.
  let route = null as Awaited<ReturnType<typeof lookupFlightRoute>>;
  let adsbQueryValue = identified.value;
  if (identified.type === "callsign") {
    route = await lookupFlightRoute(identified.value);
    adsbQueryValue = route?.callsign_icao ?? identified.value;
  }

  const results = await lookupAircraft(identified.type, adsbQueryValue);
  const aircraft = results[0] ?? null;

  if (!route) {
    const callsignForRoute = identified.type === "callsign" ? adsbQueryValue : aircraft?.flight ?? null;
    route = callsignForRoute ? await lookupFlightRoute(callsignForRoute) : null;
  }

  const acKey = aircraft?.hex ?? aircraft?.registration ?? (identified.type === "registration" ? identified.value : null);
  const aircraftInfo = acKey ? await lookupAircraftInfo(acKey) : null;

  const pseudoTracking: Tracking = {
    id: 0,
    guild_id: interaction.guildId ?? "",
    channel_id: interaction.channelId ?? "",
    thread_id: null,
    live_message_id: null,
    query_type: identified.type,
    query_value: identified.value,
    resolved_callsign: route?.callsign_icao ?? aircraft?.flight ?? null,
    display_mode: "log",
    interval_seconds: 0,
    state: aircraft ? (aircraft.onGround ? "landed" : "live") : "pending",
    next_update_at: new Date().toISOString(),
    last_seen_at: aircraft ? new Date().toISOString() : null,
    last_state_change_at: new Date().toISOString(),
    fail_count: 0,
    created_by: interaction.user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const files: AttachmentBuilder[] = [];
  let mapAttachmentName: string | null = null;
  if (aircraft?.lat !== null && aircraft?.lon !== null && aircraft) {
    try {
      const rendered = await withAttribution(
        await renderFlightMap({
          lat: aircraft.lat as number,
          lon: aircraft.lon as number,
          trackDeg: aircraft.trackDeg,
          onGround: aircraft.onGround,
          altFt: aircraft.altFt,
          gsKt: aircraft.gsKt,
          trail: [],
        }),
      );
      mapAttachmentName = `map-${Date.now()}.png`;
      files.push(new AttachmentBuilder(rendered, { name: mapAttachmentName }));
    } catch {
      // map render failures shouldn't block the info reply
    }
  }

  const embed = buildFlightEmbed({ tracking: pseudoTracking, aircraft, route, aircraftInfo, mapAttachmentName });
  if (!aircraft) {
    await interaction.editReply({
      content: "현재 이 항공편의 실시간 신호를 찾지 못했습니다 (운항 전/후이거나 커버리지 밖일 수 있습니다).",
      embeds: [embed],
    });
    return;
  }
  await interaction.editReply({ embeds: [embed], files });
}
