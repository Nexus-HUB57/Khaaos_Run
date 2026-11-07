# Revisão técnica dos Termos de Uso — War'I

**Data:** 7 de novembro de 2026<br>
**Documento-fonte:** `/home/ubuntu/upload/TermosdeUsoGoodCode-Games.txt`<br>
**Escopo:** revisão editorial e de consistência com o produto e o repositório, alinhamento a instruções do responsável, identificação de questões para advogado brasileiro e implementação apenas de uma página de status provisória.<br>
**Limite:** não é parecer jurídico. O texto novo é minuta interna, não aprovada e não deve ser usada para aceite ou contratação.

## Resultado

Foi criada a [minuta técnica dos Termos de Uso War'I](MINUTA_TERMOS_DE_USO_WARI_REVISAO_TECNICA.md), reconstruída sem as cláusulas transplantadas e marcada como **não publicar / não usar como contrato / não coletar aceite**. Também foi criada a rota pública `/termos`, com aviso de que o documento está em revisão e que visitar a página não registra aceite, consentimento, alistamento ou pagamento. Há um teste E2E para comprovar esse comportamento.

A página não contém checkbox, botão de aceite, texto final de contrato nem identificação empresarial inventada. Os dados jurídicos da Operadora, endereço e contatos ficam pendentes porque o responsável informou que estão sendo finalizados. A página registra, sem transformar em oferta, que eventual recompensa depende de condições e aprovações futuras.

## Orientações do responsável incorporadas

- Referências a GoodCode, Epic/Fortnite e contratos de outros produtos foram retiradas do texto proposto.
- O foro indicado na minuta é a **Comarca de Campinas/SP**, ressalvadas competências inderrogáveis e foros que a legislação assegure ao consumidor. Arbitragem obrigatória, renúncia ampla a ações coletivas e prazos contratuais de prescrição foram removidos.
- A possibilidade futura de recompensa de referência de até **US$ 1.000.000**, potencialmente em **USDT**, foi mantida como possibilidade de produto — não como oferta atual, promessa, garantia, direito adquirido ou compromisso de pagamento. Um regulamento separado, funding comprovado e aprovações jurídicas, regulatórias, fiscais, financeiras e operacionais seriam pré-condições a qualquer campanha.
- Foi preservada na minuta, como compromisso de produto a aprovar, a proposta de reembolso integral da taxa em até 30 dias corridos se a Operadora decidir definitivamente não prosseguir com a abertura do CIGKV após cobrança e antes de entregar o serviço correspondente. Não se declara que o prazo já foi aprovado; o texto não afasta direitos legais de cancelamento, arrependimento ou reembolso.
- O tratamento de dados foi limitado ao que é sustentado pelos documentos/código examinados e separado de uma Política de Privacidade ainda não aprovada. Não se afirma consentimento genérico, nem gravação/análise de voz, varredura de processos locais ou algoritmo operacional anti-aliciamento.

## Achados no documento recebido

1. **Identidade e marcas incompatíveis:** o original alterna GoodCode, entidades corporativas diferentes, Epic/Fortnite, endereços, cartões, produtos e serviços de terceiro. Esses nomes e mecanismos não foram transferidos à minuta. A razão social, CNPJ, endereço e canais da operadora permanecem campos pendentes.
2. **Foro e arbitragem contraditórios:** o texto combina SIAC, arbitragem obrigatória, procedimento estrangeiro, Campinas, júri/FAA e renúncia a ações coletivas. A minuta seleciona Campinas/SP como foro proposto e não inclui arbitragem compulsória ou renúncia a acesso ao Judiciário. A compatibilidade concreta deve ser confirmada por advogado.
3. **Reembolso contraditório:** a regra genérica “final e não reembolsável” conflita com a promessa específica de reembolso integral da taxa se o projeto não puder continuar. A minuta retira a proibição universal e mantém o reembolso de 30 dias como proposta a aprovar. Eventual checkout deverá comunicar claramente cancelamento, atendimento e preço final.
4. **Prêmio/cripto:** o original afirmava obrigação de pagar US$ 1 milhão em sete dias, transferência em USDT, único sobrevivente e pagamento por intermédio dos pais a menores. Esses compromissos foram substituídos por uma possibilidade futura, sem obrigação ou data de pagamento. A relação entre pagamento de taxa, competição e prêmio é uma questão de risco própria e exige decisão/parecer antes de lançamento.
5. **Dados e segurança:** alegações de coleta de programas em execução, gravação/análise de chat, aprendizado de máquina e detecção automatizada de aliciamento não foram encontradas como recursos operacionais nos materiais canônicos examinados. A minuta não promete tais mecanismos. A Política de Privacidade precisa identificar finalidades, bases legais, retenção, destinatários, transferências, canal de direitos e contato responsável.
6. **Serviços transplantados:** foram excluídas regras de cartões-presente, assinatura recorrente, empréstimo de KRC/VIP, marketplace/Dev Edition, UGC publicitário, arbitragem de pequenos valores, DMCA e suporte/apelação não confirmados no app.
7. **Limitação de responsabilidade:** o teto de US$ 200 e a exclusão ampla de garantias foram removidos. A minuta preserva direitos e responsabilidades que não possam ser afastados, sem propor teto alternativo.
8. **Menores:** não se replica a regra de pagar prêmio a pais/responsável. Idade mínima, consentimento, territórios e proteção de menores seguem pendentes; não foi presumida elegibilidade.

## Conferência com o estado canônico

- O [README — Jornada Oficial do Jogador](../README.md#jornada-oficial-do-jogador) separa cadastro, login, alistamento, pagamento, marco de 1.000.000, Academia KR e CIGKV. A recompensa já é qualificada mais adiante como conceito de campanha, sem garantia; porém o cabeçalho ainda dizia “recompensa real”. A descrição do cabeçalho e a landing pública foram ajustadas nesta branch para manter a possibilidade e remover a afirmação de oferta real.
- O PR [#287](https://github.com/Nexus-HUB57/Khaaos_Run/pull/287) foi mesclado em 5/11/2026. Cadastro/login local por email e senha estão no código, coexistindo com OIDC; o registro por email permanece indisponível sem SMTP. O relatório e roadmap de jornada foram atualizados para não descrever a funcionalidade como apenas OIDC ou “em branch”.
- `docs/LOCAL_EMAIL_PASSWORD_AUTH.md`, `shared/models/auth.ts` e `migrations/0013_local-auth.sql` sustentam o tratamento de nome/email, hash scrypt, tokens de verificação/reset e sessões. O fato de código existir não prova operação de SMTP em caixa real/staging.
- `docs/INTERNAL_CURRENCY_AND_PAYMENTS.md` e o README dizem que KRC é moeda interna sem paridade, saque ou resgate externo. A possibilidade de prêmio futuro é separada de KRC e não equivale a conversão de KRC em USDT.
- `server/routes/enrollment.ts` retorna `503 PAYMENT_PROVIDER_NOT_CONFIGURED` sem o opt-in exclusivo dos testes. Entretanto, `docs/STRIPE_BRAZIL_CHECKOUT.md` ainda dizia que a simulação de alistamento continuaria por default. Essa contradição documental foi corrigida nesta branch. O Stripe permanece test-only; preço/cotação BRL, refund/chargeback e sign-off jurídico/fiscal seguem pendentes.
- O índice canônico informa que o binário EAC está pendente e anti-cheat é protótipo/validação de movimento. O roadmap registra telemetria e anonimização/minimização em arquitetura, mas não comprova gravação de voz ou varredura local.
- O contador/entitlement global, a Academia KR, notificação e agenda de CIGKV continuam incompletos segundo o README/roadmap. A minuta não promete abertura ou prêmio com data certa.

## Pendências antes de qualquer publicação contratual

1. Preencher e confirmar razão social, CNPJ, endereço, operador por território, suporte e contato de privacidade.
2. Aprovar Política de Privacidade e inventário factual de dados, propósitos, bases legais, retenção, processadores e fluxos de direitos do titular.
3. Definir idade mínima, elegibilidade por país e proteção de crianças/adolescentes.
4. Obter análise específica sobre competição, taxa de alistamento e eventual recompensa, inclusive funding, estrutura regulatória, tributação e formato USDT.
5. Aprovar preço BRL, fluxo de pagamento, recibo, cancelamento, reembolso e chargebacks; nenhum checkout live está autorizado pela documentação atual.
6. Definir suporte, denúncias, revisão/recursos e qualquer software local de integridade antes de anunciar esses serviços.
7. Submeter a minuta a advogado brasileiro e, após aprovação, criar versão/data pública e desenhar o aceite afirmativo adequado.
8. Decidir se o cadastro de conta ficará aberto depois de eventual ativação do SMTP, mas antes da publicação dos Termos finais. Esta entrega apenas informa o status: não coleta aceite e não bloqueia o cadastro. Não abrir cadastro público sem essa decisão explícita.

Até a conclusão dos itens, `/termos` deve permanecer como aviso de status informativo, sem captura de aceite. Esta entrega não ativa pagamento nem campanha promocional.

## Fontes jurídicas oficiais consultadas

A consulta externa identificou temas para revisão; não determina validade de cláusulas nem substitui counsel.

- [Código de Defesa do Consumidor — portal federal](https://www.gov.br/mj/pt-br/assuntos/seus-direitos/consumidor/Anexos/cdc-portugues-2013.pdf).
- [Lei nº 13.709/2018 (LGPD) — texto atualizado da Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html).
- [Decreto nº 7.962/2013 — comércio eletrônico](https://goias.gov.br/procon/decreto-no-7-962-de-15-de-marco-de-2013-dispoe-sobre-a-contratacao-no-comercio-eletronico/).

## Validação

- [x] `npm run check` — passou.
- [x] `npm run build` — passou; o bundler reportou apenas o aviso existente de chunk cliente maior que 500 kB.
- [x] Playwright em `tests/e2e/terms-status.spec.ts` + `tests/e2e/war-i-ui.spec.ts` — **7/7 passaram**, incluindo página pública, link do cadastro, ausência de controle de aceite e copy de recompensa na landing.
- [x] `npm run guard:tests`, `git diff --check` e parse JSON do manifesto — passaram.
- [x] Busca de resíduos de marcas/serviços transplantados no texto da minuta — nenhum encontrado; referências comerciais na landing/README qualificam o prêmio como possibilidade futura e não oferta.
- [ ] Revisão jurídica final antes de substituir a página de status ou coletar aceite.
