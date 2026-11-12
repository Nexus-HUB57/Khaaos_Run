# TODO — Dashboard de Sinergia dos Operativos

> **Estado:** as três entregas estão implementadas e validadas localmente. `npm run verify:all` passou nos sete estágios; os cinco testes da API FastAPI passaram; os workflows YAML foram analisados e o Preview respondeu com 16 operativos e 120 pares. O GitHub Actions remoto não foi disparado: ainda não houve commit/push desta entrega.

## [x] Dados canônicos e API — concluído localmente
- O dashboard carrega os dados canônicos dos 16 operativos diretamente do repositório `Nexus-HUB57/Khaaos_Run`, sem criar uma fonte paralela. O backend Python FastAPI valida IDs/horizonte e entrega dados da simulação; não usa banco de dados.
- Cada operativo expõe cooldown, duração/intervalo efetivo, ativações e metadados de habilidade. O serviço calcula interseções temporais e regras explicáveis, não estima dano, vitória ou outro resultado autoritativo.
- Estados de carregamento, dados ausentes e erros de validação/integração são apresentados com mensagens claras e recuperáveis.

## [x] Linha do tempo, filtros e comparação — concluído localmente
- Gráficos mostram faixas de efeito, períodos ativos, cooldowns e sobreposições para todos os 16 operativos, com eixo temporal ajustável e navegação por diferentes intervalos do horizonte.
- É possível filtrar/inspecionar detalhes para reduzir a complexidade visual, selecionar operativos e comparar pares e composições; sobreposições e lacunas de cobertura recebem destaque visual.
- A composição selecionada apresenta resumo quantitativo de duração e frequência das sobreposições. A ferramenta também permite examinar as 120 duplas possíveis do roster completo.
- Duração efetiva e cooldown são visualmente distintos. O stun de Soraya Hadd contabiliza 1,5 s de controle efetivo, embora o estado da habilidade dure 2 s; sinais instantâneos usam a janela analítica de 5 s marcada explicitamente como convenção do modelo.

## [x] Experiência, integração e entrega — concluído localmente; CI remoto pendente
- A interface segue o centro de comando tático-laboratorial aprovado, adapta-se a desktop e mobile, permite foco/inspeção detalhada, navegação por teclado e não usa somente cor para expressar estado.
- Um painel explica premissas, fórmulas, simplificações e limitações. Ele informa que as sobreposições são modeladas, que marcas/controle locais se referem a bots quando aplicável, e que habilidades ainda não são sincronizadas no online.
- Código e instruções permanecem no repositório oficial e a alteração é testada/configurada para o pipeline CI/CD existente do Khaaos_Run; dependências, execução do FastAPI e manifesto de rota estão documentados.
