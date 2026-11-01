# Auditoria estática das fontes de dados de armas

**Data da inspeção:** 31/10/2026
**Estado de autoridade:** `UNRESOLVED` — nenhuma fonte foi aprovada como canônica.
**Escopo:** comparação de campos declarados em arquivos versionados; não prova valores carregados em uma partida.

## Resultado reproduzível

O relatório gerado por [`scripts/audit_weapon_source_divergence.py`](../scripts/audit_weapon_source_divergence.py) compara três artefatos: `components_dev/weapons` (11 registros JSON), `Unreal/KhaaosRun/Content/DataTables/DT_WeaponBalance.csv` (12 linhas) e `scripts/mvp/step4_3d_assets/asset_manifest_mvp.json` (3 armas). O conjunto contém 12 IDs; `WPN_Crossbow_Ancient` existe na CSV, mas não está no manifesto/arquivos JSON de `components_dev`.

O relatório encontra **12 pares arma/campo com valores diferentes** em três armas compartilhadas entre os JSONs e o manifesto MVP:

| Arma | Campos divergentes | `components_dev` / CSV | Manifesto MVP |
|---|---|---|---|
| `WPN_AssaultRifle_MK1` | dano; recarga | 35; 2,0 s | 28; 2,1 s |
| `WPN_Shotgun_Breach` | dano; cadência; pente; recarga; pellets | 12; 80; 6; 4,2 s; 9 pellets no JSON | 120; 60; 2; 3,5 s; 8 pellets |
| `WPN_Sniper_DMR` | dano; cadência; multiplicador de headshot; pente; recarga | 95; 40; 3; 5; 3,5 s | 65; 180; 2; 10; 2,8 s |

A comparação preserva números brutos. Em particular, não se assume que dano da shotgun signifique dano por pellet ou por disparo total, nem que unidades/definições de alcance e cadência sejam equivalentes. Portanto, os números servem para localizar divergências, não para calcular qual configuração é melhor ou correta.

## Evidência sobre runtime

Na varredura das pastas `Unreal/KhaaosRun/Content/Weapons` e `Content/DataTables`, foram encontrados **0 arquivos `.uasset`** e **4 marcadores `pending_import`**. A CSV `DT_WeaponBalance.csv` é um arquivo presente no repositório, mas isso, por si só, não prova que exista ou seja carregada como UDataTable. A classe C++ `UKhaaosWeaponDataAsset` define estrutura/fórmulas e valores padrão da classe; sem assets/perfis importados e sem execução em PIE/servidor, ela também não identifica a fonte per-arma usada pelo gameplay.

## Atualizar/verificar o relatório

```bash
python3 scripts/audit_weapon_source_divergence.py --check
python3 scripts/audit_weapon_source_divergence.py --write
```

`--check` é parte de `npm run test:python` e falha se as fontes mudarem sem atualização do snapshot versionado [`components_dev/weapon_source_audit_report.json`](../components_dev/weapon_source_audit_report.json). O relatório registra hashes/contagens das fontes, IDs não correspondidos e cada campo divergente; ele não falha apenas por encontrar conflitos já documentados.

## Decisões ainda necessárias

Product/game design e engenharia precisam escolher e registrar, com versão e owner, qual fonte deve governar o conteúdo final; documentar unidade e semântica de cada campo (incluindo shotgun); resolver o crosswalk de IDs; e validar o import/consumo real em Unreal 5.8 no servidor/PIE. Até essas decisões e evidências existirem, `canonical_source` permanece `null`, nenhum valor deve ser copiado entre fontes e qualquer alegação de balanceamento/paridade segue `UNVERIFIED`.
