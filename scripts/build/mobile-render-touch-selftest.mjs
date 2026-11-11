#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");
const assertIniValue = (ini, key, expected, label) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = ini.match(new RegExp(`^${escaped}\\s*=\\s*(.+)$`, "mi"));
  assert.ok(match, `${label}: chave ausente: ${key}`);
  assert.equal(match[1].trim(), expected, `${label}: valor incorreto para ${key}`);
};
const sectionBody = (ini, sectionName) => {
  const lines = ini.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[${sectionName}]`);
  assert.notEqual(start, -1, `seção INI ausente: ${sectionName}`);
  let end = lines.findIndex((line, index) => index > start && /^\s*\[[^\]]+\]\s*$/.test(line));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join("\n");
};

function main() {
  const android = read("Unreal/KhaaosRun/Config/Android/AndroidEngine.ini");
  const ios = read("Unreal/KhaaosRun/Config/IOS/IOSEngine.ini");
  const desktop = read("Unreal/KhaaosRun/Config/DefaultEngine.ini");
  const inputConfig = read("Unreal/KhaaosRun/Config/DefaultInput.ini");
  const profiles = read("Unreal/KhaaosRun/Config/DefaultDeviceProfiles.ini");
  const packaging = read("Unreal/KhaaosRun/Config/DefaultGame.ini");
  const androidSetup = read("scripts/build/setup_android_ue58.sh");

  for (const [platform, ini] of [["Android", android], ["iOS", ios]]) {
    assertIniValue(ini, "r.DynamicGlobalIlluminationMethod", "0", platform);
    assertIniValue(ini, "r.ReflectionMethod", "0", platform);
    assertIniValue(ini, "r.Nanite.ProjectEnabled", "False", platform);
    assertIniValue(ini, "r.Shadow.Virtual.Enable", "0", platform);
    assertIniValue(ini, "r.GenerateMeshDistanceFields", "False", platform);
    assertIniValue(ini, "r.Mobile.ShadingPath", "0", platform);
    console.log(`[mobile-selftest] ok: ${platform} usa fallback baked/LOD sem Lumen/Nanite/VSM`);
  }

  for (const [name, deviceType] of [["Android", "Android"], ["IOS", "IOS"]]) {
    const profile = sectionBody(profiles, `${name} DeviceProfile`);
    assert.match(profile, new RegExp(`DeviceType=${deviceType}`));
    assert.match(profile, /CVars_Default=r\.Streaming\.PoolSize=256/);
    assert.match(profile, /CVars_Smaller=r\.Streaming\.PoolSize=192/);
    assert.match(profile, /CVars_Smallest=r\.Streaming\.PoolSize=128/);
    assert.match(profile, /Group=TEXTUREGROUP_World,[^\n]*MaxLODSize=1024/);
    assert.match(profile, /Group=TEXTUREGROUP_Character,[^\n]*MaxLODSize=2048/);
    assert.match(profile, /Group=TEXTUREGROUP_Effects,[^\n]*MaxLODSize=1024/);
    assert.match(profile, /Group=TEXTUREGROUP_UI,[^\n]*MaxLODSize=2048/);
  }
  const androidLowGpu = sectionBody(profiles, "KhaaosAndroidLowGPU DeviceProfile");
  const androidBalanced = sectionBody(profiles, "KhaaosAndroidBalanced DeviceProfile");
  const iosLowGpu = sectionBody(profiles, "KhaaosIOSLowGPU DeviceProfile");
  assert.match(androidLowGpu, /sg\.ResolutionQuality=65/);
  assert.match(androidLowGpu, /sg\.ViewDistanceQuality=0/);
  assert.match(androidLowGpu, /sg\.ShadowQuality=0/);
  assert.match(androidBalanced, /sg\.ResolutionQuality=85/);
  assert.match(iosLowGpu, /sg\.ResolutionQuality=65/);
  assert.match(androidSetup, /NDK_VERSION="27\.2\.12479018"/);
  assert.match(androidSetup, /HOST_ARCH_BLOCKED/);
  assert.match(androidSetup, /--install --accept-licenses/);
  assert.match(androidSetup, /platforms;android-\$\{ANDROID_API\}/);
  const sdkRootWithSpaces = "/tmp/Khaaos Android SDK Test";
  const emitEnvCheck = spawnSync(
    "bash",
    ["-c", 'source <(bash "$SETUP_SCRIPT" --emit-env); [[ "$ANDROID_SDK_ROOT" == "$EXPECTED_SDK_ROOT" && "$NDKROOT" == "$EXPECTED_SDK_ROOT/ndk/27.2.12479018" ]]'],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ANDROID_SDK_ROOT: sdkRootWithSpaces,
        EXPECTED_SDK_ROOT: sdkRootWithSpaces,
        SETUP_SCRIPT: resolve(repoRoot, "scripts/build/setup_android_ue58.sh"),
      },
    },
  );
  assert.equal(emitEnvCheck.status, 0, `Android --emit-env must safely preserve spaces: ${emitEnvCheck.stderr}`);
  assert.match(packaging, /bShareMaterialShaderCode=True/);
  assert.match(packaging, /bSharedMaterialNativeLibraries=True/);

  // Mobile overrides must not erase the desktop visual baseline.
  assertIniValue(desktop, "r.DynamicGlobalIlluminationMethod", "1", "desktop baseline");
  assertIniValue(desktop, "r.ReflectionMethod", "1", "desktop baseline");
  assertIniValue(desktop, "r.Nanite.ProjectEnabled", "True", "desktop baseline");
  assertIniValue(inputConfig, "bAlwaysShowTouchInterface", "False", "custom UMG HUD");

  const controller = read("Unreal/KhaaosRun/Source/KhaaosRun/Player/KhaaosPlayerController.cpp");
  const controllerHeader = read("Unreal/KhaaosRun/Source/KhaaosRun/Player/KhaaosPlayerController.h");
  const touchHeader = read("Unreal/KhaaosRun/Source/KhaaosRun/Game/UI/Widgets/KhaaosMobileControlsWidget.h");
  const touchSource = read("Unreal/KhaaosRun/Source/KhaaosRun/Game/UI/Widgets/KhaaosMobileControlsWidget.cpp");
  const eacBuild = read("Unreal/KhaaosRun/Source/KhaaosEAC/KhaaosEAC.Build.cs");
  const firePolicy = read("Unreal/KhaaosRun/Source/KhaaosRun/Game/Network/KhaaosMobileFirePolicy.h");

  assert.match(controller, /#if PLATFORM_ANDROID \|\| PLATFORM_IOS[\s\S]{0,120}MobileTouchControlsClass/);
  assert.match(controller, /HandleMove\(FInputActionValue\(MobileTouchMoveAxis\)\)/);
  assert.match(controller, /BindAction\(IT\.Shoot, ETriggerEvent::Started/);
  assert.match(controller, /ServerSetFireHeld\(true, LocalFirePressToken\)/);
  assert.match(controller, /ServerFireHeartbeat\(LocalFirePressToken\)/);
  assert.match(controller, /NextFireHeartbeatTimestamp = Now \+ KhaaosMobileFirePolicy::HeartbeatIntervalSeconds/);
  assert.match(controller, /KhaaosMobileFirePolicy::HasFireLeaseExpired/);
  assert.match(controller, /KhaaosMobileFirePolicy::IsCurrentFireHeartbeat/);
  assert.match(controller, /else if \(bServerFireHeld && GetPawn\(\)\)/);
  assert.match(controller, /TryServerFireShot\(\)/);
  assert.match(controller, /KhaaosMobileFirePolicy::IsShotCadenceReady/);
  assert.match(controllerHeader, /UFUNCTION\(Server, Unreliable, WithValidation\)\s*void ServerFireHeartbeat\(uint32 PressToken\)/);
  assert.match(controllerHeader, /void ServerStopFire\(uint32 PressToken\)/);
  assert.match(firePolicy, /HeartbeatIntervalSeconds = 0\.25/);
  assert.match(firePolicy, /FireInputLeaseSeconds = 2\.0/);
  assert.match(firePolicy, /MinimumShotIntervalSeconds/);
  assert.match(firePolicy, /IsCurrentFireHeartbeat/);
  assert.match(controllerHeader, /TSubclassOf<UKhaaosMobileControlsWidget> MobileTouchControlsClass/);
  assert.match(controllerHeader, /void ServerSetFireHeld\(bool bHeld, uint32 PressToken\)/);
  assert.match(touchHeader, /UFUNCTION\(BlueprintCallable[\s\S]*?SetMoveAxis/);
  assert.match(touchHeader, /SetActionPressed\(EKhaaosTouchAction Action, int32 TouchPointerId, bool bPressed\)/);
  assert.match(touchSource, /PressedPointers\.FindOrAdd\(Action\)/);
  assert.match(touchSource, /DispatchReleased\(Entry\.Key, Controller\)/);
  assert.match(eacBuild, /bool isEacSupportedPlatform[\s\S]{0,180}UnrealTargetPlatform\.Win64[\s\S]{0,100}UnrealTargetPlatform\.Linux/);
  console.log("[mobile-selftest] ok: touch HUD usa handlers existentes e libera ações/pointers");
  console.log("[mobile-selftest] ok: política de heartbeat/lease/cadência é compartilhada com teste nativo");
  console.log("[mobile-selftest] ok: profiles low-GPU/balanced reduzem resolução e escalabilidade sem Lumen/Nanite");

  const project = JSON.parse(read("Unreal/KhaaosRun/KhaaosRun.uproject"));
  const runtimeModule = project.Modules.find((module) => module.Name === "KhaaosRun");
  const allowed = runtimeModule?.PlatformAllowList ?? [];
  const eacModule = project.Modules.find((module) => module.Name === "KhaaosEAC");
  const eacAllowed = eacModule?.PlatformAllowList ?? [];
  assert.ok(allowed.includes("Android"), "Android deve estar no PlatformAllowList do Runtime");
  assert.ok(allowed.includes("IOS"), "IOS deve estar no PlatformAllowList do Runtime");
  assert.ok(eacAllowed.includes("Android") && eacAllowed.includes("IOS"), "módulo EAC stub precisa estar disponível para dependência mobile");
  assert.ok(project.TargetPlatforms.includes("Android"));
  assert.ok(project.TargetPlatforms.includes("IOS"));
  console.log("[mobile-selftest] ok: targets Android/IOS habilitados; EAC mobile permanece sem SDK");
  console.log("[mobile-selftest] ok: profiles aplicam budgets de textura/streaming e shader sharing de pacote");
  console.log("MOBILE_CONFIG_STATIC_CHECKS_OK");
}

try {
  main();
} catch (error) {
  console.error("[mobile-selftest] FALHOU:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
