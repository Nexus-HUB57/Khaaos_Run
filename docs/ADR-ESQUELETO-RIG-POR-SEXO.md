# ADR-ESQUELETO-RIG-POR-SEXO — Rig base por sexo (SK_Manny / SK_Gwen), espécie como camada

- **Status:** Aceito (2026-11-02)
- **Escopo:** Personagens — SPC (`components_dev/avatars/SPC_*.json`), proofs (`components_dev/avatars/proofs/`), Character Studio (`shared/character-studio.ts`) e pipeline UE5 (`Unreal/KhaaosRun/Source/KhaaosRun/Game/Character/`)
- **Decide:** Qual esqueleto rege a importação UE5 dos personagens, encerrando o conflito entre três convenções conflitantes.

## 1. Contexto

Antes desta decisão, o domínio de personagens carregava **três convenções de esqueleto mutuamente contraditórias**:

| Fonte | Convenção | Valores |
|---|---|---|
| SPC + CSV + proofs (design) | esqueleto **por espécie** | `SK_Manny` (Zheers, Onith, Venex) · `SK_Gwen` (Skeetw, Huran, Khael) |
| Actors UE5 (`KhaaosOp*.cpp`, 24 arquivos) | esqueleto **por sexo** | `SK_Manny` (12 masculinos) · `SK_Gwen` (12 femininos) |
| Character Studio (`shared/character-studio.ts`) | rótulo genérico | `"UE5_Mannequin"` em todos os 16 operatives, com menção avulsa a `SK_Zheers_Base` |

O conflito tem consequência prática: para qualquer operante fora do cruzamento "espécie humana-like + sexo compatível", as fontes divergem. Exemplo real: **Huran masculino** — o SPC ordena `SK_Gwen` (espécie anfíbia), enquanto o actor `KhaaosOpHUR01.cpp` já nasce com `SK_Manny` (sexo masculino). **Zheers feminina** — SPC diz `SK_Manny`, o actor `KhaaosOpZHEF01.cpp` diz `SK_Gwen`. Não há como escrever um importador UE5 que satisfaça as três fontes ao mesmo tempo.

O header `KhaaosOperativeActor.h` documenta a intenção do runtime: *"Target skeleton asset name (SK_Manny or SK_Gwen)"* — dois rigs, não seis.

## 2. Opções consideradas

### A. Esqueleto por espécie (SPC como fonte da verdade)
Cada espécie teria seu esqueleto: 6 famílias × 2 sexos = **12 bibliotecas de animação**, retargeting contínuo entre rigs, quebra do `KhaaosLyraHeroComponent` (que assume um rig padrão) e multiplicação do custo de cada nova animação por 12. Rejeitada por custo e por contrariar o runtime já implementado.

### B. Esqueleto por sexo, espécie como camada (escolhida)
Dois rigs base — **`SK_Manny` (masculino)** e **`SK_Gwen` (feminino)** — herdeiros diretos dos mannequins do UE5 (`SKM_Manny`/`SKM_Quinn` renomeados no projeto). As diferenças de espécie (asas de Skeetw, membranas de Huran, placas de Onith, augments de Venex, sigils de Khael, biofeedback de Zheers) vivem em **variantes de Skeletal Mesh + morph targets + camadas de Animation Blueprint (ex.: `ABP_Zheers_Base`)** sobre o rig base, que é exatamente o padrão Lyra (um rig, muitas "families" de personagem).

### C. Manter as três convenções e mapear no importador
O importador escolheria a fonte "correta" por contexto. Rejeitada: transfere o bug para o importador e deixa as fontes mentindo sobre o runtime.

## 3. Decisão

**O rig base do personagem é atribuído por sexo: masculino → `SK_Manny`, feminino → `SK_Gwen`. A espécie não define esqueleto; define mesh variant, morphs, cloth, VFX e camadas de ABP sobre o rig base.**

Consequências normativas:

1. **`SK_Manny`/`SK_Gwen`** são os nomes canônicos de asset no projeto (derivados de `SKM_Manny`/`SKM_Quinn` do UE5 5.8). `UE5_Mannequin` deixa de existir como valor.
2. **`shared/character-studio.ts`**: o campo `biomechanics.skeleton` passa a carregar `"SK_Manny" | "SK_Gwen"` por operante (por `gender`), e o `ue5ManifestEntry` gerado pelo Studio carrega o mesmo valor — o manifest de importação UE5 fica fiel ao runtime.
3. **SPC (`physical`)**: `skeleton` mantém o **preview rig da espécie** (usado por estúdio/proofs como referência criativa), agora acompanhado de `rig_by_sex: {masculino: "SK_Manny", feminino: "SK_Gwen"}` explícito e de `skeleton_note` apontando para este ADR. O par `animations.base_skeleton` = `physical.skeleton` continua válido (ambos descrevem o preview rig).
4. **Proofs**: o bloco `species.skeleton` espelha o preview rig do SPC e é validado por `tests/official/proofs-matrix.test.ts`.
5. **Actors UE5**: sem mudança — os 24 `KhaaosOp*.cpp` já seguem a convenção por sexo e agora são a implementação de referência.

## 4. Contratos automatizados

| Teste | Garantia |
|---|---|
| `tests/official/character-studio.test.ts` | `biomechanics.skeleton` e `ue5ManifestEntry.skeleton` = `SK_Manny` (M) / `SK_Gwen` (F) |
| `tests/official/species-catalog.test.ts` | `physical.rig_by_sex` presente nos 6 SPC com valores canônicos + `skeleton_note` citando o ADR |
| `tests/official/proofs-matrix.test.ts` | `species.skeleton` dos 24 proofs = preview rig da espécie (paridade com SPC) |

## 5. Impacto no import UE5

- O importer consome `ue5ManifestEntry.skeleton` e passa a receber um asset que existe de fato (`SK_Manny`/`SK_Gwen`), em vez do placeholder `UE5_Mannequin`.
- `ABP_Zheers_Base` e demais `ABP_<Espécie>_Base` são **camadas/meshes de espécie**, não esqueletos independentes — nenhum retarget extra é necessário.
- MetaHuman/Control Rig seguem o fluxo padrão sobre os dois rigs.

## 6. Follow-ups

1. Auditar `epic_integration/lyra_mapping.json` para apontar os dois rigs canônicos (hoje menciona apenas o caminho de Characters/Zheers).
2. Quando a Fase de import UE5 rodar, validar no editor que as variantes de espécie carregam sobre os dois rigs com os 4 LODs do Studio.
3. Remover qualquer resíduo do rótulo `UE5_Mannequin` em docs de onboarding (busca programática já garante `shared/` limpo).
