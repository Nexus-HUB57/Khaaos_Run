import { z } from 'zod';
import { items, loans, transactions, bankAccounts, playerStats, SPECIALIZATION_IDS } from './schema';
import { fromMinorUnits, toMinorUnits } from './money';

const moneyAmountInput = (minimum: bigint, maximum: bigint) => z.union([
  z.number().finite(),
  z.string().trim(),
]).transform((value) => {
  const text = String(value);
  return text.startsWith('.') ? `0${text}` : text;
}).refine((value) => /^\d+(?:\.\d{0,2})?$/.test(value), "Informe um valor positivo com até duas casas decimais")
  .refine((value) => {
    try {
      const cents = toMinorUnits(value);
      return cents >= minimum && cents <= maximum;
    } catch {
      return false;
    }
  }, "Valor monetário fora da faixa permitida")
  .transform((value) => fromMinorUnits(toMinorUnits(value)));

export type {
  BankAccount,
  Transaction,
  Loan,
  Item,
  PlayerStats,
  TransferRequest,
  LoanRequest,
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  insufficientFunds: z.object({
    message: z.string(),
    required: z.union([z.string(), z.number()]),
    available: z.union([z.string(), z.number()]),
  }),
};

export const api = {
  // === BANKING ===
  bank: {
    get: {
      method: 'GET' as const,
      path: '/api/bank',
      responses: {
        200: z.custom<typeof bankAccounts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    deposit: {
      method: 'POST' as const,
      path: '/api/bank/deposit',
      responses: {
        503: z.object({
          code: z.literal("PAYMENTS_NOT_CONFIGURED"),
          message: z.string(),
        }),
      },
    },
    transfer: {
      method: 'POST' as const,
      path: '/api/bank/transfer',
      input: z.object({
        amountKrc: moneyAmountInput(1n, 100_000_000n),
        destination: z.enum(['fbm', 'bonus']),
      }).strict(),
      responses: {
        200: z.object({
          message: z.string(),
          newBalance: z.string(),
          operationId: z.string().uuid(),
        }),
        400: errorSchemas.validation,
        402: errorSchemas.insufficientFunds,
      },
    },
    transactions: {
      method: 'GET' as const,
      path: '/api/bank/transactions',
      responses: {
        200: z.array(z.custom<typeof transactions.$inferSelect>()),
      },
    },
  },

  // === PAYMENTS (fixed internal KRC packs; provider is authoritative) ===
  payments: {
    stripeCatalog: {
      method: 'GET' as const,
      path: '/api/payments/stripe/catalog',
      responses: {
        200: z.object({
          enabled: z.boolean(),
          testMode: z.literal(true),
          currency: z.literal('BRL'),
          paymentMethodTypes: z.array(z.enum(['card', 'pix'])),
          packs: z.array(z.object({
            id: z.string(),
            name: z.string(),
            priceBrlMinor: z.number().int().safe(),
            krcMinorUnits: z.number().int().safe(),
          }).strict()),
        }).strict(),
        503: errorSchemas.internal,
      },
    },
    stripeCheckout: {
      method: 'POST' as const,
      path: '/api/payments/stripe/checkout',
      input: z.object({ productId: z.string().min(1).max(64) }).strict(),
      responses: {
        200: z.object({ orderId: z.string().uuid(), checkoutUrl: z.string().url() }).strict(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        409: errorSchemas.internal,
        503: errorSchemas.internal,
        502: errorSchemas.internal,
      },
    },
    stripeOrder: {
      method: 'GET' as const,
      path: '/api/payments/stripe/orders/:id',
      responses: {
        200: z.object({
          id: z.string().uuid(),
          productId: z.string(),
          productName: z.string(),
          priceBrlMinor: z.string(),
          krcMinorUnits: z.string(),
          currency: z.literal('BRL'),
          status: z.enum(['created', 'pending', 'fulfilled', 'failed', 'expired', 'rejected']),
          createdAt: z.string().datetime(),
          paidAt: z.string().datetime().nullable(),
          fulfilledAt: z.string().datetime().nullable(),
        }).strict(),
        404: errorSchemas.notFound,
      },
    },
  },

  // === LOANS ===
  loans: {
    list: {
      method: 'GET' as const,
      path: '/api/loans',
      responses: {
        200: z.array(z.custom<typeof loans.$inferSelect>()),
      },
    },
    request: {
      method: 'POST' as const,
      path: '/api/loans',
      input: z.object({
        amountKrc: z.number().finite().int().min(100).max(10000),
        days: z.number().finite().int().min(1).max(30),
      }).strict(),
      responses: {
        201: z.object({ operationId: z.string().uuid() }).passthrough().and(z.custom<typeof loans.$inferSelect>()),
        400: errorSchemas.validation,
        403: z.object({ message: z.string() }), // Max loans reached
      },
    },
    pay: {
      method: 'POST' as const,
      path: '/api/loans/:id/pay',
      responses: {
        200: z.object({ message: z.string(), operationId: z.string().uuid() }),
        404: errorSchemas.notFound,
        402: errorSchemas.insufficientFunds,
      },
    },
  },

  // === INVENTORY ===
  items: {
    list: {
      method: 'GET' as const,
      path: '/api/items',
      responses: {
        200: z.array(z.custom<typeof items.$inferSelect>()),
      },
    },
    purchase: {
      method: 'POST' as const,
      path: '/api/items/purchase',
      input: z.object({
        type: z.enum(['ARMA', 'DEFESA', 'CURATIVO', 'UTILIDADE']),
        name: z.string().trim().min(1).max(64),
      }).strict(),
      responses: {
        201: z.object({ operationId: z.string().uuid() }).passthrough().and(z.custom<typeof items.$inferSelect>()),
        402: errorSchemas.insufficientFunds,
      },
    },
    equip: {
      method: 'POST' as const,
      path: '/api/items/:id/equip',
      input: z.object({ isEquipped: z.boolean() }).strict(),
      responses: {
        200: z.custom<typeof items.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    use: {
      method: 'POST' as const,
      path: '/api/items/:id/use',
      input: z.object({}).strict(),
      responses: {
        200: z.object({
          message: z.string(),
          newDurability: z.string(),
          effect: z.any(),
        }),
        404: errorSchemas.notFound,
      },
    },
    repair: {
      method: 'POST' as const,
      path: '/api/items/:id/repair',
      input: z.object({
        amountKrc: moneyAmountInput(100n, 10_000_000n),
      }).strict(),
      responses: {
        200: z.object({
          message: z.string(),
          newDurability: z.string(),
          operationId: z.string().uuid(),
        }),
        404: errorSchemas.notFound,
        402: errorSchemas.insufficientFunds,
      },
    },
  },

  // === PLAYER ===
  player: {
    me: {
      method: 'GET' as const,
      path: '/api/player/me',
      responses: {
        200: z.object({
          stats: z.custom<typeof playerStats.$inferSelect>(),
          user: z.any(), // Auth user
        }),
        404: errorSchemas.notFound,
      },
    },
    daily: {
      method: 'POST' as const,
      path: '/api/player/daily-salary',
      responses: {
        200: z.object({
          message: z.string(),
          amount: z.string(),
          operationId: z.string().uuid(),
        }),
        400: z.object({ message: z.string() }), // Already claimed
      },
    },
    specialization: {
      method: 'POST' as const,
      path: '/api/player/specialization',
      input: z.object({
        specializationId: z.enum(SPECIALIZATION_IDS),
      }).strict(),
      responses: {
        200: z.object({ specializationId: z.string() }),
        400: errorSchemas.validation,
        403: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
