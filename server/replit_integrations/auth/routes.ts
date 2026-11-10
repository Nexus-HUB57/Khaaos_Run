import type { Express } from "express";
import { authStorage } from "./storage";
import { getPublicOrigin, isAuthenticated } from "./replitAuth";
import { distributedState } from "../../game/DistributedState";
import { createLocalAuthService } from "./localAuthService";
import { localAuthRepository } from "./localAuthStore.postgres";
import { createLocalAuthMailerFromEnv } from "./localAuthMailer";
import { registerLocalAuthRoutes } from "./localAuthRoutes";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  const localAuthService = createLocalAuthService(localAuthRepository, createLocalAuthMailerFromEnv());
  registerLocalAuthRoutes(app, {
    service: localAuthService,
    resolveOrigin: getPublicOrigin,
    rateLimit: async (action, ip) => {
      const limits = {
        register: 5,
        login: 10,
        verify: 20,
        resend: 5,
        "reset-request": 5,
        "reset-complete": 10,
      } as const;
      return distributedState.rateLimit(`auth:local:${action}:${ip}`, limits[action], 15 * 60_000);
    },
  });

  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
