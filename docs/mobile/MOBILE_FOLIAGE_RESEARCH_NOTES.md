# Fontes oficiais consultadas para otimização de foliage

Consultado em 10 nov 2026. A Epic documenta `foliage.LODDistanceScale` como multiplicador de distâncias usadas para calcular LOD. `foliage.DensityScale` e `foliage.CullDistanceScale` requerem opt-in nas Foliage Types. `sg.FoliageQuality` ajusta quantos meshes de foliage são renderizados; portanto, ajustar a densidade global pode alterar a aparência do mundo por tier. Fonte: https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-console-variables-reference e https://dev.epicgames.com/documentation/unreal-engine/scalability-reference-for-unreal-engine.

Para materiais mobile, masked/translucent devem ser usados com parcimônia por overdraw; a Epic recomenda Shader Complexity para encontrar hotspots. Alpha-to-Coverage para material masked depende de MSAA. Fonte: https://dev.epicgames.com/documentation/unreal-engine/performance-guidelines-for-mobile-devices-in-unreal-engine.

A ferramenta Impostor Baker cria representações simplificadas para LOD distante; a página descreve Upper Hemisphere Impostor, Full Sphere e billboard tradicional, incluindo trade-offs de triângulos, shader e masked overdraw. Fonte: https://dev.epicgames.com/documentation/unreal-engine/impostor-baker-plugin-in-unreal-engine.

No conteúdo do main `b30b3ed`, os seis glTFs de cenário foram inspecionados e cada um tem uma mesh, sem materiais/images no arquivo; não foi identificado asset fonte específico de foliage e não há `.uasset`/`.umap` compilados. Portanto as alterações são de policy/config, não reauthor de foliage meshes.