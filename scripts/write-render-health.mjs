import fs from "node:fs";
import path from "node:path";

const commit = process.env.RENDER_GIT_COMMIT;
if (!commit || !/^[a-f0-9]{40}$/i.test(commit)) {
  throw new Error("RENDER_GIT_COMMIT must be a full 40-character Git SHA");
}

const outputDir = path.resolve("dist/public");
if (!fs.existsSync(outputDir)) {
  throw new Error(`Build output directory does not exist: ${outputDir}`);
}

const health = { status: "ok", commit };
fs.writeFileSync(
  path.join(outputDir, "healthz.json"),
  `${JSON.stringify(health)}\n`,
  { encoding: "utf8", mode: 0o644 },
);
console.log(`Wrote Render health check for ${commit}`);
