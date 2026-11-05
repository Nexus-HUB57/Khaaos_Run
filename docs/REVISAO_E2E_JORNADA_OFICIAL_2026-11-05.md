# Revisão E2E — Jornada Oficial do Jogador

**Data:** 2026-11-05  
**Branch:** `fix/official-player-journey-e2e`, baseada em `origin/main`  
**Escopo:** cadastro/login, alistamento e pagamento, liberação de acesso, marco de 1.000.000, Academia KR e agendamento do CIGKV.

## Resultado executivo

A Jornada Oficial está especificada como alvo de produto, mas **não está implementada end-to-end nem pronta para lançamento**. O app canônico usa OIDC; não há formulário ou backend próprio de cadastro/login por email e senha, checkout ainda não é BRL/live, o pagamento não funciona como gate transversal de acesso e não há contador/entitlement/outbox/agendamento conectados ao marco EXCO.

Nesta revisão foi corrigido um risco financeiro P1: sem gateway configurado, `POST /api/enrollment/fee` não pode mais declarar pagamento, completar a sessão ou gravar lançamentos/bônus. O endpoint falha com `503 PAYMENT_PROVIDER_NOT_CONFIGURED`. A simulação foi tornada explícita para testes não-production. Também foi removido o subject OIDC interno da metadata Stripe; o webhook resolve a sessão pela chave única de protocolo persistida no servidor.

Essas correções reduzem risco, mas **não transformam o fluxo atual em cobrança real**. Não ativar live checkout nem anunciar a jornada como disponível até fechar os bloqueios abaixo.

## Auditoria por etapa

| Etapa | Estado observado | Pendência/bloqueio |
|---|---|---|
| 1. Cadastro | No app web canônico não há criação de conta por Name/Email/Password/Confirm Password. Existe API de alistamento autenticada (`/api/enrollment/start`, `steps/data`, `steps/terms`), mas não formulário cliente conectado nem credenciais próprias; a landing envia a `/api/login` OIDC. | Separar criação de conta de alistamento de jogador. Credenciais próprias exigem email verificado, hash seguro, recuperação de conta, rate limit, política de sessão e testes. Não expor um formulário que aparenta cadastrar sem esse backend. |
| 2. Login | App web canônico OIDC-only; `/api/login`, callback e `GET /api/auth/user` existem. Um runtime de jogo separado contém login por username, não o cadastro/login email/senha do produto web. | Login email/senha previsto no roteiro não existe no produto web canônico. O login OIDC sozinho não prova inscrição paga. |
| 3. Taxa nominal US$ 1 | Há gateway Stripe de alistamento test-only opcional, mas o valor atual é `usd`/100 centavos. A conversão BRL ainda não está aprovada/configurada. | Definir valor BRL, fonte e validade do câmbio, arredondamento, tributos, recibo e política comercial. A rota exige provedor para concluir; sem ele responde 503. Nenhuma cobrança live foi habilitada ou testada. |
| 4. Confirmação e acesso | No modo de teste, webhook pode concluir sessão. O redirect do navegador não é confirmação. | O middleware atual autentica OIDC, mas a liberação de Perfil/War'I não é aplicada transversalmente conforme estado pago. O checkout não está conectado a uma interface completa de jornada no cliente. |
| Segurança do pagamento | Testes sequenciais cobrem webhook, idempotência e ledger. | Ainda há bloqueios P1 para live: tentativas concorrentes com chaves diferentes não têm uma claim durável única; múltiplas Checkout Sessions podem coexistir; o webhook não valida um `Stripe Session ID` persistido nem confronta `client_reference_id`; ledger, saldo, sessão e evento não estão cobertos por uma única transação. A metadata ainda contém `clientIdempotencyKey` fornecida pelo cliente; não a usar como campo para PII. Política de cobrança duplicada/reembolso e recuperação de falha parcial também não está implementada. |
| 5. Marco de 1.000.000 | Há protótipos isolados: POJ no runtime e BetaCampaign UE5 mantêm contagem/fase em memória e/ou delegate local. | Não há contador global canônico ligado a alistamentos fiduciários confirmados, deduplicação por conta elegível nem registro durável do cruzamento do marco. Pagamentos sandbox não devem contar. |
| 6. Academia KR | Não há entitlement, gate de autorização ou conteúdo de Academia conectado. | Definir conteúdo, regra de elegibilidade e autorização server-side; persistir desbloqueio único e testável após o marco. |
| 7. Notificação e agenda CIGKV | Existe sinal local `OnExcoMilestoneReached` no BetaCampaign e countdown no POJ que avança por chamada explícita; ambos são protótipos, não entrega persistente ao jogador. | Definir canal, data/hora/fuso, capacidade e gates operacionais; usar evento/outbox durável e idempotente. Atingir o número deve iniciar o processo, não abrir automaticamente produção sem aceite. |

## Correções feitas nesta branch

1. **Fail-closed de pagamento:** a rota não simula pagamento por padrão. Sem gateway, devolve `503` com código `PAYMENT_PROVIDER_NOT_CONFIGURED`; não conclui alistamento nem credita ledger/bônus.
2. **Simulação explícita:** os testes de fluxo que precisam de confirmação sintética passam `allowSimulatedFeeForTests: true`; esse opt-in é ignorado em `NODE_ENV=production`.
3. **Minimização de dados Stripe:** `userId` foi removido da metadata. O contrato `EnrollmentStore` e a store PostgreSQL agora permitem localizar a inscrição por protocolo único para o webhook. Isso não substitui persistir e validar o ID da Checkout Session e sua `client_reference_id`.
4. **Cobertura de regressão:** prova negativa valida que a rota sem gateway mantém `AWAITING_FEE`, `fee=null` e bônus zero. A prova Stripe também verifica que a metadata não inclui o identificador interno.
5. **Documentação canônica:** README e índice canônico distinguem explicitamente alvo de produto, preview econômico e implementação real.

## Evidência de validação

- `npm run check` — **PASS**.
- Testes oficiais de enrollment e Stripe — **14/14 PASS**.
- Testes PostgreSQL direcionados — **6/6 PASS**: `tests/integration/enrollment.postgres.test.ts` (5 testes) + `tests/official/enrollment-fee-stripe.postgres.test.ts` (1 teste), executados em `khaaos_journey_test` local. A segunda suíte oficial foi invocada explicitamente; ela não é descoberta por `npm run test:postgres`, que inclui apenas `tests/integration/*.test.ts`.
- `npm run verify:all` — **PASS** em todos os gates (TypeScript, build, coverage oficial, preflights Python, regras UE5 e runtime).
- `npm run test:postgres` — **172 PASS, 2 SKIP, 0 FAIL** em PostgreSQL local recém-criado `khaaos_journey_serial_test`; execução serial por arquivo evita colisão concorrente dos hooks de migração na base compartilhada da suíte.
- O checkout foi testado somente com fixtures/chaves de teste; não foram feitas cobranças nem alterações em um provedor externo. O manifest versionado mantém `KRC_CHECKOUT_ENABLED=false`; o valor efetivo de secrets/flags do ambiente hospedado e o extrato da conta Stripe não foram consultados nesta auditoria.

## Próximas entregas recomendadas

1. Aprovar modelo de identidade e fornecedor de email/verificação; implementar e testar cadastro/login de forma real, sem bypass do OIDC.
2. Aprovar cotação/preço final BRL, tributos, recibo, idade mínima, reembolso, chargeback, privacidade e sign-off jurídico/fiscal.
3. Criar ordem/tentativa de pagamento persistida, uma única tentativa ativa por alistamento e vínculo a `Stripe Session ID`/`client_reference_id`; serializar transições no PostgreSQL. Tornar fulfillment financeiro + sessão + evento atômicos e reconciliáveis.
4. Aplicar entitlement de pagamento às páginas e APIs do Perfil/War'I, mantendo exceções explícitas para login, pagamento, status e suporte.
5. Materializar alistamentos elegíveis confirmados em fonte global única; excluir sandbox, pendências, duplicatas e pagamentos revertidos conforme política aprovada.
6. Implementar entitlement e conteúdo da Academia KR a partir do evento durável de 1.000.000.
7. Implementar outbox idempotente para notificações e agendamento CIGKV; validar capacidade, fuso, encerramento de admissões e drenagem de partidas.
8. Executar E2E em staging com provedor de teste, retries concorrentes, pagamento anterior/posterior ao redirect, webhook repetido, falha em cada fronteira, reconciliação e teste de acesso antes/depois do pagamento. Só depois dos gates e aprovação explícita considerar live.

## Decisão operacional

**NO-GO para cobrança live e para declarar a Jornada Oficial concluída.** Confirmar em cada ambiente que não há credenciais Stripe live e que `KRC_CHECKOUT_ENABLED` está desligado; este checkout local não verificou secrets nem transações da conta hospedada. Excluir pagamentos de sandbox do contador de 1.000.000. O estado atual permite validar partes do backend em teste; não satisfaz ainda as sete etapas como experiência real do jogador.
