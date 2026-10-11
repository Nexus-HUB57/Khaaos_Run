# Autenticação em tempo real e controles da zona

## WebSocket

O navegador deve obter um token por `GET /api/auth/ws-token`, usando a sessão OIDC autenticada. O endpoint responde com token assinado HMAC e expiração em 60 segundos, sem cache. A conexão envia `khaaos-v1` e `khaaos-token.<token>` em `Sec-WebSocket-Protocol`; o servidor valida o token durante o handshake e recusa tokens ausentes, inválidos ou expirados com HTTP 401. O `userId` de jogo vem exclusivamente do `sub` assinado; o campo `userId` enviado em mensagens do cliente é ignorado.

Configure `WS_TOKEN_SECRET` como segredo aleatório de pelo menos 32 bytes. Se não estiver definido, o sistema usa `SESSION_SECRET` como chave de assinatura. Não registre nem exponha o token; ele é uma credencial temporária. Mantenha `SESSION_SECRET` forte e privado, pois ele também protege sessões web.

## Operação da zona

As rotas `POST /api/zone/start` e `POST /api/zone/stop` são administrativas e negam acesso por padrão. Defina `ZONE_OPERATOR_IDS` como lista separada por vírgulas de IDs OIDC autorizados, por exemplo `id-a,id-b`. `GET /api/zone/permissions` informa à interface se o usuário autenticado tem permissão; a autorização é sempre reaplicada no servidor e a resposta não é cacheada.

Sem `ZONE_OPERATOR_IDS`, jogadores podem consultar e jogar, mas nenhum deles pode iniciar ou encerrar a zona global. Em implantação, cadastre pelo menos um operador confiável.

## Verificação

```bash
npm run check
npm run test:official
npm run verify:all
```

A suíte oficial valida emissão, adulteração e expiração dos tokens, rejeição do handshake sem token, vínculo da identidade ao subject autenticado e allowlist da zona.
