import { Client } from "discord.js";
import { logger } from "../logger";
import { claimDueTrackings } from "../db/trackings";
import { processTrackingTick } from "../service/flightUpdate";

const TICK_INTERVAL_MS = 10_000;
const MAX_PER_TICK = 25;

let running = false;

/**
 * Single global scheduler loop. Deliberately not one setInterval/setTimeout
 * per tracking: schedule state (next_update_at) lives entirely in Postgres,
 * so a bot restart just resumes from the DB with no risk of duplicate
 * posts or lost schedules.
 */
export function startScheduler(client: Client): NodeJS.Timeout {
  return setInterval(() => {
    void runTick(client);
  }, TICK_INTERVAL_MS);
}

async function runTick(client: Client): Promise<void> {
  if (running) return; // previous tick still in flight; skip this one
  running = true;
  try {
    const due = await claimDueTrackings(MAX_PER_TICK);
    for (const tracking of due) {
      try {
        await processTrackingTick(client, tracking);
      } catch (err) {
        logger.error({ err, trackingId: tracking.id }, "unhandled error processing tracking tick");
      }
    }
  } catch (err) {
    logger.error({ err }, "scheduler tick failed");
  } finally {
    running = false;
  }
}
