# Baseline de cobertura de testes — aplicação oficial

**Data da análise:** 2026-10-11 (UTC)  
**Escopo:** `client/src/`, `server/` e `shared/` do repositório oficial. O runtime legado em `game-runtime/` foi excluído da contagem.

## Resultado medido

| Indicador | Resultado |
|---|---:|
| Arquivos de produção TypeScript/TSX no escopo | 92 |
| Arquivos de teste `.test.*` / `.spec.*` no escopo | 3 |
| Testes iniciais do app oficial (auth, adapter de persistência e WebSocket) | 6 |
| Relatórios/instrumentação de cobertura configurados para o app oficial | Não encontrados |
| Percentual de cobertura de linhas/branches/functions | **Não mensurável no estado atual** |

Foi criada uma suíte inicial executada por `npm run test:official`: 3 testes de middleware de autenticação, 2 testes do adapter de persistência de usuário com Drizzle simulado e 1 teste de integração WebSocket. Não há ferramenta/configuração de coverage ligada à suíte. Portanto, atribuir um percentual de linhas/branches/functions seria enganoso: **a cobertura percentual permanece não mensurável**. Os testes em `game-runtime/test/` exercitam o runtime JavaScript isolado e não contam como cobertura do app React/Express/Drizzle.

## Pontos críticos remanescentes (prioridade sugerida)

1. **Autenticação e autorização — crítica:** `server/replit_integrations/auth/`, `server/replit_integrations/auth/replitAuth.ts`, `server/replit_integrations/auth/routes.ts`, `server/replit_integrations/auth/storage.ts`, `shared/models/auth.ts`, `client/src/hooks/use-auth.ts`. Já cobertos: sessão válida, sessão ausente, sessão expirada sem refresh e contratos get/upsert do adapter. Ainda falta testar login/logout OIDC real, refresh token, isolamento por usuário e bloqueio de todas as rotas protegidas.
2. **Economia, saldo e persistência — crítica:** `server/routes.ts`, `server/storage.ts`, `server/db.ts`, `server/game/EconomyEngine.ts`, `client/src/hooks/use-bank.ts`, `client/src/hooks/use-loans.ts`, `client/src/hooks/use-items.ts`. Testar concorrência/atomicidade, saldo insuficiente, precisão numérica, transações falhas e propriedade dos registros.
3. **Salas e WebSocket da aplicação oficial — crítica:** `server/game/RoomManager.ts`, `server/game/SpatialGrid.ts`, `client/src/hooks/use-battle-room.ts`. Já coberto: recusa de `join` sem `userId`. **Risco crítico encontrado:** o handler aceita `userId` enviado pelo próprio cliente como identidade inicial (comentário do código reconhece que a validação de sessão/JWT fica para produção); um cliente pode tentar se passar por outro usuário. Não exponha o endpoint WebSocket a tráfego não confiável até validar cookie de sessão/token no servidor. Testar autenticação real, reconexão, entrada/saída, snapshots, isolamento de salas/regiões, carga e mensagens inválidas. Os testes análogos do runtime não substituem estes testes.
4. **Zona, loot, eliminação e geração — alta:** `server/game/ProceduralGenerator.ts`, `server/game/MonteCarloEconomy.ts`, rotas correspondentes e páginas/hooks. Cobrir transições de estado, limites, seeds e invariantes de gameplay.
5. **Interface e fluxos de usuário — alta:** páginas em `client/src/pages/`, hooks React Query e `client/src/components/boarding-animation.tsx`. Adicionar testes de renderização/interação para caminhos de batalha, inventário, banco e perfil, incluindo erros HTTP e estados vazios.

## Próximos passos recomendados

- Definir ambiente de teste com banco isolado (ou adapters de storage substituíveis) para cobrir operações de persistência reais e rotas.
- Expandir `node:test`/`tsx` para módulos TypeScript; adotar React Testing Library para componentes, Supertest para endpoints Express e cliente WebSocket de teste para salas.
- Começar por testes unitários de `EconomyEngine` e `ProceduralGenerator`, depois integração de autenticação/banco/rotas, e por fim fluxos de interface.
- Integrar uma ferramenta compatível de coverage e publicar relatório de statements/branches/functions no CI. Estabelecer limites progressivos depois de coletar a primeira cobertura real, sem bloquear o CI com metas não medidas.

## Método de inventário

Contagem realizada sobre `client/src`, `server` e `shared`: 92 arquivos `.ts`/`.tsx`. Os três arquivos de teste ficam em `tests/official/` para separar os testes do escopo de produção. A suíte existente mede comportamento selecionado, mas ainda não há coleta percentual instrumentada.
