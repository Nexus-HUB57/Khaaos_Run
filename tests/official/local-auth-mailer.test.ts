import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transporter } from "nodemailer";
import {
  createLocalAuthMailerFromEnv,
  type LocalAuthMailConfig,
  type LocalAuthTransportFactory,
} from "../../server/replit_integrations/auth/localAuthMailer.ts";
import type { LocalAuthRecipient } from "../../server/replit_integrations/auth/localAuthService.ts";

const smtpEnv: NodeJS.ProcessEnv = {
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "mailer@example.test",
  SMTP_PASSWORD: "test-only-password",
  SMTP_FROM: "War'I <no-reply@example.test>",
};

test("local auth mailer: configuração incompleta ou inválida mantém envio desabilitado", () => {
  const invalidConfigs: NodeJS.ProcessEnv[] = [
    {},
    { ...smtpEnv, SMTP_HOST: " " },
    { ...smtpEnv, SMTP_PORT: "not-a-port" },
    { ...smtpEnv, SMTP_PORT: "65536" },
    { ...smtpEnv, SMTP_FROM: "" },
    { ...smtpEnv, SMTP_SECURE: "sometimes" },
    { ...smtpEnv, SMTP_USER: "mailer@example.test", SMTP_PASSWORD: "" },
    { ...smtpEnv, SMTP_USER: "", SMTP_PASSWORD: "test-only-password" },
  ];

  for (const env of invalidConfigs) {
    assert.equal(createLocalAuthMailerFromEnv(env), null);
  }
});

test("local auth mailer: exige STARTTLS no SMTP sem TLS implícito e compõe mensagens de verificação/reset", async () => {
  let capturedConfig: LocalAuthMailConfig | undefined;
  const messages: Array<Record<string, unknown>> = [];
  const transportFactory: LocalAuthTransportFactory = (config) => {
    capturedConfig = config;
    return {
      sendMail: async (message: unknown) => {
        messages.push(message as Record<string, unknown>);
        return {};
      },
    } as unknown as Pick<Transporter, "sendMail">;
  };

  const mailer = createLocalAuthMailerFromEnv(smtpEnv, transportFactory);
  assert.ok(mailer);
  assert.equal(capturedConfig?.secure, false);
  assert.equal(capturedConfig?.requireTLS, true);
  assert.equal(capturedConfig?.host, "smtp.example.test");
  assert.equal(capturedConfig?.port, 587);

  const recipient: LocalAuthRecipient = {
    email: "player@example.test",
    firstName: "Player",
    lastName: null,
  };
  const verifyUrl = "https://khaaos.run/auth#verify=verify-token";
  const resetUrl = "https://khaaos.run/auth#reset=reset-token";
  await mailer.sendVerificationEmail(recipient, verifyUrl);
  await mailer.sendPasswordResetEmail(recipient, resetUrl);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].from, smtpEnv.SMTP_FROM);
  assert.equal(messages[0].to, recipient.email);
  assert.equal(messages[0].subject, "Confirme seu email — War'I");
  assert.match(String(messages[0].text), /expira em 24 horas/);
  assert.match(String(messages[0].html), /href="https:\/\/khaaos\.run\/auth#verify=verify-token"/);
  assert.equal(messages[1].to, recipient.email);
  assert.equal(messages[1].subject, "Redefinição de senha — War'I");
  assert.match(String(messages[1].text), /expira em 30 minutos/);
  assert.match(String(messages[1].html), /href="https:\/\/khaaos\.run\/auth#reset=reset-token"/);
});

test("local auth mailer: porta 465 usa TLS implícito sem opção STARTTLS separada", () => {
  let capturedConfig: LocalAuthMailConfig | undefined;
  const transportFactory: LocalAuthTransportFactory = (config) => {
    capturedConfig = config;
    return {
      sendMail: async () => ({}),
    } as unknown as Pick<Transporter, "sendMail">;
  };

  const mailer = createLocalAuthMailerFromEnv({
    ...smtpEnv,
    SMTP_PORT: "465",
    SMTP_SECURE: undefined,
  }, transportFactory);

  assert.ok(mailer);
  assert.equal(capturedConfig?.secure, true);
  assert.equal(capturedConfig?.requireTLS, false);
});
