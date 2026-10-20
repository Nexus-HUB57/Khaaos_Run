import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
const isGenerateCommand = process.argv.includes("generate");

if (!databaseUrl && !isGenerateCommand) {
  throw new Error("DATABASE_URL must be set for database migration commands");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // `generate` only compares schema files; it does not open a connection.
    url: databaseUrl ?? "postgresql://127.0.0.1/khaaos",
  },
});
