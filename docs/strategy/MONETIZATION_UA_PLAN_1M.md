# Plano de monetização e aquisição — meta de US$ 1 milhão no primeiro mês

**Produto:** Khaaos Run  
**Data-base:** 30/10/2026  
**Mercado inicial de pagamentos:** Brasil, com expansão somente após validação local  
**Natureza da meta:** receita bruta de vendas digitais no primeiro mês; não é promessa de lucro

## 1. Decisão executiva

A meta de US$ 1 milhão no primeiro mês deve ser tratada como uma meta de lançamento com risco elevado. Ela exige uma combinação de produto com retenção acima da média, forte distribuição orgânica/creator-led e compra de mídia controlada por coortes. Não é responsável assumir que comprar instalações produzirá lucro: no cenário-base abaixo, o faturamento bruto por instalação ainda fica abaixo do custo de mídia de uma campanha majoritariamente paga.

A recomendação é operar em três portões. Primeiro, provar diversão, estabilidade, retenção e conversão em uma coorte limitada. Segundo, liberar monetização fiduciária apenas com catálogo fechado, segurança, suporte, reembolso e reconciliação. Terceiro, escalar mídia somente por canal/coorte quando o LTV previsto superar o CAC com margem de segurança. O objetivo de US$ 1 milhão pode continuar no plano, mas o gatilho de escala deve ser evidência, não desejo.

## 2. Estado atual do produto e restrições

O repositório já define KRC como moeda virtual exclusivamente interna, sem saque, resgate, blockchain ou valor externo. O ledger e o saldo são autoritativos no servidor. O checkout Stripe existe apenas em sandbox/teste e permanece desligado por padrão. A auditoria de economia registra que ainda faltam aprovação de SKUs e preços, entidade vendedora, mercados, política de reembolso/chargeback, fiscal/jurídico e configuração de produção. Ver [INTERNAL_CURRENCY_AND_PAYMENTS.md](../INTERNAL_CURRENCY_AND_PAYMENTS.md) e [ECONOMY_P0_REVALIDATION_2026-10-18.md](../audits/ECONOMY_P0_REVALIDATION_2026-10-18.md).

Consequentemente, não se deve anunciar “ganhe dinheiro”, “invista”, “resgate KRC”, “fundo de US$ 1 milhão” ou qualquer promessa de retorno financeiro. O texto antigo em documentos do protótipo que trate KRC como criptomoeda ou prêmio monetário deve ser removido ou marcado como ficção não comercial antes do go-live.

No mobile, bens digitais e recursos digitais vendidos dentro de apps ficam sujeitos às políticas de cobrança da plataforma. A Apple exige que compras e modelo de negócio sejam claros na revisão e restringe manipulação de avaliações; o Google Play informa que a taxa de serviço varia por programa, região e tipo de transação, com 15% ou menos disponível para muitos desenvolvedores elegíveis em determinados contextos. Modelar a receita líquida com uma taxa efetiva por plataforma, região e canal; nunca fixar 30% como fato universal. [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) e [Google Play service fees](https://support.google.com/googleplay/android-developer/answer/112622).

## 3. Matemática da meta

A fórmula de controle será:

```text
receita bruta = instalações do mês × taxa de pagantes × ARPPU bruto do mês
payers necessários = receita bruta alvo ÷ ARPPU bruto
instalações necessárias = payers necessários ÷ taxa de pagantes
CAC pago = mídia + criativos + ferramentas + agência ÷ novos pagantes ou novos usuários, conforme o relatório
LTV líquido = receita acumulada após taxas, impostos, refunds e chargebacks
```

Os cenários abaixo são hipóteses de planejamento, não benchmarks garantidos. Eles usam a meta de US$ 1 milhão bruto e uma conversão de pagantes medida entre instalações qualificadas do mês. A parcela paga é uma hipótese de mix de distribuição, não uma previsão.

| Cenário | ARPPU bruto | Pagantes | Conversão de pagantes | Instalações | Parcela paga | CPI blended de mídia | Mídia aproximada |
|---|---:|---:|---:|---:|---:|---:|---:|
| Conservador | US$ 20 | 50.000 | 3,0% | 1.666.667 | 40% | US$ 2,50 | US$ 1,67 mi |
| Base | US$ 28 | 35.715 | 4,0% | 892.857 | 45% | US$ 2,50 | US$ 1,00 mi |
| Upside | US$ 35 | 28.572 | 5,0% | 571.429 | 50% | US$ 2,20 | US$ 0,63 mi |

A conclusão financeira é direta: faturar US$ 1 milhão não equivale a gerar US$ 1 milhão disponível para aquisição. Depois de taxa de plataforma/processamento, impostos, refunds e chargebacks, uma hipótese de planejamento de 70–80% de realização líquida precisa ser substituída pelos percentuais efetivos por canal. No cenário-base, US$ 1 milhão bruto não paga automaticamente US$ 1 milhão de mídia e operação. A meta requer distribuição orgânica relevante, ARPPU real acima do piso, LTV pós-lançamento e/ou uma decisão consciente de investimento deficitário para comprar escala.

### Alvos de controle antes de escalar

- D1: mínimo 35%; alvo 40%.
- D7: mínimo 18%; alvo 20%.
- D30: mínimo 8%; alvo 10%.
- Conversão de pagantes em instalações qualificadas: mínimo 3%; alvo 4–5%.
- LTV líquido/CAC pago: mínimo 1,5x no teste inicial; alvo de escala 3,0x.
- Payback: nenhuma campanha deve escalar para um prazo que o caixa não consiga financiar; alvo inicial de até 90 dias, sujeito ao modelo de caixa.
- Fraude, chargeback e reembolso: acompanhar por canal, país, criativo e SKU; qualquer anomalia suspende o canal até reconciliação.

As metas de retenção são uma faixa de trabalho para título mid-core comercialmente promovido. AppAgent reporta como referência direcional para jogos comercialmente escalados D1 de 35–40%, D7 de 18–22% e D30 de 8–10%, enquanto alerta que médias agregadas variam muito por gênero, plataforma, região e canal. [AppAgent — mobile game retention benchmarks](https://appagent.com/blog/mobile-game-retention-benchmarks/).

## 4. Monetização recomendada

### 4.1 Princípio: vender identidade e conveniência, não vitória

A monetização do lançamento deve preservar competição. O jogador pode comprar expressão, personalização, acesso a conteúdo e conveniência com limites; não deve comprar dano, armadura, precisão, vantagem de matchmaking, taxa de loot competitiva ou vitória direta.

A ordem de prioridade é:

1. cosméticos de personagem, armas, ZEX, banners, emotes, paraquedas, trilhas e efeitos de eliminação;
2. passe de temporada com trilha gratuita e premium, sempre com recompensas majoritariamente cosméticas;
3. packs de fundador com itens cosméticos, título, moldura, acesso antecipado a eventos não competitivos e moeda interna de baixo impacto;
4. bundles de evento e colaboração com prazo claro, sem FOMO predatório e sem esconder o preço total;
5. conveniência limitada, como slots de loadout, presets, filtros e aceleração de tarefas não competitivas;
6. KRC apenas como moeda interna para itens e sinks previamente balanceados, com catálogo e preço resolvidos no servidor.

Loot box/gacha pago não entra no primeiro lançamento. Só poderia retornar após revisão jurídica, regras de disclosure/odds, política das plataformas, controles de idade e uma decisão explícita do produto.

### 4.2 Escada preliminar de preço no Brasil

Estes são testes de posicionamento, não SKUs aprovados: BRL 9,90 para entrada, BRL 24,90 como compra recorrente, BRL 49,90 como bundle principal, BRL 99,90 como bundle premium e BRL 199,90 como pack de temporada/fundador. Cada oferta precisa exibir conteúdo, preço total, moeda, validade, limites, política de reembolso e confirmação server-side. A relação entre BRL e KRC deve ser definida no catálogo publicado e nunca enviada pelo cliente.

Não iniciar com desconto permanente. Usar um preço de referência honesto, ofertas de lançamento com janela e segmentação por comportamento, sem discriminação enganosa. O teste A/B deve medir receita líquida, retenção pós-compra, refund e impacto na percepção de justiça, não apenas conversão imediata.

### 4.3 Instrumentação obrigatória

Registrar por `productId`, país, plataforma, origem, campanha e coorte: impressão de oferta, abertura, intenção, checkout iniciado, pagamento confirmado, entitlement concedido, uso do item, refund, chargeback, falha de webhook e repetição de evento. O cliente envia somente `productId`; preço, moeda, benefício e elegibilidade são resolvidos no servidor.

Antes de live, implementar ou aprovar: outbox/retry para fulfillment, ajustes append-only de refund/chargeback, reconciliação diária provedor–ordem–ledger, rate limit, limites de compra, proteção contra replay e painel de desligamento por país/SKU/canal. O requisito de aceite é no máximo um entitlement por pagamento e nenhum drift no ledger.

## 5. Estratégia de aquisição

### Fase A — prova de produto e comunidade, dias -60 a -31

Abrir a comunidade com o loop visual dos cinco Mundos, clipes curtos de Ring/ZEX/Zu e demonstrações honestas de partidas. Reativar o programa já previsto de alpha testers, imprensa, streamers e comunidade, mas substituir distribuição ampla de KRC por recompensas cosméticas, status, acesso e códigos de convite não transferíveis. Referral deve remunerar uma ação qualificada — conta verificada, primeira partida concluída e retenção mínima — e limitar abuso por dispositivo, conta, IP e padrão de comportamento.

O objetivo desta fase é construir lista qualificada, criativos vencedores e feedback. Não otimizar para instalações baratas. O relatório da Adjust recomenda observar instalações junto de DAU, LTV, CPI, sessões, retenção e ROAS, pois volume isolado pode trazer usuários que não permanecem. [Adjust — user acquisition strategies for mobile games](https://www.adjust.com/blog/mobile-game-user-acquisition-strategy/).

### Fase B — teste fechado de aquisição, dias -30 a -8

Usar 20–30 criativos por hipótese de mensagem: sobrevivência no Ring, escolha Zu, extração ZEX, disputa entre Mundos, identidade visual e prova social de streamer. Rodar células pequenas em Brasil, LatAm hispânica e um mercado de referência somente se suporte, latência, idioma e pagamentos estiverem preparados.

Distribuir o orçamento de teste entre creator whitelisting, TikTok/Meta/YouTube, busca de marca e retargeting. Não comprometer orçamento de escala antes de observar D1 e D7 por coorte. Usar MMP/attribution com eventos server-side e bloquear tráfego fraudulento. CPI serve para diagnosticar compra; a decisão é feita por D7/D30, pLTV e qualidade de sessão.

### Fase C — lançamento, dias 1–7

Concentrar o lançamento em um evento narrativo de Barburhen e em um torneio sem vantagem paga. Creators recebem ferramentas, códigos de rastreamento e conteúdo exclusivo; não recebem resultados competitivos alterados. Publicar o calendário de live ops, roadmap de Mundos e política de fair play.

Liberar mídia em degraus: 10% do orçamento diário planejado no primeiro dia, 25% após a primeira leitura de estabilidade e retenção, 50% após a coorte de sete dias, e escala plena somente nos canais que atingirem o gate de LTV/CAC. Reservar pelo menos 20% da verba de distribuição para criativos vencedores de última hora, retargeting e resposta a crise; não gastar o orçamento inteiro em aquisição fria no dia 1.

### Fase D — escala, dias 8–30

Aumentar investimento por canal no máximo 20–30% ao dia quando os indicadores permanecerem dentro do intervalo. Renovar criativos duas vezes por semana. Criar segmentos de alta intenção: jogadores que concluíram três partidas, fizeram primeira extração, voltaram no D3, assistiram ao showcase de cosmético ou convidaram um amigo.

O mix recomendado no mês inicial é 40% creators/comunidade/orgânico assistido, 35% paid social/video, 15% busca/retargeting e 10% PR, conteúdo e experimentos. O mix pode mudar, mas nunca deve esconder CAC pago atrás de orgânico: reportar blended CAC e CAC pago separadamente.

## 6. Orçamento e disciplina de caixa

Não aprovar uma verba de mídia de US$ 1 milhão apenas porque a receita-alvo é US$ 1 milhão. O primeiro envelope deve ser um teste financiável, com teto aprovado e kill switch. Uma política inicial prudente é limitar a exposição antes da leitura D7 a 15–25% do orçamento mensal de aquisição planejado. O restante fica condicionado a retenção, estabilidade, fraude, conversão e pLTV.

A administração deve acompanhar diariamente: receita bruta, receita líquida estimada, mídia comprometida, caixa pago, margem de contribuição por coorte, D1/D7, compradores novos, ARPPU, refund, chargeback, CAC, ROAS D1/D7/D30 e payback. Separar claramente “bookings”, “cash collected”, “net revenue” e “contribution after UA”.

Para um cenário-base de 892.857 instalações e 4% de pagantes, a meta exige aproximadamente 35.715 compradores e ARPPU bruto de US$ 28. Se apenas 45% das instalações vierem de mídia a CPI de US$ 2,50, a mídia aproximada será US$ 1,0 milhão. Isso é uma estratégia de aquisição financiada e possivelmente negativa no mês 1, não uma prova de sucesso econômico. O conselho deve aprovar explicitamente se aceita esse investimento para construir LTV futuro.

## 7. Roadmap de 30 dias

### Dias 1–7: definição e instrumentação

Fechar entidade vendedora, mercados iniciais, política de preço, refund, chargeback, idade, termos, privacidade e suporte. Remover linguagem de cripto/investimento/prêmio financeiro do material comercial. Definir catálogo draft, taxonomia de cosméticos e eventos de analytics. Manter checkout desligado.

### Dias 8–14: sandbox e conteúdo

Aplicar migration de pagamentos em staging, testar webhook, replay, divergência, falha de banco e refund simulado. Criar 30 criativos e 10 variações de store page. Validar funil de onboarding, primeira partida, primeira extração e primeiro retorno.

### Dias 15–21: coorte limitada

Rodar alpha/closed beta com creators e convites. Medir retenção por origem e dispositivo. Liberar somente cosméticos gratuitos ou entitlement de teste. Corrigir crashes, matchmaking, latência, economia e fricção de checkout antes de cobrar.

### Dias 22–30: decisão de go/no-go

Go se estabilidade, suporte, segurança, reconciliação e gates de retenção forem aprovados. Soft launch pago com feature flag e limites baixos. No-go se D1/D7 ficarem abaixo dos gates, se houver drift financeiro, chargeback anormal, falha de webhook, vantagem competitiva paga ou mensagem comercial não aprovada.

## 8. Principais riscos e mitigação

**Meta sem lucro:** reportar receita bruta, líquida e contribuição separadamente; aprovar orçamento como investimento, não como retorno garantido.

**Pay-to-win e abandono:** vender identidade e conveniência não competitiva; auditar toda oferta com uma matriz de impacto de gameplay.

**Falha de pagamento ou duplicação:** manter servidor autoritativo, idempotência, inbox, outbox, reconciliação e desligamento por feature flag.

**Fraude de referral e mídia:** eventos server-side, atribuição por coorte, limites por conta/dispositivo, revisão de tráfego e holdback de pagamentos suspeitos.

**Risco jurídico/regulatório:** KRC sem valor externo; sem resgate, rendimento, investimento ou prêmio financeiro; revisão profissional local antes de live.

**Dependência de um canal:** teto por canal, diversificação e comparação com holdout orgânico. Nunca escalar com base apenas em CPI ou ROAS D1.

**Promessa de US$ 1 milhão:** comunicar internamente como meta de bookings do mês 1 e externamente somente como ambição, não como garantia de retorno ao jogador ou investidor.

## 9. Dashboard mínimo para a diretoria

O dashboard diário deve responder, em uma única página: quantos usuários novos chegaram; de quais canais; quantos retornaram em D1/D7; quantos concluíram partida e extração; quantos pagaram; quanto foi faturado bruto e líquido; quanto custou a mídia; qual o LTV previsto; qual o payback; quantos refunds/chargebacks ocorreram; e se a economia permanece reconciliada.

A regra de decisão é: **reter antes de adquirir, monetizar antes de escalar e reconciliar antes de declarar receita**.

## Referências

[1]: https://appagent.com/blog/mobile-game-retention-benchmarks/ "AppAgent — Mobile game retention benchmarks"
[2]: https://www.adjust.com/blog/mobile-game-user-acquisition-strategy/ "Adjust — The latest user acquisition strategies for mobile games"
[3]: https://business.mistplay.com/resources/user-acquisition-cost "Mistplay — Mobile game user acquisition cost benchmarks"
[4]: https://developer.apple.com/app-store/review/guidelines/ "Apple — App Store Review Guidelines"
[5]: https://support.google.com/googleplay/android-developer/answer/112622 "Google Play — Service fees"
