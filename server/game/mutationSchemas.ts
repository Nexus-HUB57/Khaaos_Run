import { z } from "zod";

export const emptyMutationInput = z.object({}).strict();

export const zoneStartInput = z.object({
  centerX: z.number().finite().min(0).max(100).default(50),
  centerY: z.number().finite().min(0).max(100).default(50),
}).strict();

export const zoneDamageInput = z.object({
  damage: z.number().finite().int().min(1).max(100).default(5),
}).strict();

export const zoneHealInput = z.object({
  amount: z.number().finite().int().min(1).max(100),
}).strict();

export const loanPreviewInput = z.object({
  principal: z.number().finite().min(1).max(1_000_000),
  days: z.number().finite().int().min(1).max(365),
}).strict();

const seedInput = z.union([
  z.number().finite().int().safe(),
  z.string().min(1).max(100),
]);

export const economySimulationInput = z.object({
  agents: z.number().finite().int().min(10).max(500).default(200),
  days: z.number().finite().int().min(7).max(90).default(30),
  seed: seedInput.optional(),
}).strict();

export const economyBatchSimulationInput = z.object({
  runs: z.number().finite().int().min(2).max(10).default(5),
  agents: z.number().finite().int().min(10).max(300).default(150),
  days: z.number().finite().int().min(7).max(60).default(21),
}).strict();
