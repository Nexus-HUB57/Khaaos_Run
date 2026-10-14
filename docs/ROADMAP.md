# Roadmap de engenharia — Khaaos Run

Este roadmap é uma sequência técnica orientada a risco e critérios de aceite. Não presume datas ou capacidade de equipe. O estado parte da branch `main` após autenticação realtime, allowlist da zona, divisão de bundle por rota e integração dos testes de matchmaking.

## Estado atual

**Vertical slice funcional:** frontend React, autenticação Replit OIDC, API Express/PostgreSQL, filas/salas multiplayer, lobby, zona, combate, loot, ranking e resultados de partida. A aplicação principal e o runtime isolado têm testes independentes e são verificados no CI.

**Proteções entregues recentemente:** token WS assinado de curta duração, identidade WS extraída do token no handshake, escopo por usuário em leituras de itens/empréstimos, dano limitado, controles globais da zona com allowlist e testes correspondentes.

**Operação parcialmente configurada:** CI roda `npm run verify:all` em push para `main` e pull request. Existe Blueprint Render e job GitHub Actions pós-verificação, com deploy hook do commit exato e espera pelo health check do SHA. A ativação real depende de criar/configurar o Web Service, cadastrar o secret/variables do GitHub e validar o gate OIDC no domínio externo. O Replit Autoscale continua sendo configuração separada.

**Trilha Unreal iniciada:** a branch principal agora contém um `.uproject` para UE 5.8 e headers C++ de fundação, ainda sem validação de UnrealBuildTool ou Automation Tests. A implementação web/TypeScript segue como caminho executável comprovado.

## Prioridade 0 — fechar fronteiras de segurança e consistência

### 0.1 Autorizações das APIs restantes

- [ ] Inventariar cada rota mutável e declarar recurso, proprietário e capability exigida.
- [ ] Garantir ownership no SQL da mutação quando possível, evitando padrão check-then-update suscetível a TOCTOU.
- [ ] Aplicar Zod nas entradas de dinheiro/itens/dano, com limites e resposta 400 sem mutação.
- [ ] Cobrir testes negativos: ausência de sessão, usuário de outro dono, IDs inexistentes e valores fora de faixa.
- [ ] Separar operações de jogador, moderador e operador/admin; nunca inferir role do corpo ou query do cliente.

**Entrega parcial desta rodada:** a zona e o spawn global de loot exigem a allowlist de operador; reparo/uso de item e pagamento de empréstimo fazem a mutação SQL com filtro de proprietário; entradas das mutações cobertas são estritas e limitadas por Zod. As suítes HTTP verificam que as 41 rotas privadas rejeitam sessões ausentes e expiradas, os quatro controles globais da zona rejeitam jogadores comuns mesmo com role forjado no corpo, leituras de conta/inventário/empréstimos/histórico usam o proprietário da sessão e mutações de itens/empréstimos ocultam recursos alheios ou inexistentes. Entradas inválidas em mutações financeiras, de itens, zona e jogador retornam 400 sem chamar o storage. O aceite 0.1 ainda exige inventário contínuo das rotas e ampliação da cobertura de ownership/IDs para os demais recursos, além de garantir atomicidade quando uma persistência falhar entre etapas.

**Aceite:** toda rota privada tem teste de negação; nenhuma rota altera recurso de outro usuário; nenhuma ação com input inválido causa write parcial.

### 0.2 Atomicidade da economia de jogo

- [ ] Agrupar débito/crédito, criação de empréstimo/item e ledger em transações PostgreSQL.
- [ ] Usar decimal exato ou unidades inteiras mínimas; eliminar aritmética monetária baseada em `Number`.
- [ ] Adicionar idempotency key nas mutações que o cliente pode repetir após timeout.
- [ ] Definir constraints/checks de saldo, status e ownership no banco, não somente na camada Express.
- [ ] Escrever testes concorrentes para compra, transferência, pagamento e salário.

**Aceite:** sob chamadas concorrentes, o saldo e o ledger reconciliam; retries não duplicam crédito/débito; falha intermediária reverte tudo.

## Prioridade 1 — entrega reproduzível e dados seguros

### 1.1 Migrações e contratos de banco

- [x] Substituir `db:push` operacional por migrações Drizzle revisadas e versionadas em `migrations/`.
- [ ] Definir migração expand/contract, backup, rollback e verificação de compatibilidade entre versões.
- [ ] Aplicar constraints e índices para campos consultados em sala, usuário, rating e histórico.
- [ ] Usar banco isolado nos testes de integração de API e persistência.

**Aceite:** CI consegue criar banco efêmero, aplicar migrações do zero e executar testes; deploy não modifica schema de forma não revisada.

### 1.2 CI, implantação e rollback

- [x] Rodar `npm run verify:all` em push para `main` e pull request.
- [x] Tornar `test:official` fail-fast entre suítes TS e JS.
- [x] Selecionar Render e documentar a integração baseada em Deploy Hook e Blueprint.
- [ ] Criar serviço Render, guardar `RENDER_DEPLOY_HOOK_URL` no GitHub e definir `RENDER_SERVICE_URL`.
- [x] Limitar deploy ao push em `main` após `verify` verde, serializar publicação e incluir opt-in `RENDER_DEPLOY_ENABLED`.
- [x] Adicionar `/healthz` e comparar o commit efetivamente servido com o SHA verificado no CI.
- [ ] Validar rollback no serviço criado e documentar o procedimento aprovado.
- [ ] Separar ambientes de preview/staging e produção; usar banco e OIDC isolados.
- [ ] Validar Replit OIDC em Render ou planejar migração de identidade antes de habilitar o tráfego de usuários.

**Aceite:** push aprovado para `main` publica uma versão identificável; falha de teste não publica; segredo pode ser revogado; health check determina sucesso ou falha do job.

### 1.3 Sessões, chaves e proteção operacional

- [ ] Validar configuração obrigatória no startup e falhar rápido com mensagem segura.
- [ ] Definir rotação de `SESSION_SECRET`/`WS_TOKEN_SECRET` e período de convivência de chaves.
- [ ] Implementar revogação/expiração de sessões e política para desconectar sockets após logout/ban.
- [ ] Adicionar rate limits coerentes a login, token WS, economia e endpoints de jogo.
- [ ] Validar Origin/CSRF nas mutações HTTP e política de origins do handshake WS.
- [ ] Revisar serialização de logs: evitar expor payloads/PII e remover tokens, cookies ou dados sensíveis.

**Aceite:** checklist de threat model atualizado; chaves rotacionáveis sem expor segredo; nenhuma credencial aparece em artefatos/logs.

## Prioridade 2 — multiplayer distribuído e qualidade de experiência

### 2.1 Salas escaláveis horizontalmente

- [ ] Definir ownership/particionamento de salas e reconexões entre réplicas.
- [ ] Implementar presença e pub/sub com Redis/KeyDB ou serviço equivalente, com operações atômicas e TTL.
- [ ] Reconciliar snapshot, sequence number e replay após reconexão.
- [ ] Colocar backpressure, limites de frequência/tamanho das mensagens e proteção de fan-out.
- [ ] Executar teste de carga com múltiplas instâncias e regiões, medindo p50/p95/p99 e desconexão.

**Aceite:** nenhuma duplicidade de jogador/sala sob corrida de join/reconnect; limite de latência e taxa de erro documentado sob carga definida.

### 2.2 Gameplay e ranking

- [ ] Definir invariantes de estado para lobby → countdown → partida → finish; testar transições e desconexões.
- [ ] Tornar IDs/snapshot/replay suficientes para reconstruir uma partida com a mesma seed.
- [ ] Validar cálculo de posição/ataque/lag compensation e tolerância a relógio de cliente manipulado.
- [ ] Comparar algoritmo de matchmaking JavaScript/Python de referência com `MatchmakingService` de produção; escolher uma implementação canônica.
- [ ] Definir regras de abandono, empate, desconexão prolongada e partida sem vencedor.
- [ ] Executar teste de abuso de loot, dano, queue mode e host controls.

**Aceite:** mesma seed e sequência de inputs produz resultado reproduzível; testes de equilíbrio e matchmaking publicam métricas e limites.

### 2.3 Frontend, acessibilidade e desempenho

- [x] Fazer code splitting das páginas com lazy imports.
- [x] Atualizar `caniuse-lite`/Browserslist.
- [x] Reduzir o chunk inicial de aproximadamente 613 kB minificados para aproximadamente 386 kB minificados no build medido.
- [x] Implementar no War’I os filtros Arsenal/Armamento/Defesa/Bag, busca, detalhes do item e seleção persistida da PackBack com atualização limitada ao proprietário.
- [x] Carregar no fim do countdown apenas a PackBack persistida do próprio usuário; arma durável define dano/alcance, defesa durável acrescenta vida máxima (limite 200) e falha de leitura pausa a partida.
- [x] Conectar cura (`CURATIVO`), granada em área e reconhecimento temporário (`UTILIDADE`) a ações autoritativas no combate; validar snapshot/ownership, limitar frequência e consumir durabilidade atomicamente, com feedback no HUD, testes unitários/de integração e jornada E2E via WebSocket autenticado (match → ação → dano/ack; persistência isolada por fixture).
- [x] Definir regras de gameplay server-authoritative para capacidade (50 pts base, bônus de itens utilitários equipados até 150; pesos por categoria e rejeição de pickup acima do limite) e Adrenalina (+20% por 10s por padrão, limitada a +50%, com movimento avançado no tick do servidor).
- [ ] Manter testes de Lighthouse em runner estável para mobile e desktop, com percentis/variação documentados.
- [ ] Definir limites de regressão de LCP, INP, CLS e JavaScript inicial após recolher baseline repetível.
- [ ] Adicionar testes de interação e acessibilidade para lobby, zona, inventário, banco e pós-partida.
- [ ] Considerar lazy loading de dependências pesadas compartilhadas somente com evidência de waterfall/coverage.

**Aceite:** Lighthouse/CI executa em ambiente reprodutível; budget de performance é baseado em várias execuções e não em um único score local.

### 2.4 Observabilidade e SRE

- [ ] Adicionar `/health/live` e `/health/ready` com checagem de banco e dependências.
- [ ] Instrumentar traces/request IDs, métricas de matchmaking, fila, partidas e sessões WS.
- [ ] Definir SLOs, alertas de erro/latência e playbooks de incidentes.
- [ ] Publicar métricas de rede por região e ping medido pelo servidor, em vez de confiar em latência declarada pelo cliente.
- [ ] Fazer load test, soak test e teste de recuperação após falha de réplica/banco.

**Aceite:** dashboard responde a “o que falhou, quem foi afetado e quando”; alertas têm owner e playbook.

### 2.5 Portabilidade Unreal Engine 5.8

- [x] Adicionar estrutura inicial do projeto UE 5.8 e headers para GameMode/GameState, PlayerState, atributos, zona, loot, grade espacial, combate, economia, AI e SaveGame.
- [ ] Executar UnrealBuildTool em ambiente com UE 5.8 instalado e corrigir erros reais de compilação; headers atuais não foram validados pelo CI Node.
- [ ] Preencher módulos/classes declarados mas não implementados, validar includes/API UE5 e eliminar stubs/dependências que não estão no repositório.
- [ ] Definir interface versionada entre cliente UE e backend autoritativo, incluindo autenticação, reconnect, serialização, rate limits e ownership das partidas.
- [ ] Implementar primeiro mapa/protótipo jogável com assets/licenças rastreáveis e testes Unreal Automation para zona, dano, loot e ciclo de partida.
- [ ] Integrar UnrealBuildTool/Automation Tests em runner com licença e instalação UE apropriadas, sem armazenar credenciais de distribuição no repo.
- [ ] Fazer playtest multiplayer dedicado, validar replicação/lag compensation e só então decidir se o cliente UE substitui ou complementa a SPA.

**Aceite:** projeto abre e compila em UE 5.8 limpo; Automation Tests passam; existe build reproduzível e um fluxo de jogo testável; integração com backend possui contrato/versionamento e revisão de segurança. A mera presença do `.uproject` e dos headers não satisfaz este aceite.

## Prioridade 3 — economia persistente e compliance

- [ ] Manter KRC como unidade de jogo sem conversão em valor externo até decisão formal.
- [ ] Se houver carteira, moeda resgatável ou pagamento real: parar antes de implementar e realizar análise jurídica/regulatória, KYC/AML, fraude, custody, auditoria e threat modeling.
- [ ] Definir ledger append-only, reconciliação, retenção, acesso administrativo auditado e política de reversão.

**Aceite:** nenhum valor real é conectado antes de revisão e aprovação explícitas das regras, controles e jurisdição aplicáveis.

## Como contribuir ao roadmap

Cada item implementado deve chegar por mudança pequena e revisável, ter testes associados e atualizar a documentação do contrato. Preferir uma sequência de entregas em que migrações de banco, autorização e compatibilidade sejam concluídas antes de escalar recursos de gameplay. Atualize os checkboxes apenas quando o critério de aceite correspondente puder ser demonstrado.
