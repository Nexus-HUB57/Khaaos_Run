import { z } from 'zod';
import { items, loans, transactions, bankAccounts, playerStats } from './schema';

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
    required: z.number(),
    available: z.number(),
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
      input: z.object({
        amountUsd: z.number().min(1),
      }),
      responses: {
        200: z.object({
          newBalance: z.string(),
          transactionId: z.number(),
        }),
        400: errorSchemas.validation,
      },
    },
    transfer: {
      method: 'POST' as const,
      path: '/api/bank/transfer',
      input: z.object({
        amountKrc: z.number().min(1),
        destination: z.enum(['fbm', 'weapons']),
      }),
      responses: {
        200: z.object({
          message: z.string(),
          newBalance: z.string(),
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
        amountKrc: z.number().min(100).max(10000),
        days: z.number().min(1).max(30),
      }),
      responses: {
        201: z.custom<typeof loans.$inferSelect>(),
        400: errorSchemas.validation,
        403: z.object({ message: z.string() }), // Max loans reached
      },
    },
    pay: {
      method: 'POST' as const,
      path: '/api/loans/:id/pay',
      responses: {
        200: z.object({ message: z.string() }),
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
        name: z.string(), // For simplicity, we'll just buy generic items or have a preset list
      }),
      responses: {
        201: z.custom<typeof items.$inferSelect>(),
        402: errorSchemas.insufficientFunds,
      },
    },
    use: {
      method: 'POST' as const,
      path: '/api/items/:id/use',
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
        amountKrc: z.number().min(1),
      }),
      responses: {
        200: z.object({
          message: z.string(),
          newDurability: z.string(),
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
          amount: z.number(),
        }),
        400: z.object({ message: z.string() }), // Already claimed
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
