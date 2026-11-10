# Khaaos Run — edificações, pontes e veículos em mobile

## Resultado aplicado nesta entrega

Foi adicionado um contrato de produção por categoria em `Content/Environment/MOBILE_ENVIRONMENT_ASSET_POLICY.json` e um auditor engine-less em `scripts/build/audit_mobile_environment_assets.py`. O auditor identifica fontes nomeadas para as três categorias, mede OBJ e glTF/GLB quando há dados serializados, separa blockouts agregados e relata explicitamente quando faltam fontes ou assets binários Unreal. `--strict` retorna código 2 quando as fontes de qualquer categoria ou os `.uasset`/`.umap` não existem. O `--self-test` usa fixtures temporárias e não altera o projeto.

O contrato define budgets de triângulos como metas iniciais relativas ao LOD0, não como limites finais aprovados. Os valores precisam ser ajustados ao triângulo pixel, silhueta, material, dispositivo e replay do Khaaos Run. O contrato também proíbe mudar regras de cover, travessia, colisão, hitboxes, física ou replicação ao otimizar renderização.

## Estado constatado no repositório

O checkout auditado contém cinco OBJ de `WorldBlockout` no projeto Unreal com 4–24 vértices e 2–12 faces por arquivo. Há também cinco OBJ gerados de mundo em `mvp_output/assets/worlds/`, cada um com aproximadamente 56–77 objetos nomeados e 752–1.164 vértices/892–1.260 faces no total. Esses últimos são coleções procedurais de primitivas low-poly, não modelos de produção. O auditor identificou 56 objetos arquitetônicos nomeados em três coleções e uma ponte (`void_sanctum_bridge`) em outra. Não há fonte nomeada de veículo. Os glTFs de blockout do projeto não contêm accessors de geometria nem materiais/imagens, e não há `.uasset`/`.umap` binários no projeto. Portanto, **não foram efetivamente criados LODs/HLODs ou materiais de produção no Editor; nenhum cook ou FPS físico foi medido**. As fontes OBJ agregadas existentes permitem um futuro import e ensaio de proxy, mas ainda não comprovam qualidade visual nem comportamento de jogo. O [snapshot detalhado do inventário](MOBILE_ENVIRONMENT_ASSET_AUDIT.json) deixa os bloqueios e métricas por objeto legíveis.

## Estratégia por tipo de asset

### Edificações

Modele como módulos estáticos reutilizáveis (paredes, telhados, escadas, guarnições) e agrupe peças repetidas por ISM/HISM quando compartilharem mesh e material. Separe portas, loot, destrutíveis e cover de gameplay dos clusters estáticos. Autorize HLOD para agrupamentos distantes e não interativos, usando uma camada de mesh merged/simplified com teste de lightmap e material proxy. Em mobile, use variantes de material enxutas e iluminação baked/static. Evite vidro translúcido; mantenha masked somente quando a silhueta exigir. Colisão de movimentação deve ser simples e independente de LOD visual.

### Pontes

Separe tabuleiro, pilares, guarda-corpos e adereços. Os LODs distantes podem remover rebites, cabos e detalhes de suporte pequenos, mas devem manter a silhueta do vão e as bordas que afetam leitura de combate. Preserve tabuleiro, altura livre, largura de passagem, colisão, conectividade do NavMesh e limites de salto/queda entre perfis. A colisão de travessia deve usar volumes simples separados da malha visual. HLOD pode representar apenas cenário distante; pontes jogáveis continuam com fonte interativa e colisão não mescladas.

### Veículos

Veículos estacionados podem ser Static Mesh com LOD e, se não interativos, participar de HLOD. Veículos móveis/articulados usam Skeletal Mesh LODs; preserve rodas, pivôs de suspensão, sockets e peças de gameplay. Em LODs distantes, remova interiores e detalhe não legível, reduza slots e amostras de material e simplifique a silhueta cuidadosamente. Hitboxes, colisão física, sockets, assentos, autoridade do servidor e replicação não podem mudar como efeito colateral de um LOD visual.

O código já tem `UKhaaosSignificanceConfigSubsystem::SetActorAsVehicleInUse`, que eleva a significância de veículos em uso e permite que os estacionados retornem à avaliação por distância (`Source/KhaaosRun/Game/Performance/KhaaosSignificanceManager.cpp`). Esse mecanismo é prioridade de simulação/atualização do ator; ele não substitui LODs de renderização e não foi alterado neste patch.

As frações iniciais LOD1/LOD2/LOD3 e recomendações completas estão no manifesto de política. Não se deve aplicar uma porcentagem automaticamente sem inspeção de silhueta/collision e captura de tela em gameplay.

## Execução e gates

```bash
python3 scripts/build/audit_mobile_environment_assets.py
python3 scripts/build/audit_mobile_environment_assets.py --self-test
python3 scripts/build/audit_mobile_environment_assets.py --strict --output /tmp/khaaos-mobile-environment-audit.json
```

`--strict` deve continuar falhando até existirem fontes reais para as três classes e assets Unreal binários no checkout. Isso é um gate intencional, não falha silenciosa. Com as fontes entregues, importar no UE5.8 Editor, revisar cada LOD e colisão, gerar HLOD apenas para partes estáticas, cozinhar Android ASTC e iOS em runner x64 compatível, e fazer capturas reproduzíveis em Android intermediário com GPU Adreno e Mali e em iOS suportado. Registrar GPU/Render/Game frame time p50/p95/p99, draw calls, triângulos, memória e temperatura.

O objetivo de 60 FPS equivale a orçamento de 16,67 ms por frame. Essa entrega não demonstra que o objetivo foi atingido. A aprovação precisa vir de medições de aparelho real em cenas/câmeras fixas e replay idêntico para todos os perfis.

## Referências

A Epic descreve LOD de Static Mesh como seleção por tamanho na tela e observa que LOD escolhido para colisão complexa não acompanha a troca visual em runtime [1]. World Partition HLOD combina Static Mesh Actors em proxy meshes e oferece camadas de instancing, merged mesh e simplified mesh; essa técnica é voltada a conteúdo estático/distantemente visível, não a substituir objetos interativos [2]. A ferramenta de Skeletal Mesh LOD permite reduzir triângulos/bones e priorizar estruturas por osso/seção para preservar partes importantes [3]. As diretrizes mobile recomendam iluminação estática/lightmaps, cuidado com transparência/overdraw e redução de draw calls e custo de materiais [4].

[1]: https://dev.epicgames.com/documentation/unreal-engine/creating-and-using-lods-in-unreal-engine "Creating and Using LODs"
[2]: https://dev.epicgames.com/documentation/unreal-engine/world-partition---hierarchical-level-of-detail-in-unreal-engine "World Partition Hierarchical Level of Detail"
[3]: https://dev.epicgames.com/documentation/unreal-engine/skeletal-mesh-lods-in-unreal-engine "Skeletal Mesh LODs"
[4]: https://dev.epicgames.com/documentation/unreal-engine/performance-guidelines-for-mobile-devices-in-unreal-engine "Performance Guidelines for Mobile Devices"
