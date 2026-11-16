# Validação Brev NVIDIA L4 — CIGKV

## Resultado

A tentativa autorizada de provisionar uma instância NVIDIA L4 foi executada em 2026-11-10 com:

```text
GPU: L4
VRAM mínima: 16 GB
Disco mínimo: 150 GB
Timeout: 900 s
```

O Brev encontrou tipos compatíveis, mas todas as tentativas retornaram `Internal Server Error`. O resultado final foi `0/1 instances`. Nenhuma instância foi criada.

A verificação posterior retornou:

```json
{"workspaces": null}
```

Também não foi encontrado o nome `khaaos-cigkv-l4-20261110`, portanto não houve workspace órfão nem cobrança de uma instância criada parcialmente.

## Validação local end to end

O launcher real foi executado com `CIGKV_GPU_MOCK=1` e percorreu o mesmo contrato de orquestração:

```text
MOCK_HEADLESS_PASS cases=24 real_pngs=0
E2E_MOCK_PASS 24 0
```

Foram validados GPU preflight simulado, configuração de materiais, pre-bake, matriz de renderização e artifacts. O mock não executa Unreal Engine, não acessa GPU e não produz PNGs; portanto o aceite visual permanece `not_measured`.

## Diagnóstico e próximo passo

O `dry-run` do Brev continua retornando tipos L4, então a falha ocorre durante a criação, não na seleção do tipo. Como o erro é HTTP 500 para múltiplos provedores/tipos, a próxima ação deve ser abrir suporte no Brev/NVIDIA com o horário da tentativa, a organização autenticada e o primeiro tipo tentado. Não repetir tentativas em massa até confirmar créditos, região/provedor e estado da conta.

Quando o backend estiver saudável, repetir o workflow manual com `provision=true`, GPU `L4`, e manter o cleanup automático. O runner ainda precisará conter UE5.8 licenciado; a presença de uma L4 sozinha não garante screenshots reais.
