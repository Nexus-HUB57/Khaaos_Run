# UE5.8 no CI — estado, bloqueios e caminhos para compilar

> Status: **estrutura 100% validada sem engine; compilação aguarda um binário
> de engine** (imagem oficial da Epic em container **ou** runner self-hosted).
> Este documento é o mapa honesto do bloqueio e de como removê-lo.

## Por que o compile está bloqueado no CI hosted "puro"

| Bloqueio | Detalhe |
|----------|---------|
| Licença | A EULA da Unreal Engine **proíbe redistribuir o binário da engine**. Nenhuma imagem pública de terceiros pode ser usada sem auditoria; a Epic publica as únicas imagens oficiais (`ghcr.io/epicgames/unreal-engine`), acessíveis só com conta GitHub vinculada à Epic (EULA aceita). |
| Tamanho | Engine instalada ≈ 60–90 GB; runners hosted têm ~14 GB de disco útil em `/` e cache limitado. Instalar por download a cada job é inviável (limites de runtime também). |
| Editor/SDK | `KhaaosRunEditor` exige ferramentas do editor (UHT/Iris). O target `KhaaosRunServer` **não** exige editor, mas ainda exige o build da engine para linkar. |

Consequência prática: **a estrutura do projeto é totalmente verificável sem
engine** (e hoje está verde — 1782 includes validados), mas o *link* só
acontece com um binário de engine.

## O que já roda sem engine (em toda PR)

- **`UE5.8 Preflight`** (`.github/workflows/ue5-preflight.yml`) — valida
  `KhaaosRun.uproject` (EngineAssociation 5.8, módulos), os três targets
  (Game/Editor/Server), `Build.cs` (chaves, caminhos absolutos), resolução de
  includes de projeto em `Source/` e `GENERATED_BODY()` em headers refletidos.
  Mesmo código roda nos testes do game-runtime
  (`game-runtime/test/ue58-preflight.test.js`).
- **Bônus histórico:** o preflight nasceu de uma auditoria real e encontrou
  **7 includes quebrados** (`KhaaosAttributeSet.h`, `KhaaosSaveGame.h`,
  `KhaaosPlayerState.h`, `KhaaosCIGKVLevelData.h` com caminhos que não
  resolviam) — corrigidos neste PR. Eram erros de compilação latentes que só
  apareceriam depois de horas de build com engine.

## Caminho A (recomendado): imagem oficial da Epic em container

Workflow: **`.github/workflows/ue58-container-build.yml`** — job `gate`
detecta o secret `UE_CONTAINER_PAT`; presente, sobe o container e roda
`Build.sh KhaaosRunServer Linux Development`. Sem o secret, o build é
**pulado com resumo explicativo** (nunca falha a CI).

Setup (uma vez, ~5 min):

1. Conta GitHub vinculada à Epic: aceitar a EULA em
   <https://www.unrealengine.com/eula> e vincular em
   <https://epicgames.com/account/connected>.
2. Criar PAT clássico com `read:packages` nessa conta.
3. Repo → Settings → Secrets and variables → Actions:
   - Secret **`UE_CONTAINER_PAT`** = o PAT.
   - (Opcional) Variable **`UE_CONTAINER_IMAGE`** para fixar a tag exata
     publicada em `github.com/orgs/epicgames/packages`
     (ex.: `ghcr.io/epicgames/unreal-engine:dev-slim-5.8.0`).
4. Push em `Unreal/KhaaosRun/Source/**` ou rodar o workflow manualmente →
   binários do servidor dedicado sobem como artifact.

## Caminho B: runner self-hosted com engine instalada

Workflow já existente: **`ue5-headless-compile.yml`**
(`runs-on: [self-hosted, linux, ue5.8, x64]`), agora com bootstrap
automatizado em **`scripts/build/bootstrap_ue58_runner.sh`**:

```bash
# máquina Linux 8+ cores / 32 GB RAM / 250 GB disco
sudo UE5_GITHUB_TOKEN=<PAT-Epic> bash scripts/build/bootstrap_ue58_runner.sh --prereqs
sudo UE5_GITHUB_TOKEN=<PAT-Epic> bash scripts/build/bootstrap_ue58_runner.sh --engine
RUNNER_TOKEN=<token da UI> bash scripts/build/bootstrap_ue58_runner.sh --runner
bash scripts/build/bootstrap_ue58_runner.sh --check   # valida engine+runner
```

O script clona `EpicGames/UnrealEngine` branch `5.8.0-release` (via PAT da
conta vinculada), roda `Setup.sh` e registra o runner com os labels exatos
que o workflow exige.

## Caminho C (referência): Windows/Editor

Para `KhaaosRunEditor` (cook de mundos, Niagara, .umap), o mesmo padrão vale
em um agente Windows com Epic Games Launcher instalado — fora do escopo de
CI (licença e custo de máquina), manter builds de conteúdo na estação de
design e versionar artefatos via LFS.

## Checklist para "compilado no CI" ✅

- [x] Estrutura do projeto validada sem engine (preflight + testes)
- [x] Workflow de container com gate de secret (`UE_CONTAINER_PAT`)
- [x] Bootstrap de runner self-hosted com UE5.8
- [x] Includes quebrados corrigidos (7) — projeto pré-UBT limpo
- [ ] Secret `UE_CONTAINER_PAT` configurado no repo **(ação humana, 5 min)**
- [ ] Primeiro build `KhaaosRunServer` verde no `UE5.8 Container Build`
- [ ] (Opcional) runner self-hosted para Editor/cook

## Camada EAC — build condicional com stub (entregue) ✅

O bloqueio de binários não pode mais quebrar o build. O módulo
`Source/KhaaosEAC/` detecta o SDK **em tempo de build**:

| Estado | Condição | Comportamento |
|---|---|---|
| `KHAAOS_EAC_SDK=1` | env `KHAAOS_EAC_SDK_DIR` ou `Source/KhaaosEAC/EACSDK/` com `Sdk/anticheat/sdkdefines.h` | include paths + libs `eacserver`/`eacclient` (Win64 `.lib`/`.dll`, Linux `.so`) + `RuntimeDependencies` |
| `KHAAOS_EAC_SDK=0` (stub) | SDK ausente | módulo compila; `KhaaosEACSupport::IsSDKAvailable() → false`; runtime opera só com validação local (`KhaaosAntiCheat`/`KhaaosMovementValidator`) |

- O `.uproject` registra `KhaaosEAC` (Runtime, Win64/Linux) e `KhaaosRun` já
  declara a dependência — quando os binários existirem, as chamadas C reais
  entram via `Game/AntiCheat/KhaaosEACIntegration` (já estruturado).
- Preflight valida o contrato: UE1041 (fatal) se o Build.cs do módulo perder a
  detecção condicional; UE1040 (warning honesto) enquanto os binários não
  existirem.
- **Ação humana pendente (inalterada)**: baixar o EAC SDK no dev portal da Epic
  (conta do jogo, aceitar termos) e descompactar em
  `Unreal/KhaaosRun/Source/KhaaosEAC/EACSDK/` (ou apontar `KHAAOS_EAC_SDK_DIR`).
  O preflight passa a sinalizar `KHAAOS_EAC_SDK=1` automaticamente.
