# Khaaos Run — Pipeline de Mundos UE5.8 (Editor-Python)

Fecha o bloqueador **"criar/importar .umap, meshes, materiais e Niagara"** na
medida do possível sem engine: o *pipeline* completo está versionado e validado
no CI (engine-less); os **artefatos** (.umap/.uasset) só a engine cria — bastam
dois comandos numa estação com o UE5.8.

## Estado

| Peça | Status |
|---|---|
| `scripts/build/generate_worlds.py` | ✅ versionado — gera 2 mapas, 3 materiais PBR, 3 placeholders Niagara, iluminação Lumen |
| `scripts/build/build_worlds.sh` | ✅ runner do commandlet (`--check` engine-less; sem editor → status honesto, exit 0) |
| `Config/DefaultEngine.ini` | ✅ `GameDefaultMap=/Game/Maps/Menu_Khaaos`, `ServerDefaultMap=/Game/Maps/CIGKV_BR` |
| Preflight | ✅ UE1031 (warning honesto) até o primeiro `.umap` ser gerado |
| Artefatos `.umap`/`.uasset` | ⏳ exigem Editor (90 GB, licenciado) — único passo pendente |

## Como gerar os mundos (estação com UE5.8)

```bash
# 1) Caminho rápido — de dentro do Editor (Janela → Python):
#    execute scripts/build/generate_worlds.py

# 2) Caminho commandlet (recomendado, sem abrir a GUI):
UE_ROOT=/epics/UE_5.8 ./scripts/build/build_worlds.sh
#    Win64: UE_ROOT apontando para a raiz da engine (detecta UnrealEditor-Cmd)

# 3) Verificação sem engine (CI):
./scripts/build/build_worlds.sh --check
```

O script imprime **uma linha de contrato** parseável:

```
KHR_WORLDGEN_RESULT_JSON: {"status":"ok","maps":[...],"materials":[...],"niagara":[...],"warnings":[]}
```

`status`: `ok` (mapas + materiais) / `partial` (alguns artefatos) / `failed`.
Cada passo é independente — falha de Niagara vira *warning*, nunca derruba os
mapas. Idempotente: re-executar substitui assets existentes.

## O que é gerado

### `/Game/Maps/Menu_Khaaos` (GameDefaultMap)
Blockout de menu 40 m: piso, pano de fundo, 4 pilares, PlayerStart e
iluminação (direcional + sky + atmosfera + fog — Lumen pronto).

### `/Game/Maps/CIGKV_BR` (ServerDefaultMap — partida)
Arena 120 m × 120 m determinística:
- **Solo** + **4 paredes de borda** (KillZ −2000 no WorldSettings);
- **8 POIs** com os nomes dos mundos (`AruKheea`, `Barburhen`, `Ckesalth`,
  `Priadus`, `Zentrum`, `Cigarra`, `VaalNor`, `Iguassu`) — cada um com portal,
  2 blocos, torre, **1 PlayerStart** e **3 pontos de loot** (`TargetPoint`);
- Marcador central do anel (fase 1 da zona nasce no centro);
- Manchas de vegetação (material foliage) ao redor dos POIs.

Layout é **determinístico** (mesmas coordenadas em toda execução — sem RNG),
alinhado ao mundo do runtime 3D (`getWorldLayout`), o que mantém a simulação
Node e a versão UE comparáveis durante o parity.

### `/Game/Materials/` — PBR base
`M_KhaaosGround` / `M_KhaaosStructure` / `M_KhaaosFoliage` com parâmetros
`BaseColor` (Vector), `Roughness` e `Metallic` (Scalar) conectados por
`MaterialEditingLibrary`. Texturas realistas (4K, Megascans/originais) entram
depois pelo pipeline existente `import_assets_to_ue5.py` + manifest.

### `/Game/VFX/` — Niagara placeholders
`NS_Explosion`, `NS_GlooPuff`, `NS_AirdropDust` criados por
`NiagaraSystemFactoryNew`. Emissores detalhados são autorados no Editor
(criação programática de emissores é instável entre versões — tratada como
warning de propósito).

## Limitações honestas

- **Blockout, não final art**: geometria via BasicShapes; substituição por
  meshes finais é incremental (POIs são coordenadas estáveis).
- **Landscape**: heightmap real entra via `import_assets_to_ue5.py` (FBX/RAW) —
  o solo atual é plano, suficiente para gameplay e cook.
- **GameModes**: não configurados no ini ainda (GameMode classes existem em
  `Source/KhaaosRun/Game/`); wiring de GameMode é tarefa de integração UI.

## Contratos de validação (sem engine)

- `test/ue58-worlds-eac.test.js` (5 testes): preflight verde só-warnings com
  `KhaaosEAC`; ini ↔ script em sintonia; contrato do `generate_worlds.py`
  (funções, marcador JSON, determinismo); módulo EAC em stub nunca quebra;
  UE1041 enforce o contrato se a detecção condicional for removida.
- `./scripts/build/build_worlds.sh --check` valida o pipeline em <1 s no CI.
