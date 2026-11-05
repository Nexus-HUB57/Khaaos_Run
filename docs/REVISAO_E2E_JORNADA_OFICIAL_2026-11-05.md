# Revisão E2E — Jornada Oficial do Jogador

**Data:** 2026-11-05  
**Base:** `origin/main` após PR #282
**Escopo:** cadastro/login, alistamento e pagamento, liberação de acesso, marco de 1.000.000, Academia KR e agendamento do CIGKV.

## Resultado executivo

A Jornada Oficial está especificada como alvo de produto, mas **não está implementada end-to-end nem pronta para lançamento**. Esta atualização implementa a conta própria por email/senha no código (migração, endpoints, interface e testes), mantendo OIDC; porém o cadastro local permanece fechado até configurar e provar a entrega SMTP em staging. Checkout ainda não é BRL/live, pagamento não funciona como gate transversal e não há contador/entitlement/outbox/agendamento global conectados ao marco EXCO.

Nesta revisão foi corrigido um risco financeiro P1: sem gateway configurado, `POST /api/enrollment/fee` não pode mais declarar pagamento, completar a sessão ou gravar lançamentos/bônus. O endpoint falha com `503 PAYMENT_PROVIDER_NOT_CONFIGURED`. A simulação foi tornada explícita para testes não-production. Também foi removido o subject OIDC interno da metadata Stripe; o webhook resolve a sessão pela chave única de protocolo persistida no servidor.

Essas correções reduzem risco, mas **não transformam o fluxo atual em cobrança real**. Não ativar live checkout nem anunciar a jornada como disponível até fechar os bloqueios abaixo.

## Auditoria por etapa

| Etapa | Estado observado | Pendência/bloqueio |
|---|---|---|
| 1. Cadastro | Branch `feat/local-email-password-auth` adiciona formulário com Nome/Email/Senha/Confirmar Senha, APIs, persistência separada, scrypt, token de verificação e recuperação. A confirmação é validada e descartada. | O código não auto-vincula contas OIDC por email. Cadastro local responde indisponível quando SMTP não está configurado; a configuração, entrega real, staging e operação de suporte continuam pendentes. |
| 2. Login | Branch adiciona login local para contas com email verificado; OIDC permanece disponível. A sessão usa o subject canônico em Passport e resposta pública sem hashes. | Executar login com email real verificado em staging e validar cookies/proxy no domínio publicado. Login não representa alistamento pago. |
| 3. Taxa nominal US$ 1 | Há gateway Stripe de alistamento test-only opcional, mas o valor atual é `usd`/100 centavos. A conversão BRL ainda não está aprovada/configurada. | Definir valor BRL, fonte e validade do câmbio, arredondamento, tributos, recibo e política comercial. A rota exige provedor para concluir; sem ele responde 503. Nenhuma cobrança live foi habilitada ou testada. |
| 4. Confirmação e acesso | No modo de teste, webhook pode concluir sessão. O redirect do navegador não é confirmação. | O middleware atual autentica OIDC, mas a liberação de Perfil/War'I não é aplicada transversalmente conforme estado pago. O checkout não está conectado a uma interface completa de jornada no cliente. |
| Segurança do pagamento | Testes sequenciais cobrem webhook, idempotência e ledger. | Ainda há bloqueios P1 para live: tentativas concorrentes com chaves diferentes não têm uma claim durável única; múltiplas Checkout Sessions podem coexistir; o webhook não valida um `Stripe Session ID` persistido nem confronta `client_reference_id`; ledger, saldo, sessão e evento não estão cobertos por uma única transação. Política de pagamento duplicado/reembolso e recuperação de falha parcial também não estão implementadas. |
| 5. Marco de 1.000.000 | Há protótipos isolados no POJ e BetaCampaign UE5, com contagem/fase em memória ou local à instância. | Não existe contador global canônico ligado a alistamentos fiduciários confirmados, deduplicação por conta elegível nem registro durável do cruzamento. Pagamentos sandbox não devem contar. |
| 6. Academia KR | Não há entitlement, gate de autorização ou conteúdo de Academia conectado. | Definir conteúdo, regra de elegibilidade e autorização server-side; persistir desbloqueio único e testável após o marco. |
| 7. Notificação e agenda CIGKV | Existe sinal local `OnExcoMilestoneReached` no BetaCampaign e countdown no POJ que avança por chamada explícita; ambos são protótipos sem entrega persistente ao jogador. | Definir canal, data/hora/fuso, capacidade e gates operacionais; usar outbox durável e idempotente. O marco inicia o processo, não abre automaticamente produção sem aceite. |

## Correções feitas nesta branch

1. **Fail-closed de pagamento:** a rota não simula pagamento por padrão. Sem gateway, devolve `503` com código `PAYMENT_PROVIDER_NOT_CONFIGURED`; não conclui alistamento nem credita ledger/bônus.
2. **Simulação explícita:** os testes de fluxo que precisam de confirmação sintética passam `allowSimulatedFeeForTests: true`; esse opt-in é ignorado em `NODE_ENV=production`.
3. **Minimização de dados Stripe:** `userId` foi removido da metadata. O contrato `EnrollmentStore` e a store PostgreSQL agora permitem localizar a inscrição por protocolo único para o webhook.
4. **Cobertura de regressão:** prova negativa valida que a rota sem gateway mantém `AWAITING_FEE`, `fee=null` e bônus zero. A prova Stripe também verifica que a metadata não inclui o identificador interno.
5. **Documentação canônica:** README e índice canônico distinguem explicitamente alvo de produto, preview econômico e implementação real.
6. **Cadastro/login local nesta branch:** migration `0013_local-auth`, credenciais/tokens em tabelas separadas, endpoints de registro/login/verificação/reenvio/reset, cliente em `/auth` (`/login` e `/cadastro`), SMTP default-off, rate limit por IP, validação Origin, scrypt e sem auto-vínculo por email. Detalhes em [`LOCAL_EMAIL_PASSWORD_AUTH.md`](LOCAL_EMAIL_PASSWORD_AUTH.md).
7. **Revogação sem bloquear re-login:** logout grava instante de revogação; middleware e tickets/socket com autenticação anterior são recusados, mas um login OIDC/local posterior recebe timestamp server-side novo. O logout fecha sockets antigos e o cliente submete POST same-origin.
8. **Corrida OIDC/local de email:** ambos os fluxos serializam a criação/upsert por advisory transaction lock usando email normalizado. Se um email já pertence a outro subject, o OIDC não auto-vincula nem cria uma segunda identidade; teste PostgreSQL cobre capitalização concorrente.

## Evidência de validação

- `npm run check` — **PASS**.
- Testes oficiais de enrollment e Stripe — **14/14 PASS**.
- Testes PostgreSQL de enrollment e fulfillment Stripe — **6/6 PASS**, executados contra PostgreSQL local dedicado `khaaos_journey_test` (não produção).
- `npm run verify:all` — **PASS** em todos os gates (TypeScript, build, 560/560 testes oficiais, preflights Python, regras UE5 e runtime; 1.047 testes runtime passaram e 13 foram skip conforme configuração).
- `npm run test:postgres` — **176 PASS, 2 SKIP, 0 FAIL** contra PostgreSQL local descartável; inclui 4 testes local-auth para migração, concorrência, verificação, reset e colisão OIDC/local. A suíte permanece serial por arquivo para evitar colisão dos hooks de migração.
- `npm audit --omit=dev --audit-level=moderate` — **0 vulnerabilidades** nas dependências de produção.
- O checkout foi testado somente com fixtures/chaves de teste; não foram feitas cobranças nem alterações em um provedor externo.
- `npm run check`, build, testes direcionados de auth/session/OIDC (17/17) e PostgreSQL local-auth (4/4) também passaram em bancos `*_test` efêmeros. Os papéis e bancos de teste foram criados somente para esta validação; nenhuma base compartilhada foi usada.
- Nenhum secret SMTP/Stripe, DNS, ambiente hospedado ou transação externa foi inspecionado nesta revisão. Não inferir que a ausência de credenciais live foi verificada no ambiente remoto.

## Próximas entregas recomendadas

1. Configurar SMTP por secret manager em staging; validar SPF/DKIM/DMARC e recebimento em caixa real para verificação/reset; testar login local e as regras de conta preexistente OIDC sem vinculação automática.
2. Aprovar cotação/preço final BRL, tributos, recibo, idade mínima, reembolso, chargeback, privacidade e sign-off jurídico/fiscal.
3. Criar ordem/tentativa de pagamento persistida, uma única tentativa ativa por alistamento e vínculo a `Stripe Session ID`/`client_reference_id`; serializar transições no PostgreSQL. Tornar fulfillment financeiro + sessão + evento atômicos e reconciliáveis.
4. Aplicar entitlement de pagamento às páginas e APIs do Perfil/War'I, mantendo exceções explícitas para login, pagamento, status e suporte.
5. Materializar alistamentos elegíveis confirmados em fonte global única; excluir sandbox, pendências, duplicatas e pagamentos revertidos conforme política aprovada.
6. Implementar entitlement e conteúdo da Academia KR a partir do evento durável de 1.000.000.
7. Implementar outbox idempotente para notificações e agendamento CIGKV; validar capacidade, fuso, encerramento de admissões e drenagem de partidas.
8. Executar E2E em staging com provedor de teste, retries concorrentes, pagamento anterior/posterior ao redirect, webhook repetido, falha em cada fronteira, reconciliação e teste de acesso antes/depois do pagamento. Só depois dos gates e aprovação explícita considerar live.

## Decisão operacional

**NO-GO para cadastro público sem SMTP comprovado, cobrança live e para declarar a Jornada Oficial concluída.** Confirmar em cada ambiente o estado de secrets/flags; este checkout local não verificou SMTP/Stripe hospedados. Manter checkout live desligado e nenhum pagamento sandbox no contador de 1.000.000. O app permite validar partes do backend em teste, mas não satisfaz ainda as sete etapas como experiência completa do jogador.
