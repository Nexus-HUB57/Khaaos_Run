# Khaaos Run — habilitação de targets e base mobile UE 5.8

**Status:** Android e iOS estão habilitados nos allowlists do `.uproject`; há uma configuração inicial de renderer e budgets de textura/shader. O primeiro cook real está bloqueado: este sandbox não tem Unreal Engine/UAT nem toolchains móveis, e o projeto ainda não possui mapas ou assets binários Unreal importados. Portanto não há evidência de build mobile nem de 60 FPS.

## Targets e Easy Anti-Cheat

O módulo Runtime `KhaaosRun` e `TargetPlatforms` agora incluem `Android` e `IOS`. `KhaaosEAC` também é listado nessas plataformas para satisfazer a dependência do Runtime, mas seu `Build.cs` força `KHAAOS_EAC_SDK=0` em Android/iOS mesmo se o SDK desktop estiver presente. A vinculação real continua apenas em Win64/Linux. Isso é um stub de compilação, não proteção EAC mobile: a checklist da Epic declara Android e iOS como clientes não suportados pelo Anti-Cheat [1]. A compatibilidade dos plugins de terceiros habilitados no `.uproject` ainda precisa ser confirmada com build UE 5.8.

## Renderer, shaders e texturas

Android e iOS usam baked/static lighting, reflection captures, LODs convencionais e Mobile Forward (`r.Mobile.ShadingPath=0`). A Epic recomenda Forward para projetos com iluminação pré-computada; Deferred é opção se o slice depender de iluminação dinâmica e passar por perfilagem nos aparelhos-alvo [2]. Lumen, Nanite, Virtual Shadow Maps e geração de mesh distance fields estão desligados nas configs mobile. A configuração desktop permanece inalterada.

`DefaultDeviceProfiles.ini` estabelece um pool inicial de streaming de 256 MB no bucket padrão, 192 MB no menor e 128 MB no menor bucket. Reduz anisotropia nos aparelhos com menos memória. Os mip caps reduzem World de 1024 para 512/256 px, Characters de 2048 para 1024/512 px e Effects/UI em tiers menores. Os thresholds de memória são 8/6/4/3 GB. Profiles, memory buckets, texture pools e mip caps são mecanismos de configuração documentados pela Epic [3]. Estes valores são hipóteses de orçamento, não medições; precisam ser calibrados depois do cook com `stat streaming`, `ListTextures`, Unreal Insights e teste térmico nos aparelhos reais.

Para Android intermediário, o smoke-cook principal é `Android_ASTC`; manter `Android_ETC2` como fallback separado. A Epic descreve ETC2 como amplamente suportado e ASTC como formato de compressão mais recente, mas disponível somente em aparelhos compatíveis [4]. O primeiro slice deve cozinhar os dois formatos como variantes distintas, sem empacotar Android Multi antes de demonstrar que a distribuição multi-formato é necessária.

`DefaultGame.ini` habilita `bShareMaterialShaderCode` e `bSharedMaterialNativeLibraries` para armazenar shader code compartilhado e reduzir duplicação no pacote. A documentação avisa que isso pode reduzir o tamanho do pacote, mas aumentar o tempo de carregamento [5]. Não reduz por si só o custo do pixel shader ou garante FPS. As configs móveis ativam `NeedsShaderStableKeys` para preparar coleta futura de PSO cache; ainda não existe cache medido ou entregue. É necessário cozinhar o build, percorrer os fluxos reais em aparelho e recolher os dados antes de adicionar uma cache de produção.

O conteúdo atual não tem `.uasset` nem `.umap` binários, imagens de textura importadas ou mapas Unreal prontos. Há arquivos declarativos `.uasset.json`/`.meta`, blockouts OBJ/GLTF e marcadores `pending_import`. Por isso não foi possível converter texturas, gerar mips, contar shader permutations ou perfilar materiais. As configurações acima só afetam assets Unreal reais depois de importados. Para otimização de shaders por asset ainda será preciso reduzir samplers/instruções, overdraw/translucency e variantes static-switch depois de importar e medir o slice; não se deve remover variantes às cegas [6].

## Controles touch

A classe-base C++ `UKhaaosMobileControlsWidget` permite criar uma subclasse UMG/Blueprint para a arte final. Expõe eixo normalizado do joystick virtual, delta do gesto de câmera e ações de gameplay já encaminhadas ao `AKhaaosPlayerController`. A contagem de pointer IDs preserva multitoque: ação inicia no primeiro pointer, libera após o último; ao destruir o HUD, movimento é zerado e ações mantidas são liberadas.

A classe base não cria a tela visual. Ainda é preciso construir a subclasse UMG, ligar joystick/botões aos métodos BlueprintCallable e atribuir `MobileTouchControlsClass` ao Blueprint do PlayerController. O projeto ainda não possui um HUD touch visual integrado. `bAlwaysShowTouchInterface=False` evita duplicar o HUD com os controles nativos.

## Rede móvel e segurança

O tiro automático usa RPC de start/stop em vez de enviar chamada confiável por frame. A cadência é regulada no servidor pelo `FireRate` da arma. Enquanto o toque fica pressionado, o cliente envia heartbeat a 4 Hz; o servidor encerra o estado de tiro após 2 segundos sem heartbeat, cobrindo suspensão do app ou perda de conectividade. Esse lease não detecta sozinho um evento de release local perdido enquanto o cliente continua executando e enviando heartbeats; tratar cancelamentos/foco do app e testar essa condição nos aparelhos. Ações one-shot do Enhanced Input foram mudadas de `Triggered` para `Started`; movement/look analógicos permanecem contínuos. Isso reduz tráfego e estados presos em redes móveis, mas não substitui validação de movimento, hit registration, inventário, replay, sanções e anti-cheat server-side.

## Primeiro cook de teste

O comando reproduzível está em `scripts/build/mobile-cook-smoke.mjs`. Ele verifica target, mapa/assets reais, `UnrealEditor-Cmd` e toolchain antes de invocar o Cook Commandlet. Em uma máquina configurada com UE 5.8:

```bash
node scripts/build/mobile-cook-smoke.mjs --platform=Android_ASTC
node scripts/build/mobile-cook-smoke.mjs --platform=Android_ETC2
# Em Mac com Xcode configurado:
node scripts/build/mobile-cook-smoke.mjs --platform=IOS
```

**Resultado desta sessão:** `BLOCKED`, não `COOK_OK`. A tentativa Android detectou ausência de `.umap`, `.uasset`, do mapa `GameDefaultMap`, de `UnrealEditor-Cmd`, `ANDROID_HOME`/SDK, `JAVA_HOME` e `NDKROOT`. O cook iOS não foi executado; o projeto é C++ e exige host macOS com toolchain Apple/Xcode compatível com UE 5.8 [7]. O Android Quick Start UE 5.8 lista Android Studio/SDK, NDK e Java compatíveis como pré-requisitos para desenvolvimento e packaging [8].

Depois de importar um mapa de vertical slice e preparar o host, exigir cook de desenvolvimento `Android_ASTC`, depois `Android_ETC2`, e cook `IOS` em Mac. Revisar logs de plugins/RHI, contagem de shaders, memória de streaming e assets ausentes. Cook bem-sucedido não comprova 60 FPS: ainda é necessário instalar em aparelhos intermediários representativos e medir frametime p50/p95/p99, memória, térmica, bateria, draw calls e complexidade de shaders em uma sessão longa.

## Validações executadas

- `node scripts/build/mobile-render-touch-selftest.mjs` — passou (`MOBILE_CONFIG_STATIC_CHECKS_OK`), cobrindo presença textual de targets, EAC stub, profiles mobile, render, touch e cadência do tiro; não valida parsing UE, UBT/UHT ou compatibilidade de plugins.
- `node scripts/build/ue58_preflight.mjs Unreal/KhaaosRun` — passou sem erros estruturais; restaram 2 warnings: `GameDefaultMap` sem `.umap` e SDK EAC ausente (o stub é esperado neste ambiente).
- `node scripts/build/mobile-cook-smoke.mjs --platform=Android_ASTC` e `--platform=IOS` — bloqueados pelos pré-requisitos listados acima; nenhum cook foi iniciado.
- A classe UMG touch ainda não está atribuída a um PlayerController/Blueprint e os assets de InputAction não estão importados. Em especial, revisar a semântica de `Started` versus `Triggered` por ação quando esses assets estiverem disponíveis.

## Referências

[1]: https://dev.epicgames.com/docs/epic-online-services/trust-and-safety/anti-cheat-interfaces/anti-cheat-integration-check-list "Epic Anti-Cheat Integration Checklist"
[2]: https://dev.epicgames.com/documentation/unreal-engine/mobile-rendering-and-shading-modes-for-unreal-engine "Epic Mobile Rendering and Shading Modes"
[3]: https://dev.epicgames.com/documentation/unreal-engine/setting-up-device-profiles-in-unreal-engine "Epic Setting Device Profiles"
[4]: https://dev.epicgames.com/documentation/unreal-engine/packaging-android-projects-in-unreal-engine "Epic Packaging Android Projects"
[5]: https://dev.epicgames.com/documentation/unreal-engine/API/Developer/DeveloperToolSettings/UProjectPackagingSettings "Epic UProjectPackagingSettings UE 5.8"
[6]: https://dev.epicgames.com/documentation/unreal-engine/optimization-and-development-best-practices-for-mobile-projects-in-unreal-engine "Epic Mobile Optimization Best Practices"
[7]: https://dev.epicgames.com/documentation/unreal-engine/ios-ipados-tvos-quick-start-guide-for-unreal-engine "Epic iOS Quick Start UE 5.8"
[8]: https://dev.epicgames.com/documentation/unreal-engine/android-quick-start "Epic Android Quick Start UE 5.8"
