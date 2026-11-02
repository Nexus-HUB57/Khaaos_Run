# Guia do jogador — War’I e PackBack

Este guia explica como usar o **War’I**, o arsenal do jogador, a **PackBack Tática** — chamada informalmente de Backbag — e a Forja do Armeiro para reunir materiais, fabricar equipamentos e usá-los durante uma partida.

## Em poucas palavras

- **War’I** é o inventário completo. Nele você consulta, filtra, equipa, repara e organiza seus itens.
- **PackBack** é a seleção de itens equipada para o próximo combate; não é um inventário separado.
- **Forja do Armeiro** fabrica itens a partir de receitas canônicas. O jogador fornece os materiais coletados e paga a mão de obra em KRC; o produto concluído entra no War’I.
- **Zona → Ações da PackBack** é o painel usado para ativar curas, granadas e itens de reconhecimento durante uma partida em andamento.

## Fluxo recomendado

1. Colete matérias-primas (metal, madeira, polímero, pólvora e outros componentes) como loot na Zona ou durante uma partida.
2. Abra a **Forja do Armeiro**, confira seu estoque, os ingredientes de cada receita e a taxa de serviço em KRC. Fabrique o item quando houver materiais suficientes.
3. Abra **War’I** e localize os itens recém-fabricados no Arsenal. Use os compartimentos ou a busca para encontrá-los.
4. Abra os detalhes de cada item e escolha **ADICIONAR À PACKBACK**. A etiqueta **PACKBACK** indica que ele está equipado.
5. Antes da partida, revise o resumo **PRONTOS PARA A BATALHA**. Itens sem durabilidade válida permanecem no Arsenal, mas não concedem bônus no combate.
6. Durante uma partida, abra **Zona** e use **WAR’I · AÇÕES DA PACKBACK** para ativar um consumível ou utilidade compatível.

## Compartimentos do War’I

| Compartimento | O que exibe |
|---|---|
| **Arsenal** | Todos os itens do jogador. |
| **Armamento** | Itens do tipo arma. |
| **Defesa** | Itens do tipo defesa. |
| **Bag** | Curativos e utilidades. Matérias-primas ficam no estoque da Forja, não como itens avulsos do Arsenal. |
| **PackBack** | Itens marcados como equipados para o loadout. |

Os contadores mostram quantos itens pertencem a cada filtro. A busca procura pelo nome, tipo e raridade. Selecione um cartão para ver raridade, tipo, durabilidade e stats.

## Equipar e prontidão para a batalha

Nos detalhes de um item, use **ADICIONAR À PACKBACK** para equipá-lo ou **NA PACKBACK — REMOVER** para guardá-lo no Arsenal. O número **NA PACKBACK** no topo resume quantos itens estão selecionados.

Um item equipado está **pronto para a batalha** quando sua durabilidade atual é maior que zero, a durabilidade máxima é válida e a atual não excede o máximo. Por exemplo, `65/100` está pronto; `0/100` ou valores inconsistentes não estão. A interface mostra a proporção de durabilidade no cartão e os valores nos detalhes.

Se algum item equipado não estiver pronto, o War’I avisa quantos itens não concederão bônus nesta partida. Você pode repará-los por **50 KRC** quando a durabilidade estiver abaixo do máximo, ou removê-los da PackBack.

O loadout fica **congelado durante o countdown e a partida**. Mudanças feitas depois que o bloqueio começa valem para a próxima batalha; prepare e revise o equipamento antes do countdown.

## Efeitos do equipamento

Somente itens equipados e com durabilidade válida são considerados pelo loadout de combate.

| Tipo/atributo | Efeito |
|---|---|
| **Arma** | Define o dano e o alcance do armamento do loadout. Se houver mais de uma arma válida, o loadout seleciona a de maior dano; os efeitos não são somados entre armas. |
| **Defesa** | Cada item válido contribui com `⌊defesa ÷ 4⌋` para a saúde máxima (arredondado para baixo). A saúde máxima tem limite de 200. |
| **Capacidade** | Utilidades com o atributo `capacity` aumentam a capacidade de carga. O valor-base é 50 pontos e o limite é 150. |
| **Curativo** | Pode restaurar saúde até o máximo do operativo; a quantidade efetiva não ultrapassa a saúde que falta. Fora de uma partida, um curativo também pode ser usado pelos detalhes do item no War’I. |

A **Mochila Tática** concede capacidade passiva: ela não tem botão de ativação na partida. Uma granada ou item de reconhecimento, por outro lado, aparece como ação quando está equipado e possui stats compatíveis.

Fora do countdown e da partida, um item do tipo `CURATIVO` com stat `heal` pode ser usado pelos detalhes no War’I. Durante a partida, o endpoint de inventário não aplica curas: use o controle **USAR CURA** em Zona para que a ação seja validada e confirmada pelo servidor.

## Usar a PackBack durante a partida

As ações aparecem em **Zona → WAR’I · AÇÕES DA PACKBACK** quando a sala está em partida. Para usá-las, é necessário estar vivo, conectado ao WebSocket do jogo e ter carregado o item na PackBack no início da partida. Um item fora do loadout inicial ou sem durabilidade válida não pode ser ativado.

| Ação | Requisito do item | O que acontece |
|---|---|---|
| **Usar cura** | Tipo `CURATIVO` com stat positivo `heal`. | Restaura até a quantidade indicada, limitada à saúde que falta. A opção fica desativada quando a saúde já está cheia, salvo se o item também conceder velocidade. |
| **Lançar granada** | Tipo `UTILIDADE` com stats positivos `damage` e `radius`. | Aplica o dano definido pelo item a operativos vivos dentro do raio, sem atingir quem lançou. |
| **Ativar reconhecimento** | Tipo `UTILIDADE` com stat positivo `vision`. | Revela operativos vivos e loot dentro do alcance por 8 segundos. |

Cada uso confirmado consome **10 pontos de durabilidade** — tanto a cura fora da partida quanto uma ação da PackBack em combate. O servidor valida a ação e seus efeitos; o cliente não escolhe o dano, a cura ou o alcance. A interface mostra a durabilidade atual, desativa os outros botões enquanto aguarda a confirmação e apresenta o resultado recebido do servidor. Há também um intervalo de recarga de 1,2 segundo entre ativações da PackBack em combate.

Se a sala estiver em andamento e nenhum item equipado tiver uma ação ativa compatível, o painel informa que não há consumíveis ou utilidades ativas carregadas.

## Receitas e taxas da Forja

O catálogo atual contém oito produtos. A raridade/poder afeta a escassez dos componentes e o custo do serviço; todos os itens fabricados começam com durabilidade `100/100`.

| Item | Tipo / raridade | Componentes principais | Trabalho (KRC) |
|---|---|---|---:|
| Lâmina Nano | Arma / COMUM | 3 Metal + 2 Madeira + 1 Polímero | 120 |
| Colete de Kevlar | Defesa / COMUM | 3 Metal + 6 Fibra Tática + 2 Polímero | 180 |
| Stim Pack | Curativo / COMUM | 2 Gel Médico + 1 Fibra Tática | 25 |
| Mochila Tática | Utilidade / COMUM | 2 Madeira + 3 Fibra Tática + 2 Polímero | 50 |
| Granada de Fragmentação | Utilidade / RARO | 2 Metal + 3 Pólvora + 1 Polímero | 240 |
| Rifle de Plasma | Arma / RARO | 8 Metal + 4 Polímero + 3 Componentes Eletrônicos + 2 Pólvora | 500 |
| Kit Médico Avançado | Curativo / EPICO | 6 Gel Médico + 2 Componentes Eletrônicos + 3 Polímero | 650 |
| Escudo Tático | Defesa / EPICO | 10 Metal + 8 Polímero + 3 Componentes Eletrônicos + 2 Ligas Cristalinas | 900 |

A tela da Forja mostra o estoque individual, os componentes exigidos e o que falta. A solicitação não envia preço, stats nem receita do cliente: o servidor resolve o catálogo, debita materiais e mão de obra, cria o item no War’I e registra o KRC de serviço de forma atômica. Se faltar algum recurso ou saldo, nada é consumido.

Veja a [tabela completa de fabricação e obtenção de materiais](ARMORER_CRAFTING_RECIPES.md) para quantidades dos drops, APIs e garantias da transação.

## Problemas comuns

- **Item aparece no Arsenal, mas não está pronto:** verifique a durabilidade; repare-o ou remova-o da PackBack antes do countdown.
- **Não consigo alterar o loadout:** ele está congelado durante o countdown ou a partida. A alteração ficará para a próxima batalha.
- **A cura está desativada:** confira se você está vivo, se a conexão está sincronizada e se ainda falta saúde. Com a saúde cheia, a cura comum não pode ser acionada.
- **A mochila não aparece como ação:** capacidade é um bônus passivo, não um consumível. Consulte o efeito no loadout/carga.
- **Ação fica em confirmação:** aguarde a resposta do servidor antes de tentar outro item. Se o problema persistir, verifique a conexão com a sala.
- **Falha ao abrir o Arsenal:** use **TENTAR NOVAMENTE** na tela do War’I para refazer a sincronização.

## Referências de implementação

- Catálogo canônico: `shared/armorer-catalog.ts`
- Regras de categoria e prontidão: `shared/war-i.ts`
- Cálculo do loadout: `server/game/loadout.ts`
- Validação e efeitos das ações: `server/game/packback-actions.ts` e `server/game/RoomManager.ts`
- Testes de interface: `tests/e2e/war-i-ui.spec.ts`
