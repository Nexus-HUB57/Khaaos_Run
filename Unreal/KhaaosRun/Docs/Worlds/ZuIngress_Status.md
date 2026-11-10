# Zu — auditoria de implementação e sincronização

**Fonte canônica:** [`README.md`](../../../../README.md), seção **Protocolos de Ingresso (Zu)**. Esta nota registra estado técnico; não amplia o cânone. O README não especifica um fluxo temporal completo de embarque, percurso e chegada. Esses passos permanecem **não especificados** até decisão de design.

## Contrato comum

- Cada mundo tem exatamente três variantes Zu (Zu 1–3), com o evento e a ação indicados na tabela do README.
- Decisão correta: 0 dano e possível atordoamento/visão embaçada durante 5–7 s.
- Decisão incorreta: até 30% de dano à vitalidade.
- Caixotes de armamento no perímetro: um item por jogador. Estoques estáticos não provam distribuição individual em runtime.

## Sincronização aplicada

1. `Source/KhaaosRun/Game/World/Zu/ZuIngressRules.cpp`: os rótulos do popup/evento foram alinhados aos 15 itens da tabela do README. Removida, entre outros acréscimos não canônicos, a inferência “Trem-Tanque” de Arukheea; o texto agora diz somente “Colisão com tanque”.
2. `shared/game-hierarchy.ts`: os 15 eventos, ações e resultados exibidos/calculados pela hierarquia TypeScript foram reduzidos ao contrato README, mantendo os enums e a penalidade de 30%. A regra inicial de 1.000 KRC no Zu 1 do CIGKV permanece descrita separadamente no resultado.
3. `client/src/pages/mundos.tsx`: os três cards Zu de CIGKV usam eventos/ações canônicos, o teto de 30% e o texto comum de efeito; inventários de loot não presentes na tabela README foram substituídos pela regra de caixote/um item.
4. `tests/ue5/zu_ingress_contract_test.cpp`: teste C++20 portátil para as 15 variantes contra texto/action/limites do catálogo C++; integrado a `npm run test:ue5:logic` e ao `verify:all` existente.
5. `tests/official/game-hierarchy.test.ts`: teste da hierarquia TypeScript que lê a tabela Zu do README e compara eventos, ações, limite de dano e janela de efeito para os cinco mundos.
6. `Source/KhaaosRun/Tests/ZuIngressRulesSpec.cpp`: Automation Test nativo `Khaaos.Zu.Contract.Readme15Variants` que compara popup, evento, local, ação e limites/efeitos nas 15 entradas.
7. `Source/KhaaosRun/Tests/ZuIngressComponentSpec.cpp`: Automation Test nativo `Khaaos.Zu.Authority.ServerOnlyAppliesEffects` que percorre as 15 variantes em owner autoritativo e em `ROLE_SimulatedProxy`, exercitando recusa/dano e escolha protetiva/stun-ou-blur; confere o roteamento de evento, a vitalidade e a ausência de efeitos locais no proxy.
8. Ambos emitem eventos Info `ZU_CASE|...`; `scripts/ci/verify-zu-automation-report.sh <report.json-ou-diretório>` exige 15 marcadores de contrato e 30 marcadores de autoridade (15 servidor + 15 cliente), os dois testes bem-sucedidos e zero falhas/erros no JSON.
9. `KhaaosRunEditor.Target.cs` força Development Automation Tests apenas na configuração `Development`; os dois arquivos de teste são guardados por `WITH_DEV_AUTOMATION_TESTS`. `scripts/ci/run-zu-automation.sh` confirma UE5.8, compila `KhaaosRunEditor` em `Development`, roda `Automation RunTest Khaaos.Zu`, exporta relatório/log e chama o verificador. `.github/workflows/zu-automation.yml` automatiza esse fluxo em pushes confiáveis para `main`/`feat/**` e permite execução manual, usando as labels self-hosted UE5.8 existentes. Pode-se definir `UE_ROOT` ou `UE5_INSTALL_DIR`; o default local é `/opt/unreal-engine/5.8`. A chamada segue os argumentos documentados de [execução de Automation Tests](https://dev.epicgames.com/documentation/unreal-engine/run-automation-tests-in-unreal-engine?lang=en-US) e [exportação do relatório JSON](https://dev.epicgames.com/documentation/unreal-engine/review-test-results-in-unreal-engine?lang=en-US).

## Matriz canônica

| Mundo | Zu 1 | Zu 2 | Zu 3 |
|---|---|---|---|
| CIGKV | Caminhão atropela bois → apertar cinto | Capota com rocha → saltar | Cai da ponte → máscara O₂ |
| Barburhen (W1/C1) | Trem descarrila → cinto | Colisão frontal → saltar | Incêndio elétrico → máscara |
| Priadus (W2/C2) | Fim de trilho → cinto | Homens-bomba → saltar | Neblina tóxica → máscara |
| Ckesalth (W3/C3) | Tempestade de areia → cinto | Explosão no túnel → saltar | Caminhão-tanque em chamas → máscara |
| Arukheea (W4/C4) | Trilho desmorona → cinto | Colisão com tanque → saltar no mar | Bombas de gás por drones → máscara |

O README não define, para todos os mundos, veículo, embarque, capacidade, assentos, rota, duração da cena, ordem temporal, ponto exato de chegada ou condição técnica de ativação do Ring. Código antigo não deve transformar esses detalhes em contrato canônico.

## O que ainda não é end-to-end

O componente compartilhado `UKhaaosZuIngressComponent` existe, mas a busca estática não encontrou chamadas a `BeginIngress` ou `SubmitDecision` fora do próprio componente/testes. Não há prova de ligação completa entre cinematic, popup, decisão autoritativa, consequência no jogador correto, entrega real de caixote e chegada/spawn no Ring.

Também há definições legadas em níveis específicos que divergem do catálogo canônico. A auditoria encontrou, por exemplo, uma variante Zu4 em Barburhen; enum de Priadus com `Zu3_Nadando`; entradas de Ckesalth/Arukheea associadas a areia ou outros eventos fora da tabela; e placeholders de decisão/efeitos em Ckesalth e Arukheea. Não foram renomeadas automaticamente: enums Unreal podem ser referenciados em Blueprints/assets serializados, e a pesquisa de usos/compilação UHT/UBT/PIE precisa ocorrer em UE5.8 para uma migração segura.

Há ainda divergências de identidade dos níveis/intakes — especialmente conteúdo aquático em Barburhen e dados de arquipélago/montanha/neve/deserto em Priadus, Ckesalth e Arukheea — que impedem usar esses níveis como fixtures válidas sem reconciliação. O código deve continuar sinalizado como parcial até isso ser resolvido.

### Sequência necessária para aceite real

1. Localizar referências em C++, Blueprints e assets a cada enum/ator específico; migrar para o catálogo comum em alterações controladas, sem quebrar dados serializados.
2. Ligar cada gatilho cinematográfico ao componente compartilhado e à autoridade do servidor; replicar estado/popup/resultado ao jogador correto e cobrir timeout/decisão.
3. Implementar a distribuição real de caixotes com um item por jogador e testes de concorrência/autoridade.
4. Obter decisão de design para transporte, embarque, ordem temporal e ponto de chegada onde não constam do README; então implementar o handoff/desembarque no Ring.
5. Corrigir os dados de cada mundo conforme o README e validar spawn, gameplay e integração no nível.
6. No Unreal Editor 5.8, rodar UHT/UBT, Automation Tests, cook e playtest multiplayer. O Editor não está disponível neste sandbox; portanto `.uasset`/`.umap`, build e validação visual/gameplay real continuam pendentes.

## Verificações executadas neste trabalho

- `npm run test:ue5:logic`: **PASS**; inclui `15 canonical Zu variants` e os testes portáteis de lógica já existentes.
- `npm run verify:world-manifests`: **PASS** para CIGKV, Priadus, Ckesalth e Arukheea.
- `npm run verify:all`: todos os gates de mundos/Zu, TypeScript, build do app e build/testes do runtime passaram, mas a suíte `App oficial · testes + coverage` falhou em `tests/official/private-room-access.test.ts`, pois `DATABASE_URL` não está provisionada e PostgreSQL em `127.0.0.1:5432` recusou conexão. O gate de runtime registrou 967 aprovações, zero falhas e 13 testes ignorados por dependência.
- `Unreal Automation Tests`: os dois testes nativos acima cobrem textualmente/comportamentalmente 5 × 3 casos, mas **não foram compilados nem executados**; Unreal Editor, UBT e RunUAT não estão disponíveis neste ambiente. O teste de autoridade configura a role local do ator; não substitui uma sessão de rede PIE com servidor e cliente.
- `scripts/ci/verify-zu-automation-report.sh`: sintaxe e fixtures JSON passaram; cobertos sucesso, diretório com JSON auxiliar, falha global, marcador ausente e teste obrigatório ausente. Ainda não foi validado contra um JSON produzido por execução real do Unreal.
- `scripts/ci/run-zu-automation.sh`: sintaxe Bash validável localmente; a compilação e execução reais dependem do runner licenciado UE5.8 e não foram executadas neste sandbox.
- Orquestração do runner: **PASS** com um Engine UE5.8 simulado; confirmou argumentos de build/Automation, escrita do JSON e aprovação dos 45 marcadores. Isso não substitui compilação/execução no Unreal real.
- `git diff --check`: **PASS**.

**Status:** catálogo, hierarquia TypeScript e apresentação CIGKV sincronizados e cobertos por testes de contrato; integração entre níveis, transporte, chegada, spawn, entrega de itens e aceite no UE5.8 continuam parciais/pendentes. Não declarar Zu end-to-end concluído até fechar essas etapas.
