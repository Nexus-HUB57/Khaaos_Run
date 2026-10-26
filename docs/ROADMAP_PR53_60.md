# Roadmap de implementação — PRs #53–#60

**Base:** `main` após o PR #52, que fechou os bloqueadores de segurança imediatos, atomicidade financeira inicial, hardening de WebSocket e o primeiro adapter Redis. **Objetivo:** converter as lacunas restantes do roadmap em oito mudanças pequenas, revisáveis e encadeadas.

## Princípios de execução

Cada PR deve conter código, testes e documentação do contrato que altera. Nenhum PR deve conectar KRC a valor externo. Migrações de banco entram antes das features que dependem de novos estados; observabilidade entra antes de escalar realtime; o cliente UE5 só pode ser declarado funcional depois de um build UE5.8 real, sem simular sucesso com stubs Node.

| PR | Issue | Entrega | Dependências | Resultado esperado |
|---:|---|---|---|---|
| #53 | [Issue #53](https://github.com/Nexus-HUB57/Khaaos_Run/issues/53) | Idempotência, constraints e gates de migração da economia | #52 | Retries não duplicam débito/crédito; migração e rollback testáveis |
| #54 | [Issue #54](https://github.com/Nexus-HUB57/Khaaos_Run/issues/54) | Rotação/revogação de identidade, rate limits de borda e origem WS | #52 | Sessões e tokens revogados deixam de reconectar; limites compartilhados |
| #55 | [Issue #55](https://github.com/Nexus-HUB57/Khaaos_Run/issues/55) | Ownership distribuído de salas, presença e replay de reconnect | #54 | Duas réplicas não duplicam jogadores e snapshots fora de ordem são descartados |
| #56 | [Issue #56](https://github.com/Nexus-HUB57/Khaaos_Run/issues/56) | Readiness, métricas, SLOs, alertas e playbooks | #55 | Operação identifica impacto, região e causa sem dados sensíveis |
| #57 | [Issue #57](https://github.com/Nexus-HUB57/Khaaos_Run/issues/57) | Matchmaking regional canônico e budgets de latência | #55, #56 | Decisões determinísticas, parties compatíveis e fila observável |
| #58 | [Issue #58](https://github.com/Nexus-HUB57/Khaaos_Run/issues/58) | Máquina authoritative de estados e replay determinístico | #57 | Partidas reproduzíveis por seed + comandos e abandono definido |
| #59 | [Issue #59](https://github.com/Nexus-HUB57/Khaaos_Run/issues/59) | Acessibilidade e budgets de performance no CI | #56, #58 | Regressões de UX/performance bloqueiam o PR com evidência comparável |
| #60 | [Issue #60](https://github.com/Nexus-HUB57/Khaaos_Run/issues/60) | Slice CIGKV compilável em UE5.8 e contrato UE↔backend | #55, #56, #58 | Build/Automation Tests reais e contrato versionado, sem declarar além do validado |

## Ordem e gates

A primeira onda é de consistência e segurança: #53 e #54. O gate de #53 é a reconciliação saldo/ledger sob concorrência; o gate de #54 é a invalidação efetiva de sessão/token e o rate limit entre réplicas.

A segunda onda é de escala operacional: #55 e #56. #55 não deve ser aceito apenas porque a fila Redis existe: o teste precisa executar duas instâncias, simular perda do owner e verificar lease, fencing, sequence e replay. #56 deve vir antes de aumentar carga ou ativar regiões adicionais.

A terceira onda é de qualidade do jogo: #57 e #58. O matchmaking precisa escolher uma implementação canônica entre as referências JS/Python e o serviço usado em produção. Em seguida, #58 formaliza os estados de partida e torna seed, comandos, checkpoints e versão de regras suficientes para replay e auditoria.

A quarta onda é de produto e portabilidade: #59 e #60. O cliente precisa de budgets de performance e fluxos acessíveis antes de receber mais telas; a trilha UE5 precisa de um ambiente UE5.8 real antes que qualquer PR declare compilação ou Automation Tests aprovados.

## Definition of Done comum

Um PR da faixa só está pronto quando o código passa no typecheck e no build aplicável, os testes novos falham antes da correção e passam depois, a documentação do contrato foi atualizada, logs e métricas não expõem tokens/PII, a migração é reversível quando houver schema, e o PR informa explicitamente o que não foi validado por limitação de ambiente.

## Fora do escopo da faixa

Não fazem parte destes oito PRs pagamentos reais, conversão de KRC, custódia, KYC/AML, promessa de prêmio, assets comerciais não licenciados, build UE5 fingido em runner sem UE5.8 ou bypass de revisão para acelerar a numeração de PRs. Cada issue pode ser dividida em sub-PRs se exceder o limite de risco ou tamanho.

## Checklist de acompanhamento

- [ ] #53 — idempotência, constraints e migrações
- [ ] #54 — sessão, revogação, rate limiting e origin WS
- [ ] #55 — ownership, presença, fencing e reconnect
- [ ] #56 — readiness, métricas, SLOs e playbooks
- [ ] #57 — matchmaking canônico regional
- [ ] #58 — estados authoritative e replay
- [ ] #59 — acessibilidade e performance
- [ ] #60 — UE5.8 CIGKV e contrato versionado
