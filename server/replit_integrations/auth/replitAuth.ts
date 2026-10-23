import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { distributedState } from "../../game/DistributedState";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const currentSecret = process.env.SESSION_SECRET_CURRENT ?? process.env.SESSION_SECRET;
  const previousSecret = process.env.SESSION_SECRET_PREVIOUS;
  if (!currentSecret || Buffer.byteLength(currentSecret, "utf8") < 32) throw new Error("SESSION_SECRET_CURRENT must contain at least 32 bytes");
  const previousValidUntil = process.env.SESSION_SECRET_PREVIOUS_VALID_UNTIL
    ? Number(process.env.SESSION_SECRET_PREVIOUS_VALID_UNTIL)
    : undefined;
  if (previousSecret && (!previousValidUntil || !Number.isFinite(previousValidUntil))) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET_PREVIOUS_VALID_UNTIL is required in production");
  }
  const previousIsValid = Boolean(previousSecret && previousValidUntil && previousValidUntil > Math.floor(Date.now() / 1000));
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: previousIsValid ? [currentSecret, previousSecret!] : currentSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

function getPublicOrigin(req: { hostname: string; protocol: string }): string {
  const configured = process.env.PUBLIC_ORIGIN;
  if (configured) {
    const origin = new URL(configured);
    if (origin.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new Error("PUBLIC_ORIGIN must use HTTPS in production");
    }
    const requestHost = req.hostname.toLowerCase();
    if (origin.hostname.toLowerCase() !== requestHost) {
      throw new Error("Untrusted request host");
    }
    return origin.origin;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("PUBLIC_ORIGIN must be configured in production");
  }
  return `${req.protocol}://${req.hostname}`;
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export type AuthSetupOptions = {
  sessionMiddleware?: RequestHandler;
  upsertUser?: (claims: any) => Promise<unknown>;
  oidcConfig?: client.Configuration;
};

export async function setupAuth(app: Express, options: AuthSetupOptions = {}) {
  if (process.env.NODE_ENV === "production" &&
    (options.sessionMiddleware || options.upsertUser || options.oidcConfig)) {
    throw new Error("Auth test overrides are not allowed in production");
  }
  app.set("trust proxy", 1);
  app.use(options.sessionMiddleware ?? getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = options.oidcConfig ?? await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await (options.upsertUser ?? upsertUser)(tokens.claims());
    verified(null, user);
  };

  const strategyName = "replitauth:default";
  let strategyRegistered = false;

  const ensureStrategy = (req: { hostname: string; protocol: string }) => {
    const origin = getPublicOrigin(req);
    if (!strategyRegistered) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `${origin}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      strategyRegistered = true;
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    void distributedState.rateLimit(`auth:login:${req.ip}`, 30, 60_000).then((limit) => {
      if (!limit.allowed) return res.status(429).set("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000))).json({ message: "Too many authentication attempts" });
    try {
      ensureStrategy(req);
    } catch {
      return res.status(400).json({ message: "Untrusted request host" });
    }
    passport.authenticate(strategyName, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
    }).catch(() => res.status(503).json({ message: "Authentication unavailable" }));
  });

  app.get("/api/callback", (req, res, next) => {
    void distributedState.rateLimit(`auth:callback:${req.ip}`, 30, 60_000).then((limit) => {
      if (!limit.allowed) return res.status(429).set("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000))).json({ message: "Too many authentication attempts" });
    try {
      ensureStrategy(req);
    } catch {
      return res.status(400).json({ message: "Untrusted request host" });
    }
    passport.authenticate(strategyName, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
    }).catch(() => res.status(503).json({ message: "Authentication unavailable" }));
  });

  const logout = (req: any, res: any) => {
    let origin: string;
    try {
      origin = getPublicOrigin(req);
    } catch {
      return res.status(400).json({ message: "Untrusted request host" });
    }
    if (req.get("origin") !== origin || req.get("sec-fetch-site") === "cross-site") {
      return res.status(403).json({ message: "Origin not allowed" });
    }
    const userId = req.user?.claims?.sub;
    const revoke = userId ? distributedState.revokeUser(userId) : Promise.resolve();
    revoke.then(() => req.logout(() => {
      req.session?.destroy(() => undefined);
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: origin,
        }).href
      );
    })).catch(() => res.status(503).json({ message: "Logout indisponível" }));
  };

  app.post("/api/logout", logout);
  app.get("/api/logout", (_req, res) => res.status(405).json({ message: "Use POST /api/logout" }));
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (user.claims?.sub && await distributedState.isUserRevoked(user.claims.sub)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
