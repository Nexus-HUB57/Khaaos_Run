# Khaaos Run

**Um Jogo · Uma Chance · Um Legado**

> Plataforma Battle Royale multi-mundo com recompensa real de **US$ 1.000.000**.  
> O jogador se alista voluntariamente, assume o posto de **Zheers** e atravessa uma sequência de *Rings* (mundos) que funcionam como filtros psicológicos, táticos e econômicos progressivos.

Este repositório contém a implementação authoritative TypeScript (web/API + runtime de simulação), algoritmos de matchmaking de referência e a fundação inicial em Unreal Engine 5.8. O README distingue o que já está implementado, o que é design canônico e o que permanece roadmap.

---

## Sumário

- [Ontologia dos Mundos](#ontologia-dos-mundos)
- [Arquitetura de Ciclos e Rings](#arquitetura-de-ciclos-e-rings)
- [Protocolo CIGKV — Campo de Treinamento](#protocolo-cigkv--campo-de-treinamento)
- [Mundos Oficiais (W1–W4)](#mundos-oficiais-w1w4)
- [Protocolos de Ingresso (Zu)](#protocolos-de-ingresso-zu)
- [Modelo Econômico e Persistência](#modelo-econômico-e-persistência)
- [Arquitetura Técnica](#arquitetura-técnica)
- [Fluxo de uma Partida](#fluxo-de-uma-partida)
- [Modelo de Dados](#modelo-de-dados)
- [Autenticação e Limites de Confiança](#autenticação-e-limites-de-confiança)
- [API e WebSocket](#api-e-websocket)
- [Desenvolvimento Local](#desenvolvimento-local)
- [Qualidade e Validação](#qualidade-e-validação)
- [Build e Implantação](#build-e-implantação)
- [Limitações Conhecidas](#limitações-conhecidas)
- [Roadmap](docs/ROADMAP.md)

---

## Ontologia dos Mundos

O console **não possui um único mundo**. A Guerra do Khaaos é uma sequência de *Rings* (ambientes de batalha) organizados em estágios de intensidade crescente. Cada Ring é, simultaneamente:

1. **Campo de combate** (mecânicas, loot, zona, eliminação);
2. **Filtro psicológico** (melancolia, paranoia, asfixia, isolamento);
3. **Instrumento de coleta de dados** (balanceamento, taxa de retenção, padrões de risco);
4. **Mecanismo de persistência seletiva** (conquistas, Tokens de Veterano, KRC).

| Estágio | Identificador | Nome Canônico | Função Primária | Duração-alvo |
|---------|---------------|---------------|-----------------|--------------|
| Pré-lançamento | **CIGKV** | Khaaos Ville — Campo de Instrução de Guerra | Treinamento, coleta de dados, campanha de massa | Até 1.000.000 de alistamentos |
| Ciclo 1 | **W1/C1** | Barburhen — Mundo da Destruição | Brutalidade urbana pós-guerra | 7 dias (12 h/dia) |
| Ciclo 2 | **W2/C2** | Priadus — Floresta da Escuridão | Sanidade sob invisibilidade e neblina | 7 dias |
| Ciclo 3 | **W3/C3** | Ckesalth — Deserto das Almas Esquecidas | Fragilidade da vaidade / ambiente em extinção | 7 dias |
| Ciclo 4 | **W4/C4** | Arukheea — Ilha dos Gritos Calados | Isolamento absoluto e pressão hidráulica | 7 dias |

O desenho segue a doutrina do **Descentralizador**: cada mundo remove uma dimensão de segurança (tecnologia → estômago → sanidade → vaidade → refúgio) até restar apenas o sobrevivente capaz de ocupar o helicóptero de extração final.

---

## Arquitetura de Ciclos e Rings

```
┌─────────────────────────────────────────────────────────────────┐
│                    GUERRA DO KHAAOS (Ciclos)                    │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│   CIGKV      │   W1/C1      │   W2/C2      │  W3/C3 → W4/C4     │
│  (Treinamento│  Barburhen   │  Priadus     │  Ckesalth →        │
│   + Campanha)│  (Urbano)    │  (Selva)     │  Arukheea (Ilha)   │
└──────────────┴──────────────┴──────────────┴────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
   Protocolo CIGKV   Anel de       Emboscada      Tsunami /
   Ring 3 h          Conflito      Verde          Assassino
   50 players        10 min        10 min         Silencioso
   Fluxo contínuo    Zona →        Zona →         Zona →
                     Parque        Templo         Prisão
```

Cada Ring possui:

- **Perímetros fracionados** (frações de ⅛ a ⅜ do mapa) com funções táticas distintas;
- **Plus +** (vantagens posicionais: bunkers, sniper points, veículos, kits médicos);
- **Plus −** (perigos ambientais: chuva ácida, neblina alucinógena, areia movediça, flora carnívora, tsunami);
- **Zonas de Extração de XP (ZEX)** — terminais que permitem persistir parte das conquistas;
- **Dinâmica de inatividade** — “dedo-duro” (ratos, mosquitos, gafanhotos, gaivotas) que pune o jogador que evita combate.

---

## Protocolo CIGKV — Campo de Treinamento

O **CIGKV** (Campo de Instrução de Guerra Khaaos Ville) é o *spoiler experimental* aberto após o alistamento. Ele permanece ativo até a marca de **1.000.000 de inscrições confirmadas** (sigla **EXCO** — Excesso e Contingente).

### Ambientes (perímetro total = 1)

| Setor | Fração | Função |
|-------|--------|--------|
| Pátio de Armamento (Armory Hub) | ⅛ | Zona neutra de loadout sem restrição de patente |
| Setor de Testes (Proving Grounds) | ⅜ | Urbano denso, prédios destrutíveis, túneis |
| Parque Abandonado | ⁴⁄₈ | Vegetação, riachos, emboscadas |
| 15 Zonas de Extração de XP (ZEX) | dispersas | Persistência seletiva de conquistas |

### Dinâmica de Ring

- **Capacidade**: 50 jogadores.
- **Duração**: 3 horas (Ring de Longa Duração).
- **Entrada em fluxo contínuo**: vaga aberta instantaneamente ao sair/eliminar; bloqueio nos últimos 5 minutos.
- **Pulso Khaaos**: a cada 10 minutos, alteração climática ou drop de loot lendário.
- **Arsenal sem limites de patente**: Recruta pode testar equipamento de nível General — objetivo é coleta de dados de balanceamento.

### Desafio de Gigantes (pós-EXCO)

Os 50 melhores do CIGKV são convocados para a “Guerra dos Filhos da Escuridão” (batalha noturna, transmissão YouTube). Recebem:

- Insígnia **Mérito KR**;
- **Código KR-N1** (manual de instrução);
- 1000 KRC + kits;
- **Token de Veterano** conversível em pack diferenciado no W1/C1 oficial.

Os 1000 melhores pontuados do período experimental recebem persistência parcial de itens/KRC/medalhas/skins.

---

## Mundos Oficiais (W1–W4)

### W1/C1 — Barburhen (Mundo da Destruição)

Ambiente urbano pós-guerra: construções inacabadas, carros abandonados, corpos que **não desaparecem** e apodrecem. O cenário degrada dia após dia (chuva ácida, desabamentos, fumaça).

| Setor | Fração |
|-------|--------|
| Área Urbana e Comercial | ²⁄₈ |
| Setor Industrial (desembarque) | ⅜ |
| Parque Abandonado (centro) | ⅜ |
| Zona de Extração (estação ferroviária) | — |

**Dinâmica**: “Água da Morte” — anel de conflito fecha em 10 min em direção ao Parque; quem não corre é consumido pela chuva ácida.

### W2/C2 — Priadus (Floresta da Escuridão)

Selva hostil, neblina alucinógena, pântanos, flora carnívora, jacarés. Teste de sanidade mental diante do invisível.

| Setor | Fração |
|-------|--------|
| Área Pantanosa | ²⁄₈ |
| Bosque (desembarque) | ⅜ |
| Área de Caça + Templo Antigo | ⅜ |
| Zona de Extração (matadouro) | — |

**Dinâmica**: “Emboscada Verde” — anel fecha no templo; neblina com esporos tóxicos pune atraso.

### W3/C3 — Ckesalth (Deserto das Almas Esquecidas)

Deserto árido, lagoas de petróleo em chamas, fumaça tóxica, areia movediça. Lição sobre a fragilidade da vaidade.

| Setor | Fração |
|-------|--------|
| Resort Abandonado | ⅜ |
| Vilarejo dos Beduínos | ²⁄₈ |
| Refinaria de Petróleo (centro) | ⅜ |
| Zona de Extração (expedição) | — |

**Dinâmica**: “Assassino Silencioso” — a partir de 5 min o anel fecha na Vila Sombria sob fumaça tóxica.

### W4/C4 — Arukheea (Ilha dos Gritos Calados)

Ilha isolada, Prisão do Sol da Noite (luz perpétua), tsunami iminente, tubarões. Pressão hidráulica e claustrofobia em céu aberto.

| Setor | Fração |
|-------|--------|
| Bosque dos Perdidos | ⁴⁄₈ |
| Prisão do Sol da Noite | ⅜ |
| Fábrica / Cemitério das Baleias | ⅛ |
| Extração final (heliporto da torre) | — |

**Dinâmica**: “Tsunami” — anel fecha na Prisão; quem não sobe no helicóptero torna-se “grito calado”.

---

## Protocolos de Ingresso (Zu)

Todo Ring possui **três variantes de Zu** (entrada cinematográfica). O jogador recebe um pop-up de decisão que determina dano inicial e posicionamento.

| Mundo | Zu 1 | Zu 2 | Zu 3 |
|-------|------|------|------|
| **CIGKV** | Caminhão atropela bois → apertar cinto | Capota com rocha → saltar | Cai da ponte → máscara O₂ |
| **W1/C1** | Trem descarrila → cinto | Colisão frontal → saltar | Incêndio elétrico → máscara |
| **W2/C2** | Fim de trilho → cinto | Homens-bomba → saltar | Neblina tóxica → máscara |
| **W3/C3** | Tempestade de areia → cinto | Explosão no túnel → saltar | Caminhão-tanque em chamas → máscara |
| **W4/C4** | Trilho desmorona → cinto | Colisão com tanque → saltar no mar | Bombas de gás por drones → máscara |

Em todos os casos:

- Decisão correta → 0 dano + possível atordoamento/visão embaçada (5–7 s);
- Decisão incorreta → até −30 % de vitalidade;
- Caixotes de armamento caem no perímetro (1 item por jogador).

---

## Modelo Econômico e Persistência

- **KRC** (Khaaos Run Coin) — criptomoeda de jogo. Adquirida por sobrevivência, eliminações, captura de Data Cores e ranking de convites.
- **Bankhaoos** — conta bancária automática ao alistamento + endereço de depósito.
- **Fundo de Investimentos KR** — acumula o prêmio de US$ 1.000.000 destinado ao(à) grande vencedor(a).
- **Forja do Armeiro** — marketplace de equipamentos e upgrades pagos em KRC.
- **Persistência seletiva**: conquistas do CIGKV não migram integralmente; apenas Tokens de Veterano, packs e os 1000 melhores pontuados recebem transferência parcial para W1/C1.
- **Zonas de Extração de XP**: terminais no mapa que “salvam” progresso para o inventário War’I, desde que o jogador não seja eliminado antes.

> **Atenção de engenharia**: a economia atual é de jogo. Antes de qualquer valor real, são obrigatórios ledger imutável, atomicidade, idempotência, prevenção de fraude e revisão de compliance.

---

## Arquitetura Técnica

| Caminho | Responsabilidade | Stack |
|---------|------------------|-------|
| `client/` | SPA React, telas, hooks, cliente WebSocket | React 18, TypeScript, Vite, Wouter, TanStack Query, Tailwind |
| `server/` | API HTTP, sessões OIDC, salas, simulação authoritative | Node.js, Express 5, `ws`, Passport, PostgreSQL |
| `shared/` | Schema Drizzle, tipos e contratos | Drizzle ORM, Zod |
| `game-runtime/` | Runtime JS isolado (simulação, replay, testes) | Node.js, Vite, `node:test` |
| `Unreal/KhaaosRun/` | Fundação UE5.8 (GameMode, GAS, Iris, EOS declarados) | Unreal Engine 5.8, C++20 |
| `server/game/matchmaking-*.{js,py}` | Algoritmos de referência skill-based | JS / Python 3 |

```mermaid
flowchart LR
  Browser[React SPA] -->|HTTPS + cookie OIDC| API[Express API]
  Browser -->|GET ws-token| API
  Browser -->|WSS /ws + token| Rooms[RoomManager]
  API --> Auth[Passport / Replit OIDC]
  API --> DB[(PostgreSQL via Drizzle)]
  Rooms --> DB
  Rooms --> MM[MatchmakingService]
  Rooms --> Sim[Zona · Combate · Loot · Ranking]
  Sim --> DB
```

O `RoomManager` é a fonte de verdade da partida live. O `game-runtime/` é um laboratório isolado; o projeto Unreal é fundação de portabilidade e ainda não compila nem possui mapas jogáveis.

---

## Fluxo de uma Partida

Documentado em detalhe em [`docs/E2E_BATTLE_FLOW.md`](docs/E2E_BATTLE_FLOW.md):

1. Autenticação OIDC → estatísticas e conta bancária inicializadas.
2. Cliente obtém token WebSocket de curta duração (`GET /api/auth/ws-token`).
3. `BattleRoomProvider` mantém conexão compartilhada; identidade derivada exclusivamente do token assinado.
4. Entrada na fila (`queue`) → matchmaking por modo/rating → lobby.
5. Host controla readiness, convites e countdown.
6. Em partida o cliente envia **intenções** (posição, ataque, pickup); o servidor é authoritative para saúde, dano, loot e eliminação.
7. Zone ticks, combate, lag compensation e spatial grid executados no servidor.
8. `RankingService` persiste placement, rating/ELO, XP e patente.

---

## Modelo de Dados

Fonte canônica: `shared/schema.ts`.

- `users` — identidade OIDC
- `player_stats` — patente, XP, saúde/energia, eliminações
- `bank_accounts`, `transactions`, `loans` — economia de jogo
- `items` — inventário, raridade, durabilidade, stats JSON
- `zone_sessions`, `loot_items` — estado de zona e pickups
- `eliminations` — eventos de eliminação
- `match_results` — placement, kills, dano, rating, XP

Schema aplicado via `npm run db:push` (Drizzle Kit). Migrações versionadas ainda são roadmap.

---

## Autenticação e Limites de Confiança

- **Sessão HTTP**: cookie `httpOnly` + `secure`, store PostgreSQL, renovação OIDC.
- **WebSocket**: token HMAC-SHA256 (finalidade `khaaos-websocket`, TTL 60 s) enviado como subprotocolo. Identidade = `sub` assinado; mensagens do cliente não podem forjá-la.
- **Operadores de zona**: allowlist `ZONE_OPERATOR_IDS` (deny-by-default).
- Toda mutação de recurso verifica ownership no servidor.

Detalhes: [`docs/REALTIME_AUTH.md`](docs/REALTIME_AUTH.md).

---

## API e WebSocket

| Grupo | Exemplos | Propósito |
|-------|----------|-----------|
| Auth | `/api/auth/user`, `/api/auth/ws-token` | Sessão e token WS |
| Player | `/api/player/me`, `/api/player/daily` | Perfil e estado |
| Bank / Loans | `/api/bank/*`, `/api/loans/*` | Economia |
| Inventory / Loot | `/api/items/*`, `/api/loot/*` | Inventário e pickups |
| Zone | `/api/zone/status`, `/api/zone/start` | Operação de zona |
| Rooms / Matchmaking | `/api/rooms/*`, `/api/matchmaking/*`, WS `/ws` | Multiplayer |
| Ranking | `/api/ranking/*` | Leaderboard e histórico |

Protocolo WS: JSON com discriminador `type`. Contrato vivo em `RoomManager.ts` + `use-battle-room.ts`.

---

## Desenvolvimento Local

```bash
npm ci
npm ci --prefix game-runtime
npm run check
npm run dev          # porta PORT ou 5000
```

Variáveis obrigatórias: `DATABASE_URL`, `SESSION_SECRET`, `REPL_ID`.  
Recomendadas: `WS_TOKEN_SECRET` (≥ 32 bytes), `ZONE_OPERATOR_IDS`.

Comandos de verificação:

```bash
npm run test:official
npm run test:game
npm run verify:all
```

---

## Qualidade e Validação

CI (`.github/workflows/ci.yml`) executa `npm run verify:all` em todo push/PR para `main`:

- Typecheck + build da aplicação principal
- Testes oficiais HTTP/auth/storage/WebSocket/matchmaking
- Build + testes + stress do `game-runtime/`
- (Unreal ainda não entra no pipeline)

Baseline de cobertura: [`docs/TEST_COVERAGE_BASELINE.md`](docs/TEST_COVERAGE_BASELINE.md).

---

## Build e Implantação

- **Replit Autoscale**: `npm run build` → `node ./dist/index.cjs`
- **Render**: Blueprint `render.yaml` + Deploy Hook (opt-in via `RENDER_DEPLOY_ENABLED`)

Guia completo: [`docs/RENDER_DEPLOYMENT.md`](docs/RENDER_DEPLOYMENT.md).

---

## Autenticação no Render

A documentação oficial do Replit Auth não confirma suporte a hosting externo em Render. O callback gerado pelo código não comprova que o issuer autorize `onrender.com`; valide login, callback, cookie e logout em staging antes de migrar usuários ou tráfego. Veja [`docs/REPLIT_AUTH_RENDER_COMPATIBILITY.md`](docs/REPLIT_AUTH_RENDER_COMPATIBILITY.md).

---

## Limitações Conhecidas

- Economia ainda sem ledger atômico completo — não usar para valor real.
- `RoomManager` e matchmaking em memória — scaling horizontal exige coordenador e pub/sub.
- Projeto Unreal é fundação; não há evidência de build, mapas ou integração EOS.
- Ausência de suite browser completa e coverage percentual instrumentado.
- Persistência multi-mundo (CIGKV → W1–W4) e protocolos Zu ainda estão no domínio de design; a implementação atual concentra-se no runtime de combate genérico e no CIGKV como primeiro Ring operacional.

---

## Referências

- [Fluxo end-to-end de batalha](docs/E2E_BATTLE_FLOW.md)
- [Autenticação realtime](docs/REALTIME_AUTH.md)
- [Baseline de cobertura](docs/TEST_COVERAGE_BASELINE.md)
- [Lighthouse / code-splitting](docs/LIGHTHOUSE_PERFORMANCE.md)
- [Deploy Render](docs/RENDER_DEPLOYMENT.md)
- [Roadmap de engenharia](docs/ROADMAP.md)
- [Fundação Unreal Engine 5.8](Unreal/README.md)
- [Plano do runtime isolado](game-runtime/plan.md)

---

<sub>Khaaos Run · Plataforma Battle Royale multi-mundo · Equipe Nexus</sub>
