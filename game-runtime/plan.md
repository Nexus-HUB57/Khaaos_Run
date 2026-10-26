# Khaaos Run — Vertical Slice CIGKV

## Objetivo

Transformar a base de lore e regras do repositório em uma primeira experiência jogável de navegador, sem remover os documentos originais. O slice cobre o loop mínimo do Campo de Instrução de Guerra: escolha de entrada Zu, movimentação, combate, bots, pilhagem, fechamento do Ring, terminais ZEX, crafting e tela de resultado.

## Arquitetura atual

- `index.html`: HUD do runtime 3D, seleção de cenário/operativo, modal Zu e painéis de missão.
- `src/game3d/main3d.js`: cliente Three.js, entrada do usuário, renderização dos atores e integração com a HUD.
- `src/game3d/sim3d.js`: simulação determinística de combate, Ring, loot, progressão curta, snapshot e replay.
- `src/game3d/layout3d.js` e `src/game3d/scenarios.js`: layout procedural determinístico, setores, spawn e regras por cenário.
- `src/game3d/world3d.js` e `src/game3d/styles3d.css`: apresentação do mundo e identidade visual da interface.
- `Content/Avatars/avatar_catalog.json`: catálogo canônico compartilhado dos 16 operativos; o runtime usa paletas para renderizar a seleção e o modelo jogável.
- `src/game3d/operativeAbilities.js`: catálogo declarativo, com uma habilidade ativa balanceável por operativo; `sim3d.js` resolve efeitos e timers por ticks determinísticos.
- Documentos legados (`Mundos`, DOCX e INI/redistribuíveis): preservados como fonte de lore e contexto histórico.

## Design

### Movimento
Cyber-militar brutalista com tensão de arena de extração: concreto escuro, indicadores de instrumentação e verde ácido de comando.

### Princípios
1. **Leitura em primeiro lugar:** vida, defesa, ring e intenção do objetivo ficam sempre visíveis.
2. **Ameaça sistêmica:** o mapa e o anel pressionam tanto quanto os bots.
3. **Recompensa legível:** cada coleta comunica o recurso, o ganho e o próximo upgrade.
4. **Ritual de operação:** termos como ZU, ZEX, Accur e Packbag dão identidade ao universo.

### Paleta e tipografia
- Fundo carvão `#080a0d` e painéis de metal `#10151a` para sensação de bunker.
- Verde ácido `#c8ff3d` como assinatura de comando e progresso.
- Laranja `#ff6b2c` para equipamento/risco; vermelho `#ff3d52` para dano.
- `Barlow Condensed` em títulos e `Space Mono` em telemetria.

### Interação e animação
Ações diretas e reversíveis: WASD, mouse, E para interação e F para oficina. O Ring fecha progressivamente, pulsos mudam a ameaça e o rádio registra cada consequência.

## Conteúdo jogável entregue nesta fatia

- CIGKV permanece o cenário padrão e preserva o spawn de treino original.
- Barburhen tem uma primeira arena local de escala protótipo, com setores Urbano, Estação Fria, Parque Ferrífero e Usina Industrial, além do Terminal ZEX. A composição inclui landmarks de edifícios e estação, paleta fria, spawn próprio e loot associado ao setor.
- O Ring causa 1,5× de dano e abates concedem 1,5× de KRC no protótipo de Barburhen. A seleção de cenário fica no modal inicial; o cenário escolhido também é gravado em snapshots e replays.
- Os 16 operativos canônicos estão selecionáveis. A escolha aparece no HUD e aplica tons de pele e colete ao modelo 3D.
- Os 16 operativos têm habilidades ativas distintas no modo local: dash limitado a 8 m; mitigação de dano direto; reconhecimento de bots no minimapa; cura limitada; leitura/previsão informativa do pulso; precisão; aumento de velocidade; camuflagem contra detecção de bots; blindagem temporária; resistência ao Ring; scan do terminal ZEX mais próximo; e interrupção de bots sem dano. Cooldowns, efeitos temporizados e inputs ficam registrados no replay determinístico.
- A HUD mostra habilidade e cooldown; Q ativa a habilidade e H usa kit médico. No touch há botão dedicado para habilidade. O online mantém as habilidades indisponíveis, sem enviar o novo campo ao servidor nem simular autoridade que ainda não existe.
- A escala de Barburhen continua sendo uma arena demonstrativa de 400 m, não o mundo final de 12 km/100 jogadores. Priadus, Ckesalth e Arukheea agora possuem previews locais selecionáveis, com setores, identidade ambiental, spawn e multiplicador próprios; continuam sendo previews da arena procedural, não mapas finais de produção.
- Habilidades ainda precisam de protocolo autoritativo, sincronização/anti-cheat e balanceamento multiplayer; estações completas, efeitos de inverno/blizzard e replicação/matchmaking multi-world também seguem pendentes.

## Próxima evolução

Expandir as interações próprias dos setores de cada preview, começando por Barburhen; então definir contrato e resolução autoritativa das habilidades no servidor/UE5, estabelecer métricas de balanceamento e sincronizar estados, cooldowns e eventos com anti-cheat. A base local single-player não substitui persistência de loadout nem suporte multiplayer escalável.
