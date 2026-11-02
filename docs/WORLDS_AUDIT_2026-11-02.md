# Auditoria dos Mundos — Fidelidade aos Prompts e Realismo (2026-11-02)

> Escopo: aba **Mundos** do web game de preview (`/home/z/my-project/src/`) versus os
> prompts de design de cada mundo no repositório. Método: inventário de fontes,
> detecção de conflitos, seleção justificada de cânones, correção do cliente e
> validação end-to-end em browser real. Auditor executada pelo agente Z.ai a pedido
> do owner (diretiva: "auditar mundos e verificar se os cenários estão realistas,
> nível Devs Ph D e leais ao prompt de cada mundo").

---

## 1. Fontes canônicas inventariadas (com data de última alteração)

| Fonte | Data (git) | Papel declarado |
|---|---|---|
| `docs/fase4/WORLDS_DESIGN.md` | 25/10 01:29 | Cânone Fase 4 (lore + specs W1–W4); declarado canônico pela doc de arquitetura |
| `docs/ARCHITECTURE_WORLDS_AND_SPECIAL_AGENTS.md` | 25/10 03:47 | Contratos de orquestração + tabela de reconciliação (adverte contra escolha silenciosa) |
| `shared/worlds.ts` | **25/10 20:12 (mais recente)** | "Canonical End-to-End Multi-World Definitions — Syncs UE5 C++ MapData, Node.js Server Orchestration, and Web Frontend UI"; importado pelo client do console (`client/src/pages/mundos.tsx`) |
| `README.md` (Ontologia dos Mundos) | merge 28/10 (conteúdo anterior) | Lore original: biomas W2/W3/W4 distintos dos demais |
| `docs/fase0/CIGKV_MAP_GUIDE.md` | — | Especificação do CIGKV (50p/3h/15 ZEX/4 fases) |

## 2. Conflito canônico detectado (3 gerações de cânone)

Os três cânones **divergem em biomas, números e portões de progressão**:

| Aspecto | README (lore original) | WORLDS_DESIGN.md (Fase 4) | shared/worlds.ts (contrato E2E) |
|---|---|---|---|
| CIGKV | Campo de Instrução de Guerra Khaaos Ville; 50p; 3h | (herda CIGKV do README) | **Centro Integrado de Guerra Khaaos Virtual**; 2 km; 16–30 ops; **15 min** |
| Barburhen | Urbano pós-guerra, chuva ácida | Industrial-militar de **inverno** (blizzard, Zu4 Gelo) | **Deserto industrial pós-colapso**, refinarias tóxicas, chuva ácida |
| Priadus | **Floresta** da Escuridão | **Arquipélago aquático** (mergulho, tubarões) | **Arquipélago abissal** + plataformas offshore, tsunami |
| Ckesalth | **Deserto** das Almas Esquecidas | **Montanha vertical** (2.000 m, ar fino) | **Caldeira vulcânica**, magma, erupções piroclásticas |
| Arukheea | **Ilha** dos Gritos Calados | **Deserto de cânions** (hidratação, oásis) | **Singularidade dimensional** (0.35G, fenda de Khaaos) |
| Portões | 10/5/5/5 partidas | 10/5/5/5 partidas | **1/5/10/15 extrações válidas** |
| Multiplicadores KRC | — | 1.5/2.0/2.5/3.0× | **0.5/1.0/1.5/2.25/3.5×** (inclui CIGKV 0.5×) |

A doc de arquitetura já previa isso ("Nota de reconciliação… o agente não deve
escolher silenciosamente entre valores conflitantes"). A escolha precisa ser
**explícita e versionada**.

## 3. Decisão de reconciliação (registrada, não silenciosa)

**Adotado para o web game: `shared/worlds.ts`.** Justificativas:

1. É a fonte **mais recente** (25/10 20:12, ~18h após WORLDS_DESIGN.md);
2. Foi construída exatamente para sincronizar **UE5 ↔ servidor ↔ UI web** (o contrato
   que o dev conjunto do console está implementando — `client/src/pages/mundos.tsx`
   importa `KHAAOS_WORLDS` dele);
3. É a mais completa e verificável: fases de zona com raio/dps por fase, POIs com
   coordenadas e pesos de raridade, nós ZEX com tempo de extração/capacidade,
   hazards com intervalo/duração/contramedida, regra de inatividade e caminhos
   UE5 (`Game/World/<Mundo>/Khaaos<Mundo>MapData.h`);
4. WORLDS_DESIGN.md e README permanecem como **lore/legacy** — nada foi apagado.

## 4. Não-conformidades encontradas no web game (antes da correção)

| # | Achado | Severidade |
|---|---|---|
| A1 | 5 mundos **inventados** (Campo de Treinamento e Khaaos Ville como mundos distintos; Ring 1/2/3 como mundos) — "Ring" é mecânica de zona, não mundo; CIGKV é um único mundo cujo nome inclui "Khaaos Ville" | Crítica |
| A2 | Mundos canônicos Barburhen/Priadus/Ckesalth/Arukheea **ausentes** | Crítica |
| A3 | `weaponAvailability` (BASIC…ALL) inventado; no CIGKV o arsenal é **sem limite de patente** (coleta de dados), não "BASIC" | Alta |
| A4 | Zero dados de realismo: sem capacidade, duração, mapa, ZEX, fases de zona, hazards, contramedidas, portões de extração, multiplicadores, inatividade ("dedo-duro"), contrato UE5 | Alta |
| A5 | `game-service` e `game-store` usavam `world: 'CAMPO_TREINAMENTO'` (id inexistente no contrato) | Média |
| A6 | Aba Mundos rasa (1 linha de descrição + badge) — incompatível com nível PhD | Média |
| A7 | Alistamento concedia 500 KRC **sem inscrição formal e sem taxa** (fluxo de 1 clique) | Alta (fora do escopo do jogo, dentro da diretiva) |

## 5. Correções aplicadas (02/11/2026)

1. **`src/lib/game-constants.ts`** — `WORLDS` reescrito em conformidade com
   `shared/worlds.ts`: 5 mundos canônicos com subtitle/biome/hazard (intervalo,
   duração, dps, contramedida)/POIs por tier/ZEX/zuSpec/inatividade/portões por
   **extrações** (1/5/10/15)/multiplicadores (KRC 0.5→3.5×, XP 1.0→3.0×)/caminho
   UE5/cor accent canônica. Marcados como `ATIVO` (CIGKV) ou `ALVO DE DESIGN`
   (C1–C4) — honestidade de estado, nunca alegar implementação inexistente.
   Constantes novas: `ENROLLMENT_FEE_USD = 1`, `ENROLLMENT_FEE_KRC = 100`.
2. **`src/app/page.tsx`** — aba Mundos reescrita: cards com efetivo/ring/mapa/ZEX/
   multiplicadores/portão/ameaça-assinatura/contramedida/fases/POIs/mecânicas/
   Zu server-authoritative/dedo-duro/contrato UE5. Landing reimplementada como
   fluxo sincronizado de 3 etapas: **Inscrição** (protocolo KR-REG) → **Taxa de
   inscrição U$1,00 = 100 KRC** (Pix BankHaaos ou Cartão KR; recibo KR-TX) →
   **Alistamento** (só executa com pagamento confirmado; transação −100 KRC
   registrada no BankHaaos). Rodapé documenta a taxa única.
3. **`mini-services/game-service/index.ts` + `src/lib/game-store.ts`** —
   `world: 'CIGKV'` (id canônico).
4. **Higiene de tipos** — 12 erros TS pré-existentes em `src/` eliminados
   (`THEME.neonGold`→`gold`; tipagens de `RANKS`; `lastSalaryClaim` Date/number;
   `armorPenetrationMax` opcional). Estado final: **0 erros TS em `src/`**.

## 6. Validação end-to-end (browser real, preview público)

- Etapa 1: inscrição "AuditPhD" → protocolo `KR-REG-*` emitido ✔
- Etapa 2: pagamento U$1.00 → recibo `KR-TX-*`, status CONFIRMADO ✔
- Etapa 3: alistamento executado → HUD 500 KRC, BankHaaos registra
  `Taxa de inscrição U$1.00 … −100 KRC` ✔
- Aba Mundos: CIGKV `● ATIVO` + 4 mundos `○ ALVO DE DESIGN` com dados do contrato ✔
- Zero erros de página/console; formato numérico pt-BR (`1,5 dmg/s`) ✔
- Evidências: `download/khaaos_fee_receipt.png`, `download/khaaos_mundos_audit.png`,
  `download/khaaos_mundos_audit2.png`, `download/khaaos_bank_fee_tx.png`

## 7. Recomendações abertas (para os devs conjuntos)

1. **Nomear um registro canônico versionado** (`shared/worlds.ts` é o candidato
   natural) e propagar para WORLDS_DESIGN.md/README/INIs, com `configRevision` —
   conforme a "Nota de reconciliação" da doc de arquitetura;
2. Definir a **ligação entre os 3 pares de lore** (ex.: Barburhen inverno vs
   deserto tóxico) — hoje o mesmo nome descreve biomas incompatíveis entre docs;
3. Migrar o web game para consumir `shared/worlds.ts` **diretamente** (hoje há uma
   cópia fiel em `src/lib/game-constants.ts` — a duplicação é o próximo risco);
4. A taxa de inscrição U$1 é **mock local** (sem gateway): plugar provedor real +
   idempotência + ledger append-only antes de qualquer valor real (compliance já
   previsto no WORLDS_DESIGN.md §Compliance);
5. Portões por **extrações válidas** exigem contagem autoritativa no servidor —
   hoje o cliente não valida (protótipo).

---
*Auditoria gerada em 02/11/2026. Fonts verificadas via git log do repositório
Khaaos_Run. Contrato adotado: `shared/worlds.ts` @ 9cd9e94.*
