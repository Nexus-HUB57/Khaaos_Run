# Consolidação dos repositórios

O repositório oficial `Khaaos_Run` é a aplicação principal (React/TypeScript, Express e Drizzle). O conteúdo e o histórico do antigo repositório `khaaos-Run` foram preservados em [`game-runtime/`](game-runtime/), que contém um runtime independente de jogo (Vite/JavaScript, servidor WebSocket e testes Node).

## Desenvolvimento

- Aplicação principal: `npm run dev`, `npm run check` e `npm run build` na raiz.
- Runtime de jogo: `cd game-runtime && npm install && npm run dev`.
- Testes do runtime: `npm run test:game` na raiz (instale antes as dependências dentro de `game-runtime/`).

Os dois projetos conservam seus próprios `package.json`, lockfiles, configurações, documentação e testes. O `package.json` raiz continua sendo a fonte dos comandos da aplicação oficial.
