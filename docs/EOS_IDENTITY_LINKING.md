# Vinculação de identidade do jogador — EOS Connect

## Objetivo e limite desta etapa

Esta etapa estabelece a identidade persistente entre uma conta web autenticada (OIDC atual do projeto) e uma identidade de jogo EOS Connect. O identificador canônico é o **Product User ID (PUID)** vindo do claim `sub` de um **EOS Connect ID token** validado pelo backend. Um PUID enviado isoladamente pelo cliente não é prova de identidade.

O fluxo vincula duas contas existentes; não faz merge de contas, migração de inventário ou recuperação de conta. Também não transforma o PUID em credencial de sessão. As rotas de economia e inventário continuam a exigir a identidade de sessão atual até uma etapa posterior da ponte UE5/API.

## Modelo PostgreSQL

A migration `0006_eos_identity_linking.sql` cria:

- `game_identity_links`: vínculo permanente entre `users.id` e a identidade EOS. Guarda `provider`, `provider_subject` (PUID), Product/Sandbox/Deployment IDs e timestamps. O banco garante um vínculo EOS por usuário e não permite que o mesmo PUID do mesmo produto seja associado a duas contas. O escopo inclui Product ID porque PUIDs são específicos de produto.
- `identity_link_challenges`: desafios temporários iniciados por uma conta web. Armazena somente SHA-256 do código, estado, expiração e, depois da prova EOS, os claims mínimos para a confirmação. A linha referencia `users.id` com `ON DELETE CASCADE`.

Estados possíveis: `PENDING` → `AWAITING_CONFIRMATION` → `CONFIRMED`, ou `CANCELLED`/`EXPIRED`. Um novo desafio do mesmo usuário cancela desafios ainda ativos. O código tem 256 bits aleatórios e validade de 10 minutos; o texto original só é devolvido ao usuário na criação.

A migration `0007_eos_identity_proof_replay.sql` adiciona SHA-256 único do EOS ID token usado. Isso torna a submissão repetida no mesmo desafio idempotente e bloqueia o reaproveitamento do mesmo token em outro desafio enquanto o token ainda pode ser aceito. O token bruto nunca é persistido.

## Fluxo

1. O jogador entra na conta web existente e solicita `POST /api/player/identity-links/challenges`. O backend deriva `userId` exclusivamente da sessão, invalida desafios anteriores do usuário e devolve `challengeId`, `code` e `expiresAt` com `Cache-Control: no-store`.
2. No jogo, após login bem-sucedido via EOS Connect, a integração UE5 deverá obter o ID token por `EOS_Connect_CopyIdToken` e enviar o código e token a `POST /api/game/identity-links/eos-proof`. O servidor valida assinatura com o JWKS oficial da Epic, `iss`, `aud`, `exp`, `iat` (idade máxima de 5 minutos) e os claims `pfpid`, `pfsid` e `pfdid` contra a configuração do deployment. O token precisa ser recente; se não for, o cliente deverá renovar a autenticação EOS.
3. O servidor registra o PUID candidato e altera o desafio para `AWAITING_CONFIRMATION`. A conta web consulta `GET /api/player/identity-links/challenges/:challengeId` e recebe somente um PUID mascarado.
4. O usuário confirma explicitamente com `POST /api/player/identity-links/challenges/:challengeId/confirm`. Em uma transação PostgreSQL, o backend insere a identidade e encerra o desafio. Índices únicos resolvem corridas entre contas ou confirmações concorrentes; o servidor não transfere nem substitui vínculos existentes.
5. `GET /api/player/identities` lista os vínculos da sessão atual sem revelar o PUID completo.

As rotas de criação, consulta, confirmação e listagem são protegidas pela sessão web e pelo guard CSRF existente. A rota de prova é intencionalmente sem cookie de sessão — a prova é o token EOS assinado junto com o código aleatório criado pela conta web. Nenhum endpoint aceita `userId` no payload.

## Configuração do backend

Além dos IDs existentes em `.env.example`, o serviço requer:

```dotenv
EOS_CONNECT_CLIENT_ID=<Client ID que aparece no claim aud>
EOS_CONNECT_ISSUER=<valor exato do claim iss, em HTTPS no host api.epicgames.dev>
```

O verificador busca as chaves em `https://api.epicgames.dev/auth/v1/oauth/jwks`; esse URL é fixo no código para não criar uma fonte de chaves controlada por configuração. `EOS_PRODUCT_ID`, `EOS_SANDBOX_ID` e `EOS_DEPLOYMENT_ID` também precisam corresponder ao token. Configuração ausente ou inconsistente fecha o fluxo (`503`/`401`). Os IDs do EOS não substituem secrets de servidor. **Nunca** inclua `EOS_CLIENT_SECRET` no build/distribuição do cliente UE5.

## Integração UE5 ainda necessária

O backend e o contrato HTTP estão implementados; o cliente UE5 ainda precisa:

- obter um EOS **Connect** ID token após autenticação Connect (não um Auth/Epic Account ID token);
- oferecer uma tela para inserir o código gerado na conta web e enviar `code` + `idToken` por HTTPS;
- exibir sucesso/expiração e orientar o jogador a confirmar na conta web;
- não enviar PUID cru como credencial e não incluir client secret no cliente.

O `KhaaosEOSManager` atual não é considerado prova completa até expor e validar o fluxo `EOS_Connect_CopyIdToken`; o valor local de `FEosProductId` sozinho não autentica chamadas ao backend. A emissão de tokens de sessão próprios para a integração do game runtime fica para a etapa seguinte, usando a identidade vinculada e controles de autorização próprios.

## Aplicação e validação

Aplicar migrations em ambiente com PostgreSQL configurado usando `npm run db:migrate`. Esta alteração não executa migration automaticamente. Testes locais cobrem assinatura/claims, idade do token, entropia do código, contratos e exigência de sessão. O teste de integração transacional contra PostgreSQL deve ser executado antes de habilitar o fluxo em produção.

Referências oficiais: [EOS Connect Interface Reference — ID Tokens e validação backend](https://dev.epicgames.com/docs/game-services/connect/connect-reference) e [Connect Web APIs](https://dev.epicgames.com/docs/web-api-ref/connect-web-api).
