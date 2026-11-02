# Emenda GDD-03A-03 — Campanhas de Incursões Especiais e retorno

**Versão:** 0.1 — 1º de novembro de 2026<br>
**Documento-base:** GDD-03A e Emenda 02 — Ring de 100 participantes<br>
**Status:** a composição de vagas 90/até 10 foi definida pelo criador; gatilhos, seleção online e critérios de retorno abaixo são uma proposta técnica para validar em playtest antes de produção.<br>
**Código de domínio:** `server/game/specialIncursion.ts`; testes: `tests/official/special-incursion.test.ts`.

## 1. Regra de composição definida pelo criador

Uma CIE pode reunir até 100 participantes: **90 vagas reservadas exclusivamente a sobreviventes ativos** e **até 10 vagas para jogadores já eliminados**. Eliminados nunca podem ocupar uma das 90 vagas reservadas a sobreviventes; sobreviventes não podem ocupar as vagas reservadas a eliminados. Se houver menos de dez eliminados elegíveis, as vagas restantes ficam vazias: a CIE começa com 91 a 99 participantes quando houver de um a nove retornantes. Esta política mantém a divisão sem deslocar nenhum grupo.

Uma CIE com retorno só abre quando há pelo menos 90 sobreviventes ativos e online e pelo menos um eliminado online elegível. Sem esse quórum, não se forma um Ring parcial com menos de 90 sobreviventes e não se auto-selecionam usuários offline.

## 2. Gatilhos técnicos para abrir uma CIE surpresa

O serviço de eventos mantém um agendamento secreto do lado do servidor; a hora exata não é exposta no calendário do cliente. A CIE fica elegível para abertura quando **todas** as condições abaixo forem verdadeiras:

1. A janela regular de incursão do dia (12 horas em UTC) já fechou.
2. O dia da campanha é de 1 a 6. Não se pode devolver um eliminado ao mesmo ciclo depois do Dia 7.
3. A hora secreta de disparo configurada pelo serviço chegou; apenas o backend pode criar ou alterar esse agendamento.
4. Não existe Ring regular em andamento nem CIE ativa.
5. Não houve outra CIE naquele dia de campanha.
6. Há pelo menos 90 sobreviventes elegíveis e online, mais pelo menos um eliminado online elegível.

Quando as condições são atendidas, o servidor anuncia a abertura aos jogadores online e inicia uma inscrição de **3 minutos**. O anúncio no momento da abertura — e não a divulgação prévia de horário — preserva o caráter surpresa. O serviço reavalia as condições a cada 30 segundos por até 30 minutos após o horário agendado; sem quórum ou com Ring regular ainda ativo depois desse prazo, marca o evento como expirado e não consome tentativa nem progresso. Frequência e horários são configuração do serviço de conteúdo, sem chance aleatória fixa no código.

### Estados e idempotência

`SCHEDULED → ARMED → REGISTRATION → LOCKED → IN_PROGRESS → RESOLVING → COMPLETED`, com saídas `EXPIRED` ou `CANCELLED`. Aplicar índices únicos por campanha/dia/evento, por evento/jogador e por retorno campanha/jogador. A inscrição fica irrevogável depois de aceita; retries da seleção e do resultado retornam o mesmo roster/resultado já persistido. Cada resultado da CIE deve ser gravado numa transação antes da notificação ao cliente.

## 3. Elegibilidade e formação do roster

- **Sobreviventes:** conta autenticada com estado ativo (`READY` para a próxima etapa regular), não eliminada nem já comprometida com outro Ring, conectada no instante de fechamento do roster e inscrita durante os três minutos. Se houver mais de 90 elegíveis, selecionar 90 por sorteio auditável com seed CSPRNG do servidor; os demais continuam sobreviventes e mantêm a etapa.
- **Eliminados:** conta autenticada que esteja eliminada na campanha, ainda não tenha usado retorno e esteja online e inscrita no mesmo período. Selecionar no máximo dez; havendo excesso, usar sorteio auditável com seed do servidor.
- Um participante desconectado depois do lock mantém a vaga e não é removido por timeout do cliente. Seu avatar fica sem comandos e sujeito às mesmas regras de dano/eliminações; reconectar não cria outra vaga.
- Uma vez registrada, a inscrição não pode ser cancelada pelo jogador. CIE não usa preenchimento automático de offline nem modifica a composição 90/até10.
- O roster não consome a tentativa diária regular do sobrevivente. A CIE usa instância/ID próprios e não altera placement ou recompensas do Ring regular.

## 4. Resolução e retorno dos eliminados — proposta

Cada CIE usa o combate de Battle Royale do servidor, com fim quando resta um sobrevivente ou no limite de 10 minutos. A colocação final é autoritativa. Um jogador eliminado só retorna à campanha atual se ainda não tiver usado retorno, a CIE ocorrer nos Dias 1–6 e cumprir **uma** destas condições:

1. **Resultado:** terminar entre as dez primeiras posições gerais da CIE; ou
2. **Item de evento:** carregar o item vinculado e intransferível `SELO_RETORNO_CIE` no encerramento **e sobreviver** até o fim do evento.

O token não é negociável nem conversível em dinheiro; sua quantidade e a forma de obtê-lo ficam na tabela de objetivos/loot de cada evento, limitadas a no máximo dez permissões de retorno. Um participante eliminado que termine fora do top 10 sem o selo (ou morra carregando-o) continua eliminado. A concessão deve ser atômica e idempotente: uma única chave `campaign_id + player_id` impede múltiplas revives.

O retorno ocorre **para a próxima etapa regular**, não para o Ring já encerrado: por exemplo, um retorno concedido após CIE do Dia 3 habilita o Dia 4. Não reabre dias passados, não duplica XP/placement e não restaura progresso retroativo. O estado passa de `ELIMINATED` para `READY` com `returnUsed=true`; no próximo Ring usa o perfil normal de entrada do modo, definido por tuning aprovado. Não há ressurreição no meio da CIE.

CIEs após a conclusão do Dia 7 podem existir como eventos pós-campanha, mas não reabrem a disputa encerrada nem alteram elegibilidade para o prêmio da campanha concluída. Retorno por CIE não constitui por si só promessa, garantia ou pagamento dos “U$1 milhão”. Não habilitar transferência, saque ou recompensa em dinheiro real.

### Risco dos sobreviventes ativos

Proposta para manter o caráter de combate e a aposta da CIE: sobrevivente ativo que morrer na CIE passa a `ELIMINATED` na campanha; se sobreviver, mantém seu progresso/etapa e segue para a próxima incursão regular. A CIE não concede avanço extra. Esta consequência é uma decisão de design proposta e deve ser confirmada, pois o criador ainda não especificou se participar da CIE põe em risco o legado regular.

## 5. Persistência e segurança necessárias

Persistir `cie_event`, `cie_signup`, roster/role, seed, estado de presença observado no lock, resultados, claims do Selo e retorno aplicado. O lock de roster deve ser transacional, e o serviço deve usar presença distribuída/lease — não inferir “online” de um socket local quando o jogador pode estar conectado em outro nó. Selos e resultados são concedidos pelo servidor, nunca aceitos do cliente como prova suficiente. A notificação de abertura e resultado deve ser persistida; WebSocket/push é transporte, não fonte de verdade.

Os resultados de CIE têm chave própria e não podem sobrescrever `match_results` do Ring regular nem pagar duas vezes. Se um servidor cair em `IN_PROGRESS`, recuperação, anulação ou continuação dependem do snapshot persistido do match; não marcar retorno nem eliminação até uma resolução autoritativa.

## 6. Propostas de balanceamento para aprovação

- Uma CIE de retorno por dia, no máximo, em dias 1–6.
- Disparo secreto pós-janela regular; janela de inscrição de 3 minutos.
- Reavaliação de gates por 30 minutos, a cada 30 segundos; se não houver quórum, expira sem custo.
- Top 10 geral ou Selo + sobrevivência como caminhos de retorno; no máximo um retorno por pessoa na campanha.
- Morte de sobrevivente ativo na CIE o elimina da campanha regular.
- Selo de retorno vinculado, sem transferência ou valor monetário.
- Vagas de eliminados não usadas ficam vazias; não se aumenta a cota sobrevivente além das 90 vagas reservadas.

Esses parâmetros estão no protótipo de domínio, mas não ativam eventos no jogo. Validar em playtest a frequência real, o valor do retorno e o impacto de uma CIE de 91–100 participantes antes de conectar ao matchmaking e à economia.

## 7. Gates técnicos antes do end-to-end

A máquina pura e os testes cobrem decisões e fronteiras, não execução em produção. Ainda é preciso implementar: scheduler secreto server-side; presença multi-nó; tabelas e locks PostgreSQL; inscrição/seleção transacional; sala CIE distinta; avatares e reconexão; objetivos/loot de `SELO_RETORNO_CIE`; transição de status de eliminados/sobreviventes; inbox/push; UI e validação de load; monitoramento, anti-abuso e builds/clientes Unreal. Manter CIE desabilitada até finalizar esses itens e aprovar as propostas da seção 6.
