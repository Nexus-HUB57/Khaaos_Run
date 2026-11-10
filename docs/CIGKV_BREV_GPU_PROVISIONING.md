# CIGKV — provisionamento GPU via NVIDIA Brev

## Estado do CLI

O Brev CLI foi instalado no sandbox e autenticado com uma API key pessoal. O CLI confirmou a organização `lucasmpthomaz-9e253f-6sa7`. A listagem atual retornou `workspaces: null`, portanto não há instância Brev ativa.

A API key não é versionada. Para CI, configure um secret de repositório chamado `BREV_API_KEY`. A documentação do Brev recomenda API keys de Read & Write para lifecycle de instâncias e `brev refresh` para sincronizar SSH.

## Dry-run

A descoberta não cria recursos. O comando usado foi equivalente a:

```bash
brev create khaaos-cigkv-gpu \
  --min-vram 8 \
  --min-disk 150 \
  --dry-run
```

A busca retornou opções NVIDIA como L4, A10G, T4, A4000 e A5000. Os preços e disponibilidade são dinâmicos e devem ser confirmados no momento do provisionamento.

## Workflow manual

O workflow `.github/workflows/cigkv-brev-gpu-headless.yml` executa dry-run por padrão. O input `provision` precisa ser explicitamente `true` para criar uma instância, portanto não há criação automática nem cobrança durante pushes/PRs.

O lifecycle faz:

1. instala o Brev CLI;
2. autentica usando `BREV_API_KEY` sem imprimir a chave;
3. executa dry-run com GPU/VRAM/disco selecionados;
4. cria a instância somente com `provision=true`;
5. valida `nvidia-smi` e `UnrealEditor-Cmd`;
6. copia o projeto e executa o pipeline headless;
7. remove a instância em `trap` mesmo em falha.

O script não usa o `org-id` diretamente porque a API key Brev já seleciona automaticamente a organização à qual pertence.

## Segurança e custo

Não executar o workflow com `provision=true` sem revisar GPU, região/provedor, créditos e custo horário. A instância é deletada ao final pelo lifecycle, mas falhas externas podem exigir conferência no console Brev. Como as credenciais foram compartilhadas na conversa, recomenda-se revogar/rotacionar a API key e o token JWT depois de confirmar a configuração.
