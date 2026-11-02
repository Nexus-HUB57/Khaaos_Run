# Fase 43 — Plano de testes da canalização ZEX em multiplayer real

**Status:** rodada automatizada local executada; playtest em staging/multiplayer real ainda pendente.

**Versão-alvo:** commit `00c2b1a` — `feat/gameplay-next`.

**Runtime:** `game-runtime`, modo 3D online (`?online=1`).

**Data:** 2026-11-02.

## 1. Objetivo e escopo

Validar em partidas com pelo menos dois clientes humanos que a canalização ZEX é autoritativa no servidor, compreensível no HUD, consistente entre clientes e resistente a disputa, interrupções e condições de rede comuns.

O plano cobre início por interação, reserva do terminal, progresso, conclusão, recompensa, interrupção por movimento/dano/nocaute/morte, liberação para outro jogador, snapshots, reconexão e integridade da partida. Não altera nem valida mudanças de mapa, distribuição de spawns, economia KRC, persistência de recompensas ou o terminal legado UE5.

A regra-alvo está em [FASE43_ZEX_CHANNELING.md](FASE43_ZEX_CHANNELING.md): quatro segundos de canalização, cancelamento por deslocamento horizontal de pelo menos 0,75 m, dano ou fim do ciclo de vida do jogador/sala; conclusão única com 250 XP. O servidor envia snapshots a 20 Hz e o cliente produz inputs a 30 Hz, conforme o README do runtime.

## 2. Ambiente e preparação

### Ambiente permitido

Executar primeiro em **staging isolado** ou em ambiente local com o servidor e o cliente construídos a partir do mesmo commit. Não usar produção, contas pessoais, saldos reais ou serviços de economia reais para este playtest. `KR_DEV_AUTH=1` e as credenciais de desenvolvimento descritas no README são apenas para execução local; nunca habilitá-los em staging público ou produção. Em staging, usar contas descartáveis de teste e a autenticação normal daquele ambiente, sem gravar senhas, JWTs ou tokens de resume nos artefatos.

O endereço de entrada do cliente online é `?online=1`. Os clientes precisam ser autenticados e estar no mesmo modo/região e na mesma sala 3D. Preferir uma sala privada de teste quando disponível; caso contrário, conferir `roomId` em ambos os clientes e confirmar que existem pelo menos dois humanos reais na sala, não apenas bots. Usar perfis de navegador/dispositivos separados para não compartilhar `localStorage`, token de autenticação ou token de resume.

### Participantes e instrumentos

- **Jogador A:** inicia e mantém a canalização; depois executa movimentos ou recebe dano.
- **Jogador B:** observa o estado replicado, tenta disputar o terminal, interrompe A com dano e testa a retomada após cancelamento.
- **Observador/operador (opcional):** registra horário, sala, região, build, RTT e evidências sem enviar inputs de gameplay.
- Usar dois navegadores ou dispositivos separados. Após a rodada desktop-desktop, repetir os fluxos de interação com pelo menos um cliente touch, validando o botão de interação e o HUD.
- Guardar gravação de tela dos dois lados, horário sincronizado, `roomId`, região, terminal, versão do cliente/servidor, RTT observado e a sequência de ações. Remover ou mascarar nomes pessoais e não registrar credenciais, cookies, JWTs ou tokens.

### Pré-verificações

1. Confirmar que cliente e servidor correspondem ao commit sob teste e que o ambiente é descartável.
2. Executar `npm --prefix game-runtime test` e `node --test game-runtime/test/server3d.test.js` antes da sessão. A suíte de integração atual cobre login, matchmaking, snapshots e anti-cheat, mas usa um humano mais bots; ela não substitui este teste de concorrência com dois humanos.
3. Confirmar `/healthz` e `/readyz` saudáveis; registrar conexões, sala e região. Não começar durante deploy, manutenção ou saturação do servidor.
4. Fazer uma rodada sem canalização para confirmar que ambos os clientes recebem snapshots de movimento e que não há problemas de login, áudio, input ou renderização.
5. Definir uma seed de teste, se suportado pelo ambiente, e registrar o terminal escolhido sem editar posições ou geometria canônicas.
6. Registrar o estado inicial de XP e KRC exibido a cada participante; os valores de economia devem permanecer inalterados por esta feature.

## 3. Matriz de cenários

| ID | Cenário e procedimento | Resultado esperado / evidência |
|---|---|---|
| MP-ZEX-01 | **Conclusão normal.** A e B ficam junto ao mesmo terminal. A pressiona Interagir uma vez, solta o controle e permanece parado por mais de quatro segundos. B observa sem interagir. | Um único início; progresso de A cresce até concluir; B vê o terminal ocupado/progresso; o terminal fica inativo ao concluir; `extracted` aumenta uma vez e XP sobe exatamente 250; um único feedback de conclusão; nenhuma concessão adicional após aguardar mais 10 s. |
| MP-ZEX-02 | **Disputa simultânea.** A e B enviam Interagir no mesmo terminal, tão próximos no tempo quanto possível; repetir 10 vezes, alternando quem envia primeiro. | Exatamente um jogador reserva o terminal. O outro recebe feedback de ocupado, não inicia uma canalização paralela e não recebe XP. A ordem do vencedor pode depender da ordem em que o servidor processa os inputs, mas nunca pode haver dupla conclusão ou dupla recompensa. |
| MP-ZEX-03 | **Progresso replicado e late state.** A começa; B observa snapshots durante a canalização. Se a sala permitir que B reconecte sem abandonar a partida, reconectar B e observar o estado recebido. | O estado autoritativo do terminal e o percentual percebido por B correspondem ao de A; o progresso não retrocede nem fica permanentemente preso. No caso de reconexão, o snapshot deve refletir o estado atual de acordo com a regra de desconexão definida no cenário MP-ZEX-08. Salvar mensagens/snapshots sem tokens. |
| MP-ZEX-04 | **Câmera sem deslocamento.** A inicia e gira a câmera/mira, sem transladar o personagem, até a conclusão. | Girar a câmera não cancela. O HUD continua mostrando a canalização e o terminal só é consumido na conclusão. |
| MP-ZEX-05 | **Movimento interrompe.** A inicia; antes do término, desloca-se deliberadamente mais que 0,75 m (recomendado: cerca de 0,9–1,0 m para evitar ambiguidade de medição de rede). B tenta iniciar novamente após o cancelamento. | O servidor cancela sem XP/extração; terminal permanece ativo e a reserva é liberada; A vê feedback de interrupção; B consegue iniciar uma nova canalização. Registrar também pequenos ajustes de posição inferiores ao limite como observação, sem usar a rodada manual para substituir o teste unitário exato de fronteira. |
| MP-ZEX-06 | **Dano interrompe.** A inicia; B acerta A com um disparo confirmado ou outra fonte controlada de dano. Repetir com um disparo que erra para distinguir tentativa de dano aplicado. | Dano efetivamente aplicado cancela imediatamente, sem XP, e libera o terminal. Um disparo que não causa dano não deve ser tratado como “dano recebido”. B pode retomar após a liberação. Guardar o delta de vida e o evento/snapshot correspondente. |
| MP-ZEX-07 | **Nocaute, morte e fim de partida.** Iniciar a canalização e então nocautear/eliminar A. Em outra rodada, encerrar a sala enquanto há canalização ativa, se o ambiente de teste permitir fazê-lo de forma segura. | Canalização cancelada, sem XP; nenhuma reserva fica órfã. O terminal continua disponível se a sala continuar e outro jogador puder alcançá-lo. Ao terminar a sala, nenhum estado de canalização pode conceder recompensa posteriormente. |
| MP-ZEX-08 | **Queda de conexão e resume.** A inicia a canalização; interromper a conexão WebSocket de A por 2–5 s e tentar reconectar com o resume token dentro da janela documentada de 15 s. B tenta usar o terminal durante e após a queda. Repetir deixando a sessão expirar. | **Critério de produto:** uma desconexão deve cancelar e liberar imediatamente a reserva, sem XP; o reconnect não deve restaurar uma canalização cancelada. B deve conseguir iniciar durante a ausência de A. A rodada após expiração também não pode deixar reserva órfã. Registrar separadamente comportamento observado durante a janela de resume. Este cenário é bloqueante e tem o risco de implementação descrito na seção 6. |
| MP-ZEX-09 | **Latência e jitter.** Repetir conclusão e interrupção em rede normal e, apenas em ambiente isolado, com latência/jitter/perda moderados aplicados a um cliente. Começar com 100–150 ms RTT; uma rodada exploratória pode usar até 2% de perda. | O servidor permanece autoritativo: nenhum cliente conclui antes do servidor, concede XP localmente, duplica recompensa ou mantém estado divergente após os snapshots voltarem. O relógio do canal deve ser medido por eventos/estado do servidor, não pelo relógio do navegador. Registrar RTT, jitter/perda e atraso visual. |
| MP-ZEX-10 | **Prioridade de interação e ações paralelas.** Repetir perto de loot/porta, quando a geometria canônica oferecer sobreposição de alcance; durante outra rodada, observar se mirar, disparar, recarregar ou usar item é possível durante a canalização. | A prioridade existente entre porta, loot e terminal continua intacta; a interação não deve iniciar o terminal por engano. A rotação de câmera deve funcionar. O contrato MVP não define explicitamente se disparar/usar outros itens cancela ou é permitido: registrar o comportamento e encaminhar eventual decisão de balanceamento, sem reprovar por uma regra não aprovada. |
| MP-ZEX-11 | **Clientes mistos.** Repetir início, cancelamento por movimento e disputa com um cliente desktop e outro touch/mobile compatível. | O toque inicia somente uma vez; o botão virtual libera corretamente; a barra/texto de progresso, feedback de terminal ocupado e confirmação/cancelamento são legíveis e coerentes nos dois clientes. O servidor produz o mesmo resultado da rodada desktop. |

### Ordem recomendada

1. MP-ZEX-01 e MP-ZEX-04 para estabelecer a experiência base.
2. MP-ZEX-02 e MP-ZEX-03 para concorrência e consistência de snapshots.
3. MP-ZEX-05, MP-ZEX-06 e MP-ZEX-07 para interrupções e liberação da reserva.
4. MP-ZEX-08 como gate antes de qualquer aprovação de release.
5. MP-ZEX-09 e MP-ZEX-10 como robustez/balanceamento.
6. MP-ZEX-11 para compatibilidade touch.

Executar pelo menos **10 repetições** de MP-ZEX-01 e MP-ZEX-02, e pelo menos **5 repetições** de cada interrupção. Alternar os jogadores que iniciam e os clientes desktop/touch. Após qualquer falha, conservar a evidência, não limpar o estado antes de registrar o `roomId`/terminal/progresso, e repetir apenas depois de classificar a causa.

## 4. Critérios de aprovação

A feature está pronta para aprovação de playtest quando todos os itens abaixo forem verdadeiros:

1. Não há falha nos cenários críticos de conclusão, concorrência, movimento e dano nas repetições definidas.
2. Toda decisão de recompensa/consumo vem do servidor: zero recompensa antecipada, duplicada ou concedida após cancelamento; conclusão válida concede exatamente 250 XP uma única vez.
3. Depois de qualquer cancelamento, o terminal permanece utilizável, sua reserva é liberada e outro jogador consegue assumir sem reiniciar a sala.
4. Todos os clientes convergem para o mesmo estado do terminal e do canal após snapshots; não há HUD permanentemente preso nem terminal visualmente livre enquanto ainda reservado no servidor.
5. A conclusão ocorre após quatro segundos de tempo autoritativo, considerando a granularidade do tick de 20 Hz; não exigir que a animação/percentual local e a confirmação visual cheguem no mesmo frame sob latência.
6. Ações permitidas e o contrato de desconexão ficam documentados; nenhuma hipótese de UX ainda não decidida é apresentada como regra aprovada.
7. KRC, itens e saldos persistentes não mudam; portas/loot/prioridade de interação e regras espaciais canônicas permanecem intactos.
8. MP-ZEX-08 passa. Se não passar, a feature não deve ser marcada como concluída para multiplayer real até corrigir o ciclo de vida ou aprovar formalmente uma regra diferente para a janela de resume.

## 5. Dados e relatório da sessão

Para cada tentativa, registrar: ID do caso, commit/build, `roomId`, região, terminal, identidade de teste anonimizada (A/B), plataforma/navegador, horário de início/fim, RTT observado, ação/interrupção, progresso visto por cada cliente, estado final do terminal, delta de XP/extracted, mensagens/eventos relevantes e resultado PASS/FAIL/BLOCKED. Associar captura de tela ou vídeo quando houver divergência de HUD.

Não anexar credenciais, tokens, cookies, IDs pessoais ou dumps integrais de rede com dados sensíveis. O relatório final deve separar: falhas de regra autoritativa, atraso/perda de atualização visual, problemas de autenticação/infraestrutura e observações de balanceamento.

## 6. Risco conhecido a verificar antes da liberação

No código atualmente revisado, `server/server.js` salva um resume token válido por 15 segundos no evento WebSocket `close`, mas esse handler não chama `room.removePlayer()`. O método `MatchRoom3D.removePlayer()` libera a reserva ZEX quando é chamado, porém a busca atual não encontrou ligação desse método ao fechamento do socket no runtime. Assim, o comportamento de desconexão descrito na especificação pode não estar conectado ao ciclo real de rede: o ator pode permanecer na sala durante a janela de resume, e o terminal pode continuar reservado.

Por isso, MP-ZEX-08 é um **gate de validação**, não um caso presumido como aprovado. Antes de declarar a feature pronta para partidas multiplayer reais, confirmar o comportamento com dois clientes no ambiente isolado e, se a reserva não for cancelada/liberada como esperado, abrir a correção do ciclo de vida da sessão e repetir o cenário. Não contornar a falha removendo manualmente o ator durante a medição.

## 7. Registro da execução inicial — 2026-11-02

### Suítes automatizadas locais

Comando executado em `game-runtime`:

```bash
node --test test/sim3d.test.js test/room3d.test.js test/server3d.test.js
```

**Resultado: 41 testes aprovados, 0 falhas, 0 ignorados.** A cobertura confirma a conclusão/cancelamento na simulação local, conclusão e disputa na `MatchRoom3D`, e o E2E existente de login/matchmaking/WebSocket 3D. O teste E2E existente usa um humano mais bots; portanto, sozinho, não representa dois jogadores humanos.

### Simulação local com dois WebSockets autenticados

Foi iniciada uma sala descartável no servidor local com dois clientes autenticados em sockets distintos e no mesmo `roomId`; os bots foram neutralizados apenas nesse harness para isolar o ciclo ZEX. A disputa concorrente passou: A reservou o terminal e B não iniciou uma segunda canalização.

**MP-ZEX-08 falhou.** A queda do socket de A foi observada com progresso em 6,25%. Após 250 ms, `zexChannel` continuava ativo e `channelerId` ainda apontava para A. Sem reconexão, o servidor concluiu o canal e consumiu o terminal; o estado direto da sala mostrou `extracted = 1` e delta de XP `+250` para o jogador desconectado. Isso contradiz o critério de cancelamento por desconexão e confirma que a reserva não é liberada pelo fechamento do socket.

### Reteste confirmatório — 2026-11-02, commit `b1a7300`

A branch não continha uma correção de código desde a primeira rodada. O mesmo harness local com dois WebSockets foi executado novamente: sala compartilhada e disputa exclusiva passaram; no fechamento do socket, a canalização continuou ativa após 250 ms e concluiu depois, consumindo o terminal e concedendo novamente `+250 XP` ao ator desconectado. **Resultado: MP-ZEX-08 continua FAIL/BLOCKED; a correção ainda não foi validada.**

### Reteste após correção — 2026-11-02, commit `5f14992`

A sala 3D agora expõe um cancelamento ZEX específico para desconexão de transporte; o handler `close` o invoca sem remover o ator da sala, preservando o resume de 15 segundos. O novo teste E2E usa duas sessões autenticadas e valida cancelamento em até 1 segundo, zero XP/extração, liberação do terminal para B e resume de A com o evento `extractCancelled` e sem canal ativo.

**MP-ZEX-08: PASS em simulação local.** O teste `server 3D: MP-ZEX-08 cancela canal na desconexão e preserva resume` passou, assim como a suíte completa: 996 testes, 983 aprovados, 0 falhas e 13 ignorados. Verificações `node --check` e `git diff --check` também passaram.

### Limites e próximo passo

O MP-ZEX-08 passou no servidor local; ainda não houve playtest em staging, dispositivos separados, jitter/perda de rede, observação visual do HUD ou serviços reais. Nenhum teste foi executado em produção. Prosseguir com os demais cenários da matriz em staging isolado; repetir MP-ZEX-08 também nesse ambiente antes da liberação multiplayer.
