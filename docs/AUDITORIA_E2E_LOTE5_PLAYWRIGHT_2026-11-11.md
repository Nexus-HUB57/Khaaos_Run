# Auditoria E2E Playwright — Lote 5

**Data:** 11 de novembro de 2026
**Branch:** `feat/lote5-realistic-lobby-roster`
**Base validada:** `origin/main` em `67aad5f` (PR #365 já incorporada)
**Resultado:** **17/17 testes aprovados, 0 falhas**

## Execução

Comando de auditoria integral:

```bash
npx playwright test --reporter=list
```

O Playwright executou a suíte completa em Chromium, com um worker, iniciando o Vite na configuração do projeto. A listagem de descoberta confirmou 17 casos em quatro specs. Os testes interceptam HTTP e WebSocket com fixtures sintéticas; portanto, este resultado comprova os contratos do cliente e a carga local de assets, mas não substitui um smoke test de produção/staging com servidor, banco, identidade ou WebSocket reais.

## Resultados por spec

| Spec | Casos | Resultado | Área coberta |
|---|---:|---|---|
| `tests/e2e/local-auth-ui.spec.ts` | 4 | PASS 4/4 | Cadastro, confirmação de email, login válido e inválido |
| `tests/e2e/studio-ui.spec.ts` | 5 | PASS 5/5 | Roster de 32, facção/sexo, dossiê e busca de operativo |
| `tests/e2e/terms-status.spec.ts` | 2 | PASS 2/2 | Página pública de Termos e mensagem sobre prêmio |
| `tests/e2e/war-i-ui.spec.ts` | 6 | PASS 6/6 | Perfil, lobby, inventário, Forja e Zona/PackBack |
| **Total** | **17** | **PASS 17/17** | **0 falhas** |

## Verificação do Lote 5 no lobby

O novo cenário `lobby carrega retrato realista do operativo e mantém texto de identidade` injeta um jogador PIXEL por WebSocket simulado, abre `/lobby` e confirma que:

- o cartão e o nome acessível `Avatar PIXEL` ficam visíveis;
- o `src` é `/avatars/realistic/op_gng_female_pixel.webp` (resolvido do catálogo local, não URL arbitrária do payload);
- o texto de identidade `PIXEL · ELO 1000` permanece visível;
- a imagem carrega no browser (`naturalWidth > 0`).

A prova é local, servida pelo Vite; não demonstra ainda o asset no Render. A indisponibilidade/roteamento de homologação está registrada à parte no plano do Lote 5.

## Cobertura e limites

A auditoria completa exercitou os 17 testes descobertos nos quatro arquivos E2E, inclusive os quatro testes de autenticação por UI, cinco de Character Studio/roster, dois de Termos e seis de War’I/PackBack. Não há falha ou cenário ignorado no resumo da execução. Os testes usam dados sintéticos, não conectam à conta de jogador, não exercitam o OIDC externo real, não abrem banco PostgreSQL nem validam Redis, deploy/health check do Render ou comunicação com o servidor de produção. As comparações visuais existentes protegem screenshots de referência do inventário/PackBack; o teste do lobby verifica a presença/carga do retrato, não a qualidade estética da imagem.

## Reprodução

```bash
npm ci
npx playwright install chromium
npx playwright test --reporter=list
```
