# KRC interno e pagamentos globais — decisão de arquitetura

**Estado:** arquitetura aprovada para KRC interno; monetização externa bloqueada até escolha e validação de provedor.  
**Escopo:** compras opcionais de conteúdo/entitlements de jogo com meios de pagamento fiduciários.  
**Fora de escopo:** token transferível, carteira cripto, depósito/saque on-chain, resgate de KRC, promessa de rendimento ou prêmio em dinheiro.

## Decisões de produto

1. KRC é saldo virtual sem valor monetário externo. Ele não é ativo on-chain, não é conversível nem resgatável, e não tem paridade com USD ou outra moeda.
2. KRC e progresso são autoritativos no servidor. A UI, o browser e o cliente Unreal podem solicitar ações de jogo, mas não podem determinar saldo, preço de pacote, resultado do pagamento nem concessão de entitlement.
3. Nenhuma compra em dinheiro será ativada enquanto não houver provedor, catálogo e termos de produto definidos, revisão de política do provedor e revisão jurídica/compliance apropriada aos mercados de venda.
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

O endpoint de webhook usa HTTPS e o corpo bruto exigido pelo SDK do provedor para validar assinatura. Persiste o evento numa inbox com índice único `(provider, provider_event_id)`; responde rapidamente após aceitação durável e processa de modo assíncrono/idempotente. O worker consulta ou valida o estado autoritativo do pagamento, compara conta/provedor, ordem, usuário, produto, valor em minor units, moeda e status final.

Em uma única transação PostgreSQL: bloqueia a ordem, confirma que ainda não foi liquidada, cria o entitlement ou o lançamento interno autorizado, escreve correlação no ledger, e marca a ordem como cumprida. Unique constraints nas referências do provedor e na ordem impedem replay paralelo. Qualquer divergência vai para quarentena e alerta, nunca para crédito automático.

O fulfillment pode ser uma concessão de item/entitlement ou de um pacote fixo de KRC de jogo, caso o desenho de produto seja aprovado. Em ambos os casos, compras são valor pago por conteúdo interno; KRC continua sem transferência externa ou resgate. O que será vendido ainda precisa ser definido. Para reduzir risco em mercados globais, não habilitar loot boxes, gacha ou recompensas aleatórias pagas até revisão jurídica, regras de odds/disclosure e políticas do provedor/plataforma terem aprovação explícita.

### Reembolsos, disputa e chargeback

Estados sugeridos: `created → pending → paid → fulfilled`, com saídas `failed`, `cancelled`, `refunded`, `disputed` e `chargeback`. Não apagar nem editar lançamento original. Reembolso confirmado gera reversão/compensação correlacionada; eventual remoção de item consumível precisa de uma política explícita que não produza saldo negativo nem destrua progresso inesperadamente. Disputa e chargeback suspendem novas compras e alertam operação conforme política de risco, sem punição automática não revisada.

## Plano de entrega com gates

### 1. Conter crédito não verificado — feito nesta branch

Bloquear a rota e retirar caminhos de storage/cliente que emitem crédito com valor escolhido pelo browser. Testar requisição autenticada válida e replay: ambos permanecem sem mutação. A UI precisa explicar o estado, não simular conclusão.

### 2. Fechar política de produto — decisão parcial

A decisão recebida confirma KRC exclusivamente interno e elimina a necessidade de smart contract/Mainnet. Antes do checkout ainda faltam: provedor/merchant of record, entidade vendedora e país de estabelecimento, itens vendáveis, política de preço e moeda, regiões inicialmente atendidas, política de cancelamento/refund/chargeback, idade mínima e tratamento de contas de menores. Revisão jurídica deve avaliar cada mercado antes de disponibilizá-lo.

### 3. Implementar checkout em sandbox

Adicionar `payment_orders`, `payment_webhook_events` (inbox) e `outbox`/fila durável, migrations aditivas, interface `PaymentProvider`, adaptador sandbox e testes com eventos assinados/forjados/duplicados/fora de ordem. O adapter real só entra após decisão de provedor; segredo de teste deve ficar em ambiente isolado. Testar timeout e retry, diferença de preço/moeda, evento para usuário diferente, sucesso pendente, pagamento assíncrono, refund e chargeback. Não usar valores ou credenciais live nos testes.

### 4. Validar mercados e UX

Checkout deve mostrar preço local e moeda cobrada antes da confirmação, tax/fees conforme o merchant/provider, estado `pending` com polling limitado e ação de tentar novamente sem criar ordens duplicadas. O jogo deve mostrar o entitlement após confirmação servidor-side e ter mensagens localizadas, acessibilidade, suporte e fluxo de recuperação. Testar falhas de rede, retorno antes do webhook, webhook antes do retorno, pagamento assíncrono, expiração e chargeback. Bloquear territórios que o vendedor/provedor não possa atender.

### 5. Rollout controlado — sem Mainnet para KRC

Começar em sandbox; depois canary limitado por feature flag, país e pacote, com limites baixos, rate limiting, métricas de conversão/falha, alertas de reconciliação e botão de desativação. Só passar a live após revisão de segurança, fraude, suporte/refunds, tax/compliance e configuração de produção aprovada. Não criar contrato de token KRC nem endpoints de saque.

## Esquema de dados sugerido para checkout

- `payment_orders`: `id` UUID, `user_id`, `product_id`, snapshot do preço/moeda/benefício, `provider`, `provider_order_id`, `status`, `created_at`, `paid_at`, `fulfilled_at`, `refunded_at`, `version`.
- `payment_webhook_events`: `provider`, `provider_event_id` UNIQUE, tipo, hash/cópia mínima do payload redigida, verificação de assinatura, recebido/processado em, erro operacional sem dados sensíveis.
- `payment_outbox`: ordem de fulfillment e tentativas, chave única por ordem/tipo, lease/estado para retry.
- `payment_adjustments`: compensações append-only para refund/dispute, ligadas a order, provider event e operação do ledger.

Valores são inteiros em minor units e moedas ISO 4217; nunca `float` para dinheiro. Persistir apenas os dados pessoais estritamente necessários. Não gravar PAN, CVV, segredo de webhook, client secret ou tokens de pagamento no ledger nem nos logs.

## Aceite obrigatório antes de live

- Nenhuma rota autenticada concede KRC com base em um campo numérico enviado pelo cliente.
- O mesmo evento entregue repetidamente, inclusive em paralelo, produz no máximo um entitlement e um conjunto balanceado de postings.
- Eventos sem assinatura válida, sem status final, com moeda/valor/usuário/order divergentes são rejeitados sem write econômico.
- Migrations e testes executam em PostgreSQL efêmero; reconciliação após falhas/retries não apresenta drift.
- Refunds/chargebacks são rastreáveis e os procedimentos de suporte e reconciliação foram exercitados.
- Checkout está desligado por padrão; nenhum deploy/secret/env pode ativar cobrança sem uma revisão operacional explícita.

## Referências técnicas

- [Stripe Webhooks](https://docs.stripe.com/webhooks) — assinatura, corpo bruto e notificações assíncronas.
- [Stripe Payment Intent status](https://docs.stripe.com/payments/payment-intents/verifying-status) — fulfillment baseado na confirmação server-side por webhook.
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests) — retries sem criar operações duplicadas no provedor.

Essas referências ilustram padrões técnicos e não constituem recomendação de fornecedor, confirmação de elegibilidade comercial, cobertura de todos os países ou aconselhamento jurídico.
