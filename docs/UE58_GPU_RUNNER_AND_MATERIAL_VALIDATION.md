# Runner UE5.8 GPU e validação de materiais no Editor

## Provisionamento

O script `scripts/build/provision_ue58_gpu_runner.sh` é idempotente e separa instalação de registro:

```bash
# diagnóstico sem registrar runner
sudo UE5_INSTALL_DIR=/opt/UnrealEngine \
  GPU_REQUIRED=1 PROVISION_PACKAGES=0 \
  bash scripts/build/provision_ue58_gpu_runner.sh --check

# provisionar pacotes e validar host
sudo UE5_INSTALL_DIR=/opt/UnrealEngine \
  GPU_REQUIRED=1 PROVISION_PACKAGES=1 \
  bash scripts/build/provision_ue58_gpu_runner.sh --install

# registrar com token efêmero; não gravar o token no shell history/repositório
sudo RUNNER_REGISTRATION_TOKEN='TOKEN_EFEMERO' \
  UE5_INSTALL_DIR=/opt/UnrealEngine \
  bash scripts/build/provision_ue58_gpu_runner.sh --register
```

O host precisa de x86_64, UE5.8 em `UE5_INSTALL_DIR`, Blender 4.x, preferencialmente 32 GB RAM e 150 GB livres, além de `nvidia-smi`. O script usa os labels `self-hosted,linux,x64,ue5.8,ue5,gpu` e cria `.env` com `UE5_ROOT` e `CIGKV_GPU_RUNNER=1`. Tokens não são impressos nem persistidos pelo repositório.

A instalação automática do driver NVIDIA é opt-in (`INSTALL_NVIDIA_DRIVER=1`) porque pode exigir reboot e depende da imagem Ubuntu/GPU. O script falha com mensagem explícita quando `GPU_REQUIRED=1` e não há `nvidia-smi`; não simula GPU.

O diagnóstico reproduzível é:

```bash
python3 scripts/build/ue58_gpu_diagnostic.py \
  --ue-root /opt/UnrealEngine \
  --require-gpu \
  --output artifacts/cigkv-vertical-slice/ue58-gpu-diagnostic.json
```

## Validação dentro do Unreal Editor

No runner, o workflow executa `scripts/ue5_editor/validate_cigkv_materials.py` antes das capturas. O script:

1. carrega `M_CIGKV_Character_Master`;
2. verifica as instâncias `MI_CIGKV_*` e o parent do master;
3. verifica parâmetros `SubsurfaceStrength`/`SubsurfaceRadius` para pele;
4. verifica `HairAnisotropy`/`HairFlowStrength` para cabelo;
5. compara valores reais das instâncias com a receita, tolerância de 0,02;
6. registra a presença dos `SSP_CIGKV_Human_Skin` e `SSP_CIGKV_Zheers_Skin`;
7. grava `artifacts/cigkv-vertical-slice/material-validation-report.json`.

A validação inicial não declara qualidade visual final. SSS e anisotropia só são aceitos após as screenshots e métricas da matriz visual UE5.8; ausência de perfil gera warning, enquanto material/parameter ausente ou valor fora da tolerância falha o job.

## Estado no sandbox

Os scripts, workflow e validação sintática podem ser testados aqui. O diagnóstico real com `--require-gpu` e a execução do Editor continuam dependentes de host licenciado com GPU NVIDIA e Blender 4.x.
