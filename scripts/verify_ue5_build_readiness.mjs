#!/usr/bin/env node
/**
 * Khaaos Run — UE5.8 Build Readiness, 3D Maps/Niagara & EAC SDK Binary Auditor
 * Devs Ph.D | UE5.8 | Copyright Nexus-HUB57. All Rights Reserved.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const UE_ROOT = path.join(REPO_ROOT, "Unreal", "KhaaosRun");

function walkFiles(dir, extFilter = null, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, extFilter, out);
    } else if (!extFilter || extFilter.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

export function auditUE5Readiness() {
  const sourceDir = path.join(UE_ROOT, "Source");
  const cppFiles = walkFiles(sourceDir, [".h", ".cpp", ".cs"]);
  const headerFiles = cppFiles.filter((f) => f.endsWith(".h"));
  const implFiles = cppFiles.filter((f) => f.endsWith(".cpp"));

  // Check for KHAOSRUN_API typo in class declarations
  const macroViolations = [];
  let uclassCount = 0;
  let ustructCount = 0;
  let uenumCount = 0;

  for (const hFile of headerFiles) {
    const content = fs.readFileSync(hFile, "utf8");
    const rel = path.relative(REPO_ROOT, hFile);
    if (/class\s+KHAOSRUN_API\b/.test(content)) {
      macroViolations.push(rel);
    }
    uclassCount += (content.match(/\bUCLASS\s*\(/g) || []).length;
    ustructCount += (content.match(/\bUSTRUCT\s*\(/g) || []).length;
    uenumCount += (content.match(/\bUENUM\s*\(/g) || []).length;
  }

  // Check 5 Worlds 3D Map & DataTable readiness
  const worlds = ["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"];
  const worldPackages = worlds.map((w) => {
    const mapFolder = path.join(UE_ROOT, "Content", "Maps", w);
    const files = fs.existsSync(mapFolder) ? fs.readdirSync(mapFolder) : [];
    const hasObj = files.some((f) => f.endsWith(".obj"));
    const hasGltf = files.some((f) => f.endsWith(".gltf"));
    const hasUmapDesc = files.some((f) => f.endsWith(".umap.json"));
    const hasPointsCsv = files.some((f) => f.includes("MapPoints.csv"));
    const hasConfigCsv = files.some((f) => f.includes("WorldConfig.csv"));
    const hasTopDownSvg = files.some((f) => f.endsWith(".svg"));

    return {
      worldId: w,
      ready: hasObj && hasGltf && hasUmapDesc && hasPointsCsv && hasConfigCsv && hasTopDownSvg,
      hasObj,
      hasGltf,
      hasUmapDesc,
      hasPointsCsv,
      hasConfigCsv,
      hasTopDownSvg,
      fileCount: files.length,
    };
  });

  // Check Niagara VFX specs
  const vfxFolder = path.join(UE_ROOT, "Content", "VFX");
  const niagaraFiles = fs.existsSync(vfxFolder)
    ? fs.readdirSync(vfxFolder).filter((f) => f.endsWith(".niagara.json"))
    : [];

  // Check Weapons glTF specs
  const weaponsFolder = path.join(UE_ROOT, "Content", "Weapons");
  const weaponFiles = fs.existsSync(weaponsFolder)
    ? fs.readdirSync(weaponsFolder).filter((f) => f.endsWith(".gltf"))
    : [];

  // Check EAC SDK Binaries & SHA256 attestation
  const eacDir = path.join(UE_ROOT, "ThirdParty", "EasyAntiCheat");
  const eacLinuxServerSo = path.join(eacDir, "Binaries", "Linux", "libeasyanticheat_server.so");
  const eacLinuxClientSo = path.join(eacDir, "Binaries", "Linux", "libeasyanticheat_client.so");
  const eacWinServerDll = path.join(eacDir, "Binaries", "Win64", "EasyAntiCheat_Server_x64.dll");
  const eacWinClientDll = path.join(eacDir, "Binaries", "Win64", "EasyAntiCheat_x64.dll");
  const eacBridgeHeader = path.join(eacDir, "include", "eos_anticheat_bridge.h");

  const hashFile = (p) =>
    fs.existsSync(p)
      ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16)
      : null;

  const eacStatus = {
    bridgeHeaderPresent: fs.existsSync(eacBridgeHeader),
    linuxServerBinary: {
      present: fs.existsSync(eacLinuxServerSo),
      sha256Prefix: hashFile(eacLinuxServerSo),
      path: "ThirdParty/EasyAntiCheat/Binaries/Linux/libeasyanticheat_server.so",
    },
    linuxClientBinary: {
      present: fs.existsSync(eacLinuxClientSo),
      sha256Prefix: hashFile(eacLinuxClientSo),
      path: "ThirdParty/EasyAntiCheat/Binaries/Linux/libeasyanticheat_client.so",
    },
    win64ServerBinary: {
      present: fs.existsSync(eacWinServerDll),
      sha256Prefix: hashFile(eacWinServerDll),
      path: "ThirdParty/EasyAntiCheat/Binaries/Win64/EasyAntiCheat_Server_x64.dll",
    },
    win64ClientBinary: {
      present: fs.existsSync(eacWinClientDll),
      sha256Prefix: hashFile(eacWinClientDll),
      path: "ThirdParty/EasyAntiCheat/Binaries/Win64/EasyAntiCheat_x64.dll",
    },
  };

  const allWorldsReady = worldPackages.every((w) => w.ready);
  const allEacReady =
    eacStatus.bridgeHeaderPresent &&
    eacStatus.linuxServerBinary.present &&
    eacStatus.linuxClientBinary.present &&
    eacStatus.win64ServerBinary.present &&
    eacStatus.win64ClientBinary.present;

  return {
    ok: macroViolations.length === 0 && allWorldsReady && niagaraFiles.length >= 11 && allEacReady,
    timestamp: new Date().toISOString(),
    ue5Compilation: {
      engineVersion: "5.8",
      cppStandard: "C++20",
      totalSourceFiles: cppFiles.length,
      headerFiles: headerFiles.length,
      implementationFiles: implFiles.length,
      uclassCount,
      ustructCount,
      uenumCount,
      macroViolations,
      commandletClass: "UKhaaosWorldAssetBuilderCommandlet",
      status: macroViolations.length === 0 ? "READY_FOR_UBT_BUILD" : "MACRO_ERROR",
    },
    mapsAnd3DAssets: {
      allWorldsReady,
      worldsCount: worldPackages.length,
      worldPackages,
      niagaraSystemsCount: niagaraFiles.length,
      niagaraSystems: niagaraFiles.map((f) => f.replace(".niagara.json", "")),
      weaponMeshesCount: weaponFiles.length,
      weaponMeshes: weaponFiles.map((f) => f.replace(".gltf", "")),
    },
    eacSdk: {
      allEacReady,
      ...eacStatus,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = auditUE5Readiness();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exit(1);
  }
}
