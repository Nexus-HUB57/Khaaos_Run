import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const suites = ["test:official", "test:eos-flow"];

if (process.env.TEST_DATABASE_URL) {
  suites.push("test:postgres");
} else {
  console.log("[coverage] PostgreSQL integration skipped: TEST_DATABASE_URL is not configured.");
}

for (const suite of suites) {
  console.log(`\n▶ Coverage suite: ${suite}`);
  const result = spawnSync(npm, ["run", suite], {
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`Failed to start ${suite}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
