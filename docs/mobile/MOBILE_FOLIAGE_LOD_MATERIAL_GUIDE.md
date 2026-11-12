# Khaaos Run — LODs e materiais de folhagem mobile

## Alterações aplicadas

Os profiles de Android e iOS agora antecipam a seleção de LOD da folhagem com `foliage.LODDistanceScale`: 0,9 no bucket padrão, 0,75 no menor e 0,65 no menor bucket; os presets Balanced usam 0,8 e LowGPU 0,65. O valor é multiplicador de distância de LOD, não distância de culling. A intenção é trocar para LODs simples mais cedo, mantendo plantas/árvores em cena.

Os quatro profiles explícitos mantêm `sg.FoliageQuality=1`, incluindo LowGPU. A qualidade de Foliage do Scalability Group controla a densidade de foliage e Landscape Grass quando os tipos habilitam density scaling. Em um Battle Royale, reduzir essa densidade por aparelho pode mudar cobertura e visibilidade durante combate. Por isso este patch reduz custo geométrico via LOD em vez de remover cobertura. Não alteramos `foliage.DensityScale`, `grass.DensityScale` ou `grass.CullDistanceScale` globalmente.

## Auditoria do conteúdo no main

No SHA de main auditado, `Content/` contém seis glTFs que são blockouts de mapa com uma única mesh cada e sem materiais/texturas declarados. Não há `.uasset`, `.umap` ou mesh de folhagem importada no conteúdo Unreal. Assim, nenhum LOD, material de folha, impostor ou configuração de Foliage Type pôde ser editado diretamente; não foi executado cook, shader compile, GPU profile ou medição de FPS. Os mapas/glTFs continuam sendo fontes de blockout, não assets Unreal prontos para shipping.

## Padrão de authoring para quando as meshes forem importadas

Para árvores, arbustos e plantas de primeiro plano, crie LODs baseados em screen size e valide o silhouette pop em câmera de gameplay. Um ponto inicial de produção é LOD0 com detalhe completo; LOD1 e LOD2 reduzindo galhos/folhas pequenas e material work; LOD3 com silhouette econômico. Em distâncias longas, compare o LOD3 com um impostor de hemisfério superior (ou billboards tradicionais se atlas maior compensar). Os valores de screen size e cortes de triângulos devem sair do teste visual e das capturas de GPU, não ser copiados cegamente para todos os biomas.

No material de folhas, prefira **Masked** com uma Opacity Mask econômica a Translucent para folhas recortadas. Reduza áreas transparentes da textura, empacote máscaras e evite camadas/requisições de textura redundantes. Faça o material distante mais simples: remova normal/detail maps que já não alteram pixels, limite World Position Offset a distâncias em que o movimento ainda é percebido e considere desligar sombras dinâmicas de grass decorativo. Preserve resposta visual e silhueta de vegetação que funciona como cover competitivo.

`Use Alpha to Coverage` só deve ser testado no material quando MSAA estiver habilitado, pois depende dele. O renderer mobile atual do projeto está configurado em Mobile Forward, onde MSAA existe; ainda assim, compare MSAA contra o AA de base em aparelho real por custo, bordas e shimmer. Não ative o recurso em toda a biblioteca sem verificar cada material.

Para instâncias, use Foliage Type/ISM/HISM e mantenha culling por frustum/occlusion; não confunda LOD com culling. Evite cortar árvores que servem de cover em match. Grass ornamental sem função de ocultação pode receber densidade/distance overrides específicos do tipo depois que a equipe de gameplay confirmar que não afetam competitividade.

## Validação necessária com conteúdo real

1. Importar meshes e texturas de foliage; atribuir LODs e materiais mobile.
2. No Editor, inspecionar Shader Complexity/Quad Overdraw em cenários com densidade máxima e em contra-luz; usar Mobile Previewer somente como triagem.
3. Em uma cena de teste, travar câmera e comparar Balanced, LowGPU e resolução nativa/FSR. Registrar GPU time, draw calls, triângulos, frametime p50/p95/p99, memória, temperatura e shimmer.
4. Em Android físico (incluindo pelo menos uma GPU Adreno e uma Mali do tier definido), verificar que LODs mantêm silhueta, cobertura visual e leitura de inimigos. Rodar também em iOS após existir build host iOS.
5. Só então ajustar screen-size thresholds, sombras e eventualmente Alpha-to-Coverage por material. Revalidar quando o conteúdo visual mudar.

## Fontes

- [Epic — Scalability Reference](https://dev.epicgames.com/documentation/unreal-engine/scalability-reference-for-unreal-engine): Foliage scalability/density scaling requer que Foliage Types habilitem Enable Density Scaling.
- [Epic — Console Variables Reference](https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-console-variables-reference): descrição de `foliage.LODDistanceScale`, `foliage.DensityScale`, `foliage.CullDistanceScale`, grass density/cull scale.
- [Epic — Mobile Performance Guidelines](https://dev.epicgames.com/documentation/unreal-engine/performance-guidelines-for-mobile-devices-in-unreal-engine): custo de materiais masked, overdraw, shader complexity, Mobile options e alpha-to-coverage/MSAA.
- [Epic — Impostor Baker](https://dev.epicgames.com/documentation/unreal-engine/impostor-baker-plugin-in-unreal-engine): impostors como LOD distante, tipos, contagem de views e tradeoff com billboard masked overdraw.
- [Epic — Material Blend Modes](https://dev.epicgames.com/documentation/unreal-engine/material-blend-modes-in-unreal-engine): Masked e Opacity Mask.
