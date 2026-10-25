/**
 * KHAAOS RUN — Discord Webhook Configuration Bridge
 * ==================================================
 * Reads per-channel webhook URLs from environment variables
 * and provides a lookup interface matching EKhaaosWebhookChannel
 * in the C++ KhaaosDiscordWebhooks subsystem.
 *
 * Environment variables (one per channel):
 *   DISCORD_WEBHOOK_ANTI_CHEAT
 *   DISCORD_WEBHOOK_ECONOMY
 *   DISCORD_WEBHOOK_MATCH_RESULTS
 *   DISCORD_WEBHOOK_RANKED
 *   DISCORD_WEBHOOK_DEPLOY
 *   DISCORD_WEBHOOK_SERVER_STATUS
 *
 * Also reads legacy webhooks:
 *   DISCORD_WEBHOOK       (catch-all / AlertManager)
 *   DISCORD_WEBHOOK_SECURITY (security alerts)
 */

export enum EKhaaosWebhookChannel {
  AntiCheat = "anti_cheat",
  Economy = "economy",
  MatchResults = "match_results",
  Ranked = "ranked",
  Deploy = "deploy",
  ServerStatus = "server_status",
}

/** Color constants per channel — matches KhaaosDiscordWebhooks.cpp */
export const WEBHOOK_COLORS: Record<EKhaaosWebhookChannel, number> = {
  [EKhaaosWebhookChannel.AntiCheat]:   0xFF1744, // red
  [EKhaaosWebhookChannel.Economy]:     0x76FF03, // green
  [EKhaaosWebhookChannel.MatchResults]: 0x00BCD4, // cyan
  [EKhaaosWebhookChannel.Ranked]:      0xAA00FF, // purple
  [EKhaaosWebhookChannel.Deploy]:      0xFFD600, // yellow
  [EKhaaosWebhookChannel.ServerStatus]: 0x2979FF, // blue
};

/** Human-readable labels per channel */
export const WEBHOOK_LABELS: Record<EKhaaosWebhookChannel, string> = {
  [EKhaaosWebhookChannel.AntiCheat]:   "Anti-Cheat",
  [EKhaaosWebhookChannel.Economy]:     "Economy",
  [EKhaaosWebhookChannel.MatchResults]: "Match Results",
  [EKhaaosWebhookChannel.Ranked]:      "Ranked",
  [EKhaaosWebhookChannel.Deploy]:      "Deploy",
  [EKhaaosWebhookChannel.ServerStatus]: "Server Status",
};

// ─── Environment variable mapping ─────────────────────────────────────────

const ENV_KEY_MAP: Record<EKhaaosWebhookChannel, string> = {
  [EKhaaosWebhookChannel.AntiCheat]:   "DISCORD_WEBHOOK_ANTI_CHEAT",
  [EKhaaosWebhookChannel.Economy]:     "DISCORD_WEBHOOK_ECONOMY",
  [EKhaaosWebhookChannel.MatchResults]: "DISCORD_WEBHOOK_MATCH_RESULTS",
  [EKhaaosWebhookChannel.Ranked]:      "DISCORD_WEBHOOK_RANKED",
  [EKhaaosWebhookChannel.Deploy]:      "DISCORD_WEBHOOK_DEPLOY",
  [EKhaaosWebhookChannel.ServerStatus]: "DISCORD_WEBHOOK_SERVER_STATUS",
};

// ─── Webhook Store ─────────────────────────────────────────────────────────

interface WebhookInfo {
  channel: EKhaaosWebhookChannel;
  url: string;
  label: string;
  color: number;
  configured: boolean;
}

/** Get webhook URL for a specific channel */
export function getWebhookUrl(channel: EKhaaosWebhookChannel): string | null {
  const envKey = ENV_KEY_MAP[channel];
  const url = process.env[envKey];
  if (!url || url.includes("CHANGME")) return null;
  return url;
}

/** Get complete webhook info for a channel */
export function getWebhookInfo(channel: EKhaaosWebhookChannel): WebhookInfo {
  const url = getWebhookUrl(channel);
  return {
    channel,
    url: url ?? "",
    label: WEBHOOK_LABELS[channel],
    color: WEBHOOK_COLORS[channel],
    configured: url !== null,
  };
}

/** Get all configured webhooks */
export function getAllWebhooks(): WebhookInfo[] {
  return Object.values(EKhaaosWebhookChannel).map(getWebhookInfo);
}

/** Get only configured webhooks (URLs that are set) */
export function getConfiguredWebhooks(): WebhookInfo[] {
  return getAllWebhooks().filter((w) => w.configured);
}

/** Validate a webhook URL format */
export function isValidWebhookUrl(url: string): boolean {
  return /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url);
}

/** Count configured vs total webhooks */
export function getWebhookStats(): { configured: number; total: number; missing: EKhaaosWebhookChannel[] } {
  const all = getAllWebhooks();
  const missing = all.filter((w) => !w.configured).map((w) => w.channel);
  return {
    configured: all.length - missing.length,
    total: all.length,
    missing,
  };
}
