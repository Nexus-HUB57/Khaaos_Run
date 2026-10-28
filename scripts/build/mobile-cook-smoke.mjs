#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const projectRoot = join(repoRoot, "Unreal", "KhaaosRun");
const projectFile = join(projectRoot, "KhaaosRun.uproject");
const contentRoot = join(projectRoot, "Content");
const args = process.argv.slice(2);
const platformArg = args.find((value) => value.startsWith("--platform="))?.split("=")[1] ?? "Android_ASTC";
const validPlatforms = new Set(["Android_ASTC", "Android_ETC2", "IOS"]);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function getIniValue(ini, targetSection, key) {
  let activeSection = "";
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const line of ini.split(/\r?\n/)) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      activeSection = section[1];
      continue;
    }
    if (activeSection !== targetSection) continue;
    const setting = line.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*([^;\\r\\n]+)`));
    if (setting) return setting[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

function findEditorCommand() {
  if (process.env.UE_EDITOR_CMD) return process.env.UE_EDITOR_CMD;
  const engineRoot = process.env.UE_ENGINE_ROOT;
  if (engineRoot) {
    const suffix = process.platform === "win32" ? "Win64/UnrealEditor-Cmd.exe"
      : process.platform === "darwin" ? "Mac/UnrealEditor-Cmd" : "Linux/UnrealEditor-Cmd";
    return join(engineRoot, "Engine", "Binaries", suffix);
  }
  return null;
}

function main() {
  if (!validPlatforms.has(platformArg)) {
    console.error(`[mobile-cook] INVALID_PLATFORM=${platformArg}; use Android_ASTC, Android_ETC2 or IOS`);
    process.exit(2);
  }

  const project = JSON.parse(readFileSync(projectFile, "utf8"));
  const runtime = project.Modules.find((module) => module.Name === "KhaaosRun");
  const allowed = new Set(runtime?.PlatformAllowList ?? []);
  const targetPlatforms = new Set(project.TargetPlatforms ?? []);
  const expectedTarget = platformArg === "IOS" ? "IOS" : "Android";
  const problems = [];
  if (!allowed.has(expectedTarget) || !targetPlatforms.has(expectedTarget)) {
    problems.push(`uproject target ${expectedTarget} ausente em PlatformAllowList/TargetPlatforms`);
  }

  const realAssets = walk(contentRoot).filter((path) => /\.(uasset|umap)$/i.test(path));
  const maps = realAssets.filter((path) => path.toLowerCase().endsWith(".umap"));
  const engineIni = readFileSync(join(projectRoot, "Config", "DefaultEngine.ini"), "utf8");
  const defaultMapObjectPath = getIniValue(engineIni, "/Script/EngineSettings.GameMapsSettings", "GameDefaultMap");
  let mapPackage = null;
  let relativeMapPath = null;
  if (defaultMapObjectPath) {
    mapPackage = defaultMapObjectPath.split(".")[0];
    if (mapPackage.startsWith("/Game/")) relativeMapPath = `${mapPackage.slice("/Game/".length)}.umap`;
  }
  if (!maps.length) problems.push("Content/ não contém nenhum .umap importado (não há mapa para smoke cook)");
  if (!realAssets.length) problems.push("Content/ não contém .uasset/.umap Unreal reais; JSON/.meta/OBJ/GLTF não são assets cooked pelo UAT");
  if (!defaultMapObjectPath) {
    problems.push("GameDefaultMap não está definido na seção GameMapsSettings de Config/DefaultEngine.ini");
  } else if (!relativeMapPath) {
    problems.push(`GameDefaultMap não é um package path /Game válido: ${defaultMapObjectPath}`);
  } else if (!existsSync(join(contentRoot, ...relativeMapPath.split("/")))
    || !maps.some((path) => path === join(contentRoot, ...relativeMapPath.split("/")))) {
    problems.push(`GameDefaultMap aponta para ${defaultMapObjectPath}, mas Content/${relativeMapPath} não existe`);
  }

  const editorCmd = findEditorCommand();
  if (!editorCmd || !existsSync(editorCmd)) {
    problems.push("UnrealEditor-Cmd não encontrado; informe UE_ENGINE_ROOT ou UE_EDITOR_CMD para UE 5.8");
  }

  if (platformArg.startsWith("Android")) {
    if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) problems.push("ANDROID_HOME/ANDROID_SDK_ROOT ausente");
    if (!process.env.JAVA_HOME) problems.push("JAVA_HOME ausente");
    if (!process.env.NDKROOT && !process.env.ANDROID_NDK_ROOT) problems.push("NDKROOT/ANDROID_NDK_ROOT ausente");
  } else {
    if (process.platform !== "darwin") problems.push("cook iOS com este módulo C++ exige host macOS com toolchain Apple");
    if (process.platform === "darwin") {
      const xcode = spawnSync("xcode-select", ["-p"], { encoding: "utf8" });
      if (xcode.status !== 0) problems.push("Xcode Command Line Tools não configurados (xcode-select -p falhou)");
    }
  }

  if (problems.length) {
    console.error(`[mobile-cook] BLOCKED platform=${platformArg}`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(2);
  }

  const mapName = basename(defaultMapObjectPath.split(".")[0]);
  console.log(`[mobile-cook] START platform=${platformArg} project=${projectFile} map=${mapName}`);
  const result = spawnSync(editorCmd, [
    projectFile,
    "-run=cook",
    `-targetplatform=${platformArg}`,
    `-map=${mapPackage}`,
    "-unattended",
    "-nop4",
    "-nosplash",
    "-UTF8Output",
  ], { cwd: projectRoot, stdio: "inherit" });
  if (result.error) {
    console.error(`[mobile-cook] EXEC_ERROR ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[mobile-cook] COOK_FAILED exit=${result.status ?? "signal"}`);
    process.exit(result.status ?? 1);
  }
  const cookedRoots = [
    join(projectRoot, "Saved", "Sandboxes", `Cooked-${platformArg}`),
    join(projectRoot, "Saved", "Cooked", platformArg),
  ];
  const expectedSuffix = `/content/${relativeMapPath.replaceAll("\\", "/").toLowerCase()}`;
  const cookedMapExists = cookedRoots.some((root) => walk(root).some((path) =>
    path.replaceAll("\\", "/").toLowerCase().endsWith(expectedSuffix)));
  if (!cookedMapExists) {
    console.error(`[mobile-cook] COOK_INCOMPLETE: exit 0, mas mapa cooked ${relativeMapPath} não foi encontrado em Saved/Sandboxes/Cooked-${platformArg} nem Saved/Cooked/${platformArg}`);
    process.exit(1);
  }
  console.log(`[mobile-cook] COOK_OK platform=${platformArg}`);
}

try {
  main();
} catch (error) {
  console.error("[mobile-cook] FATAL:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
