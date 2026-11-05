# Auditoria de performance — cinco mundos / 300 operadores

**Data:** 5 de novembro de 2026
**Escopo:** proxy determinístico da simulação autoritativa e pipeline UE5.8
**Limite:** o sandbox não possui Unreal Engine 5.8 licenciado; portanto, o FPS de GPU continua pendente de runner real.

## 1. Evidência reproduzida

Comando executado após as correções:

```bash
npm ci --prefix game-runtime --no-audit --no-fund
node scripts/performance/ue58_all_world_stress.mjs \
  --duration-seconds 30 \
  --players-per-world 60 \
  --output artifacts/performance/ue58-all-worlds-stress.json \
  --markdown docs/performance/UE58_LIVE_ACTION_FPS_REPORT.md
```

Carga: cinco mundos simultâneos, 60 operadores por mundo, 300 no total, 900 ticks por mundo. Resultado pós-correção:

| Mundo | p95 do tick | p99 | Máximo | Gate |
|---|---:|---:|---:|---|
| CIGKV | 4,155 ms | 5,211 ms | 23,289 ms | PASS |
| Barburhen | 4,589 ms | 6,453 ms | 16,421 ms | PASS |
| Priadus | 4,096 ms | 5,597 ms | 10,479 ms | PASS |
| Ckesalth | 4,135 ms | 5,172 ms | 8,671 ms | PASS |
| Arukheea | 3,976 ms | 4,937 ms | 11,690 ms | PASS |

O pior p95 foi Barburhen, com 4,589 ms, contra o orçamento autoritativo de 33,333 ms. O gate passou nos cinco mundos. O valor agregado registrado pelo runner é 217,91 FPS server-equivalentes, calculado a partir do pior p95 observado entre os mundos; ele não é FPS de renderização.

## 2. Hotspots encontrados

Foi executado CPU profile do mesmo runner com 10 segundos e 60 operadores por mundo. Os principais custos foram:

1. `rayAabb`: caminho quente em LOS de bots, colisão balística e explosões.
2. `#stepBot` / `#hasLos`: seleção de alvo bot-versus-bot e teste de linha de visão para vários candidatos.
3. `stepActorMovement`: movimento de todos os bots contra os colliders do mundo.
4. `windowPaneOnSegment`: consulta de janelas para tiro e pathing.
5. Garbage collector e `structuredClone`: custos secundários de alocação, especialmente em snapshots e objetos temporários.

O profiler também mostrou que a seleção de alvo é o custo estrutural dominante depois que o teste geométrico foi otimizado. Ela permanece intencionalmente determinística e autoritativa.

## 3. Correções aplicadas

### 3.1 `rayAabb` sem alocações por raio

O algoritmo slab original criava um array de três eixos, três arrays internos e fazia destructuring para cada teste. A implementação agora é escalar, com as mesmas regras de intervalo, mas sem arrays temporários.

Impacto esperado:

- Menor pressão no garbage collector.
- Menor custo por LOS, bala, granada e explosão.
- Nenhuma mudança no contrato geométrico ou na ordem determinística.

### 3.2 Índice de colliders para LOS

`syncPhysicsWorld()` agora mantém `physicsWorld.losColliders`, separado da lista balística. Painéis de vidro e colliders marcados como `noBlock` não entram na lista de visão.

O índice tem `losSource` para detectar harnesses e testes que substituem diretamente `physicsWorld.colliders`; nesses casos, o caminho cai de forma segura para a lista atual, preservando compatibilidade.

### 3.3 Pré-filtro por bounding box

Antes de chamar `rayAabb`, LOS e projéteis descartam colliders cuja AABB não intercepta o bounding box do segmento. É uma rejeição conservadora: somente casos geometricamente impossíveis são removidos, sem alterar acertos válidos.

### 3.4 Janela sem cópia de objeto

`windowPaneOnSegment()` não cria mais `{ ...p, destroyed: false }` para cada janela. `windowBoxCollider(win, true)` expressa diretamente a regra de que a abertura permanece consultável mesmo quando o vidro foi destruído.

## 4. Validação contra regressão

Passaram após as mudanças:

- `game-runtime/test/stress.test.js`
- `game-runtime/test/world-survival-load.test.js`
- `game-runtime/test/room3d.test.js`
- `game-runtime/test/sim3d.test.js`
- `game-runtime/test/interiors-windows.test.js`

Resultado: 61 testes aprovados, 0 falhas.

A suíte preservou colisão, LOS através de vidro, balística, hazards, salas autoritativas, snapshots, tsunami, fumaça tóxica, gravidade e carga Priadus.

## 5. Configuração do runner UE5.8

### Requisitos do host

- Linux x64.
- Pelo menos 8 cores.
- 32 GB de RAM.
- Pelo menos 250 GB livres; a engine e os artefatos de cook ocupam dezenas de GB.
- GPU compatível com o perfil visual do teste quando a captura de renderização for executada.
- Conta GitHub vinculada à Epic Games, EULA aceita e acesso ao repositório privado `EpicGames/UnrealEngine`.
- `git-lfs`, `clang`, `build-essential`, `dotnet 8`, `curl`, `jq`, `numactl` e Python.

### Instalação e labels

O bootstrap oficial é `scripts/build/bootstrap_ue58_runner.sh`:

```bash
sudo UE5_GITHUB_TOKEN=<PAT-vinculado-à-Epic> \
  bash scripts/build/bootstrap_ue58_runner.sh --prereqs

sudo UE5_GITHUB_TOKEN=<PAT-vinculado-à-Epic> \
  bash scripts/build/bootstrap_ue58_runner.sh --engine

RUNNER_TOKEN=<registration-token> \
  bash scripts/build/bootstrap_ue58_runner.sh --runner

bash scripts/build/bootstrap_ue58_runner.sh --check
```

O script:

1. instala os pré-requisitos;
2. clona a branch `5.8.0-release` da engine licenciada;
3. executa `Setup.sh`;
4. instala e registra o Actions runner;
5. aplica as labels `self-hosted,linux,x64,ue5.8,ue5`;
6. grava `UE5_ROOT=/opt/UnrealEngine` no `.env` do runner;
7. instala o serviço systemd quando executado como root.

Para o workflow de release, o job exige `[self-hosted, linux, ue5.8, x64]`. Configure também as variáveis do repositório:

```bash
gh variable set UE58_ENABLED --repo Nexus-HUB57/Khaaos_Run --body true
gh variable set UE5_ROOT --repo Nexus-HUB57/Khaaos_Run --body /opt/UnrealEngine
gh variable set UE5_WORLD_STRESS_COMMAND --repo Nexus-HUB57/Khaaos_Run --body '...AutomationTest Khaaos.Worlds.Stress...'
```

`UE5_WORLD_STRESS_COMMAND` deve apontar para o projeto cookado e executar o AutomationTest oficial que captura `Stat Unit`, CSV, Insights e, quando configurado, GPU Visualizer. O comando real pertence ao runner licenciado e não é inventado pelo proxy engine-less.

## 6. Pipeline CI/CD implementado

Workflow: `.github/workflows/ue58-release-cd.yml`.

### Etapa `validate`

Executa em `ubuntu-latest`:

- checkout com LFS;
- Node 22 e `npm ci` na raiz e em `game-runtime`;
- selftest e verificação de includes UE1021;
- `ue58_preflight.mjs` para `.uproject`, targets, `Build.cs`, includes e configuração;
- `npm run check`;
- suíte do runtime;
- `scripts/test_ue5_logic.sh`.

Essa etapa não exige a engine e bloqueia erros estruturais antes de consumir um runner caro.

### Etapa `stress`

Executa depois de `validate` em `ubuntu-latest`:

- instala as dependências de `game-runtime`;
- executa o proxy dos cinco mundos por 30 segundos com 60 operadores por mundo;
- usa `--run-engine` de forma tolerante: sem `UE5_ROOT` ou `UnrealEditor-Cmd`, registra `skipped_no_engine` sem transformar o proxy em FPS gráfico;
- publica JSON e Markdown como artefatos por 30 dias.

### Etapa `ue-build`

Só executa quando `inputs.run_engine=true` e `vars.UE58_ENABLED=true`, em runner `[self-hosted, linux, ue5.8, x64]`:

1. valida `UnrealEditor-Cmd` e `Linux/Build.sh`;
2. compila `KhaaosRunServer` em Shipping;
3. executa `RunUAT.sh BuildCookRun` com `-server -build -cook -stage -pak -archive`;
4. roda o hook `UE5_WORLD_STRESS_COMMAND` por 60 segundos com 60 operadores por mundo;
5. publica o pacote cookado e os relatórios.

### Etapa `package`

Baixa os artefatos de performance e, quando existente, o pacote cookado. Executa `scripts/build/package_ue58_release.py`, gerando arquivo reprodutível, relatório e manifesto SHA-256.

### Etapas `publish` e `deploy`

São manuais e protegidas:

- `publish=true` publica GitHub Release com pacote e relatório;
- `deploy=true` exige `publish=true` e ambiente protegido (`staging` ou `production`);
- o secret `KHAAOS_DEPLOY_COMMAND` recebe `KHAAOS_PACKAGE` e `KHAAOS_ENVIRONMENT`;
- sem o secret, o job falha fechado e não declara deploy bem-sucedido.

A concorrência usa `cancel-in-progress: true` por ref para impedir que builds obsoletos consumam o runner UE5.8.

## 7. Próximo gargalo a medir

Depois das otimizações de CPU, o maior risco não medido é gráfico: Lumen, Virtual Shadow Maps, materiais PBR, partículas, animação e shader/PSO hitch. O próximo gate deve rodar no runner UE5.8 com replay fixo e registrar:

- p1, p5, p50, p95 e p99 de frame time do cliente;
- tempo de Game Thread, Render Thread e GPU;
- draw calls, primitivas e memória/VRAM;
- hitch de shader e warm-up de PSO;
- soak de 10 minutos por mundo e execução simultânea.

O release gráfico só deve passar com p95 de renderização ≤ 16,67 ms no perfil Medium, sem crash, hitch persistente ou crescimento de memória.

## 8. Replay fixo e soak gráfico implementados

O contrato determinístico do soak está versionado em `scripts/performance/ue58-fixed-replay.json`. Ele fixa:

- seed `UE58-FIVE-WORLDS-FIXED-REPLAY-2026-11`;
- cinco mundos canônicos;
- 60 operadores por mundo;
- duração de 600 segundos;
- perfil Medium;
- Lumen, Nanite, Virtual Shadow Maps e TAAU ativos;
- captura de Stat Unit, Stat Unit Graph, GPU Visualizer, CSV, Insights e shader pipeline cache;
- gates de p95 do cliente, tick do servidor, crescimento de memória e hitch persistente.

O executor `scripts/performance/ue58_fixed_replay.mjs`:

1. valida o manifesto do replay;
2. registra engine, seed, mundos, duração e diretório de saída;
3. exporta `KHAAOS_REPLAY_*` para o comando do AutomationTest;
4. executa `UE5_REPLAY_COMMAND` com timeout de duração + 120 segundos;
5. captura stdout/stderr;
6. procura CSVs de Game Thread, Render Thread e GPU;
7. calcula p50, p95 e máximo;
8. gera `replay-result.json` e falha o job quando o comando UE falha.

O workflow `.github/workflows/ue58-release-cd.yml` ganhou o job `graphics_soak`, executado somente quando `run_engine=true`, `run_graphics_soak=true` e `UE58_ENABLED=true`. Ele exige as labels:

```text
self-hosted, linux, gpu, ue5.8, x64
```

O ambiente de homologação deve fornecer a variável protegida `UE5_REPLAY_COMMAND`. Ela deve chamar o AutomationTest cookado e escrever os CSVs/Insights no diretório recebido por `KHAAOS_REPLAY_OUTPUT`. O sandbox atual não possui GPU, UnrealEditor-Cmd nem permissão administrativa de Actions; por isso a conexão com a Epic e a execução real do soak permanecem gates do ambiente de homologação, não são simuladas localmente.
