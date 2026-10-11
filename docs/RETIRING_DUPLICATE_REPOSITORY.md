# Checklist para retirar o repositório secundário

Este documento registra a retirada de `Nexus-HUB57/khaaos-Run`. **A exclusão definitiva foi executada após confirmação explícita do usuário em 2026-10-10**. O repositório oficial e consolidado é `Nexus-HUB57/Khaaos_Run`.

## Evidências de consolidação

- Repositório de destino: <https://github.com/Nexus-HUB57/Khaaos_Run>
- Repositório secundário: <https://github.com/Nexus-HUB57/khaaos-Run>
- Conteúdo do secundário preservado em `game-runtime/` no oficial.
- Merge original no oficial: `0a272082a303848285df224e078be9fa47316900`.
- Commit que incorporou o histórico secundário: `faabad39b5e25f32f4a55008f256b42ea0844d98` (pai secundário do merge).
- O histórico consultado contém 13 commits alcançáveis a partir desse pai, uma única branch remota (`main`) e nenhuma tag.
- Verificação da árvore: 58 arquivos versionados no secundário e 58 em `game-runtime/`; 0 caminhos ausentes.
- O verificador `npm run verify:all` passou localmente antes desta alteração; o workflow CI agora o executa no GitHub para pushes e pull requests em `main`.
- Exclusão efetuada pela API do GitHub após autorização; a consulta posterior confirmou que `Nexus-HUB57/khaaos-Run` não está mais acessível como repositório.

## Ações posteriores

1. Confira no GitHub que `Khaaos_Run` continua atualizado e acessível aos mantenedores.
2. Revise os serviços externos, links, badges, deploys e integrações para garantir que apontem ao repositório oficial.
3. Lembre que issues, pull requests, discussões, Wiki, releases/anexos, configurações, secrets, regras de proteção, webhooks e dados de Actions não fazem parte da árvore Git importada e podem não ter sido preservados.

## Após a retirada

- Remova referências antigas em README, documentação, issues e pipelines.
- Mantenha este checklist e os commits de integração no repositório oficial como trilha de auditoria.
- Clone e trabalhe apenas em `Nexus-HUB57/Khaaos_Run`.
