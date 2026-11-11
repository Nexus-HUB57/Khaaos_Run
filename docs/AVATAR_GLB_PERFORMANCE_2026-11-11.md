# Relatório de performance e memória — 10 modelos GLB

Gerado em `2026-11-11T18:21:09.334Z` com Node `v22.23.4` em modo headless, sem WebGL.

## Resumo executivo

- Arquivos avaliados: **10**
- Payload GLB total: **39.07 MiB**
- Memória residente estimada (GLB + bufferViews de geometria/imagem): **77.51 MiB**
- Geometria: **181,396 vértices** e **113,425 triângulos**
- Delta de heap do processo durante o benchmark: **6.27 MiB**

## Métricas por modelo

| Modelo | Tier | Payload | Vértices | Triângulos | Meshes | Materiais | Skins | Joints | Animações | Geom. buffer | Imagens | Residente est. |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `animated-avatar-m-01.glb` | animated | 4.59 MiB | 18,347 | 11,547 | 1 | 1 | 1 | 23 | 5 | 0.98 MiB | 3 | 8.61 MiB |
| `rigged-avatar-m-01.glb` | rigged | 4.03 MiB | 18,317 | 11,547 | 1 | 1 | 1 | 23 | 0 | 0.97 MiB | 3 | 8.05 MiB |
| `rigged-avatar-m-02.glb` | rigged | 4.01 MiB | 16,948 | 10,814 | 1 | 1 | 1 | 23 | 0 | 0.90 MiB | 3 | 8.01 MiB |
| `rigged-avatar-m-04.glb` | rigged | 3.70 MiB | 17,995 | 11,266 | 1 | 1 | 1 | 23 | 0 | 0.96 MiB | 3 | 7.39 MiB |
| `rigged-avatar-f-01.glb` | rigged | 4.19 MiB | 19,362 | 11,564 | 1 | 1 | 1 | 23 | 0 | 1.03 MiB | 3 | 8.37 MiB |
| `rigged-avatar-f-03.glb` | rigged | 4.12 MiB | 18,832 | 11,530 | 1 | 1 | 1 | 23 | 0 | 1.00 MiB | 3 | 8.22 MiB |
| `avatar-m-01.glb` | static | 3.67 MiB | 18,220 | 11,547 | 1 | 1 | 0 | 0 | 0 | 0.62 MiB | 3 | 7.33 MiB |
| `avatar-m-02.glb` | static | 3.68 MiB | 16,944 | 10,814 | 1 | 1 | 0 | 0 | 0 | 0.58 MiB | 3 | 7.35 MiB |
| `avatar-m-04.glb` | static | 3.34 MiB | 17,778 | 11,266 | 1 | 1 | 0 | 0 | 0 | 0.61 MiB | 3 | 6.68 MiB |
| `avatar-f-03.glb` | static | 3.74 MiB | 18,653 | 11,530 | 1 | 1 | 0 | 0 | 0 | 0.64 MiB | 3 | 7.48 MiB |

## LOD e silhueta procedural

O benchmark mediu o pipeline procedural usado pelo runtime como fallback e para atores remotos. No tier `high`, os limiares são: full até 30 m; silhueta a partir de 95 m; oculto a partir de 280 m.

| Nível | Meshes | Triângulos | Redução vs. full |
|---|---:|---:|---:|
| full | 114 | 6,384 | 0.00% |
| proxy | 26 | 1,188 | 81.39% |
| silhouette | 3 | 184 | 97.12% |

### Interpretação

- O proxy reduz aproximadamente **81.39%** dos triângulos do corpo procedural detalhado.
- A silhueta reduz aproximadamente **97.12%**, mantendo 3 meshes e volume visual mínimo.
- O loader atual usa os GLBs como override do herói; o LOD proxy/silhueta medido é o caminho procedural do runtime. Os GLBs não possuem variantes LOD reduzidas automaticamente.
- Para LOD real dos GLBs seria necessário exportar variantes reduzidas por asset ou gerar níveis no pipeline de importação; o relatório não atribui uma economia de triângulos GLB que não foi aplicada.

## Limitações

- estimatedResidentBytes é uma aproximação de payload GLB + bufferViews de geometria/imagens; não é VRAM nem captura de texturas decodificadas pelo navegador
- o benchmark não inicia WebGL; GPU timings e draw calls exigem Browser Performance/DevTools ou Unreal Insights
- o loader atual usa os GLBs como override do herói e mantém LOD procedural para atores; GLB com meshes LOD alternativos requer assets adicionais

## Artefato reproduzível

```bash
node scripts/benchmark_avatar_glb.mjs
```
