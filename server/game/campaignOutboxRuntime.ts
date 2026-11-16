import { pool } from "../db";
import { roomManager } from "./RoomManager";
import { CampaignOutboxWorker, campaignRoomRequestedHandler } from "./campaignOutboxWorker";

const worker = new CampaignOutboxWorker(pool, {
  CAMPAIGN_ROOM_REQUESTED: campaignRoomRequestedHandler((request) => roomManager.ensureCampaignRoom(request)),
});

function isEnabled(): boolean {
  const configured = process.env.CAMPAIGN_OUTBOX_WORKER_ENABLED;
  if (configured === "false") return false;
  return configured === "true" || process.env.NODE_ENV === "production";
}

/** Starts after RoomManager.attach() so dispatched rooms have their WebSocket runtime. */
export async function startCampaignOutboxWorker(): Promise<boolean> {
  if (!isEnabled()) {
    console.info("[CampaignOutboxWorker] disabled (set CAMPAIGN_OUTBOX_WORKER_ENABLED=true to opt in outside production)");
    return false;
  }
  await worker.start();
  return true;
}

/** Graceful stop: stops polling and waits for the current dispatch to settle. */
export async function stopCampaignOutboxWorker(): Promise<void> {
  await worker.stop();
}

export function getCampaignOutboxWorker(): CampaignOutboxWorker {
  return worker;
}
