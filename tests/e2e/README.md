# Playwright E2E — War’I / PackBack

A suíte abre a aplicação real no Chromium e verifica conteúdo visível, navegação pelos compartimentos do War’I e ações da PackBack na Zona. Os testes também comparam screenshots de referência versionados para detectar regressões visuais.

Os endpoints HTTP e o WebSocket são interceptados pelo Playwright com dados sintéticos. A suíte não precisa de PostgreSQL, login, credenciais, ou escrita no inventário de uma conta real.

## Executar

```bash
npm ci
npx playwright install chromium
npm run test:e2e:war-i
```

O Playwright inicia automaticamente o servidor Vite em `127.0.0.1:4173`. Para usar um Chromium já instalado no sistema:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e:war-i
```

Se a interface mudar intencionalmente, revise os screenshots e regenere as referências com:

```bash
npx playwright test --config=playwright.config.ts --update-snapshots
```

Os relatórios HTML e artefatos de falha ficam em `playwright-report/` e `test-results/`; ambos são ignorados pelo Git. As imagens de referência ficam junto da especificação em `tests/e2e/war-i-ui.spec.ts-snapshots/`.

## Cenários cobertos

- Inventário War’I: compartimentos/abas visíveis, indicador de itens prontos, aviso de durabilidade inválida, filtro PackBack e busca de item.
- Zona em viewport móvel: conexão WebSocket simulada, curativo e granada visíveis, estado “confirmando”, bloqueio de cliques repetidos, confirmação e atualização de durabilidade.
