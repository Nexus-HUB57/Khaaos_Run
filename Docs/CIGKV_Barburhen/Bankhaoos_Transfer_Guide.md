# Bankhaoos e progressão entre mundos — estado do protótipo

> **Status de segurança:** KRC é moeda virtual interna do jogo. Esta documentação descreve protótipos Unreal locais, não um serviço financeiro de produção. Não há endereço de depósito, checkout, API de pagamento, saque, resgate ou Mainnet. Não envie dinheiro ou cripto para qualquer endereço relacionado ao projeto.

## Bankhaoos no Unreal

`UKhaaosBankhaoosComponent` contém estado local de demonstração. `InitialKRC`, `CreditKRC` e `DebitKRC` não consultam o PostgreSQL autoritativo nem a API econômica do servidor. Não conecte esses métodos diretamente a input remoto do jogador, Blueprints replicados ou recompensas ranqueadas. Para partidas online, o servidor de jogo deve validar elegibilidade e valor e persistir a alteração pelo serviço econômico; até essa integração ser implementada, o componente não deve conceder saldo em produção.

O componente não cria nem exibe `DepositAddress`. O antigo formato aleatório `krc1…` foi removido porque não correspondia a uma carteira ou rede real.

## Compras e pagamentos

A interface web mantém saldos para gameplay, transferências internas e itens conforme as rotas autoritativas cobertas pelo `EconomyService`. Depósitos de valor real estão desativados: `POST /api/bank/deposit` responde `503 PAYMENTS_NOT_CONFIGURED` e não credita KRC. Não existe endpoint de produção `/api/bankhaoos/create`, `/credit` ou `/debit`; qualquer referência anterior a essas rotas era uma proposta não implementada.

Um checkout futuro exigirá ordem criada no servidor a partir de catálogo controlado, confirmação de webhook assinado, processamento idempotente e concessão transacional do entitlement. A escolha do provedor e dos mercados está pendente. KRC permanecerá uma moeda fechada, sem token ou conversibilidade.

## Progressão parcial entre mundos

O sistema `UKhaaosTransferSystem` é um protótipo de progressão interna, não uma transferência de ativo financeiro. Percentuais, requisitos de ranking e recompensas precisam coincidir com regras versionadas do servidor antes de serem considerados contrato de jogo.

Para mudar essas regras, registre uma decisão de produto e acrescente testes que comprovem ownership, limite de elegibilidade, idempotência e comportamento em retry. Não use valores enviados pelo cliente como prova de ranking, entitlement ou saldo.

## Preparação para integração online

Antes de ligar o Unreal à API:

1. Autenticar o jogador por sessão/ticket verificável pelo servidor; nunca aceitar `playerId` fornecido no body como identidade.
2. Fazer o servidor calcular saldo, recompensa e preço; o cliente envia apenas a intenção da ação.
3. Aplicar cada mutação junto com o ledger e a chave de idempotência em uma transação PostgreSQL.
4. Usar eventos de domínio e confirmação de resposta para atualizar a HUD, mantendo estados pendentes e mensagens recuperáveis após desconexão.
5. Cobrir replay, chamadas concorrentes, troca de conta, desconexão e reconciliação em testes de integração.

Até esses gates passarem, o componente Unreal é somente scaffolding local e não deve ser descrito como bridge ou implementação de produção.
