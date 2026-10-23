import assert from "node:assert/strict";
import { test } from "node:test";
import { getStripeTestConfig, parseKrcPackCatalog } from "../../server/payments/stripeConfig";

const testConfigEnv: NodeJS.ProcessEnv = {
  KRC_CHECKOUT_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_unit_only_not_a_credential",
  STRIPE_WEBHOOK_SECRET: "whsec_unit_only_not_a_credential",
  PUBLIC_ORIGIN: "https://khaaos.example",
};

test("Stripe checkout permanece desligado por padrão e rejeita qualquer chave live", () => {
  assert.equal(getStripeTestConfig({ ...testConfigEnv, KRC_CHECKOUT_ENABLED: "false" }), null);
  assert.equal(getStripeTestConfig({ ...testConfigEnv, STRIPE_SECRET_KEY: "sk_live_never_allowed" }), null);
  assert.equal(getStripeTestConfig({ ...testConfigEnv, STRIPE_SECRET_KEY: undefined }), null);
  assert.equal(getStripeTestConfig({ ...testConfigEnv, PUBLIC_ORIGIN: "http://public.example" }), null);
});

test("configuração válida limita métodos ao allowlist e usa cartão como padrão", () => {
  const config = getStripeTestConfig(testConfigEnv);
  assert.deepEqual(config?.paymentMethodTypes, ["card"]);
  assert.equal(config?.publicOrigin, "https://khaaos.example");
  assert.deepEqual(
    getStripeTestConfig({ ...testConfigEnv, STRIPE_PAYMENT_METHOD_TYPES: "card,pix" })?.paymentMethodTypes,
    ["card", "pix"],
  );
  assert.equal(getStripeTestConfig({ ...testConfigEnv, STRIPE_PAYMENT_METHOD_TYPES: "card,crypto" }), null);
  assert.equal(getStripeTestConfig({ ...testConfigEnv, STRIPE_PAYMENT_METHOD_TYPES: "pix,pix" }), null);
});

test("catálogo de pacotes aceita apenas snapshots server-side inteiros e IDs exclusivos", () => {
  const catalog = parseKrcPackCatalog(JSON.stringify([
    { id: "starter-01", name: "Pacote inicial", priceBrlMinor: 500, krcMinorUnits: 10000 },
  ]));
  assert.deepEqual(catalog, [{ id: "starter-01", name: "Pacote inicial", priceBrlMinor: 500, krcMinorUnits: 10000 }]);
  assert.deepEqual(parseKrcPackCatalog(undefined), []);
  assert.throws(() => parseKrcPackCatalog("{"), /valid JSON/);
  assert.throws(() => parseKrcPackCatalog(JSON.stringify([
    { id: "starter-01", name: "Pacote inicial", priceBrlMinor: 500.5, krcMinorUnits: 10000 },
  ])), /invalid package catalog/);
  assert.throws(() => parseKrcPackCatalog(JSON.stringify([
    { id: "starter-01", name: "Um", priceBrlMinor: 500, krcMinorUnits: 10000 },
    { id: "starter-01", name: "Dois", priceBrlMinor: 700, krcMinorUnits: 15000 },
  ])), /duplicate package IDs/);
});
