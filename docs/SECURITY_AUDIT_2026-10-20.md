# Auditoria de segurança — Khaaos_Run

**Data:** 20 de outubro de 2026  
**Repositório:** `Nexus-HUB57/Khaaos_Run`  
**Base remota examinada:** `main` / `7c09236e3e6aca1506ee2b07bd056b7ed3c975cf`  
**Escopo:** revisão estática por domínios, testes automatizados selecionados, `npm audit` e execução do pipeline local integrado. Não é certificação nem pentest externo. O clone foi atualizado porque a `main` havia avançado depois da análise de 10 de outubro.

## Resumo executivo

A implementação atual já autentica o WebSocket com token HMAC de curta duração emitido por endpoint OIDC protegido; o servidor deriva o `userId` do token assinado, valida mensagens com schema, limita payload e taxa por conexão. As suítes de testes e o pipeline integrado passaram. Não foram encontrados advisories ativos no snapshot de dependências consultado.

A revisão estática ainda encontrou riscos relevantes que não são cobertos pelos testes: replay de tokens WS e ausência de validação de Origin; defaults administrativos inseguros no runtime separado; estado de salas/jogadores que pode permanecer após desconexão; autorização de sala privada por ID; exposição de snapshots de estado completo; e falhas de segurança em alguns workflows de PR/release. Há também problemas de consistência no preview de empréstimo, limite de CPU em procgen e autorização do respawn.

As alterações locais desta revisão incluem um job geral de notificação de falha Discord/Slack no workflow principal e a atualização do guia de configuração. Elas **ainda não foram commitadas nem publicadas**. A sessão não tem permissão para consultar Actions secrets: GitHub retornou `403 Resource not accessible by integration`; portanto a existência dos secrets não foi confirmada nem seus valores acessados.

## Achados prioritários

### Alto

1. **Defaults de autenticação administrativa no runtime standalone.** `game-runtime/server/server.js:30-42,65-69` usa `ADMIN_TOKEN=change-me` e uma chave de desenvolvimento como fallback, sem abortar em produção quando as variáveis faltam. `game-runtime/server/auth.js:7-10` usa essa chave para assinar/verificar tokens. Se o runtime for implantado sem configuração, um bearer administrativo conhecido pode ser aceito. **Ação:** remover fallbacks em produção, exigir segredo forte e valor administrativo aleatório no startup, eliminar o caminho legado e rotacionar qualquer credencial que tenha sido usada.

2. **Workflow de Docker de PR com privilégio de publicação.** `.github/workflows/ci.yml:12-17,186-210` permite `pull_request`; o job `docker-build` tem `packages: write`, faz login no GHCR antes do build e executa código/contexto do PR. A exposição concreta depende do tipo de PR e das permissões efetivas do GitHub, mas PRs internos não devem executar build controlado pelo autor com token de publicação. **Ação:** separar build sem credenciais para PR de publicação condicionada a push na branch protegida; limitar permissões do job de PR a `contents: read`.

3. **Injeção de shell em release com permissão de escrita.** `.github/workflows/release.yml:5-22,40-56` recebe `version` sem validação estrita, concede `contents: write` e `packages: write`, e interpola o input em comandos shell. **Ação:** passar input por variável de ambiente, validar SemVer estritamente, usar environment protegido/aprovação e evitar interpolação direta em `run`.

### Médio

4. **Replay e concorrência de token WebSocket.** `server/replit_integrations/auth/ws-token.ts:25-60` assina tokens sem `jti`/estado de uso e valida apenas HMAC, propósito e validade de 60 segundos. `RoomManager.ts:519-535,578-587` não revoga o ticket e não fecha necessariamente o socket anterior no rebind. Um probe local confirmou que o mesmo token abre duas conexões simultâneas. **Ação:** implementar nonce/ticket de uso único com consumo atômico e expiração compartilhada (Redis/DB) ou política explícita de sessão única; revogar/rotacionar no logout e fechar socket antigo no rebind.

5. **Lobbies privados acessíveis por `roomId`.** `server/routes.ts:467-475` expõe listagem/detalhe a usuários autenticados; `RoomManager.ts:323-326,436-464,1488-1504,1660-1668` permite o fluxo `join` direto e a listagem não filtra `isPrivate`, enquanto validação de código fica em rota separada. **Ação:** filtrar salas privadas e exigir convite/ticket de admissão ligado à sala, usuário e expiração em toda rota de entrada.

6. **Snapshots realtime expõem entidades fora da área de interesse.** `RoomManager.ts:959-1012` define helper de AOI que não é chamado pelo broadcast usado em produção; `:1283-1303,1342-1365` serializa jogadores e loot da sala. O runtime standalone também envia snapshot global em `game-runtime/server/room.js:151-168` e `server.js:81-85,207-212`. **Ação:** aplicar AOI no caminho de broadcast real e separar estado privado do estado público por observador.

7. **Respawn sem validação do estado da partida.** `server/routes.ts:457-463` exige apenas usuário autenticado e chama `storage.respawnPlayer`; `server/storage.ts:463-469` restaura saúde/status sem exigir jogador eliminado, cooldown ou ausência de partida ativa. **Ação:** tornar a transição condicional a estado e sala autoritativos, com cooldown e update atômico.

8. **`count` sem limite no endpoint de procgen.** `server/routes.ts:513-518` aplica `parseInt` sem faixa máxima e passa o valor a `ProceduralGenerator.ts:136-148`, que pode executar até 20 × `count` tentativas síncronas. **Ação:** validar inteiro positivo com limite baixo e aplicar rate limit/custo máximo.

9. **Workflow de PR executa script alterável com permissão de escrita.** `.github/workflows/ue5-ci.yml:17-30,216-225` executa script do PR com `pull-requests: write` global. `.github/workflows/dev-coordination.yml:7-14,30-40` injeta nomes de arquivos do PR diretamente em código JavaScript. **Ação:** remover permissões de escrita dos jobs que executam código não confiável e serializar dados por variável/JSON, não por interpolação de código.

10. **Inputs manuais de workflows são interpolados em shell/JSON.** `.github/workflows/release.yml`, `stress-test.yml` e `ue5-build.yml` aceitam alguns inputs livres e os inserem em scripts; há potencial de quebra de shell/payload e, em alguns caminhos, uso próximo de webhook. **Ação:** inputs tipados e validados, passagem por `env`, JSON construído por `jq` e permissões mínimas.

11. **Economia: preview de loan diverge do valor cobrado.** `server/routes.ts:503-508` usa `computeLoan` (`EconomyEngine.ts:58-59,191-199`, 4% ao dia), enquanto `EconomyService.ts:168-172` usa `calculateLoanInterestMinorUnits` (`shared/money.ts:34-39`, 5% ao dia). Para principal 1.000 por 7 dias, o preview local retornou 1.280 e o cálculo autoritativo 1.350. **Ação:** compartilhar a mesma função/política para preview e criação e testar paridade; alinhar também os limites de prazo.

### Baixo / informativo

12. **Origin não é validado no upgrade WebSocket.** `RoomManager.ts:231-250` valida o token, mas não compara `Origin` com a origem pública configurada. O probe local confirmou aceitação de `Origin: https://attacker.example` quando acompanhado de ticket válido. **Ação:** validar origem exata em browser-handshakes e decidir explicitamente o tratamento para clientes nativos sem `Origin`.

13. **Sem rate limit pré-autenticação no handshake WS.** O limite em `RoomManager.ts:265-269` começa depois que o token é aceito; tentativas inválidas de upgrade não têm quota por IP. Há também rate limit por socket, não por identidade, permitindo multiplicar a cota com conexões concorrentes. **Ação:** aplicar limites de upgrade no edge e no processo e quota agregada por usuário/IP.

14. **Refresh OIDC pode apagar `expires_at`.** `replitAuth.ts:63-70,194-198` substitui claims por `tokens.claims()` após refresh. O contrato instalado de `openid-client` permite `claims()` indefinido quando a resposta não inclui ID token; o middleware então rejeita a sessão. **Ação:** preservar claims/subject anteriores quando apropriado e calcular validade do access token a partir de `expires_in`, com teste específico.

15. **Logout é mutação via GET.** `replitAuth.ts:158-173` destrói sessão em `GET /api/logout`; o guard de métodos unsafe em `server/routes.ts:54-70` não cobre esse caminho. O impacto direto é logout forçado, mitigado parcialmente por SameSite Lax. **Ação:** tornar logout local POST com Origin/Fetch Metadata/CSRF.

16. **Resposta autenticada sem política de cache.** `server/replit_integrations/auth/routes.ts:6-16` não define `Cache-Control` em `/api/auth/user`, ao contrário do endpoint de ticket WS. **Ação:** definir `private, no-store` e testar cabeçalho.

17. **Concorrência e retenção de estado realtime.** Mensagens async do `RoomManager` não são serializadas por usuário (`:265-280,436-468,506-516`); join simultâneo pode deixar referência de usuário em sala diferente de `userToRoom`. Disconnect não libera slots nem há TTL claro para salas terminadas (`:519-595,877-889,1383-1389`). A fila também pode formar partida com usuário offline (`MatchmakingService.ts:149-153,216-313`). **Ação:** reservar estado antes de `await`, serializar comandos, definir janela de resume/TTL e reaper de salas/fila.

18. **Coordenação de várias réplicas e rate store.** `DistributedState.ts:73-131` mantém ownership/controles sem uso efetivo em todos os handlers; jogadores remotos podem ser consumidos por nó sem socket/roteamento. `game-runtime/server/rateLimit.js:3-16` acumula chaves de um `Map` sem expurgo se esse store for usado. **Ação:** validar leases/ownership, roteamento de eventos, TTL e limite de cardinalidade; validar comportamento com Redis real.

19. **Configuração de deploy potencialmente inconsistente.** Se `infra/terraform/main.tf:190-207` for a task de produção ativa, ela injeta nomes como `DB_HOST`/`JWT_SECRET`, enquanto o código exige `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `PUBLIC_ORIGIN` e outros (`server/db.ts:7-13`, `DistributedState.ts:23-35`, `replitAuth.ts:21-60`). O arquivo `render.yaml` é outra rota e o ambiente real não foi inspecionado. **Ação:** confirmar rota ativa e testar renderização da task com os nomes efetivamente consumidos.

20. **Compose de produção pode publicar serviços internos.** A combinação de `Unreal/KhaaosRun/Build/docker-compose.yml` e `infra/deploy/docker-compose.production.yml` mapeia portas de Redis, Prometheus, Grafana, Alertmanager e Pushgateway no host, sem autenticação HTTP evidente. Exposição pública depende do firewall/security group. **Ação:** manter serviços em rede privada e expor apenas proxy/ALB com controles de acesso.

21. **Faltam headers de segurança/CSP e dev server tem host permissivo.** `server/index.ts:6-24` e `server/static.ts:13-18` não instalam CSP/HSTS/frame/referrer policies; `server/vite.ts:11-18` tem `allowedHosts: true` e o servidor dev escuta em `0.0.0.0` (`server/index.ts:67-83`). **Ação:** CSP adaptada aos recursos, headers no edge/app, allowlist de Host e bind local para desenvolvimento.

22. **Erros e logs podem carregar detalhes internos.** `server/index.ts:53-61` registra mensagem/stack completos e `server/routes.ts:443-446` pode enviar `err.message` em erro inesperado de pickup. **Ação:** resposta genérica e logger com redaction/correlation ID.

23. **Gates e supply chain de GitHub Actions são permissivos.** `10-security-scan.yml:23-32` suprime o resultado de `npm audit` com `|| true`; o Trivy do CI usa `exit-code: "0"` (`ci.yml:341-355`). Foram inventariadas 121 referências `uses` em 29 workflows e nenhuma fixada a SHA completo; o scanner usa `@master` em três lugares. **Ação:** definir gates com threshold, exceções versionadas/expiráveis, permissões `contents: read` como baseline e pinning por SHA.

24. **Nomes de webhook inconsistentes nos workflows existentes.** A documentação usa `DISCORD_WEBHOOK_URL`/`SLACK_WEBHOOK_URL`, mas outros workflows usam `DISCORD_WEBHOOK` e silenciam falhas de envio com `|| true`. A consulta de nomes de secrets foi negada por `403`. **Ação:** padronizar o nome e decidir explicitamente se falha de notificação deve ser warning ou erro.

25. **Outras fragilidades de consistência.** Inicialização de jogador/banco é `SELECT` seguido de `INSERT` (`storage.ts:71-92`), podendo correr em conta nova; start de zona e spawn de loot não são uma operação atômica (`routes.ts:380-387`, `storage.ts:333-339,378-391`); console administrativo tem idempotência somente em memória (`marshalConsole.ts:119-127`); `GET /api/economy/health` contém valores sintéticos (`routes.ts:490-500`); mensagens brutas de erro podem ser retornadas em pickup (`routes.ts:443-446`). Tratar conforme os serviços se tornem multi-réplica e operacionais.

## Dependências

`npm audit --json` reportou **0 vulnerabilidades** na árvore raiz e **0** no `game-runtime` no snapshot de 20/10/2026. A auditoria independente também executou/consultou os três manifests/locks (raiz, `game-runtime` e `scripts/mvp/step3_eos_auth`) e reportou contagem total zero em cada árvore. Isso é uma fotografia dos advisories disponíveis e não substitui revisão de código, atualizações contínuas ou scanner de imagem.

## Validação executada

- `npm run verify:all`: passou em todas as etapas (TypeScript e build do app oficial, testes oficiais, validação das regras UE5, build/testes/stress do runtime).
- Suíte oficial principal: **221 passaram, 0 falharam, 1 ignorado**; suíte E2E adicional: **39/39 passaram**.
- Runtime: testes **14 passaram, 0 falharam, 2 ignorados**; integração de persistência reportou **1 teste passado**; stress passou.
- Testes OIDC/sessão selecionados: **104/104 passaram**; testes de ownership/rotas selecionados: **139 passaram**.
- Probe WebSocket local confirmou replay simultâneo do mesmo ticket e aceitação de Origin arbitrário quando usado com ticket válido. Nenhum token foi impresso.
- Workflow CI editado para alertas: YAML parseado com sucesso; `notify-failure` tem `permissions: {}` e envia somente para secrets presentes.
- `git diff --check`: passou.

## Limitações

Não foram usados OIDC, PostgreSQL, Redis, CDN, proxy, firewall, secrets manager ou load balancer de produção. Os testes Postgres/Redis que exigem serviços reais foram pulados/negados por falta de `TEST_DATABASE_URL` e serviços locais. Não foi feito fuzzing, DAST externo, teste de carga distribuído nem execução dos workflows em PR real. Os achados relativos a Terraform/compose dependem de esses arquivos serem a rota efetiva de produção.

A API GitHub respondeu `403 Resource not accessible by integration` para `gh secret list` e GET de metadados. Nenhum valor de secret foi lido, impresso, cadastrado ou alterado. Um administrador deve confirmar `DISCORD_WEBHOOK_URL` e `SLACK_WEBHOOK_URL` em **Settings → Secrets and variables → Actions**; o job de CI já está preparado para usá-los quando existirem.

## Próximas ações recomendadas

1. Remover defaults administrativos de produção e separar build de PR da publicação GHCR.
2. Adotar ticket WS de uso único/revogável, validação de Origin, quota de handshake e limite de conexões por usuário.
3. Corrigir lobbies privados, AOI real e ciclo de vida de sala/fila.
4. Corrigir o preview de empréstimo, limitar procgen e autorizar respawn pelo estado de partida.
5. Corrigir workflows de release/PR, gates de auditoria e pinning das Actions.
6. Confirmar a rota ativa de deploy, fechar portas internas e adicionar headers/CSP.
7. Confirmar/cadastrar os secrets de notificação no GitHub com uma conta administradora; não compartilhar URLs de webhook no chat.
