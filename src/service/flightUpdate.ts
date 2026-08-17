import { Client } from "discord.js";
import { logger } from "../logger";
import { Tracking, TrackingState } from "../db/types";
import { lookupAircraft } from "../adsb/client";
import { NormalizedAircraft } from "../adsb/types";
import { lookupFlightRoute, lookupAircraftInfo } from "../meta/adsbdb";
import { insertPosition, recentPositions } from "../db/positions";
import { applyTickResult, setLiveMessageId, endTracking } from "../db/trackings";
import { renderFlightMap, withAttribution } from "../map/render";
import { buildFlightEmbed } from "../embeds/flightEmbed";
import { nextState } from "./stateMachine";
import { fetchThread, postNewMessage, editLiveMessage, postStateNotice, archiveThread } from "../discord/threads";

const STATE_NOTICE: Partial<Record<TrackingState, string>> = {
  live: "\u{1F6EB} 신호를 포착했습니다 — 추적을 시작합니다.",
  stale: "\u{1F4E1} 신호가 끊겼습니다. 계속 재시도합니다 (착륙을 의미하지 않을 수 있습니다).",
  landed: "\u{1F6EC} 착륙(또는 지상 이동)으로 추정됩니다.",
  ended: "⏹️ 추적을 종료합니다.",
};

async function resolveAircraft(tracking: Tracking): Promise<NormalizedAircraft | null> {
  const value = tracking.resolved_callsign ?? tracking.query_value;
  const results = await lookupAircraft(tracking.query_type, value);
  return results[0] ?? null;
}

async function resolveMeta(tracking: Tracking, aircraft: NormalizedAircraft | null) {
  const callsignForRoute =
    tracking.resolved_callsign ?? (tracking.query_type === "callsign" ? tracking.query_value : aircraft?.flight);
  const route = callsignForRoute ? await lookupFlightRoute(callsignForRoute) : null;

  const acKey = aircraft?.hex ?? aircraft?.registration ?? (tracking.query_type === "registration" ? tracking.query_value : null);
  const aircraftInfo = acKey ? await lookupAircraftInfo(acKey) : null;

  return { route, aircraftInfo };
}

/**
 * Runs one full poll-and-post cycle for a single tracking: fetches the
 * latest ADS-B report, resolves metadata, renders the map, posts/edits the
 * Discord message, and persists the resulting state + schedule.
 *
 * Used both by the scheduler tick (for due trackings) and once immediately
 * after `/flight track` so the user gets instant feedback.
 */
export async function processTrackingTick(client: Client, tracking: Tracking): Promise<void> {
  const now = new Date();

  if (!tracking.thread_id) {
    logger.warn({ trackingId: tracking.id }, "tracking has no thread, skipping");
    return;
  }
  const thread = await fetchThread(client, tracking.thread_id);
  if (!thread) {
    logger.warn({ trackingId: tracking.id }, "thread missing/deleted, ending tracking");
    await endTracking(tracking.id);
    return;
  }

  let aircraft: NormalizedAircraft | null = null;
  let failed = false;
  try {
    aircraft = await resolveAircraft(tracking);
  } catch (err) {
    logger.error({ err, trackingId: tracking.id }, "ADS-B lookup failed");
    failed = true;
  }

  const decision = nextState(tracking, aircraft, now);
  const stateChanged = decision.state !== tracking.state;

  if (aircraft) {
    await insertPosition(tracking.id, {
      lat: aircraft.lat,
      lon: aircraft.lon,
      altFt: aircraft.altFt,
      onGround: aircraft.onGround,
      gsKt: aircraft.gsKt,
      trackDeg: aircraft.trackDeg,
      vsFpm: aircraft.vsFpm,
    });
  }

  const { route, aircraftInfo } = await resolveMeta(tracking, aircraft).catch((err) => {
    logger.warn({ err }, "metadata resolution failed");
    return { route: null, aircraftInfo: null };
  });

  let mapAttachmentName: string | null = null;
  const files: { attachment: Buffer; name: string }[] = [];
  if (aircraft?.lat !== null && aircraft?.lon !== null && aircraft) {
    try {
      const trail = (await recentPositions(tracking.id))
        .filter((p) => p.lat !== null && p.lon !== null)
        .map((p) => ({ lat: p.lat as number, lon: p.lon as number }));
      const rendered = await withAttribution(
        await renderFlightMap({
          lat: aircraft.lat as number,
          lon: aircraft.lon as number,
          trackDeg: aircraft.trackDeg,
          onGround: aircraft.onGround,
          altFt: aircraft.altFt,
          gsKt: aircraft.gsKt,
          trail,
        }),
      );
      mapAttachmentName = `map-${Date.now()}.png`;
      files.push({ attachment: rendered, name: mapAttachmentName });
    } catch (err) {
      logger.warn({ err, trackingId: tracking.id }, "map render failed, posting without image");
    }
  }

  const embed = buildFlightEmbed({
    tracking: { ...tracking, state: decision.state },
    aircraft,
    route,
    aircraftInfo,
    mapAttachmentName,
  });

  try {
    if (tracking.display_mode === "log") {
      await postNewMessage(thread, { embeds: [embed], files });
    } else {
      let edited = null;
      if (tracking.live_message_id) {
        edited = await editLiveMessage(thread, tracking.live_message_id, { embeds: [embed], files });
      }
      if (!edited) {
        const sent = await postNewMessage(thread, { embeds: [embed], files });
        await setLiveMessageId(tracking.id, sent.id);
      }
    }

    if (stateChanged) {
      const notice = STATE_NOTICE[decision.state];
      if (notice) await postStateNotice(thread, notice);
      if (decision.state === "ended") {
        await archiveThread(thread, "Flight tracking ended");
      }
    }
  } catch (err) {
    logger.error({ err, trackingId: tracking.id }, "failed to post update to Discord");
    failed = true;
  }

  const failCount = failed ? tracking.fail_count + 1 : 0;
  const backoffMultiplier = Math.min(3, 1 + failCount * 0.5);
  const intervalMs = tracking.interval_seconds * 1000 * backoffMultiplier;
  const nextUpdateAt = new Date(now.getTime() + intervalMs);

  await applyTickResult(tracking.id, nextUpdateAt, {
    state: decision.state,
    lastSeenAt: aircraft ? now.toISOString() : null,
    failCount,
  });
}

export { STATE_NOTICE };
