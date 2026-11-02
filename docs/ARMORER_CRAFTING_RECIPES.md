# Forja do Armeiro — receitas e fabricação

## Modelo de fabricação

A Forja não vende equipamentos prontos. O jogador coleta matérias-primas como loot, consulta o próprio estoque e solicita a fabricação de uma receita canônica. A fabricação consome os ingredientes e cobra separadamente a mão de obra do Armeiro em KRC. O item concluído é gravado no War’I com raridade, atributos e durabilidade definidos pelo servidor.

A tabela abaixo é o catálogo inicial de balanceamento; preços, ingredientes e atributos vivem em `shared/armorer-catalog.ts`, a única fonte canônica consumida pelo cliente e servidor.

| Produto | Categoria / raridade | Receita de materiais | Trabalho do Armeiro | Resultado no War’I |
|---|---|---|---:|---|
| Lâmina Nano | Arma · Comum | 3 Metal Recuperado + 2 Madeira Estrutural + 1 Polímero | **120 KRC** | Dano 18 · alcance 6 · durabilidade 100 |
| Colete de Kevlar | Defesa · Comum | 3 Metal Recuperado + 6 Fibra Tática + 2 Polímero | **180 KRC** | Defesa 20 · +5 saúde máxima enquanto equipado · durabilidade 100 |
| Stim Pack | Curativo · Comum | 2 Gel Médico + 1 Fibra Tática | **25 KRC** | Cura até 20 HP · durabilidade 100 |
| Mochila Tática | Utilidade · Comum | 2 Madeira Estrutural + 3 Fibra Tática + 2 Polímero | **50 KRC** | +20 capacidade de carga · durabilidade 100 |
| Granada de Fragmentação | Utilidade · Raro | 2 Metal Recuperado + 3 Pólvora + 1 Polímero | **240 KRC** | Dano 30 · raio 5 · durabilidade 100 |
| Rifle de Plasma | Arma · Raro | 8 Metal Recuperado + 4 Polímero + 3 Componentes Eletrônicos + 2 Pólvora | **500 KRC** | Dano 35 · alcance 9 · durabilidade 100 |
| Kit Médico Avançado | Curativo · Épico | 6 Gel Médico + 2 Componentes Eletrônicos + 3 Polímero | **650 KRC** | Cura até 80 HP · durabilidade 100 |
| Escudo Tático | Defesa · Épico | 10 Metal Recuperado + 8 Polímero + 3 Componentes Eletrônicos + 2 Ligas Cristalinas | **900 KRC** | Defesa 60 · +15 saúde máxima enquanto equipado · durabilidade 100 |

## Matérias-primas e obtenção

| Material | Código de loot | Raridade | Drop inicial por coleta |
|---|---:|---|---:|
| Metal Recuperado | 1 | Comum | 4 |
| Madeira Estrutural | 2 | Comum | 3 |
| Polímero | 3 | Comum | 3 |
| Pólvora | 4 | Raro | 2 |
| Componente Eletrônico | 5 | Raro | 2 |
| Fibra Tática | 6 | Comum | 4 |
| Gel Médico | 7 | Comum | 3 |
| Liga Cristalina | 8 | Épico | 1 |

Os drops são incluídos nos presets de loot do mapa. Cada coleta de recurso credita a carteira empilhável do jogador, não cria um item avulso no inventário. No combate, o peso declarado do drop continua sujeito ao limite de carga da PackBack. Os materiais ficam associados ao jogador entre partidas e aparecem na Forja.

## Progressão econômica

A taxa é cobrada pelo trabalho do Armeiro, não como preço de venda do produto. Neste catálogo inicial, todas as taxas raras superam a maior taxa comum, e todas as taxas épicas superam a maior taxa rara. As receitas de maior raridade também exigem materiais mais escassos — por exemplo, Pólvora e Componentes Eletrônicos para receitas raras, e Liga Cristalina para o Escudo Tático. O balanceamento pode ser ajustado alterando o catálogo compartilhado, sem confiar em valores enviados pelo navegador.

## Fluxo end-to-end e integridade

1. O jogador coleta recursos na Zona ou durante uma partida.
2. O servidor valida e reivindica o loot em transação; matérias-primas com código inválido ou quantidade inválida não são creditadas.
3. `GET /api/armorer/materials` devolve somente o estoque do usuário autenticado.
4. A Forja mostra os ingredientes necessários, as quantidades disponíveis e a fee KRC. O botão de fabricar fica desabilitado quando faltar material.
5. `POST /api/items/craft` recebe apenas o `catalogId` e uma chave de idempotência. O servidor resolve a receita, os atributos e a fee no catálogo canônico.
6. Em uma única transação PostgreSQL, o servidor bloqueia saldo e materiais em ordem determinística, valida suficiência, debita KRC, consome ingredientes, cria o item no War’I e grava a transação e o ledger balanceado em `system.armorer_fees`.
7. Se faltar material ou KRC, ou se qualquer etapa falhar, não há fabricação parcial. Falha posterior à retirada reverte também os ingredientes e o saldo; retries com a mesma chave não fabricam ou cobram duas vezes.

A carteira é persistida em `player_materials` e protegida por unicidade `(user_id, material_id)` e constraint de quantidade não negativa. A migration `0010_aspiring_captain_midlands.sql` cria a tabela e autoriza a conta contábil `system.armorer_fees` no ledger.

## Verificação

- Contrato do catálogo e receitas: `tests/official/armorer-catalog.test.ts`.
- Transação PostgreSQL: `tests/official/economy-postgres.test.ts` — concorrência, estoque insuficiente, taxa, catálogo completo e rollback (requer `TEST_DATABASE_URL` de teste).
- Coleta e empilhamento de materiais: `tests/integration/storage.postgres.test.ts` (requer PostgreSQL local descartável).
- Interface real Chromium: `tests/e2e/war-i-ui.spec.ts` — materiais disponíveis, fee, fabricação de todos os produtos e sincronização com War’I/PackBack.
