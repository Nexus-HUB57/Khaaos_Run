# Modelo de chamado — NVIDIA Brev: Internal Server Error ao provisionar NVIDIA L4

**Para:** brev-support@nvidia.com

**Assunto:** `Internal Server Error provisioning NVIDIA L4 — org-3LsCqgZ7WlC1hqFyAUiKCiiDmbw — 0/1 instances`

Olá, equipe Brev,

Estamos tentando provisionar uma instância NVIDIA L4 para executar um pipeline headless do Unreal Engine 5.8. A criação falha com `Internal Server Error` em todos os tipos compatíveis retornados pelo próprio catálogo do Brev.

## Organização e cliente

- **Organization ID:** `org-3LsCqgZ7WlC1hqFyAUiKCiiDmbw`
- **Organization name:** `lucasmpthomaz-9e253f-6sa7`
- **CLI:** Brev `v0.6.337`
- **Sistema cliente:** Linux x86_64, sandbox/cloud runner
- **Tentativa:** `2026-11-10 12:49:52 BRT (UTC-3)`
- **Nome solicitado:** `khaaos-cigkv-l4-20261110`
- **GPU filter:** `L4`
- **VRAM mínima por GPU:** `16 GB`
- **Disco mínimo:** `150 GB`
- **Timeout:** `900 s`
- **Quantidade:** `1`

## Comando executado

```bash
brev create khaaos-cigkv-l4-20261110 \
  --gpu-name L4 \
  --min-vram 16 \
  --min-disk 150 \
  --timeout 900
```

## Resultado

O CLI retornou `Internal Server Error` para cada tipo tentado. Alguns dos tipos foram:

```text
g2-standard-4:nvidia-l4:1
g6.xlarge
g2-standard-8:nvidia-l4:1
g6.2xlarge
g2-standard-12:nvidia-l4:1
g2-standard-16:nvidia-l4:1
g6.4xlarge
gr6.4xlarge
g2-standard-32:nvidia-l4:1
g6e.xlarge
```

O resultado final foi:

```text
Warning: Only created 0/1 instances
could only create 0/1 instances
```

Nenhum `instance_id`, `public_ip` ou estado `Waiting` foi retornado. Uma verificação posterior confirmou:

```json
{"workspaces": null}
```

Também confirmamos que `khaaos-cigkv-l4-20261110` não existe na listagem atual, portanto não há workspace órfão.

## Verificações realizadas

```text
brev healthcheck: Healthy!
brev ls --json: {"workspaces": null}
```

A busca de catálogo funciona e retorna L4 disponíveis, por exemplo:

```text
g2-standard-4:nvidia-l4:1  | gcp | L4 | 24 GB VRAM | 4 vCPUs | 150 GB | aproximadamente $0.85/h
g6.xlarge                  | aws | L4 | 24 GB VRAM | 4 vCPUs | 150 GB | aproximadamente $0.97/h
g2-standard-8:nvidia-l4:1  | gcp | L4 | 24 GB VRAM | 8 vCPUs | 150 GB | aproximadamente $1.02/h
```

Os valores acima vieram do catálogo no momento da consulta e não são uma cotação garantida.

## Solicitação ao suporte

Podem, por favor, verificar nos logs do backend:

1. o request correspondente à organização e ao horário informados;
2. se a API key/organização possui créditos, quota e permissão de provisionamento;
3. se há falha de alocação nos provedores GCP/AWS para L4;
4. se há bloqueio regional, limite de conta ou problema de billing;
5. o código interno e o request ID associado ao HTTP 500;
6. se existe uma região/provedor/tipo recomendado para repetir com segurança;
7. se é necessário ajustar a organização ou habilitar GPU provisioning antes de tentar novamente.

Não repetimos novas tentativas após a falha para evitar consumo ou cobrança desnecessária. Podemos testar novamente depois que o suporte confirmar a causa e a configuração recomendada.

Atenciosamente,

`[nome / e-mail da conta NVIDIA Brev]`

## Anexos sugeridos

- saída completa do comando `brev create`;
- saída de `brev healthcheck`;
- saída de `brev ls --json`;
- saída de `brev search --gpu-name L4 --min-vram 16 --min-disk 150 --sort price`;
- versão do CLI (`brev --version`).

Não anexar API keys, tokens JWT, `~/.brev/credentials.json` ou qualquer arquivo contendo credenciais.

## Referências oficiais

A documentação do Brev recomenda informar à equipe de suporte o organization ID, nome/configuração da instância, timestamps e logs da atividade. [1] O Help Center oficial informa o canal `brev-support@nvidia.com`. [2]

[1]: https://docs.nvidia.com/brev/troubleshooting/instances-gpus/instance-stuck-in-waiting-state "Brev Instance Stuck in Waiting State"
[2]: https://brev.nvidia.com/help?product=brev "NVIDIA Brev Help Center"
