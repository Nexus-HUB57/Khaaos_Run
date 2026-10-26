# Khaaos Run — Pipeline visual oficial

## Slice em produção

**Mundo:** CIGKV / Khaaos Ville  
**Experiência alvo:** battle royale em primeira pessoa, visual live action realista, leitura de combate inspirada no ritmo de Free Fire e Fortnite sem copiar assets, personagens ou marcas.  
**Fonte de verdade do mapa:** `Unreal/KhaaosRun/Content/Maps/CIGKV/CIGKV_level_data.json`  
**Fonte de verdade da simulação navegável atual:** `game-runtime/src/game3d/`

## Estado atual

- O runtime Three.js permanece o protótipo navegável e determinístico para validar combate, loot, Ring, bots, input e rede.
- A câmera padrão do protótipo agora é **FPS**; `?view=tps` continua disponível para comparação e regressão visual.
- O protótipo usa materiais e geometrias procedurais. Isso é deliberado: nenhuma malha genérica é apresentada como asset final de produção.
- O Unreal é o destino do look final: iluminação, materiais PBR, Lumen/Nanite quando disponíveis, animação, cinematics e streaming devem ser validados no editor/build alvo.

## Contrato do primeiro mundo

1. Manter o mapa em unidades UE (`cm`, Z-up) e preservar os três setores canônicos: `ArmoryHub`, `ProvingGrounds` e `Park`.
2. Produzir primeiro um **vertical slice** do corredor ArmoryHub → ProvingGrounds: spawn, cobertura, iluminação, um landmark e um encontro de combate.
3. Separar `Game`, `GameContent` e `Cinematics` para que assets de render não contaminem a simulação determinística.
4. Medir frame time, memória de textura, draw calls, visibilidade e streaming antes de ampliar a densidade de vegetação, destruição ou interiores.
5. Aprovar qualquer asset gerado por ferramenta externa apenas após revisão de licença, escala, UVs, colisão, LODs, rig e leitura em primeira pessoa.

## Orçamento visual inicial

- PC alvo: 60 FPS como referência; fallback escalável para hardware intermediário.
- Primeira pessoa: arma e mãos devem permanecer legíveis em FOV de combate e ADS, sem bloquear o centro da mira.
- Iluminação: exposição e temperatura calibradas por setor; evitar bloom e grão como substitutos de material, geometria ou iluminação corretos.
- Realismo: usar referências fotográficas apenas como direção; não transformar placeholders procedurais em promessa de qualidade final.

## Próximas fatias

1. Blockout jogável do corredor CIGKV com câmera FPS e colisão UE.
2. Material master de concreto/metal/vegetação com instâncias por setor.
3. Pass de iluminação dia nublado + variação de alerta do Ring.
4. Kit de cobertura modular e um landmark do ProvingGrounds.
5. Captura comparativa: editor UE, build UE e protótipo web, com métricas anexadas ao checkpoint.

## Perfil Unreal versionado

O primeiro perfil de materiais e iluminação está em `Unreal/KhaaosRun/Content/Maps/CIGKV/CIGKV_visual_profile.json`. Ele é um contrato de importação para o Editor UE5.8, não um substituto de `.uasset` ou `.umap`: o sandbox não contém UnrealEditor, UBT ou RunUAT e não consegue cozinhar shaders/mapas.

O baseline de renderer está em `Unreal/KhaaosRun/Config/DefaultEngine.ini`. Antes de aprovar o slice, abrir o projeto no Editor, criar os assets nomeados no perfil, validar exposição e sombras em hardware alvo e executar os gates de performance. Não considerar o mundo visualmente pronto apenas por causa dos valores de INI.
