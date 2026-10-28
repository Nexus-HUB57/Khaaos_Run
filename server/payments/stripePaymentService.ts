import { createHash, randomUUID } from "node:crypto";
import Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { bankAccounts, economyLedgerEntries, paymentOrders, paymentWebhookEvents, transactions } from "@shared/schema";
import { fromMinorUnits, hashEconomicRequest } from "../game/economyMoney";
import type { KrcPack, StripeTestConfig } from "./stripeConfig";

export type StripeGateway = Pick<Stripe, "checkout" | "webhooks">;
type Database = typeof db;

export type CheckoutResult =
  | { kind: "ready"; orderId: string; checkoutUrl: string }
  | { kind: "idempotency_conflict" }
  | { kind: "order_closed" };

function checkoutReturnUrl(origin: string, payment: "success" | "cancelled", orderId: string): string {
  const url = new URL("/bank", origin);
  url.searchParams.set("payment", payment);
  url.searchParams.set("orderId", orderId);
  return url.toString();
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class StripePaymentService {
  constructor(private readonly database: Database = db) {}

  async createCheckout(
    userId: string,
    idempotencyKey: string,
    pack: KrcPack,
    stripe: StripeGateway,
    config: StripeTestConfig,
  ): Promise<CheckoutResult> {
    if (!userId.trim()) throw new Error("Authenticated user ID is required");
    const requestHash = hashEconomicRequest("stripe.checkout", {
      productId: pack.id,
      productName: pack.name,
      priceBrlMinor: pack.priceBrlMinor,
      krcMinorUnits: pack.krcMinorUnits,
    });
    const candidateOrderId = randomUUID();

    const order = await this.database.transaction(async (tx) => {
      const [inserted] = await tx.insert(paymentOrders).values({
        id: candidateOrderId,
        userId,
        provider: "stripe",
        productId: pack.id,
        productName: pack.name,
        priceBrlMinor: String(pack.priceBrlMinor),
        krcMinorUnits: String(pack.krcMinorUnits),
        currency: "brl",
        status: "created",
        idempotencyKey,
        requestHash,
      }).onConflictDoNothing({
        target: [paymentOrders.userId, paymentOrders.idempotencyKey],
      }).returning();

      if (inserted) return inserted;
      const [existing] = await tx.select().from(paymentOrders).where(and(
        eq(paymentOrders.userId, userId),
        eq(paymentOrders.idempotencyKey, idempotencyKey),
      )).for("update").limit(1);
      if (!existing) throw new Error("Payment order idempotency record disappeared");
      if (existing.requestHash !== requestHash) return { ...existing, _conflict: true as const };
      return existing;
    });

    if ("_conflict" in order) return { kind: "idempotency_conflict" };
    if (order.status === "pending" && order.checkoutUrl) {
      return { kind: "ready", orderId: order.id, checkoutUrl: order.checkoutUrl };
    }
    if (order.status !== "created") return { kind: "order_closed" };

    const amount = Number(order.priceBrlMinor);
    if (!Number.isSafeInteger(amount) || amount < 50) throw new Error("Stored Stripe amount is invalid");
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      billing_address_collection: "required",
      allowed_payment_method_types: config.paymentMethodTypes,
      locale: "pt-BR",
      client_reference_id: order.id,
      metadata: {
        orderId: order.id,
        productId: order.productId,
      },
      payment_intent_data: {
        metadata: {
          orderId: order.id,
          productId: order.productId,
        },
      },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: amount,
          product_data: {
            name: order.productName,
            description: `${fromMinorUnits(BigInt(order.krcMinorUnits))} KRC internos para saldo Weapons; moeda de jogo sem resgate.`,
          },
        },
      }],
      success_url: checkoutReturnUrl(config.publicOrigin, "success", order.id),
      cancel_url: checkoutReturnUrl(config.publicOrigin, "cancelled", order.id),
    };

    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `khaaos-checkout-${order.id}`,
    });
    if (!session.url || !session.url.startsWith("https://checkout.stripe.com/")) {
      throw new Error("Stripe returned an invalid hosted checkout URL");
    }

    await this.database.update(paymentOrders).set({
      stripeSessionId: session.id,
      checkoutUrl: session.url,
      status: "pending",
      updatedAt: new Date(),
    }).where(and(
      eq(paymentOrders.id, order.id),
      eq(paymentOrders.userId, userId),
      eq(paymentOrders.status, "created"),
    ));

    return { kind: "ready", orderId: order.id, checkoutUrl: session.url };
  }

  async getOrderForUser(userId: string, orderId: string) {
    if (!isUuid(orderId)) return null;
    const [order] = await this.database.select({
      id: paymentOrders.id,
      productId: paymentOrders.productId,
      productName: paymentOrders.productName,
      priceBrlMinor: paymentOrders.priceBrlMinor,
      krcMinorUnits: paymentOrders.krcMinorUnits,
      currency: paymentOrders.currency,
      status: paymentOrders.status,
      createdAt: paymentOrders.createdAt,
      paidAt: paymentOrders.paidAt,
      fulfilledAt: paymentOrders.fulfilledAt,
    }).from(paymentOrders).where(and(
      eq(paymentOrders.id, orderId),
      eq(paymentOrders.userId, userId),
    )).limit(1);
    return order ?? null;
  }

  async processEvent(event: Stripe.Event, payloadHash: string): Promise<"processed" | "ignored" | "rejected" | "duplicate"> {
    return this.database.transaction(async (tx) => {
      const [eventRow] = await tx.insert(paymentWebhookEvents).values({
        provider: "stripe",
        eventId: event.id,
        eventType: event.type,
        payloadHash,
        status: "received",
      }).onConflictDoNothing().returning({ id: paymentWebhookEvents.id });

      if (!eventRow) {
        const [existingEvent] = await tx.select().from(paymentWebhookEvents).where(and(
          eq(paymentWebhookEvents.provider, "stripe"),
          eq(paymentWebhookEvents.eventId, event.id),
        )).for("update").limit(1);
        if (!existingEvent) throw new Error("Stripe webhook event conflict record disappeared");
        if (existingEvent.payloadHash !== payloadHash || existingEvent.eventType !== event.type) {
          await tx.update(paymentWebhookEvents).set({ errorCode: "EVENT_ID_PAYLOAD_MISMATCH" })
            .where(eq(paymentWebhookEvents.id, existingEvent.id));
          return "rejected";
        }
        return "duplicate";
      }
      const now = new Date();
      const finishEvent = async (status: "processed" | "ignored" | "rejected", errorCode?: string, orderId?: string) => {
        await tx.update(paymentWebhookEvents).set({
          status,
          errorCode: errorCode ?? null,
          orderId: orderId ?? null,
          processedAt: now,
        }).where(eq(paymentWebhookEvents.id, eventRow.id));
      };

      const recognized = new Set([
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
        "checkout.session.expired",
      ]);
      if (!recognized.has(event.type)) {
        await finishEvent("ignored");
        return "ignored";
      }

      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata ?? {};
      const orderId = metadata.orderId;
      if (!isUuid(orderId)) {
        await finishEvent("rejected", "INVALID_ORDER_METADATA");
        return "rejected";
      }

      const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).for("update").limit(1);
      if (!order) {
        await finishEvent("rejected", "ORDER_NOT_FOUND", orderId);
        return "rejected";
      }

      const expectedAmount = Number(order.priceBrlMinor);
      const sessionMatchesOrder = event.livemode === false
        && session.livemode === false
        && session.id === order.stripeSessionId
        && session.client_reference_id === order.id
        && session.mode === "payment"
        && session.currency === "brl"
        && Number.isSafeInteger(expectedAmount)
        && session.amount_total === expectedAmount
        && metadata.orderId === order.id
        && metadata.productId === order.productId;
      if (!sessionMatchesOrder) {
        if (order.status === "pending") {
          await tx.update(paymentOrders).set({ status: "rejected", updatedAt: now })
            .where(and(eq(paymentOrders.id, order.id), eq(paymentOrders.status, "pending")));
        }
        await finishEvent("rejected", "SESSION_ORDER_MISMATCH", order.id);
        return "rejected";
      }

      if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
        if (order.status === "pending") {
          await tx.update(paymentOrders).set({ status: event.type.endsWith("expired") ? "expired" : "failed", updatedAt: now })
            .where(and(eq(paymentOrders.id, order.id), eq(paymentOrders.status, "pending")));
        }
        await finishEvent("processed", undefined, order.id);
        return "processed";
      }

      if (event.type === "checkout.session.completed" && session.payment_status !== "paid") {
        await finishEvent("ignored", undefined, order.id);
        return "ignored";
      }
      if (session.status !== "complete" || session.payment_status !== "paid") {
        await finishEvent("rejected", "PAYMENT_NOT_FINAL", order.id);
        return "rejected";
      }
      if (order.status === "fulfilled") {
        await finishEvent("processed", undefined, order.id);
        return "processed";
      }
      if (order.status !== "pending") {
        await finishEvent("rejected", "ORDER_NOT_PENDING", order.id);
        return "rejected";
      }
      if (session.customer_details?.address?.country?.toUpperCase() !== "BR") {
        await tx.update(paymentOrders).set({ status: "rejected", updatedAt: now })
          .where(and(eq(paymentOrders.id, order.id), eq(paymentOrders.status, "pending")));
        await finishEvent("rejected", "CUSTOMER_COUNTRY_NOT_SUPPORTED", order.id);
        return "rejected";
      }

      const krcMinor = BigInt(order.krcMinorUnits);
      const amountKrc = fromMinorUnits(krcMinor);
      // M4 — idempotency_key dentro do formato canônico do ledger (0005:
      // "^[A-Za-z0-9._~-]{16,128}$") — ":" violava economy_ledger_key_format
      // e o fulfillment falhava sempre que a constraint estava aplicada.
      const idempotencyKey = `stripe-order-${order.id}`;
      const operationId = randomUUID();

      await tx.insert(bankAccounts).values({ userId: order.userId }).onConflictDoNothing();
      const [account] = await tx.select({ userId: bankAccounts.userId }).from(bankAccounts)
        .where(eq(bankAccounts.userId, order.userId)).for("update").limit(1);
      if (!account) throw new Error("Payment fulfillment could not lock the player wallet");

      await tx.update(bankAccounts).set({
        weaponsBalance: sql`round(${bankAccounts.weaponsBalance} + ${amountKrc}::numeric, 2)`,
      }).where(eq(bankAccounts.userId, order.userId));

      await tx.insert(economyLedgerEntries).values([
        {
          operationId,
          idempotencyKey,
          userId: order.userId,
          lineNumber: 1,
          accountCode: "wallet.weapons",
          side: "CREDIT",
          amountKrc,
          description: `KRC package fulfilled for payment order ${order.id}`,
        },
        {
          operationId,
          idempotencyKey,
          userId: order.userId,
          lineNumber: 2,
          accountCode: "external.deposit",
          side: "DEBIT",
          amountKrc,
          description: `Stripe test-mode payment counterpart for order ${order.id}`,
        },
      ]);
      await tx.insert(transactions).values({
        userId: order.userId,
        type: "COMPRA_KRC",
        amountKrc,
        amountUsd: null,
        operationId,
        description: `KRC package ${order.productId}`,
      });
      await tx.update(paymentOrders).set({
        status: "fulfilled",
        paidAt: order.paidAt ?? now,
        fulfilledAt: now,
        updatedAt: now,
      }).where(eq(paymentOrders.id, order.id));
      await finishEvent("processed", undefined, order.id);
      return "processed";
    });
  }
}

export function sha256Payload(payload: Buffer): string {
  return createHash("sha256").update(payload).digest("hex");
}

export const stripePaymentService = new StripePaymentService();
