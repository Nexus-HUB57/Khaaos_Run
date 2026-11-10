# CIGKV — migração para NVIDIA e simulação local

## Ativação/migração

O passthrough não pode ser habilitado de dentro do guest KVM. O pedido ao HostGator deve solicitar uma instância com GPU NVIDIA dedicada ou vGPU NVIDIA, com PCI passthrough/MDEV e suporte a CUDA. O VPS atual expõe somente Red Hat Virtio GPU, 2 vCPUs, aproximadamente 4 GB de RAM e sem UE5.8.

Requisitos recomendados para o novo runner:

- NVIDIA com pelo menos 8 GB de VRAM;
- 16 GB de RAM no mínimo, 32 GB recomendado;
- 4 vCPUs ou mais;
- 150 GB livres ou mais;
- Ubuntu 22.04/24.04 compatível com o driver;
- `nvidia-smi` funcionando;
- Unreal Engine 5.8 licenciado;
- Blender 4.x;
- checkout do repositório e cache persistente.

Após a migração, execute no guest:

```bash
bash scripts/build/prepare_nvidia_gpu_guest.sh
lspci -nn | grep -Ei 'nvidia|3d|vga'
ls -l /dev/nvidia*
```

O script falha se a GPU não estiver realmente exposta. Ele não instala driver, não altera o hypervisor e não reinicia a máquina.

## Simulação local

O sandbox não possui NVIDIA nem UE5.8. A integridade da orquestração pode ser testada com:

```bash
python3 scripts/build/simulate_cigkv_headless_gpu.py
```

O mock percorre GPU preflight, configuração de materiais, pre-bake, matriz de 24 casos e validação de artifacts. Ele gera somente JSONs marcados com `simulated=true`, não produz PNGs e mantém `visual_acceptance=not_measured`.

Isso verifica cardinalidade, schemas e ordem do pipeline, mas não valida shaders, Lumen, VSM, SSS, anisotropia, VRAM ou aparência. O aceite visual só pode ocorrer no runner NVIDIA/UE5.8 real.
