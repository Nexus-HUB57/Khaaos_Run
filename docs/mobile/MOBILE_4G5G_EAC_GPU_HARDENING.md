# Khaaos Run — endurecimento mobile: SDK, EAC, GPU e rede 4G/5G

**Branch de trabalho:** `feat/mobile-toolchain-network-chaos`
**Base revisada:** `main` em `1832851` (após os merges até o PR #235)
**Status:** código e testes determinísticos adicionados. O sandbox é `aarch64`, sem SDK/NDK, `javac`, Unreal Editor ou assets `.uasset/.umap`; o cook real precisa de runner UE/Linux apropriado e conteúdo importado. O EAC real ainda depende do SDK e acesso oficiais.

## O que foi implementado

- O renderer mobile exclui Lumen, Nanite, Virtual Shadow Maps e distance fields. O caminho substituto existente é Mobile Forward, iluminação estática/baked, reflection captures e LODs convencionais.
- Foram adicionados presets `KhaaosAndroidBalanced`, `KhaaosAndroidLowGPU`, `KhaaosIOSBalanced` e `KhaaosIOSLowGPU`, além de budgets de escalabilidade por memory bucket. O preset low reduz resolução interna para 65%, distância, sombras, pós-processamento, efeitos e foliage. Esses valores são um baseline para perfilagem; **não provam 60 FPS** nem são benchmark.
- O primeiro stress com quatro chamadas RPC reliable por segundo reproduziu timeout da lease em um perfil severo. O protocolo foi alterado para manter início/fim reliable, enviar heartbeats redundantes como Unreliable e rejeitar pacotes atrasados de outro pressionamento com token de geração.
- A política de heartbeat, lease, token e cadência autoritativa foi extraída para header C++ sem dependência Unreal, chamado pelo `KhaaosPlayerController` e pelo teste nativo.
- O setup EAC por URL salvava todo pacote como `.pkg` e calculava o diretório do SDK um nível acima do layout extraído. Corrigi o reconhecimento ZIP/TAR e a localização de `Sdk/anticheat`; pacotes inválidos agora falham em vez de cair silenciosamente para stub.
- Foi criado um bootstrap Linux do Android SDK/NDK para UE 5.8. Ele valida checksum do command-line tools oficial e não aceita licenças sem a flag explícita `--accept-licenses`.

## Resultado do workflow M4 UE5.8/EOS

Em 1 nov 2026, disparei duas vezes o workflow oficial [M4 — UE5.8/EOS Acceptance](https://github.com/Nexus-HUB57/Khaaos_Run/actions/workflows/m4-ue5-eos-acceptance.yml) com `package=true`: [primeira execução](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/41376087851) e [segunda execução após adicionar fallback de `UE5_GITHUB_TOKEN`](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/41376282565). Ambas terminaram com conclusão geral `success`, mas **não executaram build nem cook**: o gate reportou `UE_CONTAINER_PAT` ausente e, na segunda execução, também `UE5_GITHUB_TOKEN` ausente; por isso, `ue58-licensed` foi pulado. Nenhum UBT, Automation Tests, teste de dois clientes ou `BuildCookRun` aconteceu. A API Actions também retornou `total_count=0` para runners registrados, então não há runner self-hosted UE5.8 disponível como alternativa.

O job EOS reportou `EOS_*` ausentes e `EOS_LIVE_SMOKE_SKIPPED`; não houve autenticação live. A API do GitHub usada nesta sessão também negou permissão para listar nomes de secrets, então nenhuma credencial foi lida ou exposta. O fallback de workflow é mantido para aceitar um token com leitura do container caso ele seja configurado; o PR permanece draft até uma execução real.

## Android SDK/NDK e cook

O bootstrap `scripts/build/setup_android_ue58.sh` instala, quando autorizado, `platform-tools`, `platforms;android-35`, `build-tools;35.0.1` e `ndk;27.2.12479018` (r27c), e requer JDK 21 com `javac`, alinhado ao setup UE 5.8 [1] [2]. Para o command-line tools, ele confere o SHA-1 publicado no metadata oficial servido por HTTPS; isso verifica o artefato contra o metadata baixado, mas não é uma assinatura independente. Revalide as versões se o projeto migrar de engine.

```bash
# Leia e aceite os termos listados pelo sdkmanager antes da instalação.
scripts/build/setup_android_ue58.sh --install --accept-licenses
source <(scripts/build/setup_android_ue58.sh --emit-env)
scripts/build/setup_android_ue58.sh --check
```

**O setup não foi executado nesta revisão.** O check encontrou sete bloqueios: arquitetura do host `aarch64`, ausência de `sdkmanager`, `adb`, API 35, Build Tools 35.0.1, NDK r27c e `javac` (há apenas runtime Java 21). O script bloqueia explicitamente a instalação nesse host em vez de declarar o NDK pronto. A documentação Linux da Epic descreve a instalação de um build Unreal pré-compilado ou a compilação da engine; este ambiente não tem `UnrealEditor-Cmd` para cook [3].

Mesmo em um runner adequado, o cook está bloqueado pelo conteúdo: `Content/` não contém `.uasset` ou `.umap`, e `GameDefaultMap` aponta para `/Game/Maps/Menu_Khaaos`, cujo `.umap` não existe. O preflight UE retorna zero erros C++/UHT, mas alerta mapa e SDK EAC ausentes; isso **não** significa que o jogo foi compilado ou cooked. iOS requer host macOS com Xcode/signing e não pode ser cooked neste Linux [3] [11].

## EAC: plataforma e bloqueio real

A lista oficial EOS Anti-Cheat exclui clientes Android e iOS [4]. Isso não significa que o EOS SDK inteiro seja indisponível nessas plataformas: significa que as interfaces de Anti-Cheat client não são suportadas ali. O servidor dedicado precisa decidir como tratar clientes mobile não protegidos com base em informação de plataforma/identidade validada de forma confiável; não deve aceitar uma flag `isMobile` enviada pelo próprio cliente [5].

Além do pacote, há uma pendência concreta no código: `RegisterClient` e `UnregisterClient` em `KhaaosEACIntegration.cpp` ainda têm comentários de placeholder em vez de chamadas efetivas de registro de cliente. A API real exige opções/flags válidas [6]. Portanto, detectar cabeçalho ou bibliotecas — ou compilar `KHAAOS_EAC_SDK=1` — **não prova** que uma sessão esteja protegida. Para concluir, ainda são necessários SDK oficial autorizado, integração contra headers/API reais, Product/Sandbox/Deployment IDs, callbacks/mensageria pelo transporte do jogo, política de cliente não protegido e smoke test de uma sessão real.

O pacote oficial EAC/EOS não está no repositório nem neste sandbox. Para um runner autorizado, forneça `KHAAOS_EAC_SDK_DIR` ou `EAC_SDK_URL` com `EAC_SDK_SHA256` obrigatório; `EAC_SDK_URL_TOKEN` e `EAC_SDK_ARCHIVE_FORMAT` são opcionais. O extrator rejeita traversal, links e arquivos especiais. `--emit-env` produz exports shell seguros; `--emit-github-env` produz linhas para `$GITHUB_ENV`. O teste usa fixtures descartáveis e não inclui nem simula binários oficiais.

## Fallback gráfico em GPU intermediária

O caminho mobile permanece raster/Mobile Forward: iluminação baked/static, reflection captures, materiais compatíveis e LODs convencionais [7]. Perfis podem ser selecionados para QA com `-DeviceProfile=KhaaosAndroidBalanced`, `-DeviceProfile=KhaaosAndroidLowGPU` ou equivalentes `KhaaosIOS...`; Unreal documenta esse override por linha de comando [8].

Para mapas Battle Royale, produza lightmaps/LOD/HLOD, reduza overdraw/translucência e examine custo de shaders no Mobile Previewer. Dynamic Resolution não foi ativada porque o caminho documentado pela Epic não lista Android/iOS entre as plataformas suportadas [9]. A escolha final depende de GPU captures e estabilidade térmica em aparelhos-alvo; memory buckets não substituem classificação por GPU.

## Validação executável e interpretação

```bash
node scripts/build/mobile-render-touch-selftest.mjs
scripts/build/mobile-netcode-chaos-selftest.sh
scripts/build/eac_sdk_setup_selftest.sh
bash -n scripts/build/setup_android_ue58.sh scripts/build/setup_eac_sdk.sh
node scripts/build/ue58_preflight.mjs Unreal/KhaaosRun
```

O teste C++ compila o **mesmo header** usado pelo PlayerController e simula início/fim reliable ordenados e heartbeats redundantes Unreliable com perda/reordenação. Perfis determinísticos cobrem RTT de 40/150/300/500 ms, jitter de ±12/40/80/150 ms e perda de 1/3/10/25%. Verifica cadência autoritativa, ausência de timeout nos seeds conectados, rejeição de token atrasado, parada após release e encerramento por lease ao desconectar. É teste da política compartilhada com modelo de transporte; não roda Unreal nem valida a implementação real do NetDriver.

O self-test touch verifica estaticamente que o HUD UMG usa o PlayerController e acompanha pointers multitoque. Gameplay replicado, widget compilado, suspensão do app e recuperação de socket ainda precisam de UE/PIE e Android físico. Use Network Emulation no editor/console; a Epic recomenda incluir cenários de 500 ms RTT e perda de 10% ou mais [10]. Não aplique esses valores globalmente em produção.

## Pendências para liberar cook e teste físico

1. Usar runner Linux x86_64 com engine UE 5.8 licenciada e JDK 21 completo; revisar e aceitar explicitamente as licenças Android SDK, instalar toolchain e executar `--check`.
2. Importar o mapa `Menu_Khaaos` e assets Unreal reais; então executar cook Android e guardar logs/manifest/APK ou AAB.
3. Para iOS, usar runner macOS com Xcode, certificados e perfil de assinatura.
4. Disponibilizar EAC/EOS SDK em fonte autorizada e substituir placeholders com chamadas API revisadas. Não habilitar Anti-Cheat client em Android/iOS.
5. Implementar política segura do servidor para cliente mobile não protegido; executar sessão EAC real nos clientes suportados.
6. Executar NetDriver/Network Emulation e device farm; medir FPS p50/p95/p99, temperatura, memória, crashes, RTT p95 e input-to-shot latency.
7. Validar toque físico: multitouch, cancelamento de pointer, app em suspensão, orientação, safe area, dead zones, HUD configurável e reconnect.

## References

[1]: https://dev.epicgames.com/documentation/unreal-engine/android-quick-start "Android Quick Start"
[2]: https://developer.android.com/studio#command-line-tools-only "Android Studio Command-Line Tools"
[3]: https://dev.epicgames.com/documentation/unreal-engine/linux-development-quickstart-for-unreal-engine "Linux Development Quickstart"
[4]: https://dev.epicgames.com/docs/epic-online-services/trust-and-safety/anti-cheat-interfaces/anti-cheat-integration-check-list "Anti-Cheat Integration Checklist"
[5]: https://dev.epicgames.com/docs/epic-online-services/trust-and-safety/anti-cheat-interfaces/using-anti-cheat "Using Anti-Cheat"
[6]: https://dev.epicgames.com/docs/api-ref/functions/eos-anti-cheat-server-register-client "EOS Anti-Cheat Server Register Client API"
[7]: https://dev.epicgames.com/documentation/unreal-engine/performance-guidelines-for-mobile-devices-in-unreal-engine "Mobile Performance Guidelines"
[8]: https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-command-line-arguments-reference "Unreal Engine Command-Line Arguments"
[9]: https://dev.epicgames.com/documentation/unreal-engine/dynamic-resolution-in-unreal-engine "Dynamic Resolution"
[10]: https://dev.epicgames.com/documentation/unreal-engine/using-network-emulation-in-unreal-engine "Using Network Emulation"
[11]: https://dev.epicgames.com/documentation/unreal-engine/ios-ipados-tvos-quick-start-guide-for-unreal-engine "iOS, iPadOS, tvOS Quick Start Guide"
