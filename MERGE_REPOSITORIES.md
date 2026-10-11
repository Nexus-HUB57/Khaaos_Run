# Consolidação dos repositórios

O repositório oficial `Khaaos_Run` é a aplicação principal (React/TypeScript, Express e Drizzle). O conteúdo e o histórico do antigo repositório `khaaos-Run` foram preservados em [`game-runtime/`](game-runtime/), que contém um runtime independente de jogo (Vite/JavaScript, servidor WebSocket e testes Node).

## Desenvolvimento

- Aplicação principal: `npm run dev`, `npm run check` e `npm run build` na raiz.
- Runtime de jogo: `cd game-runtime && npm install && npm run dev`.
- Testes do runtime: `npm run test:game` na raiz (instale antes as dependências dentro de `game-runtime/`).
- Verificação completa: `npm run verify:all` executa em paralelo o typecheck e build do app oficial, além do build, suíte completa e teste de estresse do runtime.

Os dois projetos conservam seus próprios `package.json`, lockfiles, configurações, documentação e testes. O `package.json` raiz continua sendo a fonte dos comandos da aplicação oficial.

## Manutenção

- CI do GitHub Actions: [`.github/workflows/ci.yml`](.github/workflows/ci.yml), executado em pushes e pull requests para `main`.
- Preparação para retirada do repositório secundário: [`docs/RETIRING_DUPLICATE_REPOSITORY.md`](docs/RETIRING_DUPLICATE_REPOSITORY.md). A exclusão não é automática e não foi realizada.
- Análise inicial de cobertura e lacunas: [`docs/TEST_COVERAGE_BASELINE.md`](docs/TEST_COVERAGE_BASELINE.md).
