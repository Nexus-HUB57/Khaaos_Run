# Configuração UE5.8 de SSS e anisotropia

O script `scripts/ue5_editor/configure_cigkv_sss_anisotropy.py` é executado no UnrealEditor-Cmd em runner licenciado. Ele não é um mock nem um validador somente declarativo.

## O que ele faz

1. Carrega a receita `M_CIGKV_character_materials.json`.
2. Verifica `M_CIGKV_Character_Master`.
3. Cria ou carrega `SSP_CIGKV_Human_Skin` e `SSP_CIGKV_Zheers_Skin`.
4. Tenta configurar cor de falloff, mean free path/radius e escala da unidade através da API exposta pelo UE5.8.
5. Aplica `SubsurfaceStrength` e `SubsurfaceRadius` nas instâncias de pele.
6. Aplica o `SubsurfaceProfile` através do setter da API disponível.
7. Aplica `HairAnisotropy` e `HairFlowStrength` nas instâncias de cabelo.
8. Atualiza e salva os assets.
9. Gera `artifacts/cigkv-vertical-slice/material-configuration-report.json`.

A operação é idempotente. Se a versão do Python API não expuser uma factory de `SubsurfaceProfile` ou setter de perfil, o script falha com mensagem explícita; não registra sucesso parcial como aceite.

## Execução manual

```bash
UE5_ROOT=/opt/UnrealEngine
UPROJECT="$PWD/Unreal/KhaaosRun/KhaaosRun.uproject"
"$UE5_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd" "$UPROJECT" \
  -unattended -nop4 -nosplash -nullrhi=false \
  -run=pythonscript \
  -script="$PWD/scripts/ue5_editor/configure_cigkv_sss_anisotropy.py" \
  -log
```

Depois, execute `validate_cigkv_materials.py` e a matriz visual. A configuração de parâmetros não substitui a inspeção de aparência: SSS ainda precisa ser revisado em luz neutra, golden hour e interior noturno; anisotropia precisa ser revisada contra o flow map, highlights e aliasing.
