# CIGKV — Captura visual UE5.8 e análise de materiais

## Matriz de captura

O Editor executa 24 casos: 4 presets (`Low`, `Medium`, `High`, `Ultra`) × 3 iluminações (`day_neutral`, `golden_hour`, `night_interior`) × 2 vistas (`third_person_combat`, `first_person_ads`). As câmeras precisam ter as tags `CIGKV_Camera_ThirdPerson` e `CIGKV_Camera_FirstPersonADS`.

A captura só começa depois de:

1. `configure_cigkv_sss_anisotropy.py` criar/atualizar os perfis e salvar as instâncias;
2. `validate_cigkv_materials.py` confirmar o master, instâncias e parâmetros;
3. `analyze_cigkv_material_configuration.py` confirmar `status=pass`.

O relatório final é `artifacts/cigkv-vertical-slice/engine-report.json` e precisa conter 24 PNGs. O workflow bloqueia a execução se houver menos de 24.

## Análise do relatório de configuração

O analisador engine-less aceita `material-configuration-report.json` produzido no Editor:

```bash
python3 scripts/ue5/analyze_cigkv_material_configuration.py \
  --input artifacts/cigkv-vertical-slice/material-configuration-report.json \
  --output artifacts/cigkv-vertical-slice/material-configuration-analysis.json
```

Ele classifica o relatório como `pass`, `fail` ou `missing`. `missing` não é convertido em sucesso e mantém `visual_acceptance=not_measured`.

## Host GPU

No host com UE5.8 e GPU NVIDIA, a execução do workflow deve usar `run_engine=true`, `UE58_ENABLED=true` e `UE5_ROOT` apontando para a engine. O sandbox local não possui o arquivo `CREDENCIAIS_SSH`, UE5.8 ou o relatório gerado; portanto nenhuma captura remota é declarada até que o host seja acessível e o artefato seja copiado para o workspace.
