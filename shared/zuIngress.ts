import { z } from "zod";

export const ZU_VEHICLE_ENTRY_V1 = "ZU_VEHICLE_ENTRY_V1" as const;
export const ZU_VEHICLE_KINDS = ["train", "truck", "platform"] as const;
export const ZU_WORLD_IDS = ["CIGKV", "W1", "W2", "W3", "W4"] as const;

export type ZuVehicleKind = (typeof ZU_VEHICLE_KINDS)[number];
export type ZuWorldId = (typeof ZU_WORLD_IDS)[number];

export const ZuIngressSchema = z.object({
  type: z.literal("zuIngress"),
  protocol: z.literal(ZU_VEHICLE_ENTRY_V1),
  vehicle: z.enum(ZU_VEHICLE_KINDS),
  startedAt: z.number().finite().nonnegative(),
  durationMs: z.number().int().positive().max(60_000),
  world: z.enum(ZU_WORLD_IDS),
  spawn: z.object({
    x: z.number().finite(),
    z: z.number().finite(),
  }).strict().optional(),
  spawnCount: z.number().int().nonnegative().optional(),
}).strict();

export type ZuIngress = z.infer<typeof ZuIngressSchema>;

export function createZuIngress(input: Omit<ZuIngress, "type" | "protocol">): ZuIngress {
  return ZuIngressSchema.parse({
    type: "zuIngress",
    protocol: ZU_VEHICLE_ENTRY_V1,
    ...input,
  });
}
