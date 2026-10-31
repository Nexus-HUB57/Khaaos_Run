# Teste de proveniência de dados CIGKV em runtime

O teste Unreal `Khaaos.CIGKV.Runtime.DataSource` observa o mundo ativo — não simula nem infere o carregamento a partir dos arquivos do repositório. Ele registra GameMode/mapa, `APlayerStart`, `AKhaaosCIGKVLevel`, variantes Zu, `MapData`, pontos gerados e qualquer actor `AKhaaosCIGKVLevelData` com a fonte e o caminho JSON que ele realmente tentou carregar.

## Como executar

1. Abra `Unreal/KhaaosRun/KhaaosRun.uproject` em Unreal Engine 5.8 e compile o target Editor.
2. Abra o mapa CIGKV efetivamente usado pelo projeto e inicie PIE ou uma sessão de servidor. Não execute o teste somente no mundo de edição.
3. Com o jogo em execução, abra **Window → Test Automation** e rode `Khaaos.CIGKV.Runtime.DataSource`. Alternativamente, no console da sessão, use:

   ```text
   Automation RunTests Khaaos.CIGKV.Runtime.DataSource
   ```

4. Consulte os resultados de Automation e o Output Log, filtrando por `[CIGKV-DATA-SOURCE]`.

O teste falha se não houver mundo Game/PIE com `AKhaaosGameMode`, se o mapa ativo não contiver `AKhaaosCIGKVLevel`, se não houver `APlayerStart`, se `MapData` não tiver loot, ou se um `AKhaaosCIGKVLevelData` presente não resolver sua origem ou não tiver spawn, ZEX e fases. A ausência de `AKhaaosCIGKVLevelData` é registrada explicitamente como “JSON loader não instanciado”; não é confundida com o `MapData` consumido pelo Level Actor. A contagem de loot do JSON loader é reportada, mas não exigida, pois o fallback hardcoded atual não possui loot.

Quando existir `AKhaaosCIGKVLevelData`, os campos transitórios `ActiveDataSource`, `ActiveDataPath` e `LastDataPathAttempt` distinguem JSON carregado com sucesso de fallback e mostram, separadamente, o arquivo ativo e a última tentativa. Para `MapData`, o marcador de `InitializeDefaults()` confirma quando o Level Actor gerou os defaults em runtime. Nos demais casos, `IsAsset()` e o caminho do objeto são apenas indícios: não provam sozinhos a proveniência do carregamento. Também lista a classe ativa, contagens e amostras de coordenadas para comparar com o `PlayerStart` e posições atuais dos jogadores.

## Limite da validação

O script é de leitura: não move jogadores, não altera actors e não substitui fontes. O teste só comprova o conteúdo do mundo/mapa que foi carregado naquela sessão; não valida colisão, navegabilidade, qualidade da geometria nem distribuição estatística em partidas repetidas. A execução deve ocorrer no mapa CIGKV real, pois o checkout auditado não continha `.umap`/`.uasset` para iniciar essa sessão neste ambiente.
