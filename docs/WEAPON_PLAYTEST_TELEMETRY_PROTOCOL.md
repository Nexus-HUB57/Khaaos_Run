# Protocolo de telemetria para playtests de armas

## Objetivo e escopo

Este protocolo define como registrar engajamentos de playtest e resumir seus resultados de forma **descritiva**. Cada linha representa um engajamento controlado atribuído a uma única arma. O analisador não compara armas com metas de balanceamento, não declara uma arma aprovada/reprovada e não certifica o balanceamento.

O CSV precisa vir de uma captura/exportação real, aprovada e verificada. Os arquivos de teste do analisador usam apenas fixtures sintéticas para testar o código; elas não são observações de jogo e não constituem evidência.

## Metodologia controlada

1. Use um servidor autoritativo como fonte de verdade para tiros, acertos, dano, eliminações, TTK e RTT. Identifique claramente o servidor/build responsável pela medição e valide a captura antes de exportar.
2. Registre um engajamento por linha e atribua-o a uma única arma. Gere um `engagement_id` único, opaco e sem informação pessoal.
3. Mantenha fixos e documentados, dentro de cada grupo comparável, o build e a versão da tabela de armas, o modo, o cenário, a distância e a classe de armadura do alvo. Controle ainda outras condições relevantes do experimento. Não misture versões de build ou de tabela como se fossem uma mesma condição: elas são dimensões explícitas do agrupamento.
4. Não inclua identificadores de jogador, EOS IDs, nomes de conta ou outros dados pessoais no CSV. O protocolo usa IDs de engajamento, build, cenário, modo e arma, não identidades de jogador.
5. Defina previamente o tamanho mínimo de amostra por grupo para revisão. O parâmetro de CLI é obrigatório justamente para não impor um limiar padrão arbitrário. Um grupo abaixo do limite é marcado `INSUFFICIENT_SAMPLE`; alcançar o limite apenas o torna elegível para revisão, não torna a amostra estatisticamente conclusiva nem certifica a arma.
6. Preserve a proveniência do arquivo fora deste schema: origem/autorização da captura, timestamp/período, versão do exportador e versão/hash da tabela de armas devem acompanhar o processo de aprovação e arquivamento. O CSV v1 deliberadamente não contém campos adicionais.

## Schema CSV v1

O cabeçalho é obrigatório, com os nomes e a ordem exatamente como abaixo. Não são aceitas colunas extras, faltantes, repetidas ou reordenadas. Use UTF-8; vírgula como delimitador e ponto como separador decimal. Cada linha de dados é um único engajamento.

| Campo | Tipo/validação | Significado |
| --- | --- | --- |
| `engagement_id` | string não vazia, única no arquivo | Identificador opaco do engajamento. |
| `build_id` | string não vazia | Identificador imutável do build testado. |
| `scenario_id` | string não vazia | Cenário controlado. |
| `mode` | string não vazia | Modo de jogo. |
| `weapon_id` | string não vazia | Identificador da única arma usada no engajamento. |
| `target_armor_class` | string não vazia | Classe de armadura do alvo, tratada como dimensão categórica. |
| `distance_m` | número finito, >= 0 | Distância medida em metros. |
| `shots_fired` | inteiro > 0 | Disparos efetuados no engajamento. |
| `shots_hit` | inteiro entre 0 e `shots_fired`, inclusive | Disparos que acertaram. |
| `damage_applied` | número finito, >= 0 | Dano total aplicado no engajamento. |
| `time_to_kill_ms` | número finito > 0 se eliminado; vazio caso contrário | Tempo até eliminação, em milissegundos. |
| `eliminated` | exatamente `true` ou `false` | Se o alvo foi eliminado no engajamento. |
| `server_rtt_ms` | número finito, >= 0 | RTT observado pelo servidor, em milissegundos. |

Template de cabeçalho: [`docs/templates/weapon_playtest_engagements.csv`](templates/weapon_playtest_engagements.csv). O template contém somente o cabeçalho, sem dados.

## Agrupamento e métricas

O analisador agrega por `build_id`, `mode`, `scenario_id`, `weapon_id` e `target_armor_class`. Distância é medida por linha e resumida dentro do grupo; não forma uma dimensão de agrupamento adicional.

Para cada grupo:

- `n`: número de engajamentos válidos;
- `sample_status`: `SUFFICIENT_FOR_REVIEW` se `n >= --min-encounters`; caso contrário `INSUFFICIENT_SAMPLE`;
- `hit_rate`: soma de `shots_hit` / soma de `shots_fired`;
- `damage_per_shot`: soma de `damage_applied` / soma de `shots_fired`;
- `damage_per_hit`: soma de `damage_applied` / soma de `shots_hit`; é `null` se não houve acertos;
- `elim_rate`: número de engajamentos com `eliminated=true` / `n`;
- `ttk_median_ms`: mediana de `time_to_kill_ms`, considerando somente eliminações; `null` se não houver eliminações;
- `ttk_p90_ms`: percentil 90 por nearest-rank das eliminações, rank `ceil(0,90 × quantidade de TTKs)` (mínimo 1); `null` se não houver eliminações;
- `mean_distance_m`: média aritmética de `distance_m`;
- `median_server_rtt_ms`: mediana de `server_rtt_ms`.

Em quantidades pares, a mediana é a média dos dois valores centrais ordenados. O JSON contém ainda `balance_status: UNVERIFIED` e `evidence_scope: observed_playtest_descriptive_only` em todos os resultados. Nenhuma métrica é usada para declarar armas balanceadas ou desbalanceadas.

## Uso do analisador

Requer Python 3 e usa somente a biblioteca padrão. Passe o caminho CSV e especifique o limiar de amostra positivo. Por padrão, o JSON vai para stdout; `--output` grava em arquivo:

```sh
python3 scripts/analyze_weapon_playtests.py \
  docs/templates/weapon_playtest_engagements.csv \
  --min-encounters 20

python3 scripts/analyze_weapon_playtests.py caminho/da-captura.csv \
  --min-encounters 20 \
  --output resumo.json
```

O template apenas com cabeçalho serve para mostrar o contrato e será rejeitado como entrada de análise por não conter engajamentos. Erros de leitura, cabeçalho, estrutura ou validação são reportados em stderr e retornam código diferente de zero. A saída é determinística e não inclui timestamp gerado pelo analisador.

## Limitações da captura Unreal atualmente inspecionada

A revisão do código em `Unreal/KhaaosRun/Source/KhaaosRun/Game/LiveOps/KhaaosTelemetryPipeline.cpp` e `.h` confirmou:

- `VerboseSamplingRate` é inicializado como `0.1f` (10%). `ShouldSample` aplica essa taxa a `WeaponFired` (e `CustomEvent`); portanto, o evento de disparo não tem cobertura integral por padrão.
- A busca por uso de `WeaponFired` na árvore de fontes Unreal inspecionada encontrou a declaração do enum e sua verificação no filtro de amostragem, mas não um call site de disparo em gameplay.
- `SerializeEvent` e `SerializeBatch` montam objetos/arrays com `FJsonObject` e `FJsonSerializer`; o EOS ID bruto não é serializado. `ShipBatch` inicia POST assíncrono somente em servidor dedicado quando `AnalyticsUrl` usa HTTPS e `KHAAOS_TELEMETRY_TOKEN` existe no ambiente. Envia `Idempotency-Key` e versão de schema, e só considera o batch entregue após resposta 2xx. Falhas de transporte, 408, 429 e 5xx usam até cinco retries além da tentativa inicial (seis tentativas no máximo), com backoff exponencial/jitter e `Retry-After` numérico até 60 segundos. Erros 4xx permanentes e retries esgotados removem o batch da fila de envio e são registrados sem payload no log.
- A implementação de transporte ainda não demonstra entrega a um backend de produção: não foi identificada rota de ingestão correspondente no backend nem há contrato implantado para URL, autenticação, idempotência, schema e resposta. O transporte permanece inativo enquanto endpoint ou token de produção estiverem ausentes. O teste contra mock descrito abaixo valida apenas o contrato de transporte.
- O batch pendente e `LocalBuffer` ainda vivem apenas em memória; não há outbox durável nem replay após reinício, e o buffer local não reenvia batches descartados. O flush por intervalo e o reset temporal do rate limit também não estão implementados. `OnTelemetryFlushed` agora sinaliza confirmação 2xx, não apenas a montagem do lote; durante o shutdown, não há drenagem assíncrona garantida.

O Automation Test `Khaaos.Telemetry.JsonSerialization` cobre round-trip JSON de strings com caracteres especiais, metadata, timestamps e array do lote. O novo `Khaaos.Telemetry.HttpTransportIntegration` usa o `FHttpModule` real para enviar a um mock HTTP local, aguarda o callback 2xx e, com o mock em `retry-once`, verifica a sequência 503→202, o mesmo corpo e `Idempotency-Key`, headers e ausência do EOS ID bruto. HTTP em loopback e bypass do contexto dedicated-server são permitidos apenas pelo opt-in de `WITH_DEV_AUTOMATION_TESTS`; builds de produção continuam exigindo HTTPS e servidor dedicado. Os testes e workflow foram adicionados, mas a execução Unreal depende de runner UE5.8 disponível. Mesmo quando executado, esse teste comprova transporte contra mock, não coleta de gameplay, exportação de engajamentos ou entrega ao backend de produção. Um CSV não pode ser inferido ou preenchido a partir dessas declarações: deve vir de captura/exportação real aprovada antes de qualquer conclusão. Não execute análise inferencial ou de balanceamento com dados ausentes, fabricados ou não validados.

## Próximos passos recomendados (fora deste change)

Antes de ativar o transporte em revisão de armas, implementar e testar uma rota autenticada no backend, alinhar o contrato e a política de privacidade (incluindo tratamento de `PlayerEosId`), configurar `AnalyticsUrl`/segredo somente no servidor dedicado e adicionar outbox/replay duráveis se a perda não for aceitável. Também integrar hooks autoritativos nos pontos de gameplay, configurar amostragem adequada para builds de playtest, criar um evento/agregador de engajamento compatível com o schema CSV e exportar dados reais. Validar ponta a ponta completude, duplicação, associação correta de arma, retries e consistência dos totais. A serialização, o transporte assíncrono e o teste de integração contra mock estão versionados; a rota backend, a captura de gameplay e a validação operacional em runner UE5.8 ainda permanecem pendentes.
