# CIGKV — Plano de testes visuais e iluminação UE5.8

## Objetivo

Validar os materiais PBR 2K em uma matriz controlada antes de expandir o roster. O aceite não é baseado apenas em parâmetros declarados: exige 24 capturas reais do Editor UE5.8, quatro presets, três condições de iluminação e duas câmeras tagged.

## Matriz executada pelo runner

| Dimensão | Casos |
|---|---|
| Qualidade | Low, Medium, High, Ultra |
| Iluminação | `day_neutral`, `golden_hour`, `night_interior` |
| Vista | `third_person_combat`, `first_person_ads` |
| Total | 4 × 3 × 2 = 24 PNGs em 1920×1080 |

A matriz está versionada em `Unreal/KhaaosRun/Content/Characters/CIGKV_VerticalSlice/CIGKV_visual_lighting_test_matrix.json`. O mapa deve fornecer câmeras com as tags `CIGKV_Camera_ThirdPerson` e `CIGKV_Camera_FirstPersonADS`; o script falha se uma câmera estiver ausente, evitando capturas falsas da viewport.

## Checks visuais

### Pele e SSS

- `SubsurfaceProfile` ativo no master;
- Kane com strength 0,32 e radius 1,15 cm;
- Zheers com strength 0,48 e radius 1,45 cm;
- rosto e orelhas devem manter volume em luz lateral;
- rejeitar brilho plástico, halo em sombra, bleeding vermelho excessivo e emissive usado para esconder falta de detalhe.

### Cabelo e anisotropia

- anisotropia Kane 0,72 e Zheers 0,64;
- fluxo controlado pelo canal R do mapa Detail;
- clear coat limitado a 0,08–0,12;
- rejeitar highlight plano, direção de fluxo invertida e aliasing especular.

### Tecido e microdetalhe

- ORM preserva roughness sem metalização acidental;
- DetailNormalStrength inicial 0,85;
- roughness variation 0,13;
- validar leitura em 20 m e em ADS, sem moiré ou shimmering.

### Iluminação e performance

- Lumen e Virtual Shadow Maps ativos em Medium+;
- Low deve permanecer legível sem depender de emissive;
- Medium: GPU p95 ≤ 16,67 ms;
- rejeitar VSM acne, flicker Lumen, ghosting, banding, pop de LOD e clipping de arma;
- registrar Game Thread, Render Thread, GPU, VRAM, draw calls e shader/PSO hitch.

## Execução

No runner licenciado:

```bash
python3 scripts/ue5/validate_cigkv_pbr_textures.py
# o workflow executa o Editor:
UnrealEditor-Cmd KhaaosRun.uproject \
  -unattended -nop4 -nosplash -nullrhi=false \
  -run=pythonscript -script=scripts/ue5_editor/cigkv_vertical_slice.py -log
```

O aceite exige `artifacts/cigkv-vertical-slice/engine-report.json` e pelo menos 24 PNGs. O sandbox atual só consegue validar JSON, hashes, dimensões e o contrato do script; não deve gerar um `engine-report.json` falso.

## Roadmap após a validação dos materiais

1. Provisionar runner UE5.8 com GPU e Blender 4.x.
2. Normalizar Kane/Zheers, importar as 16 texturas, criar instâncias e validar compressão/mipmaps.
3. Criar/validar Subsurface Profiles, Physics Assets, IK Retargeters e câmeras tagged.
4. Executar as 24 capturas e o replay de performance de 10 minutos.
5. Corrigir SSS, anisotropia, VSM, Lumen, LOD e clipping conforme evidência.
6. Repetir a matriz e promover somente materiais/personagens sem rejeições.
7. Expandir o mesmo contrato para as demais espécies e cinco mundos.
