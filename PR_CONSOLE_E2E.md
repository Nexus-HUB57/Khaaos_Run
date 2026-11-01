# Inventário técnico — Sistemas Battle Royale (paridade não validada)

> **Status em 25/10/2026:** este documento registra sistemas descritos no código-fonte e metas de projeto. Não é um benchmark, uma aprovação de build Unreal nem uma demonstração de paridade com Free Fire, Fortnite ou consoles comerciais.

## Resumo de evidências

O inventário histórico descreve quatro fases, 39 arquivos e 7.041 linhas adicionadas. Esses números são metadados do resumo original, não uma validação independente do conteúdo final. Há classes C++ e testes de lógica portáveis no repositório, mas o ambiente de revisão não contém Unreal Editor, `.uasset`, `.umap`, `.pak`, `.utoc` ou `.ucas`; também há 17 marcadores `*_pending_import` em `Unreal/KhaaosRun/Content`. Portanto, integração em `UWorld`, interface renderizada, replicação em rede real, cook, FPS e qualidade visual continuam sem prova executável aqui.

## Sistemas listados no código-fonte

| Área | Componentes descritos | O que isso comprova | O que ainda não comprova |
|---|---|---|---|
| Rede/Iris | `KhaaosReplicationBudget`, `KhaaosIrisConfig` e propriedades replicadas | Há implementação C++ declarada | Perfil Iris ativo em build, perda de pacote, latência, servidor dedicado ou teste de 50/100 jogadores |
| Fluxo da partida | Match-flow FSM, airdrop, deploy e previsão de círculo | Há classes e parâmetros de design | Partida completa jogável, mapa carregado, widgets configurados ou ciclo de zona validado no Editor |
| Performance | Orçamentos, LOD e significance | Existem perfis e código de escalabilidade | Calibração em PS5/XSX/Switch/PC, captura de frame-time ou estabilidade sustentada |
| Combate/UX | Inventário, revive, kill feed, spectator e anti-cheat | Há componentes/testes de lógica | Sensação de mira, legibilidade do HUD, controle por plataforma, segurança em servidor ou resultado de playtest |
| Conteúdo visual | Fontes de meshes, texturas e VFX | Há arquivos-fonte e relatórios de geração | Importação Unreal, materiais finais, animações, Niagara, iluminação, cook ou avaliação em jogo |

## Metas de plataforma — não são resultados

Os alvos de FPS, quantidade de jogadores visíveis, sombras e distância de visão abaixo são especificações presentes no documento original. Nenhum deles deve ser divulgado como desempenho medido sem hardware, build, mapa, preset, resolução, duração do ensaio e captura de frame-time identificados.

| Perfil planejado | Alvo declarado | Status de validação |
|---|---:|---|
| PS5 / XSX | 60 FPS, até 60 jogadores visíveis | Não medido |
| Switch 2 | 30 FPS, até 30 jogadores visíveis | Não medido |
| PC High | 120 FPS, até 100 jogadores visíveis | Não medido |
| PC Medium | 60 FPS, até 60 jogadores visíveis | Não medido |
| Mobile | 30 FPS, até 20 jogadores visíveis | Não medido |

## Inventário de funcionalidades

Os itens do checklist abaixo indicam apenas presença declarada no código-fonte; não certificam paridade funcional, visual ou de desempenho com outro jogo.

- [x] Código-fonte de anel multi-fase e easing.
- [x] Código-fonte de airdrop e deploy/parachute.
- [x] Código-fonte de previsão de zona para minimapa.
- [x] Código-fonte de spectator, revive/downed e inventário de seis slots.
- [x] Código-fonte de kill feed e verificações anti-cheat.
- [x] Código-fonte de budgets de performance e replicação adaptativa.
- [ ] Build Unreal 5.8 limpa e mapa jogável carregado.
- [ ] HUD/minimapa e VFX observados dentro do jogo.
- [ ] Cook/package e teste de rede em ambiente dedicado.
- [ ] Sessões de playtest com telemetria de combate, estabilidade e UX.
- [ ] Benchmarks comparáveis e autorizados para qualquer alegação de paridade externa.

## Testes

O resumo histórico enumera 24 casos para zona, combate e smoke/integration. Os testes portáveis de lógica podem verificar regras determinísticas no host, mas não são equivalentes a Unreal Automation Tests executados em mundo UE. Até haver logs de uma build/editor, a contagem histórica de casos não deve ser descrita como teste end-to-end de uma partida renderizada.

## Critério para voltar a usar “paridade”

Antes de afirmar “console quality”, “paridade Free Fire/Fortnite” ou desempenho por plataforma, registrar: (1) hash/versão do build Unreal; (2) mapa e conteúdo importado; (3) hardware, resolução e preset; (4) cenário reproduzível e número de jogadores; (5) p50/p95/p99 de frame-time e RTT; (6) resultados de playtest de UX/combate; e (7) fonte e metodologia do benchmark externo. Até lá, os termos corretos são **meta de design** e **implementação em código-fonte**.
