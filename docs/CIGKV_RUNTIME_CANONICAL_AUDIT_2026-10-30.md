# Auditoria Fase A — runtime canônico de CIGKV

**Data:** 30/10/2026
**Escopo:** identificar qual caminho de código e dados governa entrada de jogadores, pontos de spawn, loot e transição de mundo para CIGKV, antes de alterar coordenadas.
**Estado:** auditoria estática concluída; runtime de mapa/spawns não pode ser comprovado integralmente sem assets/mapa UE e build/PIE. Nenhuma coordenada foi alterada.

## Conclusão executiva

**Não foi possível identificar uma única fonte canônica para os 50 `spawn_points` do JSON, porque o código de entrada de jogador CIGKV examinado não os consome.** O `AKhaaosGameMode` chama `Super::HandleStartingNewPlayer_Implementation` e não define um override de seleção de `PlayerStart`; portanto, a posição inicial normal depende do mapa/engine. Depois disso, se encontrar um `AKhaaosCIGKVLevel`, o GameMode chama `StartZuEntry`, que seleciona uma das `ZuVariants` e teleporta o pawn para o `SpawnPoint` escolhido. Se a lista estiver vazia, `InitializeMapData()` a preenche com três coordenadas fixas para essa realocação.

Assim, há dois estágios distintos: **spawn inicial padrão em um `PlayerStart` do mapa, cuja localização não está disponível no repositório; e uma realocação/entrada Zu** para uma das posições `ZuVariants`, condicionada à presença do Level Actor. O repositório não versiona mapas `.umap` ou assets `.uasset`; portanto, não demonstra quais `PlayerStarts` existem, se `AKhaaosCIGKVLevel` está associado ao mapa, se as variantes foram sobrescritas, nem se os três destinos são válidos em terreno/navmesh.

Os 50 pontos em `config/levels/CIGKV_level_data.json` e sua cópia em `Content` **não são canônicos para a entrada inicial** segundo as referências C++ encontradas. O actor `AKhaaosCIGKVLevelData`, que pode ler esse JSON e expõe `GetRandomSpawnPoint()`, não tem instanciação ou consumidor externo identificado no código fonte Unreal pesquisado. O array `UKhaaosCIGKVMapData::PlayerSpawnPoints` também é preenchido, mas não foi encontrado uso em gameplay. Esse Data Asset CIGKV é criado pelo Level Actor e seu consumidor comprovado é o spawn de loot por fase.

Há ainda `UKhaaosWorldConfigDataAsset::SpawnPoints`, consumido pelo GameMode para teletransportar jogadores vivos **durante uma transição para o próximo mundo**; a transição incrementa o índice da sequência CIGKV→Barburhen→Priadus→Ckesalth→Arukheea, e não seleciona o spawn inicial de CIGKV. Não há assets de World Config CIGKV versionados para confirmar seus dados/valores.

Conclusão operacional: **não migrar nem “corrigir” os 50 pontos JSON como se fossem a entrada real**. O dono de produto/design precisa decidir se esses pontos representam entradas de treino, spawns BR iniciais ou apenas dados de geração de mapa; engenharia precisa confirmar/fornecer o mapa Unreal e os assets WorldConfig que serão usados.

## Caminhos de runtime encontrados

### 1. Entrada de novo jogador em CIGKV

1. `AKhaaosGameMode::HandleStartingNewPlayer_Implementation` chama `Super::HandleStartingNewPlayer_Implementation`, busca atores `AKhaaosCIGKVLevel` no mundo e, se encontrar um, chama `StartZuEntry(NewPlayer)` (`Unreal/KhaaosRun/Source/KhaaosRun/Game/KhaaosGameMode.cpp:993-1011`).
2. `AKhaaosCIGKVLevel::StartZuEntry` exige autoridade, controller/pawn/PlayerState válidos e estado vivo; escolhe `ZuVariants[FMath::RandRange(...)]` e executa `Pawn->SetActorLocation(Zu.SpawnPoint)` e `SetActorRotation` (`Unreal/KhaaosRun/Source/KhaaosRun/Game/Level/KhaaosCIGKVLevel.cpp:350-380`).
3. Quando `ZuVariants` está vazia, `InitializeMapData()` cria três destinos Zu default em `(-4000,0,100)`, `(0,-4000,100)` e `(4000,4000,500)` (`KhaaosCIGKVLevel.cpp:634-659`). Se o actor não existir, o GameMode não faz essa realocação e o jogador permanece no comportamento de spawn herdado do GameMode/mapa; esse caso não pode ser inspecionado porque o mapa binário não está versionado.
4. O array `ZuVariants` é uma `UPROPERTY(EditAnywhere, BlueprintReadWrite)` (`Unreal/KhaaosRun/Source/KhaaosRun/Game/Level/KhaaosCIGKVLevel.h`, seção Zu), portanto um Level Actor/Blueprint poderia substituir os defaults; não foi encontrado asset que prove essa configuração.

**Interpretação:** a sequência Zu fornece três destinos de teleporte para o onboarding/entrada, não a lista de 50 pontos de BR. A escolha é aleatória e não demonstra spacing, proteção inicial, navmesh ou fairness. O spawn inicial herdado ainda depende dos `PlayerStart` do mapa, e não foi customizado por override `ChoosePlayerStart`/`FindPlayerStart` no `AKhaaosGameMode` pesquisado.

### 2. JSON CIGKV e actor loader

- `AKhaaosCIGKVLevelData::BeginPlay()` tenta `FPaths::ProjectConfigDir()/levels/CIGKV_level_data.json` (`Unreal/KhaaosRun/Source/KhaaosRun/Game/Level/KhaaosCIGKVLevelData.cpp:15-34`).
- No checkout atual, esse caminho resolve para `Unreal/KhaaosRun/Config/levels/CIGKV_level_data.json`, mas o diretório `Unreal/KhaaosRun/Config/levels/` não existe. Os únicos arquivos versionados estão em `config/levels/...` e `Unreal/KhaaosRun/Content/Maps/CIGKV/...`; o loader não constrói caminho para nenhum deles. **Se o actor for instanciado sem empacotar/copiar o JSON para a localização esperada, a chamada `FileExists` falha e o fluxo cai em `LoadDefaultData()`**, produzindo 10 spawns, não os 50 registros do JSON.
- Se o arquivo falha, carrega defaults hard-coded de 10 spawns, cinco ZEX e fases (`:19-25`, `:169-205`). O método de parse retorna sucesso se há pelo menos um spawn e um ZEX (`:55-167`); o método `GetRandomSpawnPoint()` escolhe um ponto aleatório (`:208-212`).
- Busca de referências no módulo Unreal encontrou essas APIs em suas próprias declarações/implementações, mas **não encontrou criação do actor, `GetAllActorsOfClass`, ou chamada externa a `GetRandomSpawnPoint`/`GetSpawnPoints`**. Logo, a implementação é um caminho possível/incompleto, não prova de runtime ativo.
- `GetLootBySector()` infere setor por limites fixos 512/1024/1536 em vez de consumir setor declarado nos registros (`:224-239`), mais um sinal de que o loader descreve o layout 2.048, e não o sistema centrado de 10 km.

### 2.1 Arquivos declarativos sem carregamento comprovado

- `Unreal/KhaaosRun/Config/DefaultCIGKV.ini` declara `MapSize=10000×10000×500` e `TargetPlayerCount=50` (`:25-35`), mas não foi encontrada referência de código a `DefaultCIGKV.ini`, `LoadConfig` ou leitura explícita desse arquivo para `UKhaaosCIGKVMapData`. A classe está marcada `UCLASS(BlueprintType)` e suas propriedades exibidas (`MapSize`, `TargetPlayerCount`, etc.) têm `EditAnywhere`, não a especificação `Config`. Portanto, tratar esses valores como **intenção/documentação de configuração**, não como valores efetivamente carregados em runtime.
- O `.ini` não contém arrays concretos para os 50 spawns, loot ou ZEX; descreve dimensões/frações e outros parâmetros. A ausência de carregador/flags impede usá-lo para resolver o conflito de coordenadas sem antes corrigir e testar o pipeline de configuração.

### 3. Data Asset CIGKV e loot

- `AKhaaosCIGKVLevel::BeginPlay()` sempre chama `InitializeMapData()` (`KhaaosCIGKVLevel.cpp:39-45`).
- Se `MapData` não foi atribuído, `InitializeMapData()` cria `UKhaaosCIGKVMapData` em memória e executa `InitializeDefaults()` (`:534-541`). Isso não carrega o JSON nem lê um Data Asset de mapa serializado.
- `SpawnPhaseLoot()` consulta `MapData->GetRandomLootSpawnEntries(...)` e spawna loot a partir desses registros (`KhaaosCIGKVLevel.cpp:186-222`). O Data Asset cria 60 pontos de loot e 50 `PlayerSpawnPoints` em `InitializeDefaults()` (`Unreal/KhaaosRun/Source/KhaaosRun/Game/World/CIGKV/KhaaosCIGKVMapData.cpp:142-245`), mas nenhuma leitura de `PlayerSpawnPoints` fora dessa classe foi encontrada no gameplay CIGKV.
- O teste `tests/ue5/cigkv_map_data_integration_test.cpp` exercita a lógica real de seleção de loot e defaults, mas não cobre a entrada de jogador, o actor loader JSON, associação a mapa ou PlayerStarts.

**Interpretação:** o Data Asset/defaults CIGKV é a origem de runtime observável para o loot por fase, mas não para os 50 spawns de jogador. Também contém coordenadas/zonas centradas que ainda divergem do JSON.

### 3.1 Fases de zona e limites espaciais em runtime

- Se `AKhaaosCIGKVLevel` está presente, seu `BeginPlay()` chama `StartZoneSequence()`. Essa rotina usa o array `ZonePhases` do Level Actor e passa a fase inicial a `AKhaaosSafeZone::SetWorldZone`; fases seguintes vêm do mesmo array em `AdvanceZonePhase()` (`KhaaosCIGKVLevel.cpp:39-58, 105-135, 138-169`). Quando o array está vazio, `InitializeMapData()` o preenche com quatro fases hard-coded, centros `(0,0)`, `(1000,0)`, `(500,500)`, `(300,300)` e raios 5000/3500/2000/800 cm (`:543-589`).
- `SetWorldZone()` marca a SafeZone como ativa e `bWorldSpaceZone=true`; quando o GameMode chama `ActivateZone()` no começo da partida, este só chama o avanço genérico de fase se `bWorldSpaceZone` for falso (`KhaaosSafeZone.cpp:156-177, 207-218`). Assim, na rota CIGKV em que `StartZoneSequence()` ocorreu, o array de quatro fases do Level Actor é a fonte de fase/centro/raio; os cinco valores genéricos de `InitDefaultZonePhases()` não devem ser confundidos com as quatro fases CIGKV. Se o Level Actor estiver ausente, mas houver SafeZone, o GameMode pode ativar a sequência genérica de cinco fases; se também não houver SafeZone, não há esse actor de zona. O mapa ausente impede confirmar qual caso se aplica.
- A classe `AKhaaosSafeZone` começa com `MapSize=10000`, `WorldMapMin=(-5000,-5000)` e `WorldMapMax=(10000,5000)` no construtor (`KhaaosSafeZone.cpp:37-49`). A largura X usada na conversão para minimapa é, portanto, 15.000 cm, embora `MapSize` seja 10.000 cm. Esses limites influenciam normalização/visualização da safe zone; não provam que a geometria do mapa tenha esse tamanho.
- Existe `Source/KhaaosRun/Config/DefaultGame.ini` com parâmetros para GameMode/SafeZone, inclusive `MapSize=10000` e `DamageTickInterval=1`, mas está sob o diretório `Source/KhaaosRun/Config`, não no `Unreal/KhaaosRun/Config` do projeto. As propriedades de SafeZone têm `EditDefaultsOnly`, não `Config`; os parâmetros de `AKhaaosCIGKVLevel` e `UKhaaosCIGKVMapData` examinados têm `EditAnywhere`, não `Config`. Não foi encontrado carregamento explícito desses arquivos. As fontes comprovadamente inicializadas no código são os construtores/defaults, sujeitas a sobrescrita por Blueprint/instância — assets não disponíveis para confirmar.

### 4. `WorldConfig` e transição entre mundos

- `AKhaaosGameMode` carrega as referências `WorldConfigAssets` configuradas no actor/Blueprint (`KhaaosGameMode.h:244-246` e `KhaaosGameMode.cpp:115-155`).
- Ao transicionar, o GameMode avança `CurrentWorldIndex` e obtém o config seguinte; para cada jogador vivo, indexa `NextConfig->SpawnPoints`, teleporta para `(X,Y,0)` e ignora o Z declarado (`KhaaosGameMode.cpp:522-600`).
- O índice inicial é 0 e representa CIGKV; o comentário do GameMode indica a sequência CIGKV→Barburhen→Priadus→Ckesalth→Arukheea (`KhaaosGameMode.cpp:55-57, 522-531`). Assim, esses pontos servem à transição para mundo seguinte, não à admissão inicial no ring CIGKV.
- `UKhaaosWorldConfigDataAsset` é abstrato e declara `SpawnPoints` (`Game/Data/KhaaosWorldConfigDataAsset.h:185-252`); o código carrega referências soft, mas nenhum `.uasset` de WorldConfig está no conteúdo versionado examinado. `Content/Barburhen/DT_Barburhen_WorldConfig.csv` existe como CSV, sem prova de que ele seja importado/conectado ao `TSoftObjectPtr` usado pelo GameMode.

## Inventário das fontes e evidências

| Fonte | Uso comprovado | Status para spawn inicial CIGKV |
|---|---|---|
| `config/levels/CIGKV_level_data.json` | Entrada default do gerador Python; não há consumidor C++ ativo encontrado para os 50 pontos | **Não canônico comprovado** |
| `Unreal/KhaaosRun/Content/Maps/CIGKV/CIGKV_level_data.json` | Cópia idêntica byte a byte do JSON de `config`; nenhum consumidor Unreal encontrado | **Cópia duplicada; função desconhecida** |
| `AKhaaosCIGKVLevelData` JSON loader | Espera `Unreal/KhaaosRun/Config/levels/CIGKV_level_data.json` (ausente no checkout); sem o arquivo usa 10 spawns fallback; não há instanciação/consumidor externo encontrado | **Candidato desconectado/inativo até prova de Blueprint/mapa e correção do caminho** |
| `Unreal/KhaaosRun/Config/DefaultCIGKV.ini` | Declara metadados/dimensões, mas sem referência explícita de loader e sem `Config` nas propriedades CIGKV examinadas | **Intenção declarativa; carregamento efetivo não comprovado** |
| `UKhaaosCIGKVMapData::InitializeDefaults()` | Criado pelo `AKhaaosCIGKVLevel`; loot por fase consome seus loot slots; `PlayerSpawnPoints` sem consumidor de gameplay encontrado | **Runtime de loot, não spawn jogador demonstrado** |
| `AKhaaosCIGKVLevel::ZonePhases` | Inicia e atualiza `SafeZone` em coordenadas de mundo; quatro fases CIGKV default se o actor estiver na partida | **Fonte de runtime provável/condicionada ao Level Actor; não é o JSON nem as cinco fases genéricas** |
| `AKhaaosSafeZone` constructor | Defaults `MapSize=10000`, `WorldMapMin=(-5000,-5000)`, `WorldMapMax=(10000,5000)` usados na lógica de zona/minimapa | **Defaults de código; limites X cobrem 15 km e divergem do mapa nominal de 10 km** |
| `AKhaaosCIGKVLevel::ZuVariants` | `GameMode` chama `StartZuEntry` após o spawn normal quando Level Actor encontrado; teleporte para uma das variantes | **Realocação/onboarding comprovada em código, condicionada ao Level Actor; não substitui a origem inicial em `PlayerStart`** |
| `UKhaaosWorldConfigDataAsset::SpawnPoints` | GameMode teleporta vivos nesses pontos na transição para mundo seguinte | **Runtime de transição, não entrada inicial CIGKV; dados concretos não disponíveis** |
| Unreal maps/assets | Nenhum `.umap`/`.uasset` versionado; não há UnrealEditor/UnrealBuildTool neste ambiente | **Não permite provar associação de Level Actor nem geometria** |
| Runtime web/Node (`server`, `client`, `shared`, `game-runtime`) | Busca por nome/identificadores e campos CIGKV/`spawn_points` não encontrou consumo do JSON | **Nenhuma conexão observada com este layout** |

## Baseline das duas cópias JSON

Os dois arquivos são **idênticos byte a byte**, SHA-256 `499294fe150314ada68c06a6931434c5abf15741f84e84e8af7904930a002303`, 17.576 bytes. Metadados e contagens: `map_size=2048×2048×256`, `unit=cm`, `capacity=50`; 3 setores, 50 spawns, 15 ZEX, 60 loot points, 4 fases. Contagem de spawns por rótulo `ArmoryHub=5`, `ProvingGrounds=25`, `Park=20`; loot por raridade `common=30`, `uncommon=17`, `rare=8`, `epic=3`, `legendary=2`.

Essa igualdade mostra que são duplicatas atuais; **não determina qual delas deve ser fonte canônica**, pois não se encontrou código de runtime que as consuma para seleção inicial de jogador.

## Verificações executadas

- `npm run test:ue5:logic`: **aprovado**, incluindo regras de loot/Zu e teste portável de `UKhaaosCIGKVMapData`. Não valida build UE, carregamento do JSON, mapa, entrada de jogador ou seleção de spawn.
- `scripts/mvp/step2_cigkv_map/validate_spawn_points.py` em diretório temporário: **falhou em 4 categorias** (`minimum_spacing`, `distribution`, `zex_spawn_clearance`, `loot_rarity`). Produziu 280 pares de spawn abaixo de 500 cm, discrepância entre distribuição atual `5/25/20` e o esperado pela ferramenta `5/20/25`, 26 pares spawn–ZEX abaixo de raio+clearance de 100 cm, e divergência de raridade `30/17/8/3/2` vs `30/15/10/3/2`. Nenhuma dessas thresholds foi aprovada como regra de design nesta auditoria.
- `generate_cigkv_map.py` em diretório temporário: script terminou com **exit 1** pelas duas violações de spawn conhecidas (280 pares abaixo de 500 cm e mismatch setorial 5/25/20 vs. 5/20/25); gerou visualização e Python UE5 temporários, removidos após captura do resumo. Não foi executado no Unreal Editor.
- Busca de assets: **0 arquivos `.umap`/`.uasset` versionados** sob `Unreal/KhaaosRun/Content`; nenhum `UnrealEditor` ou `UnrealBuildTool` disponível por PATH/locais padrão verificados.

## Decisões e próximos passos

1. **Bloqueio de design:** determinar se os 50 pontos JSON são pontos de `TrainingEntry`, spawns `BRInitial` ou apenas pontos-alvo para geração/editor. Não os migrar ainda.
2. **Bloqueio de runtime:** solicitar/recuperar o mapa CIGKV e/ou Blueprint do Level Actor usado em runtime, assim como os assets WorldConfig atribuídos ao GameMode; confirmar quais `ZuVariants` substituem os defaults e se os 50 pontos devem participar de algum modo.
3. **Bloqueio de build:** abrir o projeto na instalação licenciada UE5.8, confirmar GameMode/mapa carregado, instância de `AKhaaosCIGKVLevel`, classe de Level Script, PlayerStarts e caminhos de streaming.
4. Depois das confirmações, decidir uma única fonte canônica por função: entrada/onboarding, BR initial drop, loot de fase, extração ZEX e transição entre mundos. Só então atualizar schema, coordenadas e consumers.
5. Reforçar testes para cobrir o fluxo real de entrada de jogador (com mapa/asset ou Automation Test), garantir que pontos 2D/3D sejam validados contra geometria e terreno, e detectar ausência de assets/config sem fallback silencioso.

**Decisão da auditoria:** Fase A foi concluída quanto ao rastreamento estático de código e baseline de dados, mas o gate de runtime continua **parcial/bloqueado**. Não declarar um único runtime canônico nem iniciar conversão das 50 coordenadas até confirmar o asset/mapa e a semântica dos pontos.
