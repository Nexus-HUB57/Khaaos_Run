# Fase 43 — Canalização ZEX sob pressão

## Objetivo

Transformar a extração ZEX instantânea do runtime 3D em uma interação com canalização curta e interrompível. O jogador inicia com um toque de interação, permanece exposto por quatro segundos e recebe o prêmio apenas se concluir o processo. A janela cria oportunidade de disputa sem exigir alteração de mapa, novos itens ou nova regra econômica.

## Estado atual

No `game-runtime`, a tecla de interação consome imediatamente um terminal ativo e concede 250 XP. A simulação local e a sala multiplayer têm fluxos paralelos; a UI apenas anuncia a conclusão. A classe legada UE5 (`AKhaaosZEXTerminal`) tem contrato separado de KRC/TransferSystem e não será modificada nesta fase.

## Regras do MVP

| Regra | Comportamento |
|---|---|
| Início | Um toque em Interagir/E no terminal ativo e dentro do alcance existente (3,4 m) inicia a canalização. A prioridade contextual atual entre porta, loot e terminal permanece inalterada. |
| Duração | 4 segundos, contados pelo servidor no modo online e pelo relógio determinístico da simulação local no modo offline. |
| Compromisso | O canal continua sem segurar a tecla; o jogador pode girar a câmera, mas movimento horizontal acumulado de 0,75 m ou mais desde o início cancela o processo. |
| Interrupções | Qualquer dano aplicado, nocaute, morte, desconexão ou partida encerrada cancela a canalização. |
| Disputa | Um terminal só permite uma canalização por vez. Outros jogadores veem o estado em progresso e não podem reivindicar a recompensa enquanto estiver reservado. Se o canal for cancelado, o terminal volta a ficar disponível. |
| Conclusão | O terminal é consumido uma única vez; `extracted` aumenta em 1 e o jogador recebe exatamente os 250 XP atuais. A conclusão permanece autoritativa no servidor. |
| Recompensa/persistência | Sem mudança: nenhum KRC, item ou salvamento persistente é adicionado por esta fase. |
| HUD | Exibir progresso percentual e terminal em canalização; informar cancelamento e manter o feedback de conclusão existente. |

Os quatro segundos e o limite de deslocamento são valores de design do MVP, não novas regras canônicas de lore. Devem ficar em constantes nomeadas, fáceis de ajustar após playtest.

## Paridade e arquitetura

A sala autoritativa (`game-runtime/server/room3d.js`) e a simulação local (`game-runtime/src/game3d/sim3d.js`) implementam as mesmas transições: `idle → channeling → completed` ou `idle → channeling → cancelled`. O estado do terminal e o progresso são incluídos nos snapshots existentes; não se cria protocolo de rede paralelo. Eventos de início, cancelamento e conclusão reutilizam a fila de eventos por jogador já existente.

## Critérios de aceite

1. Fora do alcance ou com terminal inativo/reservado, Interagir não concede XP nem inicia canal.
2. Interagir inicia uma canalização e o HUD mostra progresso crescente até 100%.
3. Antes dos quatro segundos, o terminal continua ativo e nenhum XP é concedido.
4. Ao completar quatro segundos sem interrupção, há uma única concessão de 250 XP e o terminal fica inativo.
5. Movimento horizontal acumulado ≥ 0,75 m ou dano recebido cancela; não há XP, o terminal continua ativo e pode ser tentado novamente.
6. Dois jogadores não podem concluir o mesmo terminal; após cancelamento, outro jogador pode iniciar.
7. Nocaute/morte/saída da partida cancela e libera a reserva.
8. Simulação offline e sala multiplayer preservam as mesmas regras e os contratos de porta/loot continuam passando.

## Fora de escopo

Sem alterações em geometria, posições, quantidade ou distribuição de terminais, spawns, layouts do CIGKV, economia KRC/Bankhaoos/TransferSystem, conteúdo UE5, lógica de persistência, PvP/armas ou duração do anel. O mapa espacial CIGKV permanece bloqueado conforme o plano de ação até aprovação de ADR.

## Verificação

Executar os testes focados de interação/room/simulação e a suíte completa de `game-runtime`; revisar o diff para garantir que nenhuma coordenada canônica ou recompensa existente foi alterada.
