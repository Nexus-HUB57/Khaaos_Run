# Otimização global do roster de avatares

**Status:** pipeline de otimização preparado; geração de LODs e compressão de entrega dependem do editor/toolchain de produção.

## Diagnóstico do estado atual

O inventário do `origin/main` encontrou 10 GLBs de gameplay em `game-runtime/public/assets/avatars/`. Seis são riggados e quatro são estáticos; um dos riggados contém cinco animações embutidas. Os arquivos variam de aproximadamente 3,5 MB a 4,8 MB e de 10,8k a 11,6k triângulos. Os estáticos não devem ser promovidos diretamente a personagens jogáveis sem skinning, retarget e validação de armas.

Os 16 retratos WebP realistas estão dentro do budget atual de 768 px; permanecem apropriados para lobby, perfil e seleção. Eles não substituem o mesh 3D de gameplay.

Os seis `client/public/figures/glb/FIG_*.glb` continuam sendo figuras de perfil com 280 vértices, sem UV, sem skinning e sem texturas. Permanecem intocados porque ainda não existe mapeamento canônico seguro de cada figura para os GLBs realistas.

## Budgets adotados

| Nível | Screen Size | Meta de triângulos | Textura máxima |
|---|---:|---:|---:|
| LOD0 | 0,55 | 18k–20k | 2K |
| LOD1 | 0,25 | ~11k | 1K |
| LOD2 | 0,10 | ~6k | 512 |
| LOD3 | 0,03 | ~2,5k | 256 |

As transições usam hysteresis `0,02 / 0,02 / 0,015 / 0,01` e dither quando suportado pelo material. A silhueta de cabeça, cabelo, ombros, mãos, botas e sockets de arma deve ser preservada em todos os níveis.

## Artefatos desta etapa

- `Unreal/KhaaosRun/Content/Characters/avatar_optimization_profile.json`: contrato de budgets e aceite.
- `scripts/ue5/audit_avatar_roster_optimization.py`: auditoria engine-less, sem reescrever binários.
- `scripts/ue5/configure_avatar_roster_lods.py`: configuração batch dos Screen Sizes no UE5.8, dry-run por padrão.
- `artifacts/avatar-optimization/avatar-roster-optimization-report.json`: resultado do inventário atual.

## Próximas ações no toolchain de produção

1. Mapear cada GLB para um slot canônico antes de promovê-lo para o roster.
2. Importar os riggados no UE5.8 e criar IK Rigs/IK Retargeters Manny/Gwen.
3. Gerar LOD0–LOD3 no Skeletal Mesh Editor, usando os budgets acima.
4. Habilitar streaming de textura e consolidar slots: 2–4 no LOD0, 2–3 no LOD1, 1–2 no LOD2 e 1 no LOD3.
5. Aplicar KTX2/meshopt apenas quando a ferramenta de compressão estiver disponível; registrar hashes de cada saída.
6. Executar matriz Low/Medium/High/Ultra com screenshots, draw calls, VRAM, GPU p95 e revisão de clipping/LOD pop.

## Limitações

Esta etapa não afirma que os avatares já foram comprimidos ou que os LODs já foram gerados. O ambiente atual não possui Blender/UE5 editor e ferramentas de compressão glTF disponíveis para produzir esses binários com segurança. O pipeline falha fechado para arquivos inválidos e não promove candidatos não mapeados automaticamente.
