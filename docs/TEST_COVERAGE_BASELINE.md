# Baseline de cobertura de testes — aplicação oficial

**Data da análise:** 2026-10-11 (UTC)  
**Escopo:** `client/src/`, `server/` e `shared/` do repositório oficial. O runtime legado em `game-runtime/` foi excluído da contagem.

## Resultado medido

| Indicador | Resultado |
|---|---:|
| Arquivos de produção TypeScript/TSX no escopo | 92 |
| Arquivos de teste `.test.*` / `.spec.*` no escopo | 0 |
| Relatórios/instrumentação de cobertura configurados para o app oficial | Não encontrados |
| Percentual de cobertura de linhas/branches/functions | **Não mensurável no estado atual** |

O projeto tem `npm run check` e `npm run build`, mas não tem suíte automatizada própria para o app oficial nem ferramenta/configuração de coverage ligada a ela. Portanto, atribuir `0%` como percentual instrumentado seria enganoso: **não há cobertura reportável ainda**. Os testes em `game-runtime/test/` são executáveis e passam, mas exercitam o runtime JavaScript isolado e não contam como cobertura da aplicação React/Express/Drizzle.

## Pontos críticos remanescentes (prioridade sugerida)

1. **Autenticação e autorização — crítica:** `server/replit_integrations/auth/`, `server/replit_integrations/auth/replitAuth.ts`, `server/replit_integrations/auth/routes.ts`, `server/replit_integrations/auth/storage.ts`, `shared/models/auth.ts`, `client/src/hooks/use-auth.ts`. Testar login/logout, sessão expirada, usuário não autenticado, isolamento por usuário e bloqueio de operações protegidas.
2. **Economia, saldo e persistência — crítica:** `server/routes.ts`, `server/storage.ts`, `server/db.ts`, `server/game/EconomyEngine.ts`, `client/src/hooks/use-bank.ts`, `client/src/hooks/use-loans.ts`, `client/src/hooks/use-items.ts`. Testar concorrência/atomicidade, saldo insuficiente, precisão numérica, transações falhas e propriedade dos registros.
3. **Salas e WebSocket da aplicação oficial — crítica:** `server/game/RoomManager.ts`, `server/game/SpatialGrid.ts`, `client/src/hooks/use-battle-room.ts`. Testar reconexão, entrada/saída, snapshots, isolamento de salas/regiões, carga e mensagens inválidas no protocolo oficial. Os testes análogos do runtime não substituem estes testes.
4. **Zona, loot, eliminação e geração — alta:** `server/game/ProceduralGenerator.ts`, `server/game/MonteCarloEconomy.ts`, rotas correspondentes e páginas/hooks. Cobrir transições de estado, limites, seeds e invariantes de gameplay.
5. **Interface e fluxos de usuário — alta:** páginas em `client/src/pages/`, hooks React Query e `client/src/components/boarding-animation.tsx`. Adicionar testes de renderização/interação para caminhos de batalha, inventário, banco e perfil, incluindo erros HTTP e estados vazios.

## Próximos passos recomendados

- Definir ambiente de teste com banco isolado (ou adapters de storage substituíveis) antes de testar rotas e persistência.
- Adotar Vitest para módulos TypeScript e React Testing Library para componentes; usar Supertest para endpoints Express e cliente WebSocket de teste para salas.
- Começar por testes unitários de `EconomyEngine` e `ProceduralGenerator`, depois integração de autenticação/banco/rotas, e por fim fluxos de interface.
- Integrar uma ferramenta compatível de coverage e publicar relatório de statements/branches/functions no CI. Estabelecer limites progressivos depois de coletar a primeira cobertura real, sem bloquear o CI com metas não medidas.

## Método de inventário

Contagem realizada sobre os diretórios versionados `client/src`, `server` e `shared`: 92 arquivos `.ts`/`.tsx`; busca por sufixos `.test.ts`, `.spec.ts`, `.test.tsx` e `.spec.tsx`: nenhum resultado. A configuração atual contém somente checagem TypeScript e build para o app oficial.
