# Protocolos de desenvolvimento de avatares — Khaaos Run

**Escopo do PR:** vertical slice CIGKV com Khael Vance (`CHR_Zheers_Male_Vanguard`)
**Status:** pacote de conteúdo e automação preparado; aceite final UE5.8 pendente de runner licenciado com GPU.

## 1. Identidade e proveniência

Todo avatar deve possuir uma chave canônica (`asset_id`), slot de gameplay, espécie, sexo, altura, skeleton, prompt/proveniência, hash SHA-256 e status de licença. Assets gerados por IA ficam classificados como `unverified_internal_prototype` até decisão jurídica/comercial explícita; não devem ser tratados como liberados para uso comercial.

O primeiro asset deste protocolo é Khael Vance, operador masculino do CIGKV: 182 cm, T-pose, mãos vazias, aparência afro-latina/parda brasileira, roupa tática original e detalhes de identidade Khaaos Run. Armas e props permanecem separados para attachment por socket.

## 2. Geração econômica do asset hero

A primeira passagem deve validar silhueta, identidade, UVs, materiais principais e prontidão para rig. O perfil econômico usado no vertical slice é:

- `text/P1` ou equivalente econômico;
- 12k–20k faces/triângulos de LOD0;
- texturas PBR em qualidade standard;
- zonas essenciais de pele, tecido, metal e cabelo;
- sem groom, microdetalhe extremo, arma incorporada ou props separados.

A auditoria estrutural exige pelo menos 5.000 vértices/triângulos, UV, material e textura. Isso é um gate inicial, não substitui revisão visual de silhueta, deformação, clipping ou resposta PBR.

## 3. Rig e retarget

O rig base é atribuído por sexo, conforme o ADR aceito:

- masculino → `SK_Manny`;
- feminino → `SK_Gwen`.

Khael usa um rig Mixamo bípede de 23 joints como origem. O fluxo obrigatório é Mixamo → IK Rig de origem → IK Rig `SK_Manny` → `RTG_Mixamo_To_SK_Manny` → Animation Sequences retargetadas → Animation Blueprint do projeto.

Requisitos do retarget:

- T-pose de origem e destino;
- root motion preservado no root;
- tradução limitada ao root;
- hand IK e foot IK;
- calibração de pelvis;
- fingers/twist do target preservados quando disponíveis;
- rejeição por foot sliding, weapon clipping, root drift, escala não uniforme, pelvis pop ou shoulder rollover.

O JSON em `Build/CIGKVVerticalSlice/Retarget/RTG_Mixamo_To_SK_Manny.json` é a receita versionada. A criação dos `.uasset` IK Rig/IK Retargeter requer Unreal Engine 5.8.

## 4. LOD e transições

O avatar deve usar quatro LODs com redução progressiva e silhueta protegida:

| LOD | Screen Size inicial | Meta de triângulos |
|---|---:|---:|
| LOD0 | 0.55 | 18k–20k |
| LOD1 | 0.25 | ~11k |
| LOD2 | 0.10 | ~6k |
| LOD3 | 0.03 | ~2,5k |

As transições usam hysteresis e dither quando suportados pelo build do Unreal/material. O script `scripts/ue5/configure_khael_lods.py` é idempotente, executa `dry-run` por padrão e só salva com `--apply`.

Preservar em todos os níveis a leitura da cabeça/cabelo, ombros, mãos, botas, colete, joelheiras e pontos de attachment. Costuras, fivelas, bolsos pequenos e microdetalhes devem migrar para normal/máscaras antes de serem removidos da geometria.

## 5. Materiais e texturas

O material master deve consolidar as zonas por instância, evitando um material slot por acessório:

- LOD0: 2–4 material slots;
- LOD1: 2–3;
- LOD2: 1–2;
- LOD3: 1.

O conjunto PBR recomendado é Base Color, Normal e ORM (occlusion/roughness/metallic). O herói pode usar 2K no LOD0, mas deve habilitar streaming e reduzir para 1K/512/256 conforme a distância e a plataforma. Em Medium, remover microdetail e simplificar subsurface/clear coat; em Low, manter apenas Base Color e os canais essenciais.

Emissive laranja/roxo é detalhe de identidade, nunca substituto de Base Color, normal ou roughness. Cabelo deve evitar overdraw excessivo e não usar groom na primeira passagem econômica.

## 6. Aceite no Unreal 5.8

O aceite final exige runner UE5.8 licenciado com GPU e deve verificar:

- importação do Skeletal Mesh e Physics Asset;
- IK Retargeter e Animation Blueprint;
- sprint, slide, crouch, jump, reload, ADS, fire, hit-react, DBNO e death;
- ausência de foot sliding, clipping e root drift;
- transições LOD sem popping perceptível;
- materiais em Low/Medium/High/Ultra;
- screenshots de terceira pessoa e ADS;
- Game Thread, Render Thread, GPU, draw calls, VRAM e shader/PSO hitch;
- alvo inicial de 60 FPS em Medium, com orçamento de 16,67 ms.

Até esse runner existir, o estado correto é `retarget_package_prepared_ue5_editor_pending`, não `production_candidate`.

## Artefatos deste protocolo

- `Build/CIGKVVerticalSlice/Source/CIGKV_HUMAN_HERO_M01.glb`
- `Build/CIGKVVerticalSlice/Source/CIGKV_HUMAN_HERO_M01_RIGGED.glb`
- `Build/CIGKVVerticalSlice/Retarget/RTG_Mixamo_To_SK_Manny.json`
- `artifacts/cigkv-vertical-slice/khael-vance-provenance.json`
- `artifacts/cigkv-vertical-slice/asset-quality-report-pre-model.json`
- `scripts/ue5/configure_khael_lods.py`
