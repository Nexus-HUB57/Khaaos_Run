# KRC interno e pagamentos globais — decisão de arquitetura

**Estado:** KRC interno; Stripe escolhido para uma primeira fase no Brasil; checkout implementado apenas para sandbox/teste e desligado por padrão.
**Escopo:** compras opcionais de conteúdo/entitlements de jogo com meios de pagamento fiduciários.  
**Fora de escopo:** token transferível, carteira cripto, depósito/saque on-chain, resgate de KRC, promessa de rendimento ou prêmio em dinheiro.

## Decisões de produto

1. KRC é saldo virtual sem valor monetário externo. Ele não é ativo on-chain, não é conversível nem resgatável, e não tem paridade com USD ou outra moeda.
2. KRC e progresso são autoritativos no servidor. A UI, o browser e o cliente Unreal podem solicitar ações de jogo, mas não podem determinar saldo, preço de pacote, resultado do pagamento nem concessão de entitlement.
3. Nenhuma cobrança live será ativada até que o catálogo de pacotes e os preços sejam aprovados, a conta Stripe e os métodos estejam elegíveis, e haja revisão jurídica/fiscal, política de reembolso e suporte para o mercado atendido.
4. “Disponível mundialmente” descreve o público potencial, não disponibilidade universal de pagamentos. País de estabelecimento do vendedor, países atendidos, método de pagamento, impostos, moeda de apresentação, proteção ao consumidor, idade e regras de lojas/plataformas precisam ser determinados antes do rollout.
5. O ledger PostgreSQL permanece o livro de eventos e saldos de jogo. Não se registram partidas, compras de itens ou KRC em blockchain: a liquidação de um pagamento não requer transformar a moeda de gameplay num token.

## Contenção implantada no código

- `POST /api/bank/deposit` sempre retorna `503 PAYMENTS_NOT_CONFIGURED` antes de chamar o serviço econômico ou storage.
- `DatabaseStorage.depositFunds` foi removido para evitar um caminho alternativo de crédito.
- A tela BANKHAAOS não exibe formulário de USD, taxa USD/KRC, endereço simulado ou promessa de cashback por depósito; mostra que compras estão indisponíveis e não haverá cobrança.
- O endpoint não tem sucesso fictício no contrato tipado. Testes de serviço/rota/PostgreSQL devem comprovar 503 e ausência de alteração em saldo, `transactions` e `economy_ledger_entries`.
- A implementação Unreal não gera mais endereço `krc1…`; o seu saldo local continua explicitamente prototipal e não deve ser usado como autoridade em sessão online.

## Checkout futuro: contrato de confiança

### Catálogo e criação de ordem

O cliente envia apenas um `productId` do catálogo publicado. O servidor resolve preço, moeda, quantidade/benefício em KRC e elegibilidade a partir de dados próprios. A API valida que o produto está ativo, que o usuário pode comprá-lo e que limites de fraude/velocidade foram respeitados. A ordem guarda snapshot imutável de `productId`, preço em minor units, moeda ISO, `userId`, país/região quando permitido, estado, provedor e timestamps. Não aceitar `amountUsd`, `krcAmount`, balance, owner ou provider status do cliente.

O servidor cria a sessão de checkout com chave de idempotência derivada/associada à ordem. Uma resposta do browser ou redirect de sucesso só consulta estado; jamais concede KRC. Segredos de API e signing secret ficam em secret manager de produção, nunca em React, Unreal, commit ou log.

### Webhook e liquidação

No checkout sandbox atual, o endpoint HTTPS usa os bytes originais capturados pelo Express e valida a assinatura pelo SDK Stripe. Ele persiste o evento na inbox com unique `(provider, event_id)` e conclui a transação de fulfillment de forma **síncrona antes do HTTP 200**; não há worker/outbox assíncrono nesta entrega. Se a transação falhar, responde 500 para permitir retry; duplicatas idênticas não concedem novamente. O mesmo event ID com tipo/hash diferente grava `EVENT_ID_PAYLOAD_MISMATCH` para auditoria e não é processado.

Em uma única transação PostgreSQL: bloqueia a ordem, valida sessão, SKU, valor, BRL, `livemode=false`, estado e país de cobrança BR, grava wallet + transação + duas linhas balanceadas do ledger e marca a ordem como cumprida. Só `pending` pode ser cumprido; falha/expiração terminal recebida antes de um sucesso não é reaberta automaticamente. Divergência marca a ordem `rejected` (quando pendente), não concede KRC e precisa de revisão operacional. Como o handler espera o banco antes de responder, latência/locks podem acionar retry Stripe; antes de live, avaliar outbox/worker, timeout e reconciliação sem sacrificar idempotência.

O produto escolhido é um pacote fixo de KRC interno; SKUs, quantidades e preços BRL ainda não foram aprovados. O checkout de teste exige endereço de cobrança e só concede para país informado `BR`, mas isso não prova residência nem substitui controles jurídicos/comerciais. Para reduzir risco, não habilitar loot boxes, gacha ou recompensas aleatórias pagas até revisão jurídica, regras de odds/disclosure e políticas do provedor/plataforma terem aprovação explícita.

### Reembolsos, disputa e chargeback

Estados sugeridos: `created → pending → paid → fulfilled`, com saídas `failed`, `cancelled`, `refunded`, `disputed` e `chargeback`. Não apagar nem editar lançamento original. Reembolso confirmado gera reversão/compensação correlacionada; eventual remoção de item consumível precisa de uma política explícita que não produza saldo negativo nem destrua progresso inesperadamente. Disputa e chargeback suspendem novas compras e alertam operação conforme política de risco, sem punição automática não revisada.

## Plano de entrega com gates

### 1. Conter crédito não verificado — feito nesta branch

Bloquear a rota e retirar caminhos de storage/cliente que emitem crédito com valor escolhido pelo browser. Testar requisição autenticada válida e replay: ambos permanecem sem mutação. A UI precisa explicar o estado, não simular conclusão.

### 2. Fechar política de produto — decisão parcial

A decisão recebida confirma KRC exclusivamente interno, elimina a necessidade de smart contract/Mainnet e escolhe Stripe para empresa brasileira, pacotes fixos e primeira venda no Brasil. Ainda faltam os SKUs/preços/relação KRC por pacote, confirmação de que a conta pode usar Pix (a oferta pode depender de elegibilidade/convite), política de cancelamento/refund/chargeback, idade mínima e termos do vendedor. “Global” permanece uma intenção de produto; nenhuma região além do Brasil deve ser liberada sem análise de cobertura do meio de pagamento, fiscal/jurídica, consumidor e plataforma.

### 3. Implementar checkout em sandbox — código entregue; gates externos pendentes

O código acrescenta `payment_orders`, inbox `payment_webhook_events`, migration aditiva, Checkout Session de pagamento único BRL e fulfillment Stripe autenticado por assinatura. Só aceita chave `sk_test_`; `KRC_CHECKOUT_ENABLED` permanece `false` por padrão; catálogo vem de `STRIPE_KRC_PACKS_JSON`, sempre resolvido no servidor. Testes unitários não chamam o Stripe. A suíte PostgreSQL escrita cobre checkout concorrente com mesma `Idempotency-Key`, preço server-side, ownership, fulfillment concorrente, replay/hash conflitante, divergência de valor/país e estados falha/expiração fora de ordem; a execução do CI desta branch continua gate pendente. Para configurar sandbox real em staging: aplicar `npm run db:migrate` (incluindo 0005) antes da flag; validar `PUBLIC_ORIGIN` HTTPS, `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`, catálogo aprovado, endpoint `/webhooks/stripe` e apenas métodos disponíveis na conta. Nunca usar credenciais live.

### 4. Validar mercados e UX

Checkout Brasil mostra preço BRL e pacote antes da saída ao provedor. O retorno `cancelled` não consulta a ordem; retorno `success` consulta status com polling limitado e só atualiza saldos após `fulfilled`. A interface comunica explicitamente sandbox/test mode e nunca diz que houve cobrança real. Ainda é necessário validar em staging retorno antes do webhook, webhook antes do retorno, Pix pendente/assíncrono e retry/expiração. País de cobrança fora de BR é rejeitado; esta checagem simples não substitui bloqueio comercial/regulatório por território. Pix brasileiro é somente avulso em BRL e a elegibilidade deve ser confirmada no Dashboard Stripe.

### 5. Rollout controlado — sem Mainnet para KRC

Começar em sandbox; depois canary limitado por feature flag, país e pacote, com limites baixos, rate limiting, métricas de conversão/falha, alertas de reconciliação e botão de desativação. Só passar a live após revisão de segurança, fraude, suporte/refunds, tax/compliance e configuração de produção aprovada. Não criar contrato de token KRC nem endpoints de saque.

## Esquema atual e complementos pendentes

- Implementados em migration 0005: `payment_orders` (snapshot imutável de SKU/preço/moeda/benefício, idempotency key, sessão Stripe e estados) e `payment_webhook_events` (event ID único, tipo, SHA-256, estado, erro operacional, timestamps).
- Pendentes antes de um desenho live resiliente: `payment_outbox` para processamento assíncrono/retries e `payment_adjustments` append-only para refunds/disputes correlacionados ao pedido/evento/operação do ledger.

Valores são inteiros em minor units e moedas ISO 4217; nunca `float` para dinheiro. Persistir apenas os dados pessoais estritamente necessários. Não gravar PAN, CVV, segredo de webhook, client secret ou tokens de pagamento no ledger nem nos logs.

## Aceite obrigatório antes de live

- Nenhuma rota autenticada concede KRC com base em um campo numérico enviado pelo cliente.
- O mesmo evento entregue repetidamente, inclusive em paralelo, produz no máximo um entitlement e um conjunto balanceado de postings.
- Eventos sem assinatura válida, sem status final, com moeda/valor/usuário/order divergentes são rejeitados sem write econômico.
- Migrations e testes executam em PostgreSQL efêmero; reconciliação após falhas/retries não apresenta drift.
- Refunds/chargebacks são rastreáveis e os procedimentos de suporte e reconciliação foram exercitados.
- Checkout está desligado por padrão; nenhum deploy/secret/env pode ativar cobrança sem uma revisão operacional explícita.

## Referências técnicas

- [Stripe Brasil — checkout e Pix sandbox](./STRIPE_BRAZIL_CHECKOUT.md) — decisão, gates e fontes oficiais.
- [Stripe Webhooks](https://docs.stripe.com/webhooks) — assinatura, corpo bruto, duplicatas e notificações assíncronas.
- [Stripe Payment Intent status](https://docs.stripe.com/payments/payment-intents/verifying-status) — fulfillment baseado na confirmação server-side por webhook.
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests) — retries sem criar operações duplicadas no provedor.

Essas referências ilustram padrões técnicos e não constituem recomendação de fornecedor, confirmação de elegibilidade comercial, cobertura de todos os países ou aconselhamento jurídico.
