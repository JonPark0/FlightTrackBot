import { EmbedBuilder } from "discord.js";
import { NormalizedAircraft } from "../adsb/types";
import { FlightRoute, AircraftInfo } from "../meta/adsbdb";
import { Tracking, TrackingState } from "../db/types";
import { PositionEstimate } from "../service/positionEstimate";

// Keyed by the full EstimateKind union (rather than Exclude<..., "live">) so
// that indexing it doesn't depend on TypeScript's ability to carry a
// narrowed `kind` through the `est` alias below; "live" is unreachable here
// since that branch is guarded separately.
const ESTIMATE_KIND_LABEL: Record<PositionEstimate["kind"], string> = {
  live: "",
  enroute: "🧭 대권항로 기준 추정 위치",
  origin: "🛫 출발 예정 공항",
  destination: "🛬 도착(예상) 공항",
};

const STATE_BADGE: Record<TrackingState, string> = {
  pending: "\u{1F7E1} 대기 중 (아직 포착 안 됨)",
  live: "\u{1F7E2} 추적 중",
  stale: "\u{26AA} 신호 끊김",
  landed: "\u{1F535} 착륙함 (추정)",
  ended: "\u{26AB} 추적 종료",
};

function fmtAlt(altFt: number | null, onGround: boolean): string {
  if (onGround) return "지상 (Ground)";
  if (altFt === null) return "알 수 없음";
  return `${altFt.toLocaleString()} ft`;
}

function fmtSpeed(gsKt: number | null): string {
  if (gsKt === null) return "알 수 없음";
  const kmh = Math.round(gsKt * 1.852);
  return `${Math.round(gsKt)} kt (${kmh} km/h)`;
}

function fmtVs(vsFpm: number | null): string {
  if (vsFpm === null) return "-";
  if (Math.abs(vsFpm) < 100) return "수평비행";
  return vsFpm > 0 ? `⬆ ${vsFpm} ft/min` : `⬇ ${vsFpm} ft/min`;
}

function fmtAirport(a: FlightRoute["origin"]): string {
  if (!a) return "알 수 없음";
  const code = a.iata_code ?? a.icao_code ?? "?";
  const place = a.municipality ?? a.name ?? "";
  return place ? `${code} (${place})` : code;
}

export interface BuildEmbedInput {
  tracking: Tracking;
  aircraft: NormalizedAircraft | null;
  route: FlightRoute | null;
  aircraftInfo: AircraftInfo | null;
  mapAttachmentName: string | null;
  displayPosition?: PositionEstimate | null;
}

export function buildFlightEmbed(input: BuildEmbedInput): EmbedBuilder {
  const { tracking, aircraft, route, aircraftInfo, displayPosition } = input;
  const title = tracking.resolved_callsign ?? tracking.query_value;

  const embed = new EmbedBuilder()
    .setTitle(`✈️ ${title}`)
    .setColor(colorForState(tracking.state))
    .setFooter({
      text: "데이터: ADSB.lol / ADSB.fi (ODbL) · 경로: ADSB DB",
    })
    .setTimestamp(new Date());

  embed.addFields({ name: "상태", value: STATE_BADGE[tracking.state], inline: false });

  if (route?.airline_name || route?.origin || route?.destination) {
    embed.addFields(
      { name: "항공사", value: route?.airline_name ?? "알 수 없음", inline: true },
      { name: "출발 → 도착", value: `${fmtAirport(route?.origin ?? null)} → ${fmtAirport(route?.destination ?? null)}`, inline: true },
    );
  }

  if (aircraftInfo?.type || tracking.query_type === "registration" || aircraft?.registration) {
    embed.addFields({
      name: "기종 / 등록번호",
      value: `${aircraftInfo?.type ?? aircraft?.typeDesc ?? "알 수 없음"} (${
        aircraftInfo?.registration ?? aircraft?.registration ?? "-"
      })`,
      inline: false,
    });
  }

  if (aircraft) {
    embed.addFields(
      { name: "고도", value: fmtAlt(aircraft.altFt, aircraft.onGround), inline: true },
      { name: "속도", value: fmtSpeed(aircraft.gsKt), inline: true },
      { name: "승강률", value: fmtVs(aircraft.vsFpm), inline: true },
      {
        name: "방위",
        value: aircraft.trackDeg !== null ? `${Math.round(aircraft.trackDeg)}°` : "-",
        inline: true,
      },
      {
        name: "좌표",
        value: aircraft.lat !== null && aircraft.lon !== null
          ? `${aircraft.lat.toFixed(3)}, ${aircraft.lon.toFixed(3)}`
          : "알 수 없음",
        inline: true,
      },
      { name: "스쿼크", value: aircraft.squawk ?? "-", inline: true },
    );
    if (aircraft.emergency) {
      embed.addFields({ name: "⚠️ 비상 상황", value: aircraft.emergency, inline: false });
    }
  } else if (displayPosition && displayPosition.kind !== "live") {
    const est = displayPosition;
    embed.addFields(
      { name: "위치", value: ESTIMATE_KIND_LABEL[est.kind], inline: false },
      { name: "좌표(추정)", value: `${est.lat.toFixed(3)}, ${est.lon.toFixed(3)}`, inline: true },
    );
    if (est.progressPct !== null) {
      embed.addFields({ name: "경로 진행률(추정)", value: `${est.progressPct}%`, inline: true });
    }
    embed.addFields({ name: "안내", value: est.note, inline: false });
  } else {
    embed.addFields({
      name: "위치 정보",
      value: "현재 수신된 ADS-B 신호가 없습니다.",
      inline: false,
    });
  }

  embed.addFields({
    name: "갱신 주기",
    value: `${tracking.interval_seconds}초`,
    inline: true,
  });

  if (input.mapAttachmentName) {
    embed.setImage(`attachment://${input.mapAttachmentName}`);
  }

  return embed;
}

function colorForState(state: TrackingState): number {
  switch (state) {
    case "live":
      return 0x22c55e;
    case "pending":
      return 0xeab308;
    case "stale":
      return 0x94a3b8;
    case "landed":
      return 0x3b82f6;
    case "ended":
    default:
      return 0x64748b;
  }
}
