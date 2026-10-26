# Testes host do CIGKV

Execute `npm run test:ue5:logic` para rodar os testes das regras e a integração de MapData.

O teste `cigkv_map_data_integration_test.cpp` compila diretamente o arquivo de produção `KhaaosCIGKVMapData.cpp` junto com `CIGKVLootRules.cpp` e chama `UKhaaosCIGKVMapData::GetRandomLootSpawnEntries`, `GetRandomLootSpawnPoints` e `InitializeDefaults`. Assim, filtro por MinPhase/zona, shuffle/limite da seleção, retorno dos metadados e dados padrão são exercitados no código real, não reimplementados no teste.

Como o Unreal Engine não está instalado no host/CI, `stubs/` fornece apenas tipos, macros e headers mínimos necessários para compilar esse trecho fora do engine; o gerador aleatório do shim é determinístico. O teste não simula `UWorld`, spawn de atores, replicação, UHT ou `UnrealBuildTool`. Para validar esses comportamentos de engine, é necessário rodar testes de automação Unreal em uma instalação do editor.
