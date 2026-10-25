# Política de Aprovação Humana — Console Marechal

> **Status:** Policy-only (v0.1, rascunho para revisão).
> **Escopo:** Define o fluxo humano de aprovação, revogação e auditoria para
> conselhos emitidos pelo console Marechal (`/marshal-console`) do Khaaos Run.
> **Fora do escopo:** qualquer código de runtime. A implementação dos
> fluxos aqui descritos virá em PRs separados (ver §11).
>
> **Contrato relacionado (intocado):** `docs/API_MARECHAL_CONTROL_PANEL.md`
> seção 10 declara: *"Propostas permanecem consultivas e exigem um fluxo
> humano separado."* Este documento **define** esse fluxo. Nenhum endpoint
> nem schema do `API_MARECHAL_CONTROL_PANEL.md` é alterado por este doc.

---

## 1. Princípios

1. **Consultivo por padrão.** O console Marechal **nunca** muta estado
   diretamente. Toda decisão efetiva nasce de um ato humano explícito,
   registrado em ledger.
2. **Least-privilege por capability.** Cada capability tem um aprovador
   nomeado (papel + senioridade). O cargo mais alto não aprova tudo.
3. **Janela temporal explícita.** Toda proposta tem prazo de vida. Janela
   expirada = proposta morta (não aprovada por silêncio).
4. **Limites numéricos rígidos.** Limites por ring, por dia, e por valor
   existem para reduzir blast radius de erro ou abuso.
5. **Auditabilidade total.** Toda decisão — aceitar, rejeitar, vetar,
   revogar, expirar — vira linha de ledger com `requestId`.
6. **Separação de poderes.** Quem propõe (console/operador) ≠ quem aprova
   ≠ quem audita ≠ quem deploya config. O Desenvolvedor não opera
   aprovações; o Operador não toca o ledger de config.
7. **Veto é exceção registrada.** Veto é raro, motivado, e sempre
   revogável apenas por nível igual ou superior ao que vetou.

---

## 2. Personas

### 2.1 Marechal Operador (MOp)

- **Função:** consome o conselho do console Marechal; decide aceitar,
  rejeitar ou pedir veto. É o único que **executa** a capability aprovada
  via o console.
- **Pode:** ver conselho; aceitar; rejeitar; escalar para Compliance;
  acionar veto justificado.
- **Não pode:** editar ledger; revogar decisão alheia; deployar config;
  aprovar nada acima de sua senioridade.
- **Senioridade:** L1 (Operador de Ring), L2 (Operador-Chefe de Setor),
  L3 (Marechal Operacional — apenas 1 ativo por turno). Cada capability
  tem um L-mínimo (ver §3).

### 2.2 Auditor (Aud)

- **Função:** leitura histórica. Vê todo o ledger, vê métricas de
  throughput, vê anomalias.
- **Pode:** ler; exportar relatórios; sinalizar anomalia (gera ticket
  para Compliance).
- **Não pode:** aprovar, rejeitar, vetar, revogar, editar qualquer
  linha do ledger, nem deployar config.
- **Senioridade:** L1 (Auditor de Ring), L2 (Auditor-Chefe). Aud L2
  pode trancar o acesso de um MOp a uma capability específica enquanto
  o ticket é investigado (soft-lock reversível por Compliance).

### 2.3 Admin de Compliance (Cmp)

- **Função:** dono do ledger. Vê, revoga, anota, e responde a tickets
  do Auditor.
- **Pode:** revogar aprovação já executada (rollback manual), bloquear
  capability, vetar preventivamente, restaurar decisão após recurso.
- **Não pode:** executar capability diretamente (não opera o console);
  editar entradas passadas do ledger (apenas encadear uma nova linha de
  correção, mantendo o histórico imutável).
- **Senioridade:** L2 (Compliance-Officer) e L3 (Chief Compliance
  Officer — único que pode revogar decisão de Cmp L2 ou de MOp L3).

### 2.4 Desenvolvedor (Dev)

- **Função:** deploya config do console (limites, janelas, capabilities
  habilitadas, modelos de conselho). **Não** opera aprovações.
- **Pode:** propor mudança de config via PR; mergear com co-aprovação de
  Cmp L3 + 1 MOp L3; promover config em canary/full.
- **Não pode:** aprovar capabilities em nome de Operador; editar ledger;
  vetar capability em produção.
- **Senioridade:** L1 (Dev backend/console), L2 (Tech Lead do console).
  Apenas L2 pode promover config de capability crítica (diplomacia,
  mercado).

A matriz §3 detalha quem **pode aprovar** em cada capability. A regra
geral: o **Desenvolvedor não aparece como aprovador** em nenhuma
linha da matriz — ele só toca o anel de config, separado.

---

## 3. Matriz de capabilities × aprovação

Fonte das capabilities: `docs/ARCHITECTURE_WORLDS_AND_SPECIAL_AGENTS.md`
seção 3 (matriz Marechal Henricks / King Krapulla / Uryan Horks).

Cada capability abaixo é listada como
**Aprovável** (pode virar ação via aprovação) ou
**Consultivo** (permanece apenas como conselho — §4 explica o porquê).

### 3.1 Marechal Henricks (operações de ring)

| # | Capability | Status | Aprovador (papel + senioridade mínima) | Janela | Limite | Veto (quem, motivo) |
|---|---|---|---|---|---|---|
| H-01 | Ajustar zona operativa (raio/forma) de um ring ativo | **Aprovável** | MOp L2 do ring afetado | 5 min | 1 por ring por hora; máx 3 rings simultâneos | Cmp L2 (impacto em outros anéis), MOp L3 do setor (coerção tática) |
| H-02 | Reabastecer suprimento crítico de ring (água, munição, médico) | **Aprovável** | MOp L1 do ring | 2 min | até 5 por ring por dia | nenhum veto explícito (transação logada) |
| H-03 | Despachar expedição de busca/resgate | **Aprovável** | MOp L2 + co-assinatura MOp L3 do setor (para duração > 30 min) | 10 min para expedição curta; 30 min para expedição > 30 min | 4 expedições por ring por dia; máx 12 ativas globalmente | Cmp L2 se expedição cruza fronteira de mundo W1–W4 sem aprovação diplomática |
| H-04 | Ativar protocolo "Emboscada Verde" (cerco) | **Aprovável** | MOp L3 do setor **somente** | 15 min | 1 por ring por dia; máx 2 ativas globalmente | Cmp L3 (escalada para diplomacia se afetar W2/Priadus — ver §3.3) |
| H-05 | Emitir alerta de "Água da Morte" em ring | **Aprovável** | MOp L1 do ring | 1 min | até 20 por dia por ring | nenhum veto (alerta é reversível; revoke por Cmp L2) |
| H-06 | Alterar composição de guarnição (quantos MOp cobrem um ring) | **Aprovável** | MOp L2 do ring | 5 min | máx 1 mudança a cada 30 min por ring | Cmp L2 se queda de cobertura < mínimo contratual |
| H-07 | Recomendar rota de evacuação | **Consultivo** | n/a (ver §4) | n/a | n/a | n/a |
| H-08 | Reportar falha estrutural (ponte, bunker, ZEX) | **Aprovável** | MOp L1 do ring | 1 min | até 50 por dia por ring (limite de ruído) | nenhum veto (aciona fila de reparo) |
| H-09 | Suspender spawn de ZEX em ring | **Aprovável** | MOp L3 do setor + co-assinatura Cmp L2 | 30 min | 1 por ring por dia | Cmp L3 (impacto econômico de longo prazo) |

### 3.2 King Krapulla (mercado)

| # | Capability | Status | Aprovador (papel + senioridade mínima) | Janela | Limite | Veto (quem, motivo) |
|---|---|---|---|---|---|---|
| K-01 | Reajustar taxa de câmbio KRC ↔ itens dentro de ±2% | **Aprovável** | MOp L1 com escopo "mercado" (papel derivado; ver §2.1) | 5 min | 1 por par por hora; máx 6 por dia global | Cmp L2 (suspeita de manipulação), MOp L2 "economia" |
| K-02 | Reajustar taxa de câmbio KRC ↔ itens entre ±2% e ±10% | **Aprovável** | MOp L2 "economia" | 30 min | 1 por par por dia; máx 2 ativas globalmente | Cmp L2 (suspeita de manipulação), Cmp L3 (impacto de longo prazo) |
| K-03 | Reajustar taxa de câmbio KRC ↔ itens acima de ±10% | **Aprovável** | MOp L3 + co-assinatura Cmp L2 | 2 h | 1 por par por semana; sujeito a janela de "mercado fechado" (definida em config) | Cmp L3 (defesa do jogador), Auditor-Chefe (padrão anômalo) |
| K-04 | Congelar mercado de um item específico (anti-pânico) | **Aprovável** | MOp L2 "economia" | 5 min para decidir; congelamento válido por até 4 h | 1 item por dia; máx 3 ativos globalmente | nenhum veto (ação defensiva) |
| K-05 | Aprovar lote de ZEX-release (liberação programada de KRC) | **Aprovável** | MOp L2 "economia" | 30 min | 1 por dia global; valor ≤ 100.000 KRC | Cmp L2 (valor > limite) |
| K-06 | Aprovar lote de ZEX-release > 100.000 KRC | **Aprovável** | MOp L3 + co-assinatura Cmp L2 | 4 h | 1 por semana; valor ≤ 1.000.000 KRC | Cmp L3 (risco sistêmico) |
| K-07 | Sugerir precificação dinâmica de loot | **Consultivo** | n/a (ver §4) | n/a | n/a | n/a |
| K-08 | Marcar transação como suspeita (sem bloquear) | **Aprovável** | MOp L1 "economia" | 2 min | até 100 marcações por dia | nenhum veto (cria ticket para Auditor) |
| K-09 | Reverter transação de mercado (chargeback manual) | **Aprovável** | MOp L2 "economia" + co-assinatura Cmp L2 | 1 h | 5 por dia global; valor ≤ 50.000 KRC por reversão | Cmp L3 (reversões acima do limite ou de impacto sistêmico) |

### 3.3 Uryan Horks (diplomacia)

| # | Capability | Status | Aprovador (papel + senioridade mínima) | Janela | Limite | Veto (quem, motivo) |
|---|---|---|---|---|---|---|
| U-01 | Abrir canal diplomático privado com facção de W1/W2/W3/W4 | **Aprovável** | MOp L3 com co-assinatura Cmp L2 | 24 h | 1 canal por facção por semana; máx 5 ativos globalmente | Cmp L3 (facção em lista de sanções), MOp L3 "diplomacia" (risco geopolítico) |
| U-02 | Publicar comunicado diplomático público (leitura) | **Consultivo** | n/a (ver §4) | n/a | n/a | n/a |
| U-03 | Propor tratado de não-agressão entre facções | **Aprovável** | MOp L3 "diplomacia" + co-assinatura Cmp L2 | 72 h | 1 tratado por par de facções por mês | Cmp L3 (viola termos de W2/Priadus), MOp L3 do setor (impacto em ring) |
| U-04 | Aceitar tratado proposto pela facção (NPC) | **Aprovável** | MOp L3 "diplomacia" + co-assinatura Cmp L2 | 48 h | depende de U-03 | Cmp L3 (mesmos motivos) |
| U-05 | Recusar tratado proposto pela facção (NPC) | **Aprovável** | MOp L2 "diplomacia" | 4 h | sem limite | nenhum veto (decisão padrão) |
| U-06 | Convidar facção para aliança militar temporária | **Aprovável** | MOp L3 + co-assinatura Cmp L3 | 72 h | 1 aliança ativa por par por vez; máx 3 globais | Cmp L3 (sempre), MOp L3 do setor (sempre) |
| U-07 | Romper canal diplomático unilateralmente | **Aprovável** | MOp L2 "diplomacia" | 1 h | até 2 por semana | Cmp L2 (rompimento em janela de tratado aberto) |
| U-08 | Sugerir rota diplomática a Operador de outro setor | **Consultivo** | n/a (ver §4) | n/a | n/a | n/a |
| U-09 | Reportar violação de tratado por facção NPC | **Aprovável** | MOp L2 "diplomacia" | 30 min | até 5 por dia | nenhum veto (aciona fila de U-03/U-04) |

**Nota sobre diplomacia pública (U-02):** mensagens diplomáticas
públicas permanecem **consultivas por design** (§4) — o impacto
reputacional de um release público é grande demais para que um
aprovador único decida. Diplomacia pública segue para um comitê
humano separado fora deste fluxo (vide `docs/ARCHITECTURE_*` para o
comitê editorial de lore, que é um processo à parte).

---

## 4. Aprovável vs. Consultivo (regra geral)

### 4.1 Critério

Uma capability vira **Aprovável** quando atende **todos** os 4:

1. **Mutação local reversível** — efeito limitado a 1 ring/setor e
   pode ser revertido por Cmp.
2. **Limite numérico defensável** — dá para escrever um número
   "1 por X, máx Y por Z" sem ambiguidade.
3. **Risco de blast radius cabível em janela humana** — um humano
   lê, decide, registra em <= janela definida.
4. **Não é declaração pública irreversível** — não vaza para
   facções NPC, redes sociais in-game, ou canal público.

### 4.2 Lista explícita do que CONTINUA consultivo

Permanecem **consultivos** (não-aprováveis automaticamente) — humanos
podem seguir o conselho, mas via processo fora deste fluxo:

- **U-02, U-08** (comunicado público, sugestão diplomática): vão
  para o comitê editorial de lore (humano, assíncrono, 7–14 dias).
- **H-07, K-07** (recomendações de rota/precificação): vão para
  o Operador como insight — a decisão operacional cabe ao humano
  sem mediação do Marechal.
- Qualquer capability nova que dependa de **lore nova** (evento
  de mundo, mudança de regra de ZEX, novo mundo W5) — fica
  bloqueada até a lore ser aprovada e virar capability nomeada.

### 4.3 Lista explícita do que vira aprovável

Tudo nas tabelas §3.1, §3.2, §3.3 marcado como **Aprovável**,
respeitando aprovador, janela, limite, auditoria e veto.

A linha de corte mais importante: **ajuste de zona operativa (H-01)**
vira aprovável porque é local e reversível. **Mensagem diplomática
pública (U-02)** NÃO vira porque é global e reputacional.

---

## 5. Estrutura da linha de ledger (audit-grade)

Toda decisão registrada usa o schema mínimo abaixo. **Nenhuma linha
é editável após escrita** — correções viram nova linha encadeada
(`parentId` aponta para a original).

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `id` | UUID v7 | sim | gerado pelo serviço de ledger |
| `requestId` | UUID v4 | sim | mesmo ID da chamada `/api/console/v1/*` que originou o conselho |
| `parentId` | UUID v7 \| null | não | preenchido em correção/revogação |
| `timestamp` | RFC3339 UTC | sim | relógio do servidor (NTP) |
| `actor` | objeto | sim | `{userId, role, seniorityLevel}` — quem decidiu |
| `agent` | string | sim | `henricks` \| `krapulla` \| `uryan_horks` |
| `capability` | string | sim | código da capability (ex: `H-01`) |
| `ringId` | UUID \| null | não | ring/setor afetado |
| `payload` | objeto | sim | cópia exata do payload aprovado (read-only após escrita) |
| `decision` | enum | sim | `accepted` \| `rejected` \| `vetoed` \| `revoked` \| `expired` |
| `vetoReason` | string \| null | sim se `decision=vetoed` | motivo legível; < 500 chars |
| `executedAt` | RFC3339 \| null | sim se `decision=accepted` e ação já executada | preenchido após execução |
| `expiresAt` | RFC3339 | sim | data em que a proposta morre se não houver decisão |
| `hash` | sha256 | sim | hash do conteúdo da linha para tamper-evidence |

Garantias:

- Append-only (sem `UPDATE`/`DELETE` na tabela de ledger).
- Hash encadeado opcional por dia (cada linha inclui hash da
  anterior — verificação offline pelo Auditor-Chefe).
- Exportável em CSV/JSONL por Aud L1+ sob demanda.
- Retenção mínima de 24 meses; removível apenas via solicitação
  formal assinada por Cmp L3 + Dev L2 (workflow separado).

---

## 6. Estados de uma proposta

```
[proposta emitida]
       │
       ▼
   pending ─────► expired (janela estourou) ──► ledger(decision=expired)
       │
       ├──► accepted ─► executed ──► ledger(decision=accepted, executedAt=...)
       │         ▲
       │         └──── revoked (Cmp, antes ou depois de executed) ──► ledger(decision=revoked, parentId=...)
       │
       ├──► rejected ──► ledger(decision=rejected)
       │
       └──► vetoed ─────► ledger(decision=vetoed, vetoReason=...)
                          │
                          └──── recurso possível dentro de 24h ──► nova proposta
```

**Importante:** uma capability aceita pode ser revogada por Cmp L2+
(rollback manual) dentro de 4 h após `executedAt` (regra-padrão).
Após 4 h, revogação requer Cmp L3. Decisões `expired`/`rejected`/
`vetoed` não são revogáveis — apenas recurso (que vira nova proposta).

---

## 7. Cenário A — Feliz (operação de mercado dentro do limite)

**Contexto:** Krapulla detecta que o par KRC ↔ "Munição 9mm" está
com spread aberto (3,1% acima da banda de 30 dias). Sugere
rebalanceamento de −2% (capability K-01).

**Linha do tempo:**

- `T+00:00` Krapulla emite proposta `{requestId: r-001, cap: K-01, payload: {par: "KRC/9mm", delta: -0.02}, expiresAt: T+05:00}`
- `T+00:30` MOp L1 "economia" **Juliana** vê o conselho no console,
  lê o rationale, verifica que o par está dentro do limite K-01 (1 por
  par por hora). Aceita.
- `T+00:31` ledger: `accepted` por `MOp/L1/economia`. Backend executa
  rebalanceamento.
- `T+00:32` ledger: `accepted` com `executedAt=T+00:31`. Spread volta
  para 1,4%.
- `T+01:00` Aud L1 lê o ledger, confirma que está dentro dos limites.
  Sem anomalia.

**Pseudo-ledger (3 linhas):**

```yaml
- id: led-7f3a
  requestId: r-001
  timestamp: 2026-10-15T13:30:00Z
  actor: {userId: u-42, role: MOp, seniorityLevel: L1, scope: "economia"}
  agent: krapulla
  capability: K-01
  ringId: null
  payload: {par: "KRC/9mm", delta: -0.02, expectedSpread: 0.014}
  decision: accepted
  expiresAt: 2026-10-15T13:35:00Z
  executedAt: 2026-10-15T13:30:31Z
  hash: sha256:7f3a...
- id: led-7f3b
  requestId: r-001
  parentId: led-7f3a
  timestamp: 2026-10-15T13:30:31Z
  actor: {userId: system, role: ledger-bot, seniorityLevel: n/a}
  agent: krapulla
  capability: K-01
  decision: accepted
  executedAt: 2026-10-15T13:30:31Z
  notes: "execução confirmada; spread pós = 0.014"
  hash: sha256:7f3b...
- id: led-7f3c
  requestId: r-001
  parentId: led-7f3a
  timestamp: 2026-10-15T14:00:00Z
  actor: {userId: u-99, role: Aud, seniorityLevel: L1}
  agent: krapulla
  capability: K-01
  decision: accepted   # auditor não muda decisão; só marca como "auditado"
  notes: "auditoria ok; sem anomalia"
  hash: sha256:7f3c...
```

Resultado: 1 capability executada, dentro de limite, auditada. Risco
operacional baixo. Esse é o "caminho feliz" — a maioria das ações
deve parecer com isso.

---

## 8. Cenário B — Abusivo (ataque aéreo diplomático com veto)

**Contexto:** Marechal Henricks detecta ruído anômalo em
W2/Priadus (facção "Verdes de Priadus") e — extrapolando — sugere
ativar protocolo **Emboscada Verde** (H-04) e abrir canal
diplomático (U-01) **simultaneamente**, mais um possível ataque
aéreo (capability hipotética hoje **não listada** — propositalmente
fora da matriz §3).

**Linha do tempo (com controles funcionando):**

- `T+00:00` Henricks emite `{requestId: r-002, cap: H-04, payload: {ring: r-7, mode: "cerco"}, expiresAt: T+15:00}`
- `T+00:01` Uryan Horks emite `{requestId: r-003, cap: U-01, payload: {faccao: "verdes_priadus", tipo: "abrindo"}, expiresAt: T+24:00}`
- `T+00:02` MOp L3 "diplomacia" **Carla** vê U-01 no console.
  Avalia que abrir canal com facção que está em W2/Priadus **durante**
  uma Emboscada Verde iminente em W2 é loucura geopolítica. **Veta.**
- `T+00:03` ledger: `vetoed` por `MOp/L3/diplomacia` com
  `vetoReason: "Conflita com protocolo defensivo em W2; necessário resolver H-04 antes de abrir U-01"`.
- `T+00:04` Carla abre ticket para Cmp L2 sinalizando padrão
  suspeito de Henricks (combinação H-04 + U-01).
- `T+00:05` MOp L3 do setor W2 vê H-04 no console. Decide que a
  Emboscada Verde **pode** prosseguir (H-04 é aprovável apenas por
  MOp L3, não há veto aqui) — mas como há ticket de Cmp aberto,
  espera Cmp revisar.
- `T+00:10` Cmp L2 **Marcos** entra no console, vê H-04 pendente +
  ticket de Carla. Decide aplicar **veto preventivo** (cláusula
  "impacto em outro mundo" do H-04). Marca H-04 como `vetoed`.
- `T+00:11` ledger: H-04 `vetoed` por `Cmp/L2` com
  `vetoReason: "Espera revisão Cmp; padrão de combinação H-04+U-01 em W2 sob investigação"`.
- `T+00:12` H-04 morre (não foi aceita, não há recurso ativo).
  U-01 também morre (foi vetada, e Carla não abriu recurso em 24 h).
- `T+00:13` Aud L1 **Beto** lê o ledger, vê dois vetos em 13 min
  envolvendo W2. Marca como anomalia. Cria ticket de auditoria.
- `T+00:30` Cmp L3 revisa os tickets. Encadeia nota de compliance
  no ledger explicando decisão final: "Emboscada Verde adiada;
  diplomacia segue em modo passivo (U-08 consultivo) até revisão
  do Cmp L3 sobre o padrão Henricks+Uryan."

**Pseudo-ledger (resumo):**

```yaml
# H-04
- id: led-aa01
  requestId: r-002
  timestamp: 2026-10-15T18:00:00Z
  actor: {userId: system, role: console, seniorityLevel: n/a}
  agent: henricks
  capability: H-04
  ringId: r-7
  payload: {ring: r-7, mode: "cerco", rationale: "ruído anômalo"}
  decision: pending
  expiresAt: 2026-10-15T18:15:00Z
  hash: sha256:aa01...

- id: led-aa02
  requestId: r-002
  parentId: led-aa01
  timestamp: 2026-10-15T18:10:00Z
  actor: {userId: u-77, role: Cmp, seniorityLevel: L2}
  agent: henricks
  capability: H-04
  decision: vetoed
  vetoReason: "Espera revisão Cmp; padrão de combinação H-04+U-01 em W2 sob investigação"
  hash: sha256:aa02...

# U-01
- id: led-bb01
  requestId: r-003
  timestamp: 2026-10-15T18:01:00Z
  actor: {userId: system, role: console, seniorityLevel: n/a}
  agent: uryan_horks
  capability: U-01
  ringId: null
  payload: {faccao: "verdes_priadus", tipo: "abrindo"}
  decision: pending
  expiresAt: 2026-10-16T18:01:00Z
  hash: sha256:bb01...

- id: led-bb02
  requestId: r-003
  parentId: led-bb01
  timestamp: 2026-10-15T18:02:00Z
  actor: {userId: u-12, role: MOp, seniorityLevel: L3, scope: "diplomacia"}
  agent: uryan_horks
  capability: U-01
  decision: vetoed
  vetoReason: "Conflita com protocolo defensivo em W2; necessário resolver H-04 antes de abrir U-01"
  hash: sha256:bb02...

# Encadeamento Cmp L3
- id: led-cc01
  requestId: r-002
  parentId: led-aa02
  timestamp: 2026-10-15T18:30:00Z
  actor: {userId: u-01, role: Cmp, seniorityLevel: L3}
  agent: henricks
  capability: H-04
  decision: vetoed
  notes: "Emboscada Verde adiada; diplomacia segue em modo passivo (U-08 consultivo) até revisão Cmp L3"
  hash: sha256:cc01...

# Marcação de auditoria
- id: led-dd01
  requestId: r-003
  parentId: led-bb02
  timestamp: 2026-10-15T18:13:00Z
  actor: {userId: u-50, role: Aud, seniorityLevel: L1}
  agent: uryan_horks
  capability: U-01
  decision: vetoed
  notes: "anomalia sinalizada: 2 vetos em 13 min envolvendo W2; ticket de auditoria aberto"
  hash: sha256:dd01...
```

**Por que este cenário é o "caso abusivo":** ele testa os 4 controles
críticos ao mesmo tempo — (1) aprovador único correto (MOp L3 para
H-04, não L1/L2), (2) veto de MOp L3 diplomacia, (3) veto preventivo
de Cmp L2, e (4) revisão de Cmp L3. Sem essa policy, qualquer um
desses 4 vetos poderia ter sido silenciado e a Emboscada Verde teria
ido adiante — risco diplomático e reputacional real.

---

## 9. Compatibilidade com `API_MARECHAL_CONTROL_PANEL.md`

Este documento **não contradiz** o contrato existente. Mapeamento:

| Seção do contrato | Policy doc |
|---|---|
| §5 (endpoints `/api/console/v1/*`) | inalterado — o fluxo de aprovação é **orquestrado pelo console cliente**, não por novos endpoints. Em particular, não há novo endpoint de mutação; aprovações disparam chamadas já existentes com flag adicional `humanApprovalId` (a ser definido em PR de runtime, §11). |
| §6 (idempotência) | ledger usa `requestId` (UUID v4) já exigido pelo contrato — reaproveitamos. |
| §7 (rate limits) | inalterado — os limites de §3.1–3.3 são limites **de policy** (por humano/ring/dia), adicionais aos rate limits técnicos do contrato. |
| §8 (auditoria) | o ledger descrito em §5 é **complementar** ao audit log técnico; ambos coexistem. |
| §9 (erros) | decisões `expired`/`vetoed`/`rejected` retornam ao cliente com código já existente (`409 PROPOSAL_CLOSED` etc.) — nenhum código novo. |
| §10 ("Propostas permanecem consultivas e exigem um fluxo humano separado") | **Este doc é a implementação dessa frase.** §10 não é alterado. |

---

## 10. Pontos em aberto (para revisão antes de virar PR de runtime)

1. **Multi-aprovador:** algumas capabilities pedem "co-assinatura" (ex:
   H-03, K-02, U-01). Política de deadlock (2 MOp L3 não conseguem
   co-assinar entre si)? Default sugerido: qualquer Cmp L2 quebra empate.
2. **Recurso de veto:** janela de 24 h está proposta; precisa de SLA do
   Cmp L3 para revisar recursos.
3. **Voto por delegación:** MOp L3 ausente pode delegar a L2? Política
   padrão sugerida: **não** (a senioridade é o controle). Pode ser
   revisto em iteração futura.
4. **Threshold de "anomalia" do Auditor:** o que conta como padrão
   suspeito? Versão inicial: 2+ vetos na mesma região em 1 h, ou 1 veto
   + 1 revogação na mesma capability em 24 h. Pode virar config Dev L2.
5. **Coexistência com o CSRF do console:** o console `/api/console/v1/*`
   já exige Origin-check (ver `API_MARECHAL_CONTROL_PANEL.md` §5.3).
   O ledger não conflita — o CSRF protege chamadas; o ledger registra
   decisões. (Coexistência a ser documentada no PR de CSRF.)

---

## 11. Roadmap de implementação (não-escopo deste PR)

> Reforçando: este doc é **policy-only**. Nada aqui é código rodando.
> Os itens abaixo são roadmap para PRs de runtime futuros, listados
> apenas para que aprovadores saibam quando cada capability de fato
> "acende" no console.

- **PR-1 (scaffold):** tabela `marshal_ledger` (append-only) +
  serviço de ledger com hash encadeado. Sem UI ainda. MOp não
  consegue aprovar nada além de H-08 e H-05 (mínimo viável).
- **PR-2 (UI mínima):** tela "Pending proposals" no console
  Marechal para MOp; tela "Audit trail" para Aud. Aprova
  H-01, H-02, K-01, U-09.
- **PR-3 (veto + Cmp):** fluxo de veto justificado + revogação
  em até 4 h. Habilita H-04, H-09, K-04, K-05, U-05, U-07.
- **PR-4 (co-assinatura + diplomacia):** aprova H-03, K-02, K-06,
  U-01, U-03, U-04, U-06.
- **PR-5 (métricas + anomalia):** dashboards para Aud L1/L2;
  detector de padrão. Refinamento de limites com base em dados.

Cada PR deve:
- atualizar este doc com qualquer mudança de capacidade;
- revalidar compatibilidade com `API_MARECHAL_CONTROL_PANEL.md`;
- trazer testes oficiais (TS) cobrindo o caminho feliz + 1 caminho
  abusivo similar ao §8.

---

## 12. Glossário

- **Ring** — unidade operacional (anel geográfico) onde MOp atua.
- **Setor** — agrupamento de rings sob responsabilidade de um MOp L3.
- **Senioridade** — L1 (junior), L2 (pleno), L3 (sênior). Apenas L3
  pode co-assinar com Cmp L2.
- **Emboscada Verde** — protocolo defensivo/cerco de ring (lore W2).
- **Água da Morte** — alerta ambiental de ring (lore W1/W3).
- **ZEX** — Zona de Extração de XP (mecânica econômica, ver
  `Desenvolvimento ZU.txt`).
- **KRC** — moeda do jogo (Khaaos Run Coin).
- **Co-assinatura** — aprovação de 2+ atores de senioridade/papel
  compatível para uma mesma capability. Sem co-assinatura
  completa, capability não executa.

---

_Fim do documento. Para comentários, abrir issue com label
`policy/marshal-approval` e mencionar @compliance + @console-team._
