import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    exclude: [
      "tests/integration/gas-combat.integration.test.ts",
      "tests/integration/multi-world.integration.test.ts",
      "tests/integration/eos-economy.integration.test.ts",
      "tests/integration/storage.postgres.test.ts",
      "tests/integration/stripe-payments.postgres.test.ts",
    ],
    globals: true,
    environment: "node",
    timeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@server": path.resolve(__dirname, "./server"),
      "@shared": path.resolve(__dirname, "./shared"),
      "@client": path.resolve(__dirname, "./client/src"),
      "@game": path.resolve(__dirname, "./server/game"),
      "@auth": path.resolve(__dirname, "./server/replit_integrations/auth"),
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
});
