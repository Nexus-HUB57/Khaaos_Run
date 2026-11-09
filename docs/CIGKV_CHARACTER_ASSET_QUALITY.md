# CIGKV — Qualidade de assets 3D e modelagem

## Objetivo

Este ciclo melhora a qualidade verificável do conteúdo 3D sem confundir fonte de prova com personagem de produção. O pipeline agora classifica cada fonte em `production_candidate`, `proxy_source` ou `blocked` e publica métricas reprodutíveis para revisão.

## O que é auditado automaticamente

- validade do contêiner GLB/DAE/OBJ;
- quantidade aproximada de vértices, triângulos, meshes e primitivas;
- presença de UVs, normais, materiais e imagens/texturas declaradas;
- presença de skin/controllers, joints e animações quando o formato expõe esses dados;
- existência e proveniência do arquivo indicado pelo manifesto;
- classificação de fontes abaixo do mínimo de produção.

O comando é engine-less:

```bash
python3 scripts/ue5/audit_cigkv_character_assets.py \
  --output artifacts/cigkv-vertical-slice/asset-quality-report.json
```

O relatório atual deve classificar os GLBs de figuras e o DAE Zheers como `proxy_source` ou `blocked` quando aplicável, porque os arquivos existentes são fontes leves de prova e não meshes hero com acabamento final. Isso é intencional: o gate não promove automaticamente um proxy a asset AAA.

## Gates de produção

O mínimo estrutural é 5.000 vértices, 5.000 triângulos, UV, material, imagem/textura e skin para personagens animados. Esses números são apenas um filtro inicial; o aceite visual continua exigindo revisão no Blender e UE5.8 de silhueta a 20 m, identidade facial, deformação, IK de mãos/pés, cabelo, camadas de roupa, sockets de arma, transição de LOD e resposta PBR em dia/noite/interior.

## Próxima produção autorizada

1. Substituir `FIG_kane.glb` por uma fonte hero licenciada ou documentar explicitamente sua função como proxy.
2. Modelar a silhueta humana Kane e a silhueta não-humana Zheers com identidade canônica, roupa em camadas e acessórios separáveis.
3. Criar mapas BaseColor, Normal, ORM, microdetail e máscaras de pele/tecido/cabelo em 2K; manter emissive como detalhe, não como correção de falta de textura.
4. Normalizar no Blender 4.x para 180 cm, origem nos pés, forward `+X`, T-pose e escala aplicada.
5. Exportar FBX, retargetar para Manny/Gwen e validar dedos, twist, IK e ações de combate.
6. Importar no UE5.8, criar Physics Asset/Animation Blueprint/IK Retargeter/Material Instances e executar a matriz Low/Medium/High/Ultra.

## Pacote PBR 2K gerado

O script `scripts/ue5/generate_cigkv_pbr_textures.py` gera quatro conjuntos determinísticos de 2048×2048:

- `human_skin`: BaseColor, Normal, ORM e Detail;
- `zheers_skin`: BaseColor, Normal, ORM e Detail;
- `cloth`: BaseColor, Normal, ORM e Detail;
- `hair`: BaseColor, Normal, ORM e Detail.

Os metadados e hashes ficam em `Unreal/KhaaosRun/Content/Materials/CIGKV/cigkv_pbr_texture_sets.json`. O comando `scripts/ue5/validate_cigkv_pbr_textures.py` verifica 16 arquivos, resolução, modo RGB, hash e associação com as instâncias `MI_CIGKV_*`. A validação atual passou; a flag `engine_import_pending` permanece verdadeira até o Editor UE5.8 importar os PNGs e validar o resultado sob luz de dia, noite e interior.

## Limitações honestas

O auditor não mede topologia visual, qualidade de deformação, clipping, foot sliding, shader response, Lumen, Nanite, draw calls ou GPU. Esses critérios permanecem bloqueados até um runner com Blender 4.x e Unreal Engine 5.8 licenciado. Nenhum `.uasset`, `.umap` ou screenshot é criado pelo auditor.
