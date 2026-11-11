# CIGKV — Renderização headless GPU + pre-bake

## Arquitetura

O workflow usa três camadas:

1. **Preflight**: confirma `UnrealEditor-Cmd`, `nvidia-smi`, memória disponível e GPU NVIDIA real. `-nullrhi=false` é obrigatório; Virtio, llvmpipe ou CPU-only são rejeitados.
2. **Pre-bake**: o Editor aquece Shader Pipeline Cache, Nanite streaming, Lumen surface probes e Virtual Shadow Maps, solicita `BUILD LIGHTING` e salva pacotes. O relatório separa solicitação de conclusão para não declarar um bake falso.
3. **Render headless**: executa a matriz 4×3×2 e exige 24 PNGs 1920×1080, além do `engine-report.json`.

## Execução no runner GPU

```bash
export UE5_ROOT=/opt/UnrealEngine
export UPROJECT="$PWD/Unreal/KhaaosRun/KhaaosRun.uproject"
export CIGKV_GPU_RUNNER=1
scripts/build/run_cigkv_headless_gpu_pipeline.sh
```

Artifacts esperados:

- `ue58-gpu-diagnostic.json`;
- `material-configuration-report.json`;
- `material-configuration-analysis.json`;
- `headless-bake-report.json`;
- `engine-report.json`;
- `headless-pipeline-report.json`;
- 24 PNGs em `headless-render/` ou no diretório de captures.

## Limitações do host atual

O VPS auditado em `143.95.213.237` expõe KVM + `Red Hat Virtio GPU`, sem `nvidia-smi`, sem NVIDIA PCI/MDEV, sem UE5.8 e com aproximadamente 4 GB de RAM. O launcher bloqueia esse host deliberadamente. O passthrough precisa ser habilitado pelo provedor no hypervisor, ou o job deve ser direcionado a um runner self-hosted com GPU NVIDIA física/vGPU e UE5.8 licenciado.

O pre-bake não transforma Lumen em lightmap tradicional nem substitui revisão visual. O aceite continua condicionado a screenshots, métricas e revisão humana dos materiais, cabelo, Lumen, VSM, LOD e clipping.
