# Revisão End to End — Desenvolvimento dos Personagens + Assets 3D (GLB) recebidos

**Data:** 2026-11-02 · **Escopo:** pipeline canônico de personagens (lotes 1–3) + auditoria técnica dos 10 GLBs enviados (4 estáticos, 5 riggados, 1 animado)
**Veredito em uma linha:** o pipeline canônico está FIEL ao README e 100% coberto por testes; os assets 3D enviados têm qualidade técnica boa (PBR 2048², ~11.5k tris, skinning real, 5 animações úteis) mas estão **bloqueados para integração** por 3 gaps duros (identidade não ancorada ao cânon, rig Mixamo ≠ SK_Manny/SK_Gwen, escala 1.0 m ≠ alturas canônicas) e 2 gaps processuais (mapeamento asset→slot ambíguo, licença IA não decidida).

---

## 1. Panorama do pipeline canônico (estado do main 57d01f6)

| Camada | Artefato | Status | Contrato de teste |
| --- | --- | --- | --- |
| Cânon | README §Personagens (Lote 1 espécies/SPC · Lote 2 proofs · Lote 3 viewer/lyra) | FIEL ✅ 53/0 (F46, snapshot 1621 ms) | ci.yml + ue5-preflight.yml (4 barreiras) |
| Catálogo | `shared/character-studio.ts` — 16 canônicos + TALON, prompts UE5, `SK_Manny\|SK_Gwen` por sexo | ✅ | `character-studio.test.ts` (paridade byte-identical dos SVGs, skeleton por sexo) |
| Avatares 2D | 17 SVGs (`Content/Avatars` + `client/public/avatars`) | ✅ | paridade byte-identical testada |
| Persistência | migration 0012 `selected_operative_id` · `POST /api/player/operative` · relay LOBBY-only | ✅ | routes-ownership 44/44 · node-ws-gateway 11/11 · storage.postgres · Playwright |
| Proofs | 24 dossiês (11 M + 13 F), `ref_code {SPECIES}-{SEQ}`, `species_coverage` 12/12 | ✅ | `proofs-matrix.test.ts` (matriz fechada, manifest↔arquivos, stats↔CSV) |
| ADR esqueleto | `docs/ADR-ESQUELETO-RIG-POR-SEXO.md` + `lyra_mapping.json` (`skeleton_rigs` SK_Manny←SKM_Manny, SK_Gwen←SKM_Quinn, 4 LODs) | ✅ (executado lote 3) | `lyra-mapping.test.ts` (paridade com `KhaaosSpeciesMeshRegistry.cpp`) |
| UE5 runtime | 24 actors `KhaaosOp*.cpp` · `KhaaosSpeciesMeshRegistry.cpp` (ABP_<Espécie>_<Tema> + PA_<Espécie>) | ✅ código | gate C++ (300 headers / implementações pareadas) |
| Figures 3D | 6 GLB manequins (~18 KB) + viewer 3D sem dependências no perfil | ✅ servido no staging (`/figures/glb/FIG_kane.glb` 200) | `figures-glb.test.ts` + `figures-glb-viewer.test.ts` |
| Editor check | import UE5.8 dos manifests | ⏳ **bloqueado por 0 self-hosted runners** | — |

**Conclusão da parte canônica:** nenhum buraco executável restante; o elo fraco é o bloqueio humano do runner UE5.

---

## 2. Inventário técnico dos 10 GLBs enviados

Pipeline de origem detectado: **Tripo (tripo3d.ai) → rig Tripo (esqueleto Mixamo) → animação via Blender 4.5 (Khronos exporter)**. Um material PBR por modelo, texturas 2048×2048 (Color JPEG ~0.9–1.0 MB · ORM/metallicRoughness JPEG ~0.8–0.96 MB · NormalGL PNG ~1.1–1.5 MB), mesh único, `doubleSided`.

| Arquivo | Bytes | Tris | Verts | Skin | Anims | Pose | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- |
| avatar-m-01 | 3.846.060 | 11.547 | 18.220 | — | — | **A-pose** | material UUID `27c2d799` (base da família m-01) |
| avatar-m-02 | 3.856.860 | 10.814 | 16.944 | — | — | T-pose | colete + coldre de coxa |
| avatar-m-04 | 3.505.652 | 11.266 | 17.778 | — | — | T-pose | loiro, capuz/cowl navy, peitoral |
| avatar-f-03 | 3.924.864 | 11.530 | 18.653 | — | — | T-pose | ruiva ondulada, top claro + peitoral tan |
| rigged-avatar-m-01 | 4.223.300 | 11.547 | 18.317 | 23 joints | — | A-pose | mesmo mesh base do avatar-m-01 |
| rigged-avatar-m-02 | 4.203.784 | 10.814 | 16.948 | 23 joints | — | T-pose | |
| rigged-avatar-m-04 | 3.880.180 | 11.266 | 17.995 | 23 joints | — | T-pose | |
| rigged-avatar-f-01 | 4.392.504 | 11.564 | 19.362 | 23 joints | — | T-pose | rabo de cavalo alto (peso de cabelo a validar) |
| rigged-avatar-f-03 | 4.315.076 | 11.530 | 18.832 | 23 joints | — | T-pose | |
| animated-avatar-m-01 | 4.815.596 | 11.547 | 18.347 | 23 joints | **5** | A-pose | export Blender 4.5 |

**Animações do `animated-avatar-m-01`** (69 canais cada): `idle` 15,37 s · `run` 1,27 s · `shoot` 9,07 s · `standing_relax` 17,6 s · `walk` 2,37 s.

**Esqueleto (23 joints, Mixamo):** Root · Hips → Spine → Spine1 → Spine2 → Neck → Head · Ombro→Braço→Antebraço→Mão (×2) · UpLeg→Leg→Foot→ToeBase (×2). **Sem dedos, sem twist bones, sem auxiliares.**

Atributos por primitiva: estáticos `POSITION, NORMAL, TEXCOORD_0`; riggados adicionam `JOINTS_0, WEIGHTS_0`; índices uint16; material `pbrMetallicRoughness` (baseColor + metallicRoughness + normalTexture) — compatível com import UE5 (validar packing do ORM em canal no editor).

Previews renderizados (frente/3-4/perfil + 4 texturizados): `download/character-review/*.png`.

---

## 3. Achados positivos

1. **Budget saudável**: 10,8–11,6k tris / 17–19k verts por personagem — encaixa em LOD0 de shooter; topologia AI watertight consistente.
2. **PBR completo e pronto para engine**: 3 mapas 2048² por modelo, incluindo metallicRoughness (ORM) e NormalGL — sem retrabalho de shading.
3. **Skinning real**: JOINTS_0/WEIGHTS_0 presentes nos riggados; o mesmo mesh-base migra estático → riggado → animado preservando material UUID (pipeline reprodutível).
4. **Set de animações alinhado ao jogo**: walk/run alimentam a locomoção stride-locked (F32); idle/standing_relax servem lobby/dojo; shoot cobre combate. Cadência de run (1,27 s) coerente.
5. **Identidades visuais distintas e legíveis** no estilo Free Fire (cabelo, roupa, paleta) entre os 5 rostos enviados.

## 4. Gaps que bloqueiam a integração

| # | Gap | Evidência | Impacto |
| --- | --- | --- | --- |
| G1 | **Identidade não ancorada ao cânon** | asset m-04 é lojo de pele clara; canônico M-04 é Tariq Bakari (ébano `#3c2009`, cabeça raspada) e o proof M-04/ZHR-02 pede "Mogno muito escuro `#4A2C17`". asset f-03 ruiva ondulada vs Mei-Ling Zhou (bob preto liso `#030712`); proof F-01/SKW-01 pede afro com pontas azuis `#00BFFF` vs asset de rabo de cavalo liso. m-01 pele clara vs Khael Vance/ZHR-01 `#8B5E3C`/`#8d5524` com afro fade cobre. Zero traços de espécie (sem penas Skeetw, sem escamas Onith) | Rejeitável na auditoria de fidelidade de personagem; quebra a promessa README/proofs de dossiês auditáveis |
| G2 | **Numeração ambígua** | dois sistemas coexistem: studio M-01..M-08+TALON(M-09) e proofs M-01..M-11/F-01..F-13; o nome `avatar-m-01` não indica a qual slot/espécie corresponde | Sem registro de mapeamento, nenhum teste pode amarrar asset↔cânon |
| G3 | **Rig Mixamo ≠ ADR** | 23 joints Mixamo vs política "SK_Manny (SKM_Manny) / SK_Gwen (SKM_Quinn), 4 LODs" (ADR + lyra_mapping + registry .cpp com ABP/PA por espécie); sem dedos (mãos em arma) e sem twist | Retarget obrigatório (IK Retargeter Mixamo→Manny/Quinn) ou re-rig; ABP_<Espécie> e PA_<Espécie> inexistem para essas malhas |
| G4 | **Escala viola alturas canônicas** | todos os bboxes ~0,998–1,0 m; cânon: Huran 168, Skeetw 170, Khael 178, Zheers 180, Venex 185, Onith 190 cm | Sem diferenciação por espécie/sexo; colisão de gameplay (hitbox) e quebra de proporção vs SPC |
| G5 | **Bind pose inconsistente** | família m-01 em A-pose; demais em T-pose | Retarget uniforme exige pose única; risco de offsets nos membros |
| G6 | **Parser do viewer não suporta esses GLBs** | `client/src/lib/glb.ts` cobre por design só POSITION/NORMAL/COLOR_0/uint32/1 primitive; assets têm TEXCOORD_0, JOINTS_0/WEIGHTS_0, uint16 e texturas | Preview no perfil falharia com erro explícito de escopo; upgrade do parser necessário |
| G7 | **Peso de entrega** | 3,5–4,8 MB/arquivo; 24 slots ≈ 90–115 MB | Inviável no bundle client sem KTX2/meshopt/Draco ou CDN; GLB full-quality é asset de engine |
| G8 | **Procedência/licença IA** | generator `tripo3d.ai` em todos os 10 | Decisão humana/org de direitos comerciais antes de virar asset de produção; registrar proveniência (generator/seed/prompt) no manifest |

## 5. Recomendações (ordem executável)

1. **R1 — Registro de mapeamento (imediato, sem arte):** estender `proofs_manifest.json` com seção `assets_3d` (slot canônico, sha256, rig status, generator, escala); definir oficialmente que a numeração dos proofs (M-01..M-11/F-01..F-13) é a chave de 3D. Teste: sha256 dos arquivos ↔ manifest.
2. **R2 — Ancoragem de identidade:** re-gerar cada rosto com os `appearancePromptEn` do studio/proofs como input do gerador OU re-texturizar o Color map por fenótipo (pele `skinToneHex`, penteado, traços de espécie). Validação automática: swatch médio do rosto vs `skinToneHex` + checklist de traços (penas/escamas/morphs).
3. **R3 — Normalização de escala e pose:** script que aplica altura canônica por espécie (168–190 cm), uniformiza T-pose, ground y=0 (já ok) e forward +X (convenção UE5).
4. **R4 — Ponte de rig:** retarget Mixamo→SK_Manny/SK_Gwen (Blender/IK Retargeter) com validação por contagem de joints do Manny, bake das 5 anims e publicação em `Content/Characters/<Espécie>/Mesh/` (nomes do registry: `ABP_<Espécie>_<Tema>`, `PA_<Espécie>`).
5. **R5 — Viewer:** estender o parser (TEXCOORD + sampler de textura) mantendo a regra zero-dependências; previews texturizados no perfil.
6. **R6 — Compressão/entrega:** KTX2 + meshopt antes de servir do client; GLB full-quality permanece pipeline UE5 (Content), não bundle web.
7. **R7 — Licença e proveniência:** decisão humana sobre uso comercial de arte IA; registrar generator/seed/prompt por asset no manifest.

## 6. Veredito

- **Pipeline canônico (cânon → catálogo → SVG → persistência → viewer → UE5): FIEL ✅** — lotes 1–3 fechados com testes e staging servindo os GLBs das figuras.
- **Assets 3D enviados: QUALIDADE TÉCNICA BOA · INTEGRAÇÃO BLOQUEADA** — incorporar só após R1–R3 (bloqueios duros) e R7 (decisão humana); R4–R6 são o caminho de chegada à engine.
- O bloqueio estrutural do projeto permanece humano: **0 self-hosted runners** impede o editor check de import dos manifests — os assets só se tornam "no ar" em UE5.8 depois disso.
