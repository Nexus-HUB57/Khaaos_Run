# Diretrizes narrativas da Classe Especial — Submundo KR

Este catálogo transforma sinais operacionais limitados em rascunhos ficcionais compartilhados pelos três agentes. O código correspondente está em `server/game/specialClassNarrative.ts`; a API somente leitura é `GET /api/console/v1/marshal/narrative-events?worldId=W2`.

## Princípios de autoria e governança

1. **Fato separado da ficção.** Gatilhos e `observedSignals` são derivados apenas do snapshot de servidor. Falas e premissas narrativas são marcadas como ficcionais; nenhuma linha pode afirmar incidente, preço, estoque, tratado, identidade, recompensa ou ação que o runtime não observou.
2. **Três perspectivas, uma cena.** Cada rascunho atribui uma contribuição ao Marechal Henricks (segurança/coordenação operacional), King Krapulla (mercado ficcional sem dados econômicos conectados) e Uryan Horks (diplomacia e texto de rascunho). O campo `role` distingue quem conduz, revisa e redige.
3. **Sem execução ou publicação.** Todo resultado tem `status: proposal`, `needsHumanReview: true` e `executable: false`. A API não altera partidas, fila, ring, preço, alianças nem publica mensagens.
4. **Agência e dignidade dos jogadores.** Não produzir ameaças, humilhação, perseguição individual, conteúdo discriminatório ou instruções para causar dano. Usar apenas agregados de mundo e jamais expor IDs ou comportamento de uma pessoa.
5. **Sem promessas persistentes.** Diálogo não concede itens, KRC, XP, progressão, acesso ou alteração de regra; qualquer recompensa e mudança de cânone requer fluxo de produto próprio e aprovação humana.
6. **Degradação segura.** Sinal ausente, nulo ou desatualizado não satisfaz gatilho. Se as fontes não alcançam threshold, retornar lista vazia, não preencher lacunas com invenção.

## Gatilhos narrativos iniciais

| Evento | Gatilho exclusivamente observável | Henricks | King Krapulla | Uryan Horks |
|---|---|---|---|---|
| **As Docas em Silêncio** | `queueCount >= 3` | revisa o limite operacional | conduz investigação ficcional, sem alegar oferta ou preço | rascunha proposta de trégua |
| **O Farol da Espera** | `queueP95Seconds >= 60` | conduz e mantém mudanças em `hold` | recusa inferências econômicas não medidas | rascunha janela diplomática de passagem |
| **A Mesa do Anel** | `occupancy.percent >= 80` | conduz revisão humana de capacidade | não infere escassez/valor da ocupação | propõe conversa entre facções, sem declarar tratado |
| **O Corredor de Ecos** | RTT p95 de **250–499,9 ms**, com ≥5 pongs recentes | recomenda cautela, sem ordem operacional | não atribui causa a mercado/facção | redige mensagem ficcional para aguardar confirmação |
| **A Tempestade de Ecos** | RTT p95 **≥500 ms**, com ≥5 pongs recentes | encaminha para revisão humana; não pausa partidas | rejeita teorias de sabotagem/causa sem evidência | prepara convocação ficcional de confirmação de mensagens |

RTT vem de probes WebSocket `ping` iniciados pelo servidor e respostas nativas `pong`; não é `queueP95Seconds`, timestamp fornecido pelo cliente ou cálculo de lag de combate. O snapshot agrega apenas RTTs em janela móvel de cinco minutos, limitado a 1.000 amostras por mundo e sem IDs de usuário. O p95 e o número de amostras ficam explícitos; sem cinco amostras válidas recentes, latência é indisponível e nenhum evento de latência é criado. Os thresholds são sinais narrativos, não SLA, diagnóstico de causa nem acionamento de mitigação.

O servidor retorna apenas eventos cujo gatilho é verdadeiro para o snapshot atual. `eventId` identifica mundo e observação; atualizar amostra cria uma nova versão observacional do rascunho, não publica uma cena nem inicia um evento de gameplay.

## Contrato de interação

O painel mostra gatilho, valores observados, três contribuições, estado de revisão e timestamp do snapshot. O operador pode consultar e deliberar; até existir um fluxo separado de aprovação, não há botão de aprovar, executar ou transmitir. Os agentes continuam determinísticos e locais nesta versão, sem chamada a LLM ou serviço externo.

## Testes exigidos para novos eventos

- Gatilho abaixo do threshold produz ausência do evento; threshold exato o inclui.
- Campos de sinal reproduzem a telemetria de servidor sem adicionar fatos.
- Cada evento contém os três agentes e uma atribuição de papel coerente.
- Resposta e cada evento permanecem `executable: false` e exigem revisão humana.
- Snapshot com métricas indisponíveis/nulas não cria evento que dependa delas.
- Alta latência exige RTT observado no servidor e no mínimo cinco amostras; espera de fila nunca substitui RTT.
- 250 ms ativa aviso, 500 ms ativa o evento crítico; drafts não pausam nem reconfiguram partidas.
- Texto narrativo não recebe nem serializa identificadores pessoais, credenciais ou dados de jogador.
