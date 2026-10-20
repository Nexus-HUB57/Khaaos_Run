import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const env = { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "production" };

if (env.RUN_DB_MIGRATIONS === "true") {
  console.log("RUN_DB_MIGRATIONS=true; applying checked-in Drizzle migrations.");
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const migration = spawnSync(npmCommand, ["run", "db:migrate"], {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (migration.error) {
    console.error("Could not start the Drizzle migration command:", migration.error);
    process.exit(1);
  }
  if (migration.status !== 0) {
    process.exit(migration.status ?? 1);
  }
  console.log("Drizzle migrations completed; starting the application.");
}

const server = spawn(process.execPath, ["dist/index.cjs"], {
  env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}

server.on("error", (error) => {
  console.error("Could not start the production server:", error);
  process.exitCode = 1;
});

server.on("exit", (code, signal) => {
  process.exitCode = signal ? 0 : (code ?? 1);
});
