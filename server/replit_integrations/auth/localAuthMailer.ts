import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { LocalAuthMailer, LocalAuthRecipient } from "./localAuthService";

export type LocalAuthMailConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user?: string;
  password?: string;
  from: string;
};

export type LocalAuthTransportFactory = (
  config: LocalAuthMailConfig,
) => Pick<Transporter, "sendMail">;

function readMailConfig(env: NodeJS.ProcessEnv): LocalAuthMailConfig | null {
  const host = env.SMTP_HOST?.trim();
  const port = Number(env.SMTP_PORT);
  const from = env.SMTP_FROM?.trim();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !from) return null;

  const secureSetting = env.SMTP_SECURE?.trim().toLowerCase();
  if (secureSetting && secureSetting !== "true" && secureSetting !== "false") return null;
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD;
  if (Boolean(user) !== Boolean(password)) return null;

  const secure = secureSetting ? secureSetting === "true" : port === 465;
  return {
    host,
    port,
    secure,
    // Port 587 and other non-implicit-TLS transports must upgrade with STARTTLS;
    // do not silently send account tokens over plaintext SMTP.
    requireTLS: !secure,
    from,
    ...(user && password ? { user, password } : {}),
  };
}

function createTransport(config: LocalAuthMailConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    ...(config.user && config.password ? { auth: { user: config.user, pass: config.password } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

function verificationContent(recipient: LocalAuthRecipient, url: string) {
  return {
    to: recipient.email,
    subject: "Confirme seu email — War'I",
    text: `Use este link para confirmar seu email no War'I. O link expira em 24 horas.\n\n${url}\n\nSe você não solicitou o cadastro, ignore esta mensagem.`,
    html: `<p>Confirme seu email no War'I.</p><p>Este link expira em 24 horas.</p><p><a href="${url}">Confirmar email</a></p><p>Se você não solicitou o cadastro, ignore esta mensagem.</p>`,
  };
}

export class SmtpLocalAuthMailer implements LocalAuthMailer {
  private readonly transport: Pick<Transporter, "sendMail">;

  constructor(
    private readonly config: LocalAuthMailConfig,
    transportFactory: LocalAuthTransportFactory = createTransport,
  ) {
    this.transport = transportFactory(config);
  }

  async sendVerificationEmail(recipient: LocalAuthRecipient, url: string): Promise<void> {
    const content = verificationContent(recipient, url);
    await this.transport.sendMail({ ...content, from: this.config.from });
  }

  async sendPasswordResetEmail(recipient: LocalAuthRecipient, url: string): Promise<void> {
    await this.transport.sendMail({
      from: this.config.from,
      to: recipient.email,
      subject: "Redefinição de senha — War'I",
      text: `Use este link para redefinir a senha da sua conta War'I. O link expira em 30 minutos.\n\n${url}\n\nSe você não solicitou a redefinição, ignore esta mensagem.`,
      html: `<p>Foi solicitada uma redefinição de senha da sua conta War'I.</p><p>Este link expira em 30 minutos e pode ser usado uma única vez.</p><p><a href="${url}">Redefinir senha</a></p><p>Se você não solicitou a redefinição, ignore esta mensagem.</p>`,
    });
  }
}

export function createLocalAuthMailerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  transportFactory: LocalAuthTransportFactory = createTransport,
): LocalAuthMailer | null {
  const config = readMailConfig(env);
  return config ? new SmtpLocalAuthMailer(config, transportFactory) : null;
}
