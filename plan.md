# Khaaos Run — Vertical Slice CIGKV

## Objetivo

Transformar a base de lore e regras do repositório em uma primeira experiência jogável de navegador, sem remover os documentos originais. O slice cobre o loop mínimo do Campo de Instrução de Guerra: escolha de entrada Zu, movimentação, combate, bots, pilhagem, fechamento do Ring, terminais ZEX, crafting e tela de resultado.

## Arquitetura

- `index.html`: HUD QG-War’I, modal de entrada Zu, arena e painéis de missão.
- `src/main.js`: simulação determinística por frame lógico de 50 ms, entidades, colisões, progressão e renderização Canvas 2D.
- `src/styles.css`: sistema visual cyber-militar responsivo.
- `public/manus-routes.json`: manifesto de rota do protótipo.
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

## Próxima evolução

A base atual é single-player local. A próxima camada deve separar simulação/renderização, adicionar seed de partida, armas com atributos reais, persistência de loadout e uma camada multiplayer authoritative server antes de qualquer economia real.
