# Plano — Khaaos Run Operative Synergy Dashboard

## Escopo aprovado
Criar uma visualização web interativa para a simulação de sinergia, cobrindo os 16 operativos canônicos e mostrando janelas de efeito, cooldowns e sobreposições temporais. A interface deve permitir ajustar horizonte/composição, comparar pares e exibir a explicação das regras modeladas. O painel deve deixar claro que sobreposição temporal não equivale a dano por segundo, chance de vitória ou resultado autoritativo do jogo.

## Arquitetura e estrutura
- Backend Python com FastAPI, sem banco de dados; endpoint JSON calcula ou fornece schedules e sobreposições a partir do módulo Python de simulação mantido no repositório oficial.
- Frontend responsivo em HTML, CSS e JavaScript simples, servido pela aplicação FastAPI; gráficos SVG para linha do tempo e heatmap, sem dependência de serviço externo.
- Estrutura:
  - `app.py`: rotas `/` e `/api/simulation`, validação de roster/horizonte e serialização.
  - `simulator.py`: adaptação importável da lógica do simulador existente, sem duplicar constantes autoritativas.
  - `static/index.html`: semântica e controles acessíveis.
  - `static/styles.css`: identidade responsiva, foco/contraste e estados de movimento reduzido.
  - `static/app.js`: filtros, timeline, seleção de composição e atualização dos gráficos.
  - `public/manus-routes.json`: manifesto com a rota `/`.
  - `requirements.txt`, `Dockerfile`, `README.md`: execução, dependências e implantação/reprodução.
- Manter o dashboard e o simulador sob `Nexus-HUB57/Khaaos_Run`; nenhum banco ou segredo é necessário.

## Design escolhido
Três direções avaliadas (probabilidades sorteadas, todas abaixo de 0,10):
1. Centro de comando tático-laboratorial — 0,095 (**escolhida**).
2. Terminal industrial brutalista — 0,088.
3. Estação científica de análise — 0,031.

### Centro de comando tático-laboratorial
- **Movimento de design:** consola de telemetria tática de uma sala de operações, com precisão de laboratório.
- **Princípios:** leitura rápida; rastreabilidade das premissas; interação que revela detalhe sem poluir a visão geral; acessibilidade em desktop e mobile.
- **Filosofia de cor:** grafite para reduzir ruído, ciano para janelas/estado ativo e âmbar para cooldowns/sinais; cores não serão o único canal de informação.
- **Paradigma de layout:** timeline horizontal ampla como superfície principal, seletor compacto de operativos e painel de leitura lateral que recolhe em viewport estreito; evitar uma grade centralizada de cartões.
- **Elementos assinatura:** escala de ticks, linhas de telemetria e arcos/contornos inspirados no Ring.
- **Interação:** selecionar até quatro operativos para uma composição; hover/foco em um segmento revela horários e regra; scrubber muda o instante; botões de horizonte e filtros atualizam API e gráficos.
- **Animação:** transições curtas e discretas; respeitar `prefers-reduced-motion`.
- **Tipografia:** sans-serif legível para conteúdo e monoespaçada para números, ticks e IDs.
- **Essência/voz:** “Sincronize habilidades. Leia as janelas.” Personalidade: precisa, tática, transparente. Microcopy concisa e sem sugerir resultados não medidos.
- **Marca:** wordmark textual “KHAAOS // SYNERGY LAB”, com marca vetorial geométrica simples inspirada em duas janelas de timeline sobrepostas.
- **Cor de assinatura:** ciano de telemetria.

## Premissas de simulação
- Agenda-base determinística: cada habilidade é ativada em `t=0` e novamente quando o cooldown termina; o dashboard também permite filtrar ou inspecionar janelas.
- Duração de efeito é diferente de cooldown. Stun de Soraya Hadd usa 1,5 s de controle efetivo, embora o estado da habilidade dure 2 s.
- Sinais instantâneos de Ring/terminal podem usar uma janela de interação analítica de 5 s, explicitamente rotulada como convenção do modelo, não duração no jogo.
- O relatório mede interseção de intervalos de habilidades complementares; não estima dano, vitória, geometrias, linha de visão, nem comportamento dos jogadores.
- O modo online não sincroniza habilidades de operativos atualmente; reconhecer que as marcações/regras locais referem-se aos bots onde aplicável.

## Backend e interface
- FastAPI oferece roster/metadata e endpoint de simulação com horizonte validado e lista de IDs válidos; respostas incluem timestamps, intervalos, cooldown, duração e regras de sinergia com rationale.
- Frontend exibe todos os 16 por padrão em uma timeline; composição selecionável destaca os pares, comparação completa oferece visão das 120 duplas, e painel de detalhes lista cooldowns/ativações/tempo de sobreposição.
- Estados de erro, vazio e carregamento; controles com labels, navegação por teclado e visualização utilizável em viewport móvel.
