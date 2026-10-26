import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.test.js"
    ],
    timeout: 30000,
    hookTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["server/**/*.ts", "shared/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@server": path.resolve(__dirname, "./server"),
      "@shared": path.resolve(__dirname, "./shared"),
      "@client": path.resolve(__dirname, "./client"),
      "@game": path.resolve(__dirname, "./server/game"),
      "@auth": path.resolve(__dirname, "./server/replit_integrations/auth"),
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
});
