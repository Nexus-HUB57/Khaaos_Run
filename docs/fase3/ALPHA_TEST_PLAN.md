# Khaaos Run — Plano de Teste Alpha (Fase 3)
# Alpha Test Plan | Devs Ph.D | Nexus-HUB57

> **Status:** Pre-Alpha | **Classificação:** Confidencial — NDA obrigatório  
> **Última atualização:** 2025-03-05  
> **Versão do documento:** 1.0.0

---

## 1. Objetivos

O teste alpha do Khaaos Run tem como objetivo validar que o loop central do jogo está funcional, coletar dados quantitativos para balanceamento, e garantir que os sistemas de infraestrutura (EOS, anti-cheat, monitoramento) operam corretamente sob condições reais de jogo. Este é um teste fechado (alpha fechado) com participantes selecionados e sob NDA.

### Objetivos Primários

1. **Validar o Loop Central de Jogo (Core Loop):** Confirmar que o fluxo completo Battle Royale — do lobby à Zona de Morte, loot, combate, shrink do Anel Zu, e condição de vitória — funciona sem crashes por pelo menos 8 horas contínuas de teste.

2. **Coletar Dados de Balanceamento:** Medir TTK (Time to Kill), taxa de vitória por classe/arma, fluxo de KRC (moeda do jogo), distribuição de loot, e percentual de mortes por Zona Zu para ajustar parâmetros de balanceamento antes do beta.

3. **Testar Integração EOS (Epic Online Services):** Validar autenticação EOS, matchmaking, cloud save round-trip, e sessões persistentes com 50 jogadores reais simultâneos.

4. **Testar Anti-Cheat em Condições Reais:** Verificar que o sistema de 3-strike kick opera corretamente com jogadores legítimos, medir a taxa de falsos positivos, e confirmar que violações reais são detectadas e punidas em <2s.

5. **Validar Infraestrutura de Produção:** Confirmar que monitoramento (Prometheus + Grafana), alerting (AlertManager → Discord/Slack), rate limiting, proteção DDoS, e backup/restore funcionam sob carga real.

### Objetivos Secundários

- Validar a experiência de áudio adaptativo (música de zona, transições de combate)
- Testar a UI/HUD em resoluções 1080p e 1440p
- Verificar performance de rede (RTT p95 <100ms, 0 desyncs)
- Coletar feedback qualitativo sobre mapa CIGKV e feeling de combate
- Testar procedimento de rollback

---

## 2. Escopo do Teste

### O Que Está Incluído (In-Scope)

| Componente | Detalhes |
|---|---|
| **Mapa** | CIGKV apenas — mapa único do Battle Royale |
| **Modo de Jogo** | Battle Royale (BR) — último time/pessoa vivo |
| **Jogadores** | Máximo 50 por partida (meta de produção: 100) |
| **Anel Zu** | 3 horas de shrink (configurável para teste) |
| **Loot** | Sistema completo de spawn e pickup de itens |
| **KRC** | Economia completa — ganho, gasto, market |
| **Anti-Cheat** | EAC + validação de movimento server-side |
| **EOS** | Auth, Matchmaking, Cloud Save, Voice |
| **Monitoramento** | Prometheus, Grafana, AlertManager |
| **Webhooks** | Discord #alpha-alerts, Slack #khaaos-alpha |

### O Que NÃO Está Incluído (Out-of-Scope)

- Outros mapas além do CIGKV
- Modos de jogo alternativos (TDM, FFA, etc.)
- Mobile / console — apenas PC
- Cosméticos / loja de skins (placeholder apenas)
- Spectator mode (não implementado nesta fase)
- Replays / killcam
- Ranked / competitive matchmaking
- Suporte a mods

---

## 3. Seleção de Participantes

### Critérios de Seleção

- **Total:** 50 jogadores convidados
- **Tipo:** Alpha fechado — invite-only
- **NDA:** Obrigatório — todos devem assinar NDA digital antes de receber acesso
- **Perfil:** Mix de jogadores competitivos BR (30%), jogadores casuais (40%), e testers/QA profissionais (30%)
- **Região:** Primariamente SA (Brasil), com 10 jogadores NA para testar cross-region
- **Requisitos técnicos:** PC com RTX 3060+ ou equivalente, 16GB RAM, SSD, conexão >= 25 Mbps

### Processo de Onboarding

1. Convite enviado via Discord DM com link de NDA digital
2. Após assinatura do NDA, acesso ao canal #alpha-playtest no Discord
3. Download do build via EOS dev portal (chave de acesso única)
4. Orientação em call coletiva (30min) — regras, NDA, como reportar bugs
5. Acesso ao #alpha-bugs para reportar issues

### Código de Conduta

- Proibido streaming, screenshot em redes sociais, ou qualquer divulgação
- Proibido uso de cheats, macros, ou exploits — teste é para jogadores legítimos
- Feedback deve ser reportado apenas nos canais designados
- Violação do NDA = ban imediato + ações legais

---

## 4. Cenários de Teste

### 4.1 Cenários de Combate

| ID | Cenário | Critério de Sucesso | Prioridade |
|---|---|---|---|
| C-01 | Combate 1v1 com armas brancas (facas, machados) | TTK entre 2-5s para arma corpo-a-corpo | Alta |
| C-02 | Combate 1v1 com pistolas (curta distância) | TTK entre 1.5-3s | Alta |
| C-03 | Combate 1v1 com rifles (média distância) | TTK entre 0.8-2s | Alta |
| C-04 | Combate 1v1 com snipers (longa distância) | TTK entre 0.5-1.5s (headshot) | Alta |
| C-05 | Combate 1vN (1 jogador vs 3+ inimigos) | Sobrevivência possível com skill; não instakill | Média |
| C-06 | Dano por zona Zu (fora do anel) | Dano progressivo; morte em 15-30s na zona final | Alta |
| C-07 | Uso de habilidades (dash, shield, heal) | Cooldown respeitado; efeito aplicado corretamente | Alta |
| C-08 | Hit registration com movimento (strafe, jump) | <=5% de hits fantasma (ghost shots) | Alta |
| C-09 | Combate em veículos | Dano correto; sem desync de posição | Média |
| C-10 | Friendly fire (se habilitado) | Dano aplicado apenas se FF on; sem FF se off | Baixa |

### 4.2 Cenários de Zona Zu (Anel)

| ID | Cenário | Critério de Sucesso | Prioridade |
|---|---|---|---|
| Z-01 | Primeiro shrink do anel (fase 1) | Shrink inicia no tempo correto; direção visível no minimapa | Alta |
| Z-02 | Shrink progressivo (fases 2-6) | Cada fase menor que anterior; timing consistente | Alta |
| Z-03 | Zona final (fase 7+) | Dano alto o suficiente para forçar confronto | Alta |
| Z-04 | Jogador fora do anel | Dano crescente aplicado; visuais de aviso | Alta |
| Z-05 | Morte por zona Zu | Contabilizada corretamente no scoreboard | Média |
| Z-06 | Anel Zu em movimento | Sem stutter visual; transição suave | Média |

### 4.3 Cenários de Loot

| ID | Cenário | Critério de Sucesso | Prioridade |
|---|---|---|---|
| L-01 | Spawn de loot no início da partida | Itens distribuídos em POIs e áreas de loot | Alta |
| L-02 | Pickup de item do chão | Item adicionado ao inventário; desaparece do mundo | Alta |
| L-03 | Drop de item no chão | Item aparece no mundo; removido do inventário | Alta |
| L-04 | Loot em containers (caixas, vaults) | Abertura animada; loot correto dentro | Média |
| L-05 | Loot raro/legendário | Taxa de spawn de acordo com config; efeito visual | Média |
| L-06 | Stack de itens consumíveis | Stack combina corretamente; limite respeitado | Média |

### 4.4 Cenários de Zu (Gameplay Especial)

| ID | Cenário | Critério de Sucesso | Prioridade |
|---|---|---|---|
| ZU-01 | Ativação de poder Zu | Poder ativado com input correto; efeito visual + gameplay | Alta |
| ZU-02 | Cooldown de poder Zu | Não pode reativar antes do cooldown; UI mostra timer | Alta |
| ZU-03 | Interação Zu + combate | Poder Zu afeta combate (dano, escudo, etc.) | Alta |
| ZU-04 | Zu em zona de morte | Poder Zu não bypassa dano de zona | Média |

### 4.5 Cenários de Economia (KRC)

| ID | Cenário | Critério de Sucesso | Prioridade |
|---|---|---|---|
| E-01 | Ganho de KRC por kills | KRC creditado corretamente após cada kill | Alta |
| E-02 | Ganho de KRC por sobrevivência | KRC creditado ao final baseado em placement | Alta |
| E-03 | Compra no mercado | Item recebido; KRC debitado; transação registrada | Alta |
| E-04 | KRC persistido (cloud save) | Saldo de KRC persiste entre sessões | Alta |
| E-05 | KRC não negativo | Impossível gastar mais que saldo disponível | Alta |
| E-06 | Fluxo KRC (sink vs faucet) | Economia não infla/defla descontroladamente | Média |

### 4.6 Cenários de Anti-Cheat

| ID | Cenário | Critério de Sucesso | Prioridade |
|---|---|---|---|
| AC-01 | Speed hack detectado | Kick em <2s após 3 strikes | Alta |
| AC-02 | Aimbot detectado | Kick em <2s após análise de accuracy anômala | Alta |
| AC-03 | Teleport detectado | Kick imediato por movimento impossível | Alta |
| AC-04 | Jogador legítimo NÃO kickado | Taxa de falso positivo <1% | Alta |
| AC-05 | Report de jogador (in-game) | Report registrado; não gera kick automático | Média |
| AC-06 | Validação server-side de posição | Movimentos inválidos rejeitados pelo servidor | Alta |

### 4.7 Cenários de EOS

| ID | Cenário | Critério de Sucesso | Prioridade |
|---|---|---|---|
| EOS-01 | Login via Epic Account | Autenticação funcional; sessão criada | Alta |
| EOS-02 | Matchmaking (find match) | Partida criada com >=2 jogadores; <=30s wait | Alta |
| EOS-03 | Cloud Save write + read | Round-trip <5s; dados consistentes | Alta |
| EOS-04 | Desconexão + reconexão | Jogador reconecta na mesma partida se dentro do timeout | Alta |
| EOS-05 | Voice chat via EOS | Áudio funcional entre jogadores na mesma squad | Média |
| EOS-06 | EOS Auth failure handling | Error graceful; jogador pode tentar novamente | Média |

### 4.8 Cenários de Performance

| ID | Cenário | Critério de Sucesso | Prioridade |
|---|---|---|---|
| P-01 | 50 jogadores em uma partida | Server: >=30 FPS; Client: >=60 FPS (RTX 3060) | Alta |
| P-02 | Latência de rede (RTT p95) | <100ms para jogadores na mesma região | Alta |
| P-02b | Latência cross-region (SA↔NA) | <200ms; playable | Média |
| P-03 | Uso de memória do servidor | <6GB RAM com 50 jogadores | Alta |
| P-04 | Zero desyncs de posição | Nenhum desync >1m detectado em 8h de teste | Alta |
| P-05 | Zero crashes em 8h contínuas | Servidor permanece online por >=8h sem crash | Alta |
| P-06 | Tempo de carregamento do mapa | <30s para entrar na partida (SSD) | Média |
| P-07 | Full server (50/50) + join queue | Queue funcional; jogadores entram conforme vagas | Média |

---

## 5. Coleta de Dados

Todas as métricas são coletadas automaticamente via Prometheus e exportadas para Grafana dashboards. Dados adicionais são logados em arquivo para análise post-test.

### Métricas Quantitativas

| Métrica | Unidade | Fonte | Target Alpha |
|---|---|---|---|
| TTK (Time to Kill) | segundos | Combat log | 1-5s (arma dependente) |
| Taxa de vitória | % por arma/classe | Match result | 15-25% (balanced) |
| Fluxo de KRC | KRC/min (earn vs spend) | Economy metrics | Faucet ≈ Sink |
| Mortes por Zona Zu | % do total de mortes | Death log | 20-40% |
| Taxa de desconexão | % por sessão | Session log | <5% |
| Falso positivo anti-cheat | % de kicks legítimos | Anti-cheat log | <1% |
| RTT p50 / p95 / p99 | ms | Network metrics | p95 < 100ms |
| FPS servidor | frames/s | Server metrics | >= 30 FPS |
| FPS cliente | frames/s | Client telemetry | >= 60 FPS |
| Uso de memória servidor | GB | System metrics | < 6GB |
| Taxa de crash | crashes/hora | Server log | 0 |
| Cloud save round-trip | segundos | EOS metrics | < 5s |
| Matchmaking wait time | segundos | EOS metrics | < 30s |

### Dados Qualitativos

- Feedback de combate feeling (peso das armas, responsividade)
- Feedback visual do mapa CIGKV (atmosfera, legibilidade)
- Feedback de áudio (música adaptativa, spatial audio)
- Sugestões de UI/UX
- Bugs visuais / glitches reportados

### Ferramentas de Coleta

- **Prometheus** — métricas de servidor em tempo real
- **Grafana** — dashboards de visualização
- **EOS Dev Portal** — analytics de auth, matchmaking, cloud save
- **Discord #alpha-bugs** — bug reports dos jogadores (formato template)
- **Server logs** — combat log, economy log, anti-cheat log (arquivo rotacionado)

---

## 6. Critérios de Sucesso

### Gates Obrigatórios (Todos devem ser PASS para promover ao Beta)

| # | Critério | Threshold | Medição |
|---|---|---|---|
| 1 | Zero crashes em 8h contínuas | 0 crashes/8h | Server uptime |
| 2 | RTT p95 na mesma região | < 100ms | Network metrics |
| 3 | Zero desyncs de posição | 0 desyncs >1m | Replication log |
| 4 | Falso positivo anti-cheat | < 1% | Anti-cheat log |
| 5 | Cloud save round-trip | < 5s | EOS metrics |
| 6 | Matchmaking funcional | 100% das partidas criadas | EOS Dev Portal |
| 7 | Economia KRC sem bugs | 0 duplicações, 0 saldos negativos | Economy audit |
| 8 | FPS servidor com 50 players | >= 30 FPS | Server metrics |

### Gates Desejáveis (Nice-to-have)

| # | Critério | Threshold | Notas |
|---|---|---|---|
| 1 | FPS cliente (RTX 3060) | >= 60 FPS | Pode otimizar depois |
| 2 | Taxa de desconexão | < 5% | Depende de rede do jogador |
| 3 | Mortes por zona Zu | 20-40% | Balanceamento de anel |
| 4 | Matchmaking wait | < 30s | Depende do player pool |
| 5 | Áudio adaptativo sem glitches | 0 audio stalls | Prioridade baixa |

---

## 7. Cronograma

### Semana 1 — Setup + Primeiras Playtests

| Dia | Atividade | Responsável |
|---|---|---|
| Seg | Deploy alpha; smoke test interno | DevOps + QA |
| Ter | Onboarding dos 50 jogadores; call de orientação | Community + QA |
| Qua | **Playtest #1** (2h) — foco: core loop, combate, loot | Todos |
| Qui | Análise de dados do Playtest #1; hotfix se necessário | Devs + QA |
| Sex | **Playtest #2** (3h) — foco: economia, EOS, zona Zu | Todos |

### Semana 2 — Testes de Stress + Validação

| Dia | Atividade | Responsável |
|---|---|---|
| Seg | Análise de dados do Playtest #2; ajustes de balanceamento | Devs + QA |
| Ter | Teste de stress: 50 bots + 10 jogadores reais (8h) | DevOps + QA |
| Qua | **Playtest #3** (3h) — foco: anti-cheat, performance, full BR | Todos |
| Qui | **Playtest #4** (3h) — foco: cross-region, rollback drill | Todos |
| Sex | Análise final; go/no-go decision para Beta | Toda a equipe |

### Sessões de Playtest

| Sessão | Data | Duração | Foco | Jogadores |
|---|---|---|---|---|
| #1 | Sem 1 - Qua | 2h | Core loop, combate, loot | 30-50 |
| #2 | Sem 1 - Sex | 3h | Economia KRC, EOS, zona Zu | 40-50 |
| #3 | Sem 2 - Qua | 3h | Anti-cheat, performance, full BR | 50 |
| #4 | Sem 2 - Qui | 3h | Cross-region, rollback, final validation | 50 |

---

## 8. Processo de Report de Bugs

### Canal de Report

Todos os bugs são reportados no canal **Discord #alpha-bugs** usando o template abaixo.

### Template de Bug Report

```
🪲 **BUG REPORT**
**ID:** [auto-incrementado pelo bot]
**Reporter:** [seu nome/EOS ID]
**Playtest:** [#1/#2/#3/#4]
**Categoria:** [Combate/Zona/Loot/Economia/Anti-Cheat/EOS/Performance/UI/Outro]
**Severidade:** [Critical/High/Medium/Low]
**Descrição:** [o que aconteceu]
**Reprodução:** [passos para reproduzir, se conhecido]
**Evidência:** [screenshot/video link — lembrar NDA!]
**Frequência:** [Always/Often/Rare/Once]
```

### Severidade

| Nível | Definição | Exemplo | SLA |
|---|---|---|---|
| **Critical** | Impede o jogo de funcionar; crash; data loss | Server crash; KRC duplicado; unable to join | Hotfix <4h |
| **High** | Impacta significativamente a gameplay | Desync de posição; loot não spawn; aim não registra | Fix antes da próxima playtest |
| **Medium** | Impacta experiência mas tem workaround | UI bug; áudio glitch; visual glitch | Fix antes do beta |
| **Low** | Cosmético ou menor | Text typo; animation glitch raro | Backlog |

### Fluxo de Bug

1. Jogador reporta no #alpha-bugs
2. Bot do Discord tria automaticamente (assigna ID, categoriza)
3. QA valida o bug (reproduz ou marca como "não reproduzido")
4. Dev responsável é mencionado
5. Bug fix → deploy em staging → validação QA → deploy no próximo playtest
6. Jogador original é notificado da resolução

---

## 9. Critérios de Rollback

O alpha test é **interrompido imediatamente** se qualquer um dos critérios abaixo for atingido:

### Rollback Imediato (Stop Test)

| Condição | Ação |
|---|---|
| **3+ bugs Critical** não resolvidos simultaneamente | Parar todas as playtests; deploy rollback; investigar |
| **Server crash** que cause perda de dados de partida | Parar; restaurar backup; investigar root cause |
| **Anti-cheat falso positivo** kicking >5% de jogadores legítimos | Desabilitar auto-kick; investigar; re-tunar thresholds |
| **KRC exploit** permitindo duplicação ou saldo negativo | Parar economia; auditar todas as transações; corrigir |
| **DDoS ou ataque externo** comprometendo a infraestrutura | Ativar modo defesa; Avaliar se é ataque real vs teste de stress |
| **EOS outage** que impeça login/matchmaking por >30min | Comunicar aos jogadores; aguardar EOS recovery |

### Rollback Parcial (Reduce Scope)

| Condição | Ação |
|---|---|
| **1-2 bugs Critical** | Desabilitar feature afetada; continuar teste do restante |
| **Performance abaixo do threshold** | Reduzir max players para 30; continuar |
| **Desyncs >5 em 1h** | Reduzir tick rate para 30; investigar; retomar com 60 |
| **Taxa de desconexão >15%** | Investigar rede; possível rollback de config de rede |

### Procedimento de Rollback

1. Comunicar no #alpha-announce: "ALPHA TEST PAUSED — [razão]"
2. Executar `scripts/alpha/restore_system.sh` com último backup validado
3. Verificar health com `scripts/alpha/verify_alpha_readiness.sh`
4. Se health FAIL após restore, escalar para DevOps lead
5. Documentar root cause no post-mortem (template no #alpha-postmortem)
6. Decisão go/no-go para retomar testes

---

## 10. Infraestrutura de Teste

### Ambiente

| Componente | Especificação | Quantidade |
|---|---|---|
| Game Server | AWS c6i.2xlarge (8 vCPU, 16GB RAM) | 1 (SA) + 1 (NA) |
| Economy API | AWS t3.medium | 1 |
| Redis | AWS ElastiCache t4g.small | 1 |
| PostgreSQL | AWS RDS t3.medium | 1 |
| Prometheus | AWS t3.small | 1 |
| Grafana | AWS t3.small | 1 |
| AlertManager | AWS t3.small | 1 |

### Configuração Alpha

- Feature flags: preset Alpha aplicado via `DefaultProduction.ini`
- Rate limiting: 60/min + 10/s (production values)
- DDoS protection: 50/s global, 5/IP
- Anti-cheat: 3-strike kick habilitado
- Matchmaking: min 2 players, max 50, timeout 60s
- Zona Zu: 3-hour ring (acelerado para teste)
- Mapa: CIGKV apenas

### Monitoramento Durante Teste

- **Grafana dashboard** aberto em tela dedicada no war room
- **Discord #alpha-live** — canal de observação em tempo real
- **AlertManager** — alerts critical/warning roteados para Discord + Slack
- **DevOps on-call** — disponível durante todas as playtests

---

## 11. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Server crash durante playtest | Média | Alto | Auto-restart policy; rollback procedure testado |
| Anti-cheat falso positivo | Média | Alto | Threshold conservador; monitorar FP rate; desabilitar auto-kick se >1% |
| EOS outage | Baixa | Alto | Fallback para auth local; retry logic; timeout graceful |
| DDoS durante alpha | Baixa | Médio | Rate limiting + DDoS protection já configurados; IPs allowlist se necessário |
| NDA violado | Baixa | Médio | NDA assinado; watermarks nos builds; monitoramento de streaming platforms |
| KRC exploit | Média | Alto | Economy audit automático; parar economia se detectar anomalia |
| Desync de rede | Média | Alto | Lag compensation + server authority; rollback de posição se detectado |
| Performance insuficiente | Média | Médio | Reduzir player count; otimizar hot path; profiling contínuo |

---

## 12. Pós-Alpha

Ao concluir o alpha com todos os gates obrigatórios em PASS:

1. **Post-mortem document** — lições aprendidas, métricas coletadas, bugs encontrados/resolvidos
2. **Balanceamento pass** — ajustar TTK, loot rates, zona Zu timing baseado nos dados
3. **Performance pass** — otimizar baseado nos profiling data
4. **Go/No-Go decision** — decisão formal de promover ao Beta
5. **Beta planning** — expandir para 200 jogadores, 2 mapas, ranked mode
6. **NDA lift** — permitir que alpha testers compartilhem experiência (se aprovado)

---

*Documento mantido por Devs Ph.D — Nexus-HUB57. Khaaos Run © 2025 Nexus-HUB57. Todos os direitos reservados.*
