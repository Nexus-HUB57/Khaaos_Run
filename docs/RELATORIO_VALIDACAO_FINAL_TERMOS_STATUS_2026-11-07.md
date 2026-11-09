# Relatório de validação final — Termos de Uso e página de status

**Data/hora da validação:** 7 de novembro de 2026, aproximadamente 09:03 (UTC−03:00)<br>
**PR:** [#302 — docs(terms): add provisional status page and technical review](https://github.com/Nexus-HUB57/Khaaos_Run/pull/302)<br>
**Branch:** `docs/terms-of-use-review`<br>
**Commit de implementação validado:** `13b0ec9`<br>
**Resultado:** validação local aprovada; CI remota ainda em execução no momento do registro; PR mantido em rascunho.

## Escopo validado

A entrega inclui a rota pública `/termos`, o aviso de revisão sem mecanismo de aceite, o link para o status a partir da landing e do cadastro, a minuta técnica identificada como interna/não publicável e a auditoria editorial/técnica. Também alinha a comunicação da recompensa como possibilidade futura, diferencia KRC de valor externo e corrige a documentação de pagamento para refletir o comportamento fail-closed do endpoint sem provedor.

Referências principais: [página de status](../client/src/pages/terms-status.tsx), [minuta interna](MINUTA_TERMOS_DE_USO_WARI_REVISAO_TECNICA.md), [relatório técnico dos Termos](REVISAO_TERMOS_DE_USO_GOODCODE_GAMES.md), [teste E2E](../tests/e2e/terms-status.spec.ts) e [PR #302](https://github.com/Nexus-HUB57/Khaaos_Run/pull/302).

## Verificações locais executadas

| Verificação | Resultado | Observação |
|---|---|---|
| `npm run check` | **Passou** | TypeScript terminou sem erros. |
| `npm run build` | **Passou** | Build cliente e servidor concluído. O bundler manteve o aviso de chunk cliente acima de 500 kB; não houve falha de build. |
| `npm run guard:tests` | **Passou** | Manifesto/inventário das suítes íntegro. |
| `npx playwright test --config=playwright.config.ts tests/e2e/terms-status.spec.ts tests/e2e/war-i-ui.spec.ts` | **7/7 passaram** | Inclui rota pública, mensagem sem aceite, link de cadastro, copy de recompensa e regressões principais da UI War'I/PackBack. |
| `git diff --check` | **Passou** | Nenhum erro de whitespace no diff validado. |

## Snapshot dos checks remotos

Na consulta ao PR #302 às **09:03:52 UTC−03:00**, o GitHub reportou **27 checks com sucesso, 1 ignorado e 2 pendentes**, sem checks falhos. Os pendentes eram `CI/Build Server` e `UE5 CD/Build server image`. Este é um snapshot; o resultado final dessas execuções ainda não estava disponível.

O PR estava **OPEN**, em **draft**, com base `main`; o `mergeStateStatus` era `UNSTABLE` enquanto havia checks pendentes. Não foi mesclado. A aprovação jurídica dos Termos não é coberta por CI.

## Controles e limites

- A página `/termos` declara que o conteúdo está em revisão, não é contrato e não registra aceite ou consentimento.
- A minuta mantém campos jurídicos pendentes e é marcada como **não publicar / não usar como contrato / não coletar aceite**.
- A Comarca de Campinas/SP aparece como foro indicado na minuta, ressalvadas competências e direitos inderrogáveis; não há arbitragem obrigatória.
- A recompensa de referência de até US$ 1.000.000, potencialmente em USDT, aparece apenas como possibilidade futura, não oferta, promessa ou garantia atual.
- O reembolso integral em até 30 dias no cenário de descontinuação do CIGKV está rotulado como proposta sujeita à aprovação jurídica/financeira; não como política operacional já aprovada.
- Nenhuma cobrança live, campanha de recompensa, configuração SMTP, alteração de banco ou aceite contratual foi ativada por esta entrega.

## Pendências antes de publicação ou merge final

1. Obter aprovação de advogado brasileiro para os Termos e o tratamento de foro, competição, taxa, reembolso e eventual recompensa.
2. Inserir e confirmar razão social, CNPJ, endereço e canais empresariais/de privacidade; aprovar Política de Privacidade e inventário de tratamento.
3. Decidir se o cadastro público ficará aberto depois de eventual ativação do SMTP, mas antes da publicação dos Termos finais. Esta entrega informa o status, mas não registra aceite nem bloqueia cadastro.
4. Atualizar este relatório com os dois checks remotos pendentes quando concluírem; manter o PR em draft até a revisão humana/legal necessária.

**Conclusão:** os checks locais relevantes para as alterações passaram e não há falha local conhecida. A CI remota estava majoritariamente verde, porém incompleta; portanto, o estado é **aprovado tecnicamente para revisão, não liberado para publicação contratual nem merge final**.
