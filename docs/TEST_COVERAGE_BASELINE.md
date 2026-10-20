# Baseline de cobertura de testes — aplicação oficial

**Inventário atualizado:** 2026-10-11 (UTC). Escopo: `client/src/`, `server/` e `shared/` da aplicação principal. O runtime independente em `game-runtime/` é contabilizado à parte.

## Medição disponível

| Indicador | Resultado |
|---|---:|
| Arquivos de produção `.ts`/`.tsx` no escopo | 103 |
| Arquivos `.test.ts`/`.test.js` diretamente em `tests/official/` | 9 |
| Testes TypeScript oficiais aprovados na execução registrada | 11 |
| Testes JavaScript oficiais (core E2E, economia/procgen, spatial/lag e matchmaking) aprovados | 38 |
| Instrumentação de coverage de linhas/branches/functions | Não configurada |
| Percentual de coverage | **Não mensurável** |

`npm run test:official` executa as duas suítes em sequência e usa `&&`, para propagar falhas de ambas ao CI. A contagem de testes não é uma estimativa do percentual de código coberto.

## Escopo exercitado e lacunas

1. **Sessão, autenticação e WebSocket:** há testes para sessão presente/ausente/expirada, token WS assinado, expiração/adulteração, subject, recusa de handshake sem token e resistência a `userId` forjado. Ainda faltam fluxo OIDC real com provider, renovação/token refresh ponta a ponta, logout, revogação de sockets ativos, Origin/CSRF e testes sistemáticos de todas as rotas privadas.
2. **Persistência e economia:** testes de contrato do adapter de usuários existem, mas é prioritário cobrir banco PostgreSQL real, isolamento de proprietário em todas as mutações, transações concorrentes, saldos insuficientes, idempotência, rollback e precisão de valores.
3. **WebSocket e salas:** a autenticação do handshake está coberta. Ainda faltam ciclos abrangentes de lobby/reconnect/leave/kick, snapshots, isolamento entre salas/regiões, malformed messages e concorrência/carga do RoomManager principal.
4. **Zona, loot e eliminação:** autorização deny-by-default dos operadores está testada; faltam cenários de transições, limites, recolha simultânea, eliminação, respawn e consistência em persistência real.
5. **UI:** não há inventário significativo de testes de componentes/interação React. Priorizar login/onboarding, fluxo lobby→zona→resultado, banco, inventário, estados vazios/erros e acessibilidade.
6. **Matchmaking de referência:** a suíte JavaScript valida janela de rating, modos, desempate por proximidade, dequeue e expansão da janela. A implementação de referência Python e a equivalência com o algoritmo de produção devem receber testes dedicados.

Os testes `game-runtime/test/` verificam apenas o runtime JavaScript isolado e não substituem testes do servidor Express, banco Drizzle ou componentes React.

## Próximos passos de cobertura

- Configurar PostgreSQL efêmero e executar testes de integração das rotas e transações.
- Adotar React Testing Library para UI, Supertest para rotas Express e cliente WebSocket de teste para os fluxos de salas.
- Acrescentar coverage instrumentado no CI e publicar relatórios como artefatos.
- Estabelecer metas de statements/branches/functions somente após a primeira medição reproduzível; aumentar os limites progressivamente sem contar código gerado.

Consulte [`ROADMAP.md`](ROADMAP.md) para prioridades de engenharia e critérios de aceite.
