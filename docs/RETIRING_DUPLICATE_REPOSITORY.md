# Checklist para retirar o repositório secundário

Este documento prepara a retirada de `Nexus-HUB57/khaaos-Run`. **A exclusão não foi executada**. O repositório oficial e consolidado é `Nexus-HUB57/Khaaos_Run`.

## Evidências de consolidação

- Repositório de destino: <https://github.com/Nexus-HUB57/Khaaos_Run>
- Repositório secundário: <https://github.com/Nexus-HUB57/khaaos-Run>
- Conteúdo do secundário preservado em `game-runtime/` no oficial.
- Merge original no oficial: `0a272082a303848285df224e078be9fa47316900`.
- Commit que incorporou o histórico secundário: `faabad39b5e25f32f4a55008f256b42ea0844d98` (pai secundário do merge).
- O histórico consultado contém 13 commits alcançáveis a partir desse pai, uma única branch remota (`main`) e nenhuma tag.
- Verificação da árvore: 58 arquivos versionados no secundário e 58 em `game-runtime/`; 0 caminhos ausentes.
- O verificador `npm run verify:all` passou localmente antes desta alteração; o workflow CI agora o executa no GitHub para pushes e pull requests em `main`.

## Antes de excluir

1. Confira no GitHub que `Khaaos_Run` está atualizado e acessível aos mantenedores que precisam continuar o desenvolvimento.
2. Aguarde o workflow **CI / Verify official app and game runtime** ficar verde no commit mais recente do branch `main`.
3. Baixe ou exporte, se ainda forem necessários, itens que não fazem parte da árvore Git importada: issues, pull requests, discussões, Wiki, releases/anexos, configurações, secrets, regras de proteção, webhooks e dados de Actions.
4. Confirme que os links externos, pipelines, badges, deploys, integrações e colaboradores foram redirecionados/adicionados ao repo oficial.
5. Opcionalmente, prefira arquivar o secundário primeiro e manter um período de retenção antes da exclusão permanente.
6. Se a exclusão definitiva continuar desejada, faça-a nas configurações do GitHub do repositório secundário, autenticado como proprietário/admin. Essa ação é destrutiva e pode remover metadados e serviços do GitHub associados; não é realizada por este checklist.

## Após a retirada

- Remova referências antigas em README, documentação, issues e pipelines.
- Mantenha este checklist e os commits de integração no repositório oficial como trilha de auditoria.
- Clone e trabalhe apenas em `Nexus-HUB57/Khaaos_Run`.
