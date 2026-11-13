# Emenda GDD-03A-02 — Ring de 100, corte de 10 minutos e CIE

**Versão:** 0.1 — 1º de novembro de 2026<br>
**Base:** GDD-03A v0.2 e Emenda GDD-03A-01<br>
**Status:** formalização das regras novas fornecidas pelo criador do Khaaos Run; parâmetros não definidos estão explicitamente marcados como pendentes.<br>
**Código relacionado:** `server/game/campaignProgression.ts`, `server/game/specialIncursion.ts` e suas suítes de teste.

> As regras técnicas propostas para CIE e retorno de eliminados foram detalhadas na [Emenda GDD-03A-03](GDD_03A_EMENDA_03_CIE_E_REGRESSO.md); os eventos permanecem desligados até os parâmetros de balanceamento serem aprovados e integrados.

> Esta emenda substitui, para novas implementações, o corte top-20% e a vaga única para menos de cinco sobreviventes descritos na Emenda 01. A Emenda 01 permanece como histórico e não é o regulamento atual da campanha.

## 1. Regras de formação do Ring

1. Cada incursão regular de campanha é formada por **100 participantes**.
2. Ao abrir a convocação, o sistema recebe inscrições por até **3 minutos**. Se cem jogadores se inscreverem antes, a formação fecha imediatamente. A inscrição é irrevogável pelo jogador; não existe comando de desistência depois de inscrito.
3. Se a janela terminar com menos de cem inscritos, o servidor completa as vagas por seleção aleatória entre os demais sobreviventes elegíveis da campanha, **online ou offline**. O backend gera um seed de alta entropia com CSPRNG, usa-o para produzir a ordem determinística do sorteio e persiste seed e roster; não aceitar seed ou resultado enviado pelo cliente. O sorteio não pode repetir IDs. A lista selecionada passa a integrar o Ring sem exigir que o jogador esteja conectado.
4. Uma proteção Ring ativa exclui o sobrevivente **do sorteio automático**. A proteção não cancela inscrição já realizada nem remove uma pessoa de um Ring cuja formação já fechou.
5. O Ring **não pode começar com menos de cem**. Se, depois de excluir jogadores protegidos e os já inscritos, não houver sobreviventes elegíveis suficientes para completar a capacidade, o Ring permanece pendente; não se reduz o roster silenciosamente.
6. Um jogador sorteado offline é incluído como avatar sem comandos de jogador, permanece imóvel e pode ser eliminado normalmente. O servidor deve registrar uma notificação persistente para que a seleção seja visível no próximo acesso. A implementação de push do sistema operacional depende de credenciais/provedor de notificação e não é presumida por esta emenda.

### Questão operacional pendente: pool insuficiente

O criador definiu que a campanha só começa com 100 participantes, mas não definiu como encerrar uma convocação se o pool elegível continuar abaixo de 100. A regra técnica provisória é **falhar fechado**: não iniciar um Ring parcial nem consumir uma etapa; preservar as inscrições e sinalizar `WAITING_FOR_ELIGIBLE_SURVIVORS` para o operador. Antes de produção, aprovar se a convocação aguarda até haver pool, expira no fechamento da janela UTC ou é cancelada pelo operador. A liberação de inscritos não pode ser inventada pelo cliente.

## 2. Duração e classificação do Ring

- Um Ring termina quando resta **um único sobrevivente** ou quando seu cronômetro atinge **10 minutos**, o que ocorrer primeiro.
- No encerramento, o servidor congela a lista do grupo e calcula uma única classificação autoritativa. HP, XP, batalhas, abates, mortes e sobrevivência não podem ser informados ou alterados por payload do cliente.
- Nos Dias 1–6, se houver de **1 a 10 sobreviventes**, todos avançam automaticamente. A regra inclui explicitamente Ring com dois sobreviventes: ambos se classificam.
- Nos Dias 1–6, se houver **mais de 10 sobreviventes**, avançam exatamente os dez primeiros do ranking abaixo. Como todo Ring tem 100 participantes, dez representam 10% dos inscritos.

### Desempate quando existem mais de dez sobreviventes

Ordenar sobreviventes por:

1. maior HP atual validado pelo servidor no instante de fechamento;
2. maior XP persistente de conta, amostrado pelo servidor;
3. maior número persistente de batalhas disputadas, amostrado pelo servidor;
4. maior relação K/D — a implementação atual interpreta como `kills / max(1, mortes)`; o sentido exato de “quantidade de kills/mortes” ainda requer validação de produto;
5. se os quatro critérios forem idênticos, ticket aleatório criptograficamente seguro emitido pelo servidor e persistido no resultado do Ring, para que o replay seja reprodutível.

O último item é um mecanismo técnico de desempate que não foi descrito expressamente pelo criador. Ele evita que uma ordem acidental por ID favoreça alguém; confirmar com produto/design antes de usar em competição de alto impacto.

> Também falta confirmar se XP, batalhas, kills e mortes são métricas de toda a conta ou apenas da campanha. O protótipo usa os totais persistentes da conta, congelados pelo servidor antes de conceder XP pelo resultado do Ring.

### Dia 7

O Dia 7 não tem fase seguinte. **Hipótese técnica provisória:** se o timer encerrar com mais de um sobrevivente, o primeiro do mesmo ranking acima é declarado campeão; se restar um, esse jogador é campeão. Essa extensão usa a hierarquia de critérios informada para o corte, mas o criador ainda não confirmou a regra de escolha do campeão quando o cronômetro expira com múltiplos sobreviventes.

## 3. Calendário da campanha

A janela regular de inscrição é de **12 horas a partir do início de cada dia da campanha, em UTC**. Cada dia técnico é um intervalo consecutivo de 24 horas contado de `campaign.startsAt`; a janela de inscrição fecha ao completar 12 horas. A campanha tem sete dias.

Após essa janela podem ocorrer **Campanhas de Incursões Especiais (CIE)**. O limite de composição confirmado é de até 10 jogadores eliminados e as demais vagas reservadas a sobreviventes; a regra técnica proposta de 90 sobreviventes + até 10 eliminados, os gatilhos e o retorno são detalhados na [Emenda GDD-03A-03](GDD_03A_EMENDA_03_CIE_E_REGRESSO.md).

**Não executar ressurreição automática nem pagamentos/recompensas financeiras por CIE antes da implementação e aprovação dos gates descritos na Emenda 03.** A referência a “U$1 milhão” é mantida como proposta narrativa/competitiva; este módulo não implementa prêmio em moeda real, saque, depósito, criptoativo ou pagamento.

## 4. Proteção de Ring

As durações válidas são **12, 24, 36 e 72 horas**. Os itens podem ser obtidos em batalha ou na Forja do Armeiro. A proteção deve ser ativada pelo jogador antes da seleção aleatória e é consumida pelo servidor numa transação atômica com atualização do vencimento.

O protótipo de domínio usa acúmulo: `novo_vencimento = max(agora, vencimento_atual) + duração`. É necessário validar com design/economia: regra de acumulação, prazo máximo, momento limite para ativação, origem e idempotência do consumo. **Preços e quantidades de KRC não são definidos nesta emenda.**

## 5. Persistência e fluxo end-to-end exigidos

1. Persistir campanha, calendário UTC, convocação, inscritos, seed e roster sorteado.
2. Impedir desistência pelo jogador após inscrição, inclusive durante reconexão; manter a inscrição no servidor se o socket cair.
3. Na seleção automática, consultar estado de sobrevivência, proteção e elegibilidade no banco; gravar em transação os 100 participantes ou nenhum.
4. Criar instância de Ring com 100 slots e gerar avatar offline imóvel para os participantes selecionados sem conexão.
5. Persistir uma notificação/outbox por seleção offline; entrega ao entrar novamente. Push móvel fica condicionado à integração futura com APNs/FCM.
6. Capturar o snapshot de estatísticas de ranking, vida e sobrevivência pelo servidor. Encerrar no último sobrevivente ou no segundo 600; gravar os resultados de todos os participantes em transação idempotente.
7. Para cada qualificado nos Dias 1–6, atualizar progresso uma única vez. No Dia 7, persistir campeão/resultado final. Clientes recebem somente estado já confirmado.
8. Registrar versão de regra, seed dos desempates, roster, métricas e resultado para auditoria, replay e suporte.

## 6. Status da implementação no repositório

O módulo puro da campanha implementa e testa: capacidade de 100; janela de 3 minutos; espera por pool suficiente; seleção que exclui proteção ativa e pode ser reproduzida pelo mesmo seed; avanço automático de até dez sobreviventes; ranking por HP/XP/batalhas/KD; cálculo da janela UTC de 12 horas; helper de proteção de 12/24/36/72h; aplicação idempotente da progressão. A CIE tem módulo puro separado com gatilhos, roster 90/até10 e critérios propostos de retorno, cobertos por 11 testes. A regra de 10 minutos existe como parâmetro/contrato de domínio, mas nenhum cronômetro real está conectado. As 21 provas da campanha e 11 da CIE passaram, assim como o typecheck TypeScript.

Ainda **não está conectado ao matchmaking, ao timer real, às tabelas duráveis, ao inventário/Forja, ao avatar offline, às notificações ou ao cliente Unreal**. Portanto, as regras não estão ativas no jogo nem em produção. A formação atual do runtime de combate tem teto de 50 jogadores; será necessária capacidade de Ring isolada em 100, sem alterar casual inadvertidamente.

### Bloqueadores antes de ativar em ambiente real

- Persistência transacional das inscrições, proteção, roster e resultados; concorrência entre nós e recuperação de falhas.
- Fila exclusiva de campanha; impedir o `dequeue` após inscrição e separar matchmaking casual.
- Sala realmente compatível com 100 participantes e testes de carga.
- Avatares offline e reconexão para um Ring persistido/reatribuído.
- Inventário e consumo de proteção, obtida por loot e Forja, sem preço presumido.
- Inbox persistente e/ou push móvel autorizado.
- Aprovação da política de pool insuficiente, do último desempate e do campeão no Dia 7 com vários sobreviventes.
- Definir se o último critério usa relação K/D, kills absolutos ou uma ordenação separada por kills e mortes; definir também se as métricas de ranking são vitalícias ou da campanha.
- Aprovar e integrar as propostas de gatilho, composição 90/até10, critério de retorno e risco aos sobreviventes ativos registradas na Emenda 03.
- Validação e build no Unreal Engine alvo; esta Sandbox não compila o Editor Unreal.
