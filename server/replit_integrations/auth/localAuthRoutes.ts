import type { Express, Request } from "express";
import { z } from "zod";
import {
  AuthEmailDeliveryError,
  AuthEmailUnavailableError,
  type createLocalAuthService,
} from "./localAuthService";

type LocalAuthService = ReturnType<typeof createLocalAuthService>;
type AuthAction = "register" | "login" | "verify" | "resend" | "reset-request" | "reset-complete";

export type LocalAuthRouteOptions = {
  service: LocalAuthService;
  resolveOrigin: (request: Request) => string;
  rateLimit: (action: AuthAction, ip: string) => Promise<{ allowed: boolean; retryAfterMs: number }>;
};

const emailSchema = z.string().trim().email().max(254);
const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128),
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "As senhas não coincidem",
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
const emailOnlySchema = z.object({ email: emailSchema });
const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/i) });
const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128),
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "As senhas não coincidem",
});

function requireSameOrigin(options: LocalAuthRouteOptions) {
  return (request: Request): boolean => {
    if (request.get("sec-fetch-site") === "cross-site") return false;
    const suppliedOrigin = request.get("origin");
    if (!suppliedOrigin) return false;
    try {
      return new URL(suppliedOrigin).origin === options.resolveOrigin(request);
    } catch {
      return false;
    }
  };
}

function clientMessage(request: Request): string {
  return request.ip || "unknown";
}

function installPost(app: Express, options: LocalAuthRouteOptions, action: AuthAction, path: string,
  handler: (request: Request, response: any) => Promise<void>): void {
  const sameOrigin = requireSameOrigin(options);
  app.post(path, async (request, response) => {
    if (!sameOrigin(request)) {
      response.status(403).json({ message: "Origin not allowed" });
      return;
    }
    try {
      const limit = await options.rateLimit(action, clientMessage(request));
      if (!limit.allowed) {
        response.set("Retry-After", String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))));
        response.status(429).json({ message: "Muitas tentativas. Aguarde e tente novamente." });
        return;
      }
      await handler(request, response);
    } catch (error) {
      if (error instanceof AuthEmailUnavailableError) {
        response.status(503).json({ message: "Cadastro por email temporariamente indisponível." });
        return;
      }
      if (error instanceof AuthEmailDeliveryError) {
        console.warn(`[local-auth] delivery failed for ${action}`);
        response.status(202).json({ message: "Se a solicitação puder ser processada, enviaremos as instruções ao email informado." });
        return;
      }
      console.error(`[local-auth] ${action} request failed`, error instanceof Error ? error.message : String(error));
      response.status(503).json({ message: "Autenticação temporariamente indisponível." });
    }
  });
}

export function registerLocalAuthRoutes(app: Express, options: LocalAuthRouteOptions): void {
  installPost(app, options, "register", "/api/auth/register", async (request, response) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Dados de cadastro inválidos." });
      return;
    }
    const origin = options.resolveOrigin(request);
    await options.service.register({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password }, origin);
    response.status(202).json({ message: "Se o cadastro puder ser iniciado, enviaremos as instruções de confirmação ao email informado." });
  });

  installPost(app, options, "login", "/api/auth/login", async (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Email ou senha inválidos." });
      return;
    }
    const account = await options.service.authenticate(parsed.data.email, parsed.data.password);
    if (!account) {
      response.status(401).json({ message: "Email, senha ou confirmação inválidos." });
      return;
    }

    const identity = {
      localAuth: true,
      claims: {
        sub: account.userId,
        email: account.email,
        first_name: account.firstName,
        last_name: account.lastName,
      },
      expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      authenticatedAtMs: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      (request as Request & { login: (user: unknown, callback: (error?: unknown) => void) => void }).login(identity, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    response.set("Cache-Control", "no-store").json({
      user: {
        id: account.userId,
        email: account.email,
        firstName: account.firstName,
        lastName: account.lastName,
      },
    });
  });

  installPost(app, options, "verify", "/api/auth/verify-email", async (request, response) => {
    const parsed = tokenSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Link de confirmação inválido ou expirado." });
      return;
    }
    const verified = await options.service.verifyEmail(parsed.data.token);
    if (!verified) {
      response.status(400).json({ message: "Link de confirmação inválido ou expirado." });
      return;
    }
    response.json({ message: "Email confirmado. Você já pode entrar." });
  });

  installPost(app, options, "resend", "/api/auth/resend-verification", async (request, response) => {
    const parsed = emailOnlySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Informe um email válido." });
      return;
    }
    await options.service.resendVerification(parsed.data.email, options.resolveOrigin(request));
    response.status(202).json({ message: "Se houver uma conta pendente para esse email, enviaremos instruções." });
  });

  installPost(app, options, "reset-request", "/api/auth/password-reset/request", async (request, response) => {
    const parsed = emailOnlySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Informe um email válido." });
      return;
    }
    await options.service.requestPasswordReset(parsed.data.email, options.resolveOrigin(request));
    response.status(202).json({ message: "Se houver uma conta elegível, enviaremos instruções para redefinir a senha." });
  });

  installPost(app, options, "reset-complete", "/api/auth/password-reset/complete", async (request, response) => {
    const parsed = resetSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Link ou senha inválidos." });
      return;
    }
    const completed = await options.service.resetPassword(parsed.data.token, parsed.data.password);
    if (!completed) {
      response.status(400).json({ message: "Link inválido ou expirado. Solicite uma nova redefinição." });
      return;
    }
    response.json({ message: "Senha redefinida. Entre usando a nova senha." });
  });
}
