# Mundos — referências canônicas e pipeline visual

## Fonte de verdade

O [README raiz](../../../../README.md) é a fonte canônica de identidade narrativa e distribuição de setores. Documentação técnica adicional só complementa o README quando não diverge dele. `WCFG`, `INI`, C++ e intake JSON conflitantes não autorizam redefinir biomas, landmarks ou frações. Os manifests nesta pasta declaram referências visuais; não são tabelas de gameplay nem substituem a validação técnica do time.

O validador lê as tabelas Setor/Fração diretamente do README e confere nomes, frações e status visual-only. Se o README mudar, o gate falha até que os contratos e os conceitos compatíveis sejam revisados.

## Contratos visuais

- **CIGKV:** [manifest](../../Content/Maps/CIGKV/ReadmeVisualSlice/scene_manifest.json) — Pátio de Armamento `1/8`, Setor de Testes `3/8`, Parque Abandonado `4/8`, com 15 ZEX dispersas. O slice técnico inicial cobre somente Armory Hub → Proving Grounds.
- **Priadus (W2/C2):** [manifest](../../Content/Maps/Priadus/ReadmeVisualSlice/scene_manifest.json) — Área Pantanosa `2/8`, Bosque `3/8`, Área de Caça + Templo Antigo `3/8`, com matadouro de extração sem fração.
- **Ckesalth (W3/C3):** [manifest](../../Content/Maps/Ckesalth/ReadmeVisualSlice/scene_manifest.json) — Resort Abandonado `3/8`, Vilarejo dos Beduínos `2/8`, Refinaria `3/8`, com extração sem fração.
- **Arukheea (W4/C4):** [manifest](../../Content/Maps/Arukheea/ReadmeVisualSlice/scene_manifest.json) — Bosque dos Perdidos `4/8`, Prisão do Sol da Noite `3/8`, Fábrica / Cemitério das Baleias `1/8`, com heliporto de extração sem fração.

Os manifests explicitam ameaças canônicas, exclusões de fidelidade e dados técnicos ainda não reconciliados. Unidades `1000 × 1000` são normalizadas para diagramas e nunca devem ser importadas como bounds jogáveis.

## Concept art

Cada imagem é um conceito panorâmico independente. Ela comunica atmosfera e macrocomposição, mas não é um render de Unreal, não garante a presença visual de cada detalhe e não substitui a lista canônica do manifest.

- CIGKV: [T_CIGKV_World_Concept.png](ConceptArt/T_CIGKV_World_Concept.png)
- Priadus: [T_Priadus_World_Concept.png](ConceptArt/T_Priadus_World_Concept.png)
- Ckesalth: [T_Ckesalth_World_Concept.png](ConceptArt/T_Ckesalth_World_Concept.png)
- Arukheea: [T_Arukheea_World_Concept.png](ConceptArt/T_Arukheea_World_Concept.png)

## Slice vertical — CIGKV: Armory Hub → Proving Grounds

O gerador [`scripts/build/generate_cigkv_vertical_slice.py`](../../../../scripts/build/generate_cigkv_vertical_slice.py) lê o manifest CIGKV, mantém a razão de fração `1:3` entre os dois setores selecionados e produz um blockout fonte. Dez edifícios (dentro da faixa documental de 8–12), a distribuição de pisos, três túneis-proxy, oito racks e quatro estações são escolhas ilustrativas de composição; não definem spawn, loot, navegação, colisão, destruição ou escala real. O Parque Abandonado (`4/8`) fica fora deste slice.

- [Blockout GLB PBR](../../Content/Maps/CIGKV/ReadmeVisualSlice/SM_CIGKV_ArmoryToProvingGrounds_Blockout.glb)
- [Blockout OBJ](../../Content/Maps/CIGKV/ReadmeVisualSlice/SM_CIGKV_ArmoryToProvingGrounds_Blockout.obj) e [materiais MTL](../../Content/Maps/CIGKV/ReadmeVisualSlice/M_CIGKV_ArmoryToProvingGrounds_Blockout.mtl)
- [Layout top-down SVG](../../Content/Maps/CIGKV/ReadmeVisualSlice/T_CIGKV_ArmoryToProvingGrounds_TopDown.svg)
- [Relatório de geração](../../Content/Maps/CIGKV/ReadmeVisualSlice/CIGKV_ArmoryToProvingGrounds_Blockout.json)

Os fatores PBR são placeholders de material. Nenhuma textura licenciada foi embutida. Assets finais de produção precisam de materiais de alta resolução aprovados, composição de luz calibrada e validação visual no jogo; não se deve confundir este blockout com o padrão final de detalhe realista.

## Comandos

Na raiz do repositório:

```bash
npm run build:cigkv:vertical-slice
npm run verify:world-manifests
npm run verify:cigkv:vertical-slice
npm run verify:cigkv:ue-import
npm run verify:all
```

`build:cigkv:vertical-slice` recria deterministicamente GLB, OBJ/MTL, SVG e relatório. `verify:cigkv:vertical-slice` gera cópias temporárias e compara os arquivos byte a byte, sem sobrescrever os assets. `verify:cigkv:ue-import` valida o GLB e testa o fluxo do importador com uma API Unreal simulada; não equivale a uma importação real no Editor. Os três gates de mundos estão incluídos em `verify:all`.

Para os ingressos **Zu**, [ZuIngress_Status.md](ZuIngress_Status.md) registra o contrato README por mundo, cobertura automática das 15 variantes e os gaps que ainda impedem declarar embarque/chegada ao Ring como fluxo end-to-end. O teste portátil roda com `npm run test:ue5:logic`; ele valida regras puras, não substitui o Automation Test ou playtest no Unreal Editor.

## Importação e aceite no Unreal

O [guia Interchange da Epic](https://dev.epicgames.com/documentation/unreal-engine/importing-assets-using-interchange-in-unreal-engine) descreve a importação pelo Content Browser e o painel de pipeline. A [referência de importação](https://dev.epicgames.com/documentation/unreal-engine/interchange-import-reference-in-unreal-engine) confirma GLB e as opções `Offset Rotation`, `Offset Uniform Scale`, `Import Static Meshes`, `Import Materials` e `Collision`.

O GLB tem uma malha com cinco primitivas de material. Seu nó raiz converte a orientação Z-up interna para o Y-up do glTF 2.0. Porém, os valores normalizados `1000 × 500` são serializados segundo a convenção glTF de metros, não como dimensões de jogo aprovadas. Portanto, o import pode representar aproximadamente `1000 m × 500 m`; valide orientação e escala no preview/editor e não use esses limites em gameplay. A conversão de eixos e unidades está registrada no GLB e checada pelo gerador, conforme a [especificação glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

Para automatizar o import no projeto correto, execute `python3 scripts/import_cigkv_blockout_in_unreal.py --dry-run` fora do Editor. O preflight deve retornar `PASS`. Depois, abra `Unreal/KhaaosRun/KhaaosRun.uproject` no Unreal Editor 5.8, habilite o plugin **Python Editor Script Plugin** se necessário e execute `scripts/import_cigkv_blockout_in_unreal.py` no ambiente Python do Editor. O script usa `AssetImportTask`/`AssetTools`, importa para `/Game/Maps/CIGKV/ReadmeVisualSlice/Imported`, salva o asset, verifica uma Static Mesh e cinco slots de material, e **recusa sobrescrever** um asset existente com o mesmo caminho.

Após o import, abra o Static Mesh Editor, confira a orientação, a escala e os cinco materiais `M_CIGKV_*`; compare com o [layout top-down](../../Content/Maps/CIGKV/ReadmeVisualSlice/T_CIGKV_ArmoryToProvingGrounds_TopDown.svg). Os fatores PBR são placeholders e não há texturas. Mantenha colisão desligada para este visual blockout; não habilite gameplay, Nanite, navegação ou destruição como consequência automática da importação. Texturas licenciadas `T_`, materiais finais `M_`/`MI_`, colisão e bounds jogáveis dependem de decisão e aceite do time.

Este sandbox não tem Unreal Editor 5.8; portanto, importação `.uasset`, criação/cook de `.umap`, compilação de módulo UE, playtest e evidência de performance permanecem pendentes. Nenhuma dessas etapas é marcada como concluída por esta pipeline-fonte.
