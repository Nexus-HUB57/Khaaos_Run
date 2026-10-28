# Sistema do Khaaos — Índice Canônico (lore → repositório)

> Consolida o documento de lore "Sistema do Khaaos" com o estado REAL do
> repositório. Para cada sistema: onde a mecânica vive em código, qual guia
> de implementação cobre, e o status. Fonte oficial de lore: README
> (Ontologia dos Mundos, Protocolo CIGKV, Mundos W1–W4).

## 1. Entrada no jogo (CIGKV — Khaaos Ville)

| Sistema (lore) | Onde vive no repo | Status |
|---|---|---|
| Campo de Instrução de Guerra (perímetro 1: Pátio de Armamento 1/8 + Setor de Testes 3/8 + Parque Abandonado 4/8 + 15 ZEX) | `README.md` §Protocolo CIGKV; dados de mundo em `data_tables_csv/` e `Content/` | 🟡 regras/dados versionados; mapa UE5 pendente |
| Protocolo de ingresso — 3 Zu por ring (cinto / saltar / máscara) | `Unreal/.../Game/CIGKV/Zu1–Zu3*.h/.cpp`; regras engine-less em `Game/World/Zu/ZuIngressRules` | ✅ implementado (Zu 1–3) com spec de automação |
| Pop-up interativo de escolha | `Zu1ChoiceWidget` / `Zu2ChoiceWidget` / `Zu3ChoiceWidget` | ✅ implementado |
| Vitalidade realista (fome/sede/cansaço/medo) | `Game/Player/KhaaosVitalityComponent`; guia `Docs/CIGKV_Barburhen/Vitality_Integration_Guide.md`, `Combat_and_Vitality.md` | ✅ implementado (protótipo) |
| Zu 4 "Risco de Queda na Ponte" (extensão de lore) | Proposta: `Docs/CIGKV_Barburhen/Zu4_Extension_Guide.md` | 📋 proposta — NÃO implementado (protocolo canônico = 3 Zu) |

## 2. Economia KR

| Sistema (lore) | Onde vive no repo | Status |
|---|---|---|
| KRC (moeda interna; 1000 KRC iniciais ao criar conta) | Server: `server/game/EconomyEngine.ts`, `AtomicLedger.ts`, `economyService.ts`; migralções `0002/0003/0004` | ✅ ledger idempotente 2PC; **sem valor real sem auditoria/aceite** |
| Bankhaoos (conta do jogador) | `Docs/CIGKV_Barburhen/Bankhaoos_Transfer_Guide.md`; componente UE5 protótipo | 🟡 protótipo local — NÃO conectado a serviços financeiros (ver aviso de segurança do guia) |
| ZEX — Zona de Extração de XP (15 terminais/ring; 20% do saque salvo) | `Unreal/.../Game/CIGKV/KhaaosZEXTerminal.h/.cpp`; guia `ZEX_Terminal_Guide.md` | ✅ implementado (protótipo) |
| Forja do Armeiro (marketplace KRC) | Guia `Armorer_Forge_Guide.md` (catálogo DataTable) | 🟡 guia + contrato; integração UE5↔server pendente |
| Token de Veterano (top 50; pack + KR-N1) | `KhaaosMultiWorldPersistence` (conversão CIGKV → W1); README §recompensas | 🟡 código de persistência versionado |
| Payouts de partida (2PC, Idempotency-Key) | `server/game/EconomyPayoutSettlement.ts`; validado pelo smoke F16 | ✅ COMMITTED + ledger balanceado (evidência F16) |

## 3. Mundos oficiais W1–W4

| Mundo (lore) | Perigos canônicos | Onde vive no repo | Status |
|---|---|---|---|
| W1/C1 Barburhen (Destruição) | chuva ácida −1%/10s, corpos persistentes, ratos dedo-duro | `KhaaosBarburhenLevel` (679 linhas); guias `Barburhen_*` | ✅ código de level |
| W2/C2 Priadus (Floresta) | neblina alucinógena (inverte controles 1 min), flora carnívora −10%, jacarés/esporos/mosquitos | `KhaaosPriadusLevel` (479 linhas) | ✅ código de level |
| W3/C3 Ckesalth (Deserto) | areia movediça −100% <30s, fumaça tóxica −20–50% | `KhaaosCkesalthLevel` (210 linhas) | ✅ código de level |
| W4/C4 Arukheea (Ilha) | tsunami −100% <60s, tubarão branco −10–50% | `KhaaosArukheeaLevel` (315 linhas) | ✅ código de level |
| Colliders engine-less W2–W5 | PR "M1+fase2" (convites + colliders) | `Game/World/*` | ✅ versionado |

## 4. Multiplayer / infra (o que sustenta a experiência)

| Sistema | Onde vive | Status |
|---|---|---|
| Mesh multi-nó + túnel relay (socket no nó de origem, sala no dono) | `server/game/RoomEventMesh.ts`, `NodeWsGateway.ts`, `RoomManager.ts` | ✅ F16/F17 validado (smoke com 2 nós + morte de nó) |
| Fencing de ownership (epoch por sala; split-brain fechado) | `RoomEventMesh.renewLeasesAndFence` (M3) | ✅ implementado + 14 testes |
| Métricas HTTP/DB/WS | `server/game/metrics.ts`; `/metrics` raiz + game-runtime | ✅ M3 |
| SLOs + playbooks | `docs/SLO.md`, `docs/SRE_PLAYBOOKS.md` | ✅ M3 |
| Anti-cheat (movement validation, 3-strike) | `game-runtime/server/antiCheat.js`; UE5 `KhaaosRateLimiter/DDoSProtection` | 🟡 binário EAC pendente |

## 5. O que o lore pede e o repo ainda NÃO tem (gaps)

1. **Pacote de áudio 3D dos mundos** (vento de Barburhen, gorjeios de Priadus,
   zumbido de Ckesalth, eco de Arukheea) — assets `.uasset` requerem UE
   Editor (não versionáveis aqui).
2. **Corpos apodrecendo persistentes** no CIGKV — asset pipeline UE5.
3. **Voz distorcida do Marechal** — asset de áudio + cue (contratos de código
   já reservam `MarechalVoiceCue`/`MarechalVoiceText` nos Zu 1–3).
4. **Load generator** dos perfis 100–2000 bots executado em staging
   (roadmap M3 — provisionamento pendente).
5. **Zu 4** — extensão candidata (ver guia).
