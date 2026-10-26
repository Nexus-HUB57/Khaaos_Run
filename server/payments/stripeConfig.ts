import { z } from "zod";

export const krcPackSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().trim().min(1).max(80),
  priceBrlMinor: z.number().finite().int().safe().min(50).max(999_999_999_999),
  krcMinorUnits: z.number().finite().int().safe().min(1),
}).strict();

export type KrcPack = z.infer<typeof krcPackSchema>;
export type StripePaymentMethod = "card" | "pix";

export interface StripeTestConfig {
  secretKey: string;
  webhookSecret: string;
  publicOrigin: string;
  paymentMethodTypes: StripePaymentMethod[];
}

export function parseKrcPackCatalog(raw: string | undefined): KrcPack[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("STRIPE_KRC_PACKS_JSON must be valid JSON");
  }
  const result = z.array(krcPackSchema).min(1).max(24).safeParse(parsed);
  if (!result.success) throw new Error("STRIPE_KRC_PACKS_JSON has an invalid package catalog");
  const ids = new Set<string>();
  for (const pack of result.data) {
    if (ids.has(pack.id)) throw new Error("STRIPE_KRC_PACKS_JSON contains duplicate package IDs");
    ids.add(pack.id);
  }
  return result.data;
}

export function getStripeTestConfig(env: NodeJS.ProcessEnv = process.env): StripeTestConfig | null {
  if (env.KRC_CHECKOUT_ENABLED !== "true") return null;

  const secretKey = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const configuredOrigin = env.PUBLIC_ORIGIN;
  if (!secretKey?.startsWith("sk_test_") || !webhookSecret?.startsWith("whsec_") || !configuredOrigin) return null;

  let publicOrigin: URL;
  try {
    publicOrigin = new URL(configuredOrigin);
  } catch {
    return null;
  }
  const isLocalDevelopment = publicOrigin.hostname === "localhost" || publicOrigin.hostname === "127.0.0.1";
  if (publicOrigin.origin !== configuredOrigin.replace(/\/$/, "") || (publicOrigin.protocol !== "https:" && !isLocalDevelopment)) return null;

  const rawMethods = env.STRIPE_PAYMENT_METHOD_TYPES?.trim() || "card";
  const paymentMethodTypes = rawMethods.split(",").map((method) => method.trim());
  if (
    paymentMethodTypes.length === 0
    || paymentMethodTypes.some((method) => method !== "card" && method !== "pix")
    || new Set(paymentMethodTypes).size !== paymentMethodTypes.length
  ) return null;

  return {
    secretKey,
    webhookSecret,
    publicOrigin: publicOrigin.origin,
    paymentMethodTypes: paymentMethodTypes as StripePaymentMethod[],
  };
}
