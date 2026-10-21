# Stripe Checkout — Brasil (sandbox)

**Atualizado:** 2026-10-21

**Decisão de produto recebida:** empresa estabelecida no Brasil; primeiro mercado Brasil; venda de pacotes fixos de KRC.

**Estado de segurança:** planejamento e implementação devem permanecer em modo Stripe test. Nenhuma cobrança live, criação de sessão no Stripe do usuário ou ativação de checkout em produção foi autorizada.

## Evidência oficial e requisitos

O Stripe lista o Brasil entre os locais de conta aptos ao Pix. Para uma conta brasileira, Pix é pagamento avulso em BRL; Pix Automático/recorrência não está disponível para empresas domiciliadas no Brasil. Pix é uma forma doméstica para clientes no Brasil e sua liquidação em conta brasileira é BRL [1] [2].

Uma Checkout Session com Pix deve usar itens one-time e moeda BRL em todas as linhas. Pix precisa estar habilitado nas configurações de formas de pagamento do Dashboard; a Central de Ajuda orienta que a ativação depende de elegibilidade da conta. A página pública de preços atualmente rotula Pix no Brasil como “somente por convite”, portanto o projeto não deve presumir que a conta pode oferecê-lo até o proprietário verificar essa capacidade [2] [3] [4].

O retorno do navegador não é prova de pagamento. Para Checkout, fulfillment ocorre após evento Stripe verificado; além de `checkout.session.completed`, métodos com confirmação posterior podem exigir `checkout.session.async_payment_succeeded`. Pix não pago permanece pendente. O webhook é validado pelo SDK oficial sobre os bytes originais e o ID do evento é deduplicado. O handler atual processa sincronamente antes do HTTP 200. Estados falha/expiração são terminais; sucesso tardio/out-of-order é rejeitado para revisão manual, sem crédito automático [5] [6].

Stripe permite repetir uma criação `POST` com a mesma `Idempotency-Key` sem criar um segundo objeto; chaves não devem conter dados pessoais [7].

## Contrato de implementação

- O backend só aceita um `productId` de catálogo configurado no servidor. Preço em centavos de BRL e KRC em minor units são snapshots server-side; o cliente nunca envia montante, moeda, saldo ou destinatário do crédito.
- O checkout usa apenas uma Checkout Session de pagamento avulso. Métodos de pagamento configuráveis devem permanecer limitados aos habilitados na conta; Pix só pode ser ativado após confirmação de elegibilidade no Dashboard.
- Somente `sk_test_` habilita o adaptador nesta entrega. `KRC_CHECKOUT_ENABLED` começa desativado e faltas de chave, webhook secret ou catálogo mantêm o endpoint em fail-closed. Chaves e `whsec_` são segredos de runtime, nunca código, frontend, logs ou metadados públicos.
- O webhook confirma assinatura, `paid`, `livemode=false`, ID de sessão, ordem, SKU, BRL, valor exato e país de cobrança `BR` antes de emitir concessão. Checkout exige `billing_address_collection=required`; o `userId` é resolvido pela ordem no banco e não é enviado em metadata Stripe. A concessão atualiza Weapons, histórico e ledger append-only na mesma transação PostgreSQL que marca a ordem como cumprida e registra o evento único.
- Checkout não altera a natureza do KRC: é moeda exclusivamente interna, sem saque, resgate, transferência externa ou token/Mainnet.
- SKUs, preços BRL e quantidade de KRC por pacote ainda precisam de aprovação. Até haver configuração no catálogo de teste, nenhuma oferta será exposta e o endpoint não iniciará checkout.

## Preflight de sandbox em staging

1. Aplicar primeiro `npm run db:migrate` e verificar que a migration 0005 foi registrada no PostgreSQL de staging; não habilitar flag antes disso.
2. Confirmar `PUBLIC_ORIGIN` HTTPS do serviço e criar endpoint webhook Stripe no ambiente de teste apontando para `/webhooks/stripe`.
3. Configurar apenas `STRIPE_SECRET_KEY` começando com `sk_test_`, `STRIPE_WEBHOOK_SECRET` começando com `whsec_`, `STRIPE_KRC_PACKS_JSON` com SKUs/preços/quantidades aprovados e `STRIPE_PAYMENT_METHOD_TYPES` limitado a métodos habilitados. Nunca colocar os valores no GitHub commit ou frontend.
4. Começar por `card`; adicionar `pix` apenas depois que o titular confirmar elegibilidade/ativação no Dashboard. A feature flag permanece `KRC_CHECKOUT_ENABLED=false` até concluir esse preflight e a verificação de webhook.
5. Executar uma compra com dados de teste; conferir evento assinado, status pendente/confirmado, idempotência, balanceamento do ledger, retorno do browser e logs sanitizados. Não usar dinheiro ou chave live.

## Gate para ativação live

Além de validações jurídicas/fiscais, refunds/chargebacks, suporte e outbox/reconciliação, exigir que o titular confirme elegibilidade comercial/Pix no Dashboard, defina SKUs/preços, configure credenciais live fora do código e aprove separadamente o rollout. A checagem de país de cobrança não prova residência. A implementação sandbox não autoriza nem executa cobranças live.

## Fontes oficiais

[1]: https://stripe.com/global "Stripe global availability"
[2]: https://docs.stripe.com/payments/pix "Stripe Pix payments: eligibility and settlement"
[3]: https://support.stripe.com/questions/how-to-enable-pix-as-a-payment-method-in-brazil?locale=pt-BR "Stripe Support: enable Pix in Brazil"
[4]: https://stripe.com/br/pricing "Stripe Brazil pricing"
[5]: https://docs.stripe.com/payments/pix/accept-a-payment "Stripe Pix one-time payments with Checkout"
[6]: https://docs.stripe.com/checkout/fulfillment "Stripe Checkout fulfillment and delayed payments"
[7]: https://docs.stripe.com/api/idempotent_requests "Stripe API idempotent requests"
[8]: https://docs.stripe.com/webhooks "Stripe webhooks: signatures, retries and duplicate events"
