# OIDC do Replit no Render — compatibilidade e plano de staging

## Conclusão

**A compatibilidade técnica do fluxo no código está preparada, mas o suporte/registro do callback externo ainda não foi confirmado.** O fato de a aplicação conseguir iniciar o OIDC no Render não prova que o serviço Replit Auth autorize ou suporte callback hospedado fora de um app Replit. Não expor esse login a jogadores até concluir o teste com o host real e confirmar o registro permitido pelo provedor.

A documentação do Replit descreve Replit Auth para ambientes de desenvolvimento, apps publicados e domínios personalizados conectados a um app publicado pelo Replit. Ela não confirma, por si só, o caso de uma aplicação hospedada no Render [1] [2].

## Implementação atual relevante

Em `server/replit_integrations/auth/replitAuth.ts`:

- O issuer padrão é `https://replit.com/oidc` (`ISSUER_URL` pode sobrescrevê-lo) e `REPL_ID` é usado como client ID.
- Em produção, `PUBLIC_ORIGIN` é obrigatório e deve usar HTTPS. O hostname do request precisa corresponder ao hostname configurado; host divergente é rejeitado como `Untrusted request host`.
- O callback é exatamente `${PUBLIC_ORIGIN}/api/callback`; o logout retorna ao origin configurado. O app confia em um proxy (`trust proxy = 1`) e usa cookie de sessão `Secure`, `HttpOnly`, `SameSite=Lax`.
- As sessões são persistidas em PostgreSQL. `SESSION_SECRET_CURRENT` (ou `SESSION_SECRET` legado) precisa ter ao menos 32 bytes. A rotação pode aceitar `SESSION_SECRET_PREVIOUS` até `SESSION_SECRET_PREVIOUS_VALID_UNTIL`.
- `/api/auth/user` exige sessão válida; discovery OIDC indisponível deixa a API em modo degradado e as rotas OIDC respondem indisponível até a recuperação.

O workflow atual usa `https://khaaos-run-staging.onrender.com/healthz.json` no health check. Antes do ensaio, confirme que esse é o hostname real do serviço Render e configure `PUBLIC_ORIGIN` para exatamente `https://khaaos-run-staging.onrender.com` (ou para o hostname de staging que for efetivamente atribuído). A URL de callback a registrar/testar será `<PUBLIC_ORIGIN>/api/callback`.

## Plano de validação — Replit → Render staging

### 1. Preparar ambiente isolado

1. Criar/confirmar um serviço **staging** no Render e usar somente conta de teste.
2. Manter banco, Redis, secrets e usuários de staging separados dos de produção. Não copiar banco ou sessões de produção para staging.
3. Configurar no Render os nomes de variáveis necessários, sem gravar valores em documentação, workflow, logs ou chat: `NODE_ENV=production`, `PUBLIC_ORIGIN`, `REPL_ID`, `SESSION_SECRET_CURRENT` (mínimo 32 bytes), `DATABASE_URL` e, se usado na rotação, `SESSION_SECRET_PREVIOUS` e `SESSION_SECRET_PREVIOUS_VALID_UNTIL`. Definir explicitamente `ISSUER_URL=https://replit.com/oidc` ou confirmar o default.
4. Garantir que o schema/tabela de sessões exista antes do deploy (`connect-pg-simple` usa `createTableIfMissing: false`) e que as dependências de persistência/limitação distribuída estejam saudáveis.
5. Solicitar ao administrador do client/IdP Replit a autorização da URI de redirect **exata**: `<PUBLIC_ORIGIN>/api/callback`. Confirmar expressamente se o uso do Replit Auth em host Render é permitido. Não presumir que a lista de callbacks aceita domínios externos.

### 2. Exercitar o fluxo positivo

1. Confirmar `/healthz.json` saudável e sem expor configuração sensível.
2. Abrir `GET /api/login`; validar que a resposta inicia o redirect ao issuer esperado e que o parâmetro `redirect_uri` decodificado é exatamente `<PUBLIC_ORIGIN>/api/callback` — scheme HTTPS, hostname e path sem diferença.
3. Completar autenticação com uma conta de teste. O callback deve voltar ao Render e redirecionar para `/`, sem erro de `redirect_uri`, `state` ou `nonce`.
4. Confirmar `GET /api/auth/user` retorna `200` para a sessão e `401` sem sessão. Inspecionar apenas atributos do cookie: `Secure`, `HttpOnly`, `SameSite=Lax`; não registrar cookie, authorization code, access token, refresh token ou claims completos.
5. Reiniciar/reimplantar o serviço e verificar a persistência da sessão via store PostgreSQL. Exercitar renovação com `offline_access` se o token de staging permitir e conferir que o usuário continua ligado pelo mesmo `sub`.
6. Executar `POST /api/logout` na origem correta; confirmar limpeza da sessão, redirect de logout permitido e `401` subsequente em `/api/auth/user`.

### 3. Verificar rejeições e fronteiras de segurança

- Request com `Host`/hostname diferente de `PUBLIC_ORIGIN`: `/api/login` e `/api/callback` devem rejeitar com `400`, sem iniciar autenticação.
- Logout `GET`: deve retornar `405`; `POST /api/logout` com `Origin` diferente ou contexto cross-site: `403`.
- Callback com `redirect_uri` divergente, state/nonce inválidos, code expirado ou IdP indisponível: não criar sessão autenticada; a API deve responder/retornar ao fluxo de erro previsto sem loop de login.
- Endpoint de usuário sem cookie válido, sessão revogada ou depois do logout: `401`.
- Nenhuma falha pode registrar secrets, codes, tokens, cookies ou payload OIDC completo.

### 4. Aceite, promoção e rollback

O staging só passa quando os casos positivos e negativos acima tiverem evidência com timestamp, hostname e resultado HTTP — com credenciais e dados pessoais removidos —, a URI estiver autorizada pelo IdP e o comportamento tiver confirmação do administrador/provedor. Repetir o teste com o hostname final de produção, caso seja diferente do staging; cada origin precisa de callback explícito.

A transição de domínio pode exigir novo login porque cookies não são compartilhados entre o host Replit e o host Render. Preserve a associação de conta pelo `sub` OIDC estável; não migre tokens/sessões como forma de manter login. Promova somente após um canary controlado e mantendo um caminho de rollback para o serviço/origin anterior. Se o provider rejeitar a URI ou não confirmar suporte externo, pare a promoção: mantenha deploy externo/auth desativado e escolha um IdP que permita registrar o domínio Render ou hospede a aplicação sob um deployment compatível com Replit Auth. O gate de deploy Render deve continuar desligado para tráfego real até o aceite.

## Estado desta revisão

O código e o plano foram revisados localmente em 2026-11-01; **o login no IdP real, a autorização de callback Render e a persistência de sessão em staging não foram executados** nesta revisão, pois dependem de configuração/credenciais e de confirmação do provedor. Compatibilidade externa continua não comprovada.

## Fontes

[1]: https://docs.replit.com/features/auth-and-identity/authentication "Replit Auth — documentação oficial"
[2]: https://docs.replit.com/features/publishing/custom-domains "Custom Domains — documentação oficial"
