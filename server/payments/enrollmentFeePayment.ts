/**
 * KHAAOS RUN — Taxa de alistamento via gateway real (Task 44 / Fase 47.2)
 * =======================================================================
 * Até aqui a taxa U$1 era server-authoritative SIMULADA: o #252 marcava a
 * sessão como paga no confirm do cliente e a Fase 47.1 materializou o
 * double-entry no SSOT (economy_ledger_entries) — mas nenhum gateway era
 * chamado (WORLDS_AUDIT: "taxa de inscrição U$1 é mock local, sem gateway").
 *
 * Este módulo fecha o ciclo REAL, na mesma escola do StripePaymentService:
 *
 *   1. CHECKOUT — `createEnrollmentFeeCheckout` cria uma Checkout Session
 *      test-only (usd, 100 centavos = U$1,00) com metadata que carrega
 *      protocol + a Idempotency-Key do cliente, sem userId interno. A chave de idempotência
 *      do Stripe é determinística (`enrollment-fee-<protocol>-<hash(clientKey)>`)
 *      — replay da MESMA Idempotency-Key devolve a MESMA sessão; retry do
 *      cliente com chave NOVA após expiração cria sessão nova (sem brick).
 *
 *   2. FULFILLMENT — `createEnrollmentFeePaymentService.processEvent` roda no
 *      webhook (`/webhooks/stripe`) para eventos com `metadata.kind =
 *      "enrollment_fee"`, ANTES do processador de pacotes KRC (que rejeitaria
 *      metadata sem orderId UUID). Dedup pela MESMA tabela
 *      payment_webhook_events (unique provider+event_id, payload hash).
 *      Só conclui a sessão de alistamento após `checkout.session.completed`
 *      com `payment_status=paid`, na ordem falha-cerrada do #252:
 *      ledger PRIMEIRO (idempotente por sha256(protocol|clientKey) — a MESMA
 *      chave que o router usaria), sessão DEPOIS. Falha no ledger ⇒ sessão
 *      permanece AWAITING_FEE e o webhook pode ser re-entregue.
 *
 *   3. GATE — nada disso liga sozinho: `createEnrollmentFeeGatewayFromEnv`
 *      só retorna um gateway com ENROLLMENT_FEE_GATEWAY=stripe E a config
 *      test-only completa (KRC_CHECKOUT_ENABLED=true + sk_test_ + whsec_ +
 *      PUBLIC_ORIGIN). Sem gateway, o endpoint falha fechado: confirmação
 *      enviada pelo browser não representa pagamento e não conclui a sessão.
 *
 * Moeda deliberada: USD (a taxa canônica é U$1). Pix no Stripe é doméstico
 * BRL — precificar a taxa em BRL/Pix é decisão de produto do titular
 * (docs/STRIPE_BRAZIL_CHECKOUT.md); até lá a sessão da taxa é card-only.
 */

import { createHash } from "node:crypto";
import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { paymentWebhookEvents } from "@shared/schema";
import { ENROLLMENT_BONUS_KRC, ENROLLMENT_FEE_KRC, ENROLLMENT_FEE_USD_CENTS, type EnrollmentStore } from "../routes/enrollment";
import { getStripeTestConfig } from "./stripeConfig";
import { recordEnrollmentFeeLedger } from "../game/enrollmentLedger";

export const ENROLLMENT_FEE_METADATA_KIND = "enrollment_fee";

const PROTOCOL_PATTERN = /^KR-REG-[0-9A-Z]{8}$/;

export function isEnrollmentFeeEvent(event: Stripe.Event): boolean {
  const object = event.data?.object as { metadata?: Record<string, string> | null } | undefined;
  return object?.metadata?.kind === ENROLLMENT_FEE_METADATA_KIND;
}

export interface EnrollmentFeeCheckoutResult {
  kind: "ready";
  checkoutUrl: string;
  sessionId: string;
}

type CheckoutApi = Pick<Stripe, "checkout">;

export async function createEnrollmentFeeCheckout(input: {
  protocol: string;
  idempotencyKey: string;
  stripe: CheckoutApi;
  publicOrigin: string;
}): Promise<EnrollmentFeeCheckoutResult> {
  if (!PROTOCOL_PATTERN.test(input.protocol)) throw new Error("Enrollment protocol is invalid");

  const clientKeyHash = createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 16);
  const feeSuccessUrl = new URL("/", input.publicOrigin);
  feeSuccessUrl.searchParams.set("enrollmentFee", "success");
  feeSuccessUrl.searchParams.set("protocol", input.protocol);
  const feeCancelUrl = new URL("/", input.publicOrigin);
  feeCancelUrl.searchParams.set("enrollmentFee", "cancelled");
  feeCancelUrl.searchParams.set("protocol", input.protocol);

  const session = await input.stripe.checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: input.protocol,
      metadata: {
        kind: ENROLLMENT_FEE_METADATA_KIND,
        protocol: input.protocol,
        clientIdempotencyKey: input.idempotencyKey,
      },
      payment_intent_data: {
        metadata: {
          kind: ENROLLMENT_FEE_METADATA_KIND,
          protocol: input.protocol,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: ENROLLMENT_FEE_USD_CENTS,
            product_data: {
              name: "Khaaos Run — Taxa de alistamento",
              description:
                "Taxa única de alistamento (U$1,00). Moeda interna sem resgate; bônus de boas-vindas creditado após a confirmação.",
            },
          },
        },
      ],
      success_url: feeSuccessUrl.toString(),
      cancel_url: feeCancelUrl.toString(),
    },
    { idempotencyKey: `enrollment-fee-${input.protocol}-${clientKeyHash}` },
  );

  if (!session.url || !session.url.startsWith("https://checkout.stripe.com/")) {
    throw new Error("Stripe returned an invalid hosted checkout URL");
  }
  return { kind: "ready", checkoutUrl: session.url, sessionId: session.id };
}

export type EnrollmentFeeEventResult = "processed" | "ignored" | "rejected" | "duplicate";

export interface EnrollmentFeeGateway {
  createFeeCheckout(input: {
    protocol: string;
    idempotencyKey: string;
  }): Promise<{ checkoutUrl: string }>;
}

export function createEnrollmentFeeGatewayFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EnrollmentFeeGateway | null {
  if (env.ENROLLMENT_FEE_GATEWAY !== "stripe") return null;
  const config = getStripeTestConfig(env);
  if (!config) return null;
  const stripe = new Stripe(config.secretKey, { maxNetworkRetries: 2 }) as Pick<Stripe, "checkout">;
  return {
    async createFeeCheckout({ protocol, idempotencyKey }) {
      const result = await createEnrollmentFeeCheckout({
        protocol,
        idempotencyKey,
        stripe,
        publicOrigin: config.publicOrigin,
      });
      return { checkoutUrl: result.checkoutUrl };
    },
  };
}

export function createEnrollmentFeePaymentService(options: {
  store: EnrollmentStore;
  ledger?: {
    recordEnrollmentFeeLedger(input: {
      userId: string;
      protocol: string;
      idempotencyKey: string;
    }): Promise<{ feeRecorded: boolean; bonusRecorded: boolean }>;
  };
  database?: typeof db;
}) {
  const store = options.store;
  const ledger = options.ledger ?? { recordEnrollmentFeeLedger };
  const database = options.database ?? db;

  async function processEvent(event: Stripe.Event, payloadHash: string): Promise<EnrollmentFeeEventResult> {
    return database.transaction(async (tx) => {
      const [eventRow] = await tx
        .insert(paymentWebhookEvents)
        .values({
          provider: "stripe",
          eventId: event.id,
          eventType: event.type,
          payloadHash,
          status: "received",
        })
        .onConflictDoNothing()
        .returning({ id: paymentWebhookEvents.id });

      if (!eventRow) {
        const [existingEvent] = await tx
          .select()
          .from(paymentWebhookEvents)
          .where(and(eq(paymentWebhookEvents.provider, "stripe"), eq(paymentWebhookEvents.eventId, event.id)))
          .for("update")
          .limit(1);
        if (!existingEvent) throw new Error("Enrollment fee webhook event conflict record disappeared");
        if (existingEvent.payloadHash !== payloadHash || existingEvent.eventType !== event.type) {
          await tx
            .update(paymentWebhookEvents)
            .set({ errorCode: "EVENT_ID_PAYLOAD_MISMATCH" })
            .where(eq(paymentWebhookEvents.id, existingEvent.id));
          return "rejected";
        }
        return "duplicate";
      }

      const finishEvent = async (status: "processed" | "ignored" | "rejected", errorCode?: string) => {
        await tx
          .update(paymentWebhookEvents)
          .set({ status, errorCode: errorCode ?? null, processedAt: new Date() })
          .where(eq(paymentWebhookEvents.id, eventRow.id));
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

      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      const metadata = checkoutSession.metadata ?? {};
      const protocol = metadata.protocol ?? "";
      const clientKey = metadata.clientIdempotencyKey ?? "";

      const sessionMatchesFee = event.livemode === false
        && checkoutSession.livemode === false
        && checkoutSession.mode === "payment"
        && checkoutSession.currency === "usd"
        && checkoutSession.amount_total === ENROLLMENT_FEE_USD_CENTS
        && metadata.kind === ENROLLMENT_FEE_METADATA_KIND
        && PROTOCOL_PATTERN.test(protocol)
        && Boolean(clientKey.trim());
      if (!sessionMatchesFee) {
        await finishEvent("rejected", "SESSION_ENROLLMENT_MISMATCH");
        return "rejected";
      }

      if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
        // Fail-closed: a sessão de alistamento permanece AWAITING_FEE; o cliente
        // reenvia a MESMA Idempotency-Key (mesma Checkout Session) ou gera nova.
        await finishEvent("processed");
        return "processed";
      }

      if (event.type === "checkout.session.completed" && checkoutSession.payment_status !== "paid") {
        await finishEvent("ignored");
        return "ignored";
      }
      if (checkoutSession.status !== "complete" || checkoutSession.payment_status !== "paid") {
        await finishEvent("rejected", "PAYMENT_NOT_FINAL");
        return "rejected";
      }

      const enrollment = await store.getByProtocol(protocol);
      if (!enrollment) {
        await finishEvent("rejected", "ENROLLMENT_SESSION_NOT_FOUND");
        return "rejected";
      }
      const userId = enrollment.userId;
      if (enrollment.step === "COMPLETED") {
        // Re-entrega após conclusão (ex.: retry do Stripe depois de um crash
        // pós-put): idempotente por definição — o ledger é unique por chave.
        await finishEvent("processed");
        return "processed";
      }
      if (enrollment.step !== "AWAITING_FEE") {
        await finishEvent("rejected", "ENROLLMENT_SESSION_NOT_PENDING");
        return "rejected";
      }

      // Ordem do guard financeiro do #252: ledger ANTES de marcar a sessão.
      try {
        await ledger.recordEnrollmentFeeLedger({ userId, protocol, idempotencyKey: clientKey });
      } catch (error) {
        console.error("[enrollment-fee] ledger indisponível no webhook — evento ficará para re-entrega:", error);
        throw error;
      }

      const paidAt = new Date().toISOString();
      enrollment.fee = {
        idempotencyKey: clientKey,
        amountUsdCents: ENROLLMENT_FEE_USD_CENTS,
        krcCredited: ENROLLMENT_FEE_KRC,
        paidAt,
      };
      enrollment.bonusKrcCredited = ENROLLMENT_BONUS_KRC; // bônus único, mesmo contrato do caminho mock
      enrollment.step = "COMPLETED";
      enrollment.updatedAt = paidAt;
      await store.put(enrollment);

      await finishEvent("processed");
      return "processed";
    });
  }

  return { processEvent };
}
