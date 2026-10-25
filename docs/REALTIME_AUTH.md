# Autenticação em tempo real e controles da zona

## WebSocket

O navegador deve obter um token por `GET /api/auth/ws-token`, usando a sessão OIDC autenticada. O endpoint responde com token assinado HMAC e expiração em 60 segundos, sem cache. Cada ticket tem um `jti` aleatório e pode autenticar apenas um handshake: Redis consome-o com `SET NX` e TTL, de forma compartilhada entre réplicas. Conexão e comando Redis têm deadlines absolutos de 2 segundos; o socket também fecha após 1,5 segundo sem atividade. Timeout/erro fecha o upgrade. Cada processo limita a 128 os consumos de tickets simultâneos; esse limite não é agregado entre réplicas. Em produção, Redis é obrigatório para esse controle mesmo se `REDIS_REQUIRED=false`. Sem Redis, fallback local fica desativado por padrão e só pode ser habilitado explicitamente em `development`/`test` com `WS_LOCAL_TICKET_FALLBACK=true`; o `Map` local não protege entre processos e não há fallback em staging/preview ou produção. O marcador Redis/local permanece por até 90 segundos para cobrir a validade do ticket e a tolerância máxima de relógio aceita.

A conexão envia `khaaos-v1` e `khaaos-token.<token>` em `Sec-WebSocket-Protocol`. O servidor exige `Origin` igual à origem de `PUBLIC_ORIGIN` e recusa origem divergente/ausente com HTTP 403. Em produção, `PUBLIC_ORIGIN` deve usar HTTPS e a flag `WS_ALLOW_MISSING_ORIGIN` não libera handshakes sem Origin; o uso dessa flag é restrito a desenvolvimento/teste com clientes nativos confiáveis. Em desenvolvimento sem `PUBLIC_ORIGIN`, compara com a origem do host local. Clientes nativos devem preferencialmente enviar `Origin` com a origem pública. O servidor valida o ticket no handshake e recusa ticket ausente, inválido, expirado ou reutilizado com HTTP 401. O `userId` de jogo vem exclusivamente do `sub` assinado; o campo `userId` enviado em mensagens do cliente é ignorado.

Configure `PUBLIC_ORIGIN` com a origem HTTPS pública exata e `WS_TOKEN_SECRET` como segredo aleatório de pelo menos 32 bytes. Se `WS_TOKEN_SECRET` não estiver definido, o sistema usa `SESSION_SECRET` como chave de assinatura. Não registre nem exponha o token; ele é uma credencial temporária. Mantenha `SESSION_SECRET` forte e privado, pois ele também protege sessões web.

## Operação da zona

As rotas `POST /api/zone/start` e `POST /api/zone/stop` são administrativas e negam acesso por padrão. Defina `ZONE_OPERATOR_IDS` como lista separada por vírgulas de IDs OIDC autorizados, por exemplo `id-a,id-b`. `GET /api/zone/permissions` informa à interface se o usuário autenticado tem permissão; a autorização é sempre reaplicada no servidor e a resposta não é cacheada.

Sem `ZONE_OPERATOR_IDS`, jogadores podem consultar e jogar, mas nenhum deles pode iniciar ou encerrar a zona global. Em implantação, cadastre pelo menos um operador confiável.

## Verificação

```bash
npm run check
npm run test:official
npm run verify:all
```

A integração Redis usa duas instâncias `DistributedState` e confirma `SET NX` e TTL. Defina uma instância Redis de teste para executá-la explicitamente; `verify:all` a executa quando a variável estiver definida e a marca como ignorada quando não estiver:

```bash
WS_TICKET_REDIS_TEST_URL=redis://127.0.0.1:6379 npm run test:ws-ticket-redis
```

A suíte oficial valida emissão, adulteração, expiração e tolerância de clock dos tokens, consumo concorrente de uso único, fallback local somente com opt-in, rejeição do handshake sem token/Origin ou com origem externa, regras de Origin em produção, vínculo da identidade ao subject autenticado e allowlist da zona.
