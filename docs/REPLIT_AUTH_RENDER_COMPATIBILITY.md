# Replit Auth OIDC no Render: compatibilidade

## Conclusão

**Compatibilidade técnica não confirmada; suporte oficial para hospedar a aplicação fora do Replit não está documentado.** O código usa OIDC padrão e constrói o callback com o hostname recebido pela aplicação, mas isso não prova que o serviço de Replit Auth aceite um callback hospedado em `onrender.com` nem que esse cenário seja suportado.

A documentação oficial descreve o Replit Auth para ambientes de desenvolvimento (`replit.dev`) e apps publicados (`replit.app` e domínios personalizados). A documentação de domínios personalizados exige que o domínio seja conectado a um app publicado pelo Replit. Nenhuma dessas páginas documenta explicitamente um app servido pelo Render usando o Replit Auth [1] [2].

## O que o código atual faz

Em `server/replit_integrations/auth/replitAuth.ts`, o cliente descobre o issuer `https://replit.com/oidc`, usa `REPL_ID` como client ID e registra o callback como `https://${req.hostname}/api/callback`. O logout retorna ao hostname da requisição. A sessão depende ainda de `DATABASE_URL` e `SESSION_SECRET`, e define cookie `Secure`; a aplicação configura `trust proxy` para operar atrás de um proxy TLS.

Assim, o código consegue formar uma URL de callback do Render, mas não há neste repositório uma configuração que demonstre que essa URL está autorizada pelo serviço Replit. Um erro de `redirect_uri` só pode ser diagnosticado usando o host e o registro OIDC reais.

## Verificação segura recomendada

Antes de expor o host Render a jogadores:

1. Crie um serviço **staging** com hostname próprio e configure nele as variáveis de runtime, sem copiar valores secretos para logs ou para o repositório.
2. Teste `/api/login` e confirme se o IdP aceita exatamente `https://<staging-host>/api/callback`.
3. Conclua login e logout; confirme que `/api/auth/user` retorna `200` com sessão e `401` sem sessão, que a sessão sobrevive a um reinício e que o cookie tem `Secure`, `HttpOnly` e `SameSite` apropriado ao fluxo.
4. Repita a verificação após ligar o domínio de produção, caso ele seja diferente do hostname de staging.

O PR #7 colocou deploy no Render atrás da variável `RENDER_DEPLOY_ENABLED`; mantenha esse gate desativado para tráfego real até a validação. Se Replit Auth rejeitar o redirect ou a Replit confirmar que hosts externos não são suportados, será necessário escolher um IdP que permita cadastrar o domínio Render ou hospedar a aplicação sob um deployment/domínio compatível com Replit. A migração de identidade deve preservar o vínculo entre `sub` e os usuários existentes.

## Fontes

[1]: https://docs.replit.com/features/auth-and-identity/authentication "Replit Auth — documentação oficial"
[2]: https://docs.replit.com/features/publishing/custom-domains "Custom Domains — documentação oficial"
