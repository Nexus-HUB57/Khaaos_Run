import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import path from "node:path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  const serverBuild = await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    splitting: true,
    outdir: "dist",
    entryNames: "index",
    chunkNames: "chunks/[name]-[hash]",
    outExtension: { ".js": ".mjs" },
    banner: {
      js: [
        'import { createRequire as __createRequire } from "node:module";',
        'import { fileURLToPath as __fileURLToPath } from "node:url";',
        'import { dirname as __pathDirname } from "node:path";',
        'const require = __createRequire(import.meta.url);',
        'const __filename = __fileURLToPath(import.meta.url);',
        'const __dirname = __pathDirname(__filename);',
      ].join("\n"),
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    metafile: true,
    logLevel: "info",
  });

  const outputs = Object.entries(serverBuild.metafile?.outputs ?? {});
  const entry = outputs.find(([, output]) => output.entryPoint === "server/index.ts");
  const monteCarloChunk = outputs.find(([outputPath, output]) =>
    outputPath.replaceAll("\\", "/").includes("/chunks/") &&
    Object.keys(output.inputs).some((input) =>
      input.replaceAll("\\", "/").endsWith("server/game/MonteCarloEconomy.ts"),
    ),
  );

  const entryPath = entry?.[0];
  const chunkPath = monteCarloChunk?.[0];
  const hasDynamicMonteCarloImport = Boolean(
    entryPath &&
      chunkPath &&
      entry[1].imports.some(
        (item) =>
          item.kind === "dynamic-import" &&
          path.resolve(item.path) === path.resolve(chunkPath),
      ),
  );

  if (!hasDynamicMonteCarloImport) {
    throw new Error(
      "Server build must emit MonteCarloEconomy as a separate dynamic ESM chunk.",
    );
  }

  console.log(`verified lazy Monte Carlo chunk: ${chunkPath}`);
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
