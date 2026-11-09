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

### Fase 48 — MP-ZEX-04 e MP-ZEX-07 automatizados localmente (2026-11-03)

Os dois cenários restantes que não exigiam staging ganharam testes determinísticos (detalhes em [FASE48_FIDELIDADE_ACOUSTICA_MPZEX_LOCAL.md](FASE48_FIDELIDADE_ACOUSTICA_MPZEX_LOCAL.md)):

- **MP-ZEX-04** (`test/sim3d.test.js`): 2 s de rotação pura de câmera (yaw 0..2π, pitch oscilante, sem translação) NÃO cancelam o canal; conclusão ao girar concede XP exatamente uma vez.
- **MP-ZEX-07** (`test/room3d.test.js`, 3 testes): nocaute (sala squad/DBNO) cancela o canal, libera a reserva e outro jogador assume sem reiniciar a sala; o ciclo nocaute→morte produz EXATAMENTE UM `extractCancelled` (o cancelamento real é reason `damage`, no tick do dano — `knocked`/`death` são defense-in-depth); o fim de partida cancela todos os canais sem XP, sem consumir terminal e sem reserva órfã.

Descoberta registrada: o cancelamento por dano precede o nocaute no MESMO tick (1ª linha de `#damage`), portanto o evento observado é sempre `damage` — o contrato §4.2 (zero dupla concessão) passou a ser provado por asserção de cardinalidade. Suíte: 1041 pass / 0 fail / 13 skipped.

Superfície manual restante da matriz: MP-ZEX-08 (gate staging), MP-ZEX-09 (latência/jitter), MP-ZEX-10 (prioridade de interação), MP-ZEX-11 (clientes mistos/touch) — todos exigem staging isolado com dois clientes humanos.


### Automação do MP-ZEX-08 em staging — 2026-11-06

Foi adicionado `game-runtime/scripts/run-mp-zex-08-staging.mjs`, que autentica duas contas de teste, entra em uma partida 3D pela fila normal, alcança o terminal com inputs de movimento (sem teleporte/debug), inicia o canal, encerra abruptamente o WebSocket de A, verifica liberação para B e retoma A dentro da janela de resume. Tokens e credenciais não são impressos. O teste cria uma partida temporária; executar somente em staging isolado com contas descartáveis, nunca em produção.

O workflow `.github/workflows/mp-zex-08-staging.yml` roda em PRs para `main` quando os arquivos relevantes mudam e também permite `workflow_dispatch`. Usa o GitHub Environment `staging`, serializa execuções para não interromper uma partida em andamento e falha antes da autenticação se qualquer configuração obrigatória estiver ausente. Se o Environment exigir aprovação, o job aguardará essa aprovação no GitHub.

Configuração exigida no **GitHub Environment `staging`** (adicionar os valores diretamente nas configurações do GitHub, nunca no chat):

- Secrets: `KR_STAGING_BASE_URL`, `KR_STAGING_TEST_USER_A`, `KR_STAGING_TEST_PASSWORD_A`, `KR_STAGING_TEST_USER_B`, `KR_STAGING_TEST_PASSWORD_B`.
- `KR_STAGING_BASE_URL` deve ser HTTPS e apontar para um host que identifique staging (`stage`/`staging`). Para domínio de staging customizado sem esse rótulo, definir a variável não secreta `KR_STAGING_ALLOW_CUSTOM_HOST=true` no Environment/repositório, somente depois de confirmar o destino.
- As duas contas devem ser distintas, descartáveis e autorizadas a autenticar no staging. O workflow não cria nem altera secrets e não lê seus valores fora do job de teste.

**Validação local em `main` — 2026-11-06:** MP-ZEX-08 passou com um servidor local em `localhost` e as contas dev locais fictícias: A iniciou o canal, a queda liberou o terminal, B reservou-o e A retomou sem XP/extração. Isso não é resultado de staging; o playtest remoto continua pendente até o Environment estar configurado e o workflow concluir com sucesso.

**Suíte da base `main` (`8b9044c`) nesta rodada:** 1.077 aprovados, 1 falha, 13 ignorados. A falha reproduzida isoladamente é o teste preexistente `room3d: tiro mata alvo com crédito, xp/krc, killfeed e eventos`, na asserção `p1.krc >= 250 + KILL_KRC`; nenhum código de economia foi alterado nesta tarefa. Registrar e tratar essa falha separadamente, sem classificá-la como falha do harness ZEX.


### Retomada local após auditoria KRC — 2026-11-06

**Correção da suíte KRC (base `7e30b37`, commit `33c1cf6`, PR #301):** a falha era uma asserção desatualizada, não um erro no crédito de produção. No cenário CIGKV, `krcMultiplier = 0,5`; com saldo inicial 250, a rodada concede 3 KRC pelo nocaute (`round(5 × 0,5)`) e 8 pelo abate final (`round(15 × 0,5)`), terminando em 261. O teste antes exigia pelo menos 265. A asserção agora valida os dois valores escalados, o saldo exato e os payloads `knock`/`kill`; nenhum código ou saldo de economia foi alterado.

**Suíte completa local:** `npm test` — 1.093 testes, 1.080 aprovados, 0 falhas e 13 ignorados. O teste KRC passou isoladamente; a suíte `room3d.test.js` passou 30/30 antes da adição das duas regressões MP-ZEX-10, que também passaram. `node --check test/room3d.test.js` e `git diff --check` passaram.

**MP-ZEX-09 — validação local parcial:** passaram cinco verificações automatizadas: RTT com clamp, lag compensation (acerto na posição rebobinada e rejeição da posição atual), cálculo adaptativo de delay e jitter de chegada sintético no `NetClient3D`. Isso valida componentes de netcode, mas **não** aplica RTT de 100–150 ms nem perda de pacotes a uma partida ZEX real; o cenário de rede degradada permanece pendente em ambiente isolado.

**MP-ZEX-10 — prioridade de interação local:** adicionadas duas regressões com sobreposição temporária apenas em memória: porta vence loot e terminal em empate; loot vence terminal em empate. Ambas passaram e não alteram geometria canônica. No layout CIGKV da seed `TESTE-3D`, as distâncias mínimas observadas dos terminais foram 48,99 m até uma porta e 34,59 m até loot ativo, portanto essa fixture não oferece sobreposição espacial natural. Observacionalmente, disparar, recarregar e usar medkit não cancelaram o canal; como o contrato de produto ainda não define essas ações, o comportamento fica registrado sem ser aprovado ou reprovado.

**MP-ZEX-11 — validação local parcial:** passou o teste de controles touch/joystick do HUD. Ele valida eventos touch e joystick em DOM simulado; não valida o botão ZEX em um dispositivo/browser touch, a legibilidade visual durante o canal nem uma sessão com clientes desktop e mobile mistos.

**Limite da rodada:** secrets de `staging` não foram configurados e o usuário optou por prosseguir localmente; nenhum endpoint remoto foi acessado. MP-ZEX-08 continua pendente de execução em staging e permanece gate para aprovação multiplayer real. Os resultados desta seção são locais/sintéticos e não substituem os cenários reais MP-ZEX-08/09/11.


**Atualização do baseline:** a falha KRC descrita na referência imediatamente anterior foi resolvida no teste local conforme esta auditoria; a contagem posterior é 1.093 testes, 1.080 aprovados, 0 falhas e 13 ignorados. O commit `33c1cf6` está publicado na branch `fix/test-krc-scenario-reward` e submetido na [PR #301](https://github.com/Nexus-HUB57/Khaaos_Run/pull/301).

### MP-ZEX-09 em ambiente isolado — partida real com rede degradada (2026-11-09, PR em aberto)

A pendência registrada acima ("cenário de rede degradada permanece pendente em
ambiente isolado") está fechada: `game-runtime/scripts/run-mp-zex-09-degraded.mjs`
executa o cenário completo contra um servidor autoritativo REAL, sem nenhum
endpoint de debug/teleporte (mesma doutrina do MP-ZEX-08) e com os inputs
limitados a gameplay. A degradação é aplicada a UM cliente (A) via
`game-runtime/scripts/mp-zex-09-link.mjs`: RTT nominal de 130 ms (65 ms por
sentido ± 30 ms de jitter) com "perda" de ~2% modelada como picos de
retransmissão de +200–400 ms — WebSocket/TCP não descarta quadros; a perda se
manifesta na aplicação exatamente como esses picos. O RTT medido (ping/pong
ecoado pelo servidor, mediana de 7 amostras) é reportado no campo `rtt` do
input, exercitando a lag compensation real da Fase 3.

**Desenho das fases** (CIGKV tem 3 terminais em distritos; A fica no leste, B
no oeste; o snapshot de terminais é global, então cada cliente observa o
terminal do outro à distância):

1. **B, rede normal** — interrupção: canaliza, a conexão cai, o terminal libera
   sem XP e o resume preserva `extractCancelled/disconnect`; conclusão na
   sequência → baseline D = +250 XP, canal de 3,97 s medido por estado do
   servidor (progresso × `ZEX_CHANNEL_SECONDS`, sem relógio de cliente).
2. **A, rede degradada** — interrupção: canaliza sob RTT mediano de ~130 ms, o
   link morre com quadros em voo, e NENHUM quadro atrasado ressuscita o canal;
   resume confirma zexChannel nulo, zero XP, zero extração.
3. **A, rede degradada** — conclusão: XP degradada == D (+250, recompensa
   única), extração +1, canal de ~3,7–4,0 s por estado do servidor, atraso
   visual B→A (56–185 ms) dentro do bound p95 do link, nenhum input rejeitado,
   e pós-`drain()` o estado de A converge com o de B (terminal, extrações, XP).

**Ferramental novo:** `DegradedLink` (fila FIFO com timer serializado por
direção — o jitter nunca reordena quadros, semântica TCP) com 4 regressões em
`game-runtime/test/mp-zex-09-link.test.js`; workflow
`.github/workflows/mp-zex-09-degraded.yml` executa o cenário em servidor local
isolado (sala de capacidade 2 = zero bots, navegação determinística) a cada PR
que tocar `room3d.js`/`server.js` ou o próprio cenário. Evidência completa em
`artifacts/mp-zex-09/evidencia-e2e-completa.log`.

**Achados de execução** (registrados como lições, nenhum contrato alterado):
o heap de A* transcrito no rascunho do 08 perdeu a linha `heap[i] = tail` do
sift-down e drenava a busca ("sem rota" fantasma) — substituído por MinHeap com
trocas; eventos de jogo (`extract`/`extractCancelled`) não são mensagens WS,
são drenados dentro de `snapshot.events` a cada tick; a sessão de resume só
existe após o close da conexão anterior; e uma queda DURANTE o canal deixa o
`interactLatch` do ator preso — a primeira tecla E pós-resume é engolida e o
cliente precisa re-pressionar (comportamento registrado, não alterado).

**Limite remanescente:** esta validação cobre o ambiente isolado exigido pelo
plano; a repetição em staging com dois dispositivos reais (e o MP-ZEX-08 em
staging, gate de release) permanece dependente dos secrets do environment
`staging`, ainda não configurados.

### MP-ZEX 08+09 em staging — despacho único (2026-11-09)

O limite remanescente acima fica resolvido em mecânica: o workflow
**"MP-ZEX 08+09 — Despacho único em staging"**
(`.github/workflows/mp-zex-staging.yml`) executa, em UM `workflow_dispatch`
e contra o MESMO staging real (environment `staging`):

1. **MP-ZEX-08** (`run-mp-zex-08-staging.mjs`) — gate de release: duas contas
   reais na mesma sala, navegação só com inputs de gameplay (A* com margem de
   quina reforçada e manobra de desimpedimento estilo jogador — sidestep +
   hop — quando o ator trava >3 s; logs de progresso a cada 2,5 s), queda
   abrupta do socket, liberação para B e resume sem XP.
2. **MP-ZEX-09** (`run-mp-zex-09-degraded.mjs` em modo remoto,
   `KR_ZEX09_BASE_URL`) — o mesmo par de contas com o **DegradedLink** no
   cliente A (RTT nominal 130 ms ± jitter, "perda" ~2% como picos de
   retransmissão): interrupção degradada não ressuscita o canal, conclusão
   degradada paga XP igual ao baseline, atraso visual B→A dentro do bound
   p95 e convergência pós-drain.

Os jobs são SERIAIS (uma partida de teste por vez no staging) e exigem os 5
secrets `KR_STAGING_*` no environment `staging` — provisionados por
`scripts/staging/setup_staging_secrets.sh`; protocolo completo em
docs/MPZEX_STAGING_DISPATCH.md. A auditoria contínua do ambiente (secrets,
runner, variáveis, EULA) é `node scripts/eos/p0_gate.mjs`.

Ensaios locais idênticos aos contratos do despacho:
`node game-runtime/scripts/mpzex-staging-selftest.mjs` →
`MPZEX_STAGING_SELFTEST_OK` (servidor autoritativo real isolado; log de
evidência em `artifacts/mp-zex-staging/`). A validação de env compartilhada
(HTTPS fora do loopback, host de staging, contas distintas) ganhou regressões
em `game-runtime/test/mpzex-staging-env.test.js`.

**Superfície manual restante após este passo:** apenas MP-ZEX-10
(prioridade de interação — decisão de balanceamento) e MP-ZEX-11
(clientes mistos desktop/touch — hardware real).
