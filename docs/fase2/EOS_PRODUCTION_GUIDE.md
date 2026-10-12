# Khaaos Run — EOS Production Guide (Fase 2)

> **Devs Ph.D | UE5.8 | Nexus-HUB57**
> Guia passo-a-passo para configurar EOS (Epic Online Services) em produção,
> incluindo Auth, Matchmaking, Cloud Save e Easy Anti-Cheat.

---

## Índice

1. [Registro no Epic Developer Portal](#1-registro-no-epic-developer-portal)
2. [Obtendo Product/Sandbox/Deployment IDs](#2-obtendo-productsandboxdeployment-ids)
3. [Configurando EOS Auth](#3-configurando-eos-auth)
4. [Matchmaking Pools](#4-matchmaking-pools)
5. [EAC SDK Integration](#5-eac-sdk-integration)
6. [Cloud Save Schema Design](#6-cloud-save-schema-design)
7. [Production Checklist](#7-production-checklist)

---

## 1. Registro no Epic Developer Portal

### Passo 1.1: Criar Conta de Desenvolvedor

1. Acesse [Epic Developer Portal](https://dev.epicgames.com/portal/)
2. Crie uma conta de organização (Nexus-HUB57)
3. Aceite os termos de uso do EOS SDK
4. Ative o acesso ao Game Services

### Passo 1.2: Registrar o Produto

1. No Dashboard, clique **"Create Product"**
2. Nome do produto: `Khaaos Run`
3. Tipo: `Game`
4. Plataformas alvo:
   - ✅ Windows
   - ✅ macOS
   - ✅ Android
   - ✅ iOS
   - ✅ PlayStation (se aplicável)
   - ✅ Xbox (se aplicável)
5. Sandbox: `KhaaosRun_Prod` (produção)

### Passo 1.3: Anote os IDs

Após criar o produto, você terá:

| ID | Descrição | Onde usar |
|----|-----------|-----------|
| **Product ID** | Identificador único do produto | DefaultEOS.ini, EAC config |
| **Sandbox ID** | Ambiente (prod/staging/dev) | DefaultEOS.ini, EAC config |
| **Deployment ID** | Deployment específico | DefaultEOS.ini, matchmaking |
| **Client ID** | Para auth de clientes | DefaultEOS.ini, GitHub secret |
| **Client Secret** | Para auth (NUNCA commitar) | GitHub secret APENAS |

---

## 2. Obtendo Product/Sandbox/Deployment IDs

### Product ID

O Product ID é gerado automaticamente ao criar o produto. Exemplo:
```
ProductId=8a4f2c6d9e1b3a5f
```

### Sandbox ID

Por padrão, um sandbox "Prod" é criado. Para Khaaos Run:

| Sandbox | Uso | Descrição |
|---------|-----|-----------|
| `Prod` | Produção | Players reais |
| `Staging` | Staging | Testes pre-release |
| `Dev` | Desenvolvimento | Dev interno |

### Deployment ID

Crie deployments para cada sandbox:

1. Vá em **Product Settings → Deployments**
2. Clique **"New Deployment"**
3. Nome: `KhaaosRun_Prod_Deployment`
4. Região: Multi-region (sa1, na1, eu1)
5. Anote o Deployment ID

### Client Credentials

1. Vá em **Product Settings → Client Credentials**
2. Clique **"New Client"**
3. Nome: `KhaaosRun_Client`
4. Permissões necessárias:
   - ✅ `basicProfile` — perfil do jogador
   - ✅ `friendsList` — lista de amigos
   - ✅ `presence` — status online
   - ✅ `sessions` — criar/join sessões
   - ✅ `matchmaking` — matchmaking
   - ✅ `cloudStorage` — cloud save
   - ✅ `antiCheat` — Easy Anti-Cheat
5. Anote Client ID e Client Secret

> ⚠️ **NUNCA** commite o Client Secret no repositório. Use GitHub Secrets.

---

## 3. Configurando EOS Auth

### 3.1: EAS (Epic Account Services)

EAS permite login com conta Epic. Configure no DefaultEOS.ini:

```ini
[/Script/EOSIntegrationKit.EOSIntegrationKitSettings]
ProductId=SEU_PRODUCT_ID
SandboxId=SEU_SANDBOX_ID
DeploymentId=SEU_DEPLOYMENT_ID
ClientId=SEU_CLIENT_ID
ClientSecret=SEU_CLIENT_SECRET
bUseEAS=True
bEnableOverlay=True
bEnableOverlaySocial=True
```

### 3.2: External Auth Providers

Além do EAS, configure auth externo para outras plataformas:

| Provider | Método | Config |
|----------|--------|--------|
| Epic | EAS (padrão) | `bUseEAS=True` |
| Steam | Steam Session Ticket | Configurar no Dev Portal |
| Google | OAuth 2.0 | Configurar redirect URI |
| Apple | Sign in with Apple | Requer Apple Developer |
| Discord | OAuth 2.0 | Para launcher/desktop |

### 3.3: Fluxo de Login no Khaaos Run

```
1. GameInstance::Init()
   └→ UKhaaosEOSManager::InitializeEOS(ProductId, SandboxId, ...)
       └→ EOS_Platform_Create (via EOSIntegrationKit)
           └→ Login com Persistent Auth (auto-login)
               ├→ Sucesso: OnLoginComplete.Broadcast(true)
               └→ Falha: Tenta login com credenciais
                   ├→ Mostra tela de login (Epic overlay)
                   └→ OnLoginComplete.Broadcast(result)
```

### 3.4: Config no Código

```cpp
// No GameInstance::Init()
UKhaaosEOSManager* EOSManager = GetSubsystem<UKhaaosEOSManager>();
EOSManager->InitializeEOS(
    FName("8a4f2c6d9e1b3a5f"),  // ProductId
    FName("prod_sandbox_id"),    // SandboxId
    "deployment_id",             // DeploymentId
    "client_id",                 // ClientId
    "client_secret"              // ClientSecret
);

// Tenta persistent auth primeiro
EOSManager->LoginWithPersistence();
```

---

## 4. Matchmaking Pools

### 4.1: Configuração no Epic Dev Portal

1. Vá em **Game Services → Matchmaking**
2. Crie pools para cada região:

#### Pool SA1 (São Paulo — Padrão Brasil)

| Config | Valor |
|--------|-------|
| Nome | `KR_SA1` |
| Região | `sa1` |
| Max Players | 50 |
| Min Players | 10 |
| MMR Spread | 200 |
| Max Wait | 120s |

#### Pool NA1 (Virginia)

| Config | Valor |
|--------|-------|
| Nome | `KR_NA1` |
| Região | `na1` |
| Max Players | 50 |
| Min Players | 10 |
| MMR Spread | 200 |
| Max Wait | 120s |

#### Pool EU1 (Frankfurt)

| Config | Valor |
|--------|-------|
| Nome | `KR_EU1` |
| Região | `eu1` |
| Max Players | 50 |
| Min Players | 10 |
| MMR Spread | 200 |
| Max Wait | 120s |

### 4.2: Matchmaking Rules

Configure rules no Dev Portal:

```json
{
  "name": "KhaaosBR_MMR_Rule",
  "type": "skill_based",
  "params": {
    "mmr_property": "Rating",
    "initial_spread": 200,
    "spread_increase_per_second": 5,
    "max_spread": 500,
    "min_players": 10,
    "max_players": 50,
    "team_balance": true,
    "max_team_skill_delta": 100
  }
}
```

### 4.3: Session Template

Crie uma session template para a partida CIGKV:

```json
{
  "name": "Khaaos_CIGKV_50p",
  "maxPlayers": 50,
  "minPlayers": 10,
  "allowJoinInProgress": true,
  "allowSpectators": false,
  "timeoutMinutes": 180,
  "data": {
    "MapId": "CIGKV_KhaaosVille",
    "GameMode": "KhaaosGameMode",
    "Region": "auto"
  }
}
```

### 4.4: Fluxo de Matchmaking

```
1. Player seleciona "Jogar" no menu
   └→ UKhaaosEOSMatchmaking::StartMatchmaking(Region, GameMode)
       └→ EOS_Matchmaking_SubmitMatchmakingRequest
           ├→ Waiting... (UI mostra "Procurando partida...")
           ├→ Match found: OnMatchFound callback
           │   └→ JoinSession → Travel to server
           └→ Timeout: OnMatchmakingTimeout
               └→ Expand MMR spread e tentar novamente
```

---

## 5. EAC SDK Integration

### 5.1: Download do EAC SDK

1. Acesse [EAC Documentation](https://dev.epicgames.com/docs/game-services/anti-cheat)
2. Baixe o EAC Server SDK e Client SDK
3. Coloque em: `Unreal/KhaaosRun/Plugins/EasyAntiCheatServer/`

### 5.2: Configuração no Epic Dev Portal

1. Vá em **Product Settings → Anti-Cheat**
2. Ative Easy Anti-Cheat para o produto
3. Configure:
   - Modulos do jogo (exe names)
   - Whitelist de processos permitidos
   - Sensibilidade de detecção

### 5.3: Server-Side Setup

Crie `eac_server.ini`:

```ini
[EasyAntiCheat]
product_id=SEU_PRODUCT_ID
sandbox_id=SEU_SANDBOX_ID
deployment_id=SEU_DEPLOYMENT_ID

[Server]
port=8577
timeout=30
max_clients=100

[Logging]
enabled=true
level=info
file=eac_server.log
```

### 5.4: Client-Side Setup

O EAC client é iniciado automaticamente quando o jogo roda com o EAC launcher.
Para desenvolvimento, use o EAC em modo "dev" (sem kick):

```ini
[EasyAntiCheat]
mode=dev
```

### 5.5: Integração com KhaaosAntiCheat

O `UKhaaosEACIntegration` faz a ponte entre EAC SDK e o sistema de 3 strikes:

| EAC Severity | Strikes | Ação |
|-------------|---------|------|
| Informational | 0 | Log apenas |
| Minor | 1 | Warning |
| Major | 2 | Penúltimo aviso |
| Critical | 3 | Auto-kick |

### 5.6: Fluxo EAC

```
Servidor:
  InitializeEAC(ProductId, SandboxId, DeploymentId, true)
  └→ eac_server::start()
      └→ On player connect:
          └→ RegisterClient(PlayerId, ClientHandle)
              └→ eac_server::register_client()
                  ├→ validate_session() a cada 30s
                  └→ on_client_violation → HandleEACViolation()
                      └→ IssueStrikeForViolation() via KhaaosAntiCheat
                          └→ 3 strikes → KickPlayer()

Cliente:
  InitializeEAC(ProductId, SandboxId, DeploymentId, false)
  └→ StartAntiCheat()
      └→ eac_client::start()
          └→ SetGameSessionId(SessionId)
              └→ on_message → Handle kick/update/error
```

---

## 6. Cloud Save Schema Design

### 6.1: Versão do Schema

O `UKhaaosCloudSaveProduction` suporta versionamento. Versões atuais:

| Versão | Descrição | Mudanças |
|--------|-----------|----------|
| v1 | Schema inicial | Stats, items, settings |
| v2 | Economia FBM | Adicionado FbmBalance, Zu |
| v3 | Ranking sazonal | Histórico de patente, season ranking |

### 6.2: Estratégia de Merge

Quando local e cloud divergem (conflito):

| Categoria | Estratégia | Motivo |
|-----------|-----------|--------|
| Stats (XP, Rating, Kills, KRC) | ServerWins | Server é autoritativo |
| Cosméticos (Zu, skins, equipped) | ClientWins | Preferência do jogador |
| Match History | MergeBoth | Combina e deduplica |
| Settings | ClientWins | Preferência local |
| Economia (loans, salary) | ServerWins | Server é autoritativo |

### 6.3: Compressão LZ4

- Todos os saves são comprimidos com LZ4 antes do upload
- Redução típica: 60-80% do tamanho original
- Metadata rastreamento: `bIsCompressed`, `SizeBytes` (original), `Checksum`

### 6.4: Retry com Exponential Backoff

```
Tentativa 1: 1.0s + jitter
Tentativa 2: 2.0s + jitter
Tentativa 3: 4.0s + jitter
Tentativa 4: 8.0s + jitter
Tentativa 5: 16.0s + jitter  (máximo 30s)
```

Se 5 tentativas falharem, a operação falha com callback de erro.

### 6.5: Auto-Save

- Intervalo padrão: 120 segundos
- Mínimo: 30 segundos
- Trigger manual via `TriggerAutoSave()`
- Auto-save respeita estado dirty (só salva se houver mudanças)

---

## 7. Production Checklist

### Pré-Deploy

- [ ] **EOS IDs configurados** — Product, Sandbox, Deployment IDs no DefaultEOS.ini
- [ ] **Client Secret em GitHub Secret** — NUNCA no repositório
- [ ] **EOS Auth testado** — Login com conta Epic funciona
- [ ] **Matchmaking pools criados** — KR_SA1, KR_NA1, KR_EU1 no Dev Portal
- [ ] **Session template criado** — Khaaos_CIGKV_50p no Dev Portal
- [ ] **EAC SDK integrado** — Plugin no projeto, server.ini configurado
- [ ] **EAC ativado no Dev Portal** — Anti-cheat enabled para o produto
- [ ] **Cloud Save schema versionado** — Versão atual = 3
- [ ] **Merge strategy testada** — ServerWins para stats, ClientWins para cosméticos
- [ ] **LZ4 compressão testada** — Save/upload/download/decompress ciclo funciona

### Deploy

- [ ] **Build do servidor** — Package server com EAC, EOS, matchmaking
- [ ] **Build do cliente** — Package client com EAC launcher
- [ ] **Deploy servidor SA1** — São Paulo (primário)
- [ ] **Deploy servidor NA1** — Virginia
- [ ] **Deploy servidor EU1** — Frankfurt
- [ ] **CDN atualizado** — Assets, config, patches
- [ ] **Monitoring ativo** — Grafana dashboards, alerts, log aggregation

### Pós-Deploy

- [ ] **Smoke test** — Login, matchmaking, join, play, save
- [ ] **EAC validação** — EAC running em client e server
- [ ] **Cloud save roundtrip** — Save → Cloud → Load → Verify
- [ ] **Matchmaking teste** — 2+ players encontram partida
- [ ] **Multi-region teste** — Players em sa1, na1, eu1 matchmaking
- [ ] **Load test** — KhaaosLoadTestManager com 50+ bots
- [ ] **DDoS teste** — KhaaosDDoSProtection validado
- [ ] **Metrics verificados** — Save count, load count, merge conflicts < threshold

### Rollback Plan

Se algo der errado em produção:

1. **EOS Auth falha** → Fallback para offline mode com save local
2. **Matchmaking falha** → Direct IP connect como backup
3. **EAC falha** → `bEACMandatory=false` temporariamente
4. **Cloud Save falha** → Local save com sync quando cloud voltar
5. **Server crash** → Auto-restart via Docker/K8s health checks

---

## Referências

- [Epic Developer Portal](https://dev.epicgames.com/portal/)
- [EOS SDK Documentation](https://dev.epicgames.com/docs/game-services)
- [EOSIntegrationKit Plugin](https://github.com/PlayFab/EOSIntegrationKit)
- [Easy Anti-Cheat Integration](https://dev.epicgames.com/docs/game-services/anti-cheat)
- [EOS Matchmaking Guide](https://dev.epicgames.com/docs/game-services/matchmaking)
- [EOS Cloud Storage](https://dev.epicgames.com/docs/game-services/cloud-storage)
- [Khaaos Run Roadmap](../../docs/ROADMAP.md)
