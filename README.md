# Khaaos Run

Vertical slice jogável do **Campo de Instrução de Guerra Khaaos Ville (CIGKV)** com simulação modular, seeds reproduzíveis, catálogo de armas, loot ponderado e servidor WebSocket authoritative.

## Rodar o cliente

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite. O campo `SEED` no HUD inicia a mesma partida procedural. Para build:

```bash
npm run build
```

## Rodar o servidor authoritative

Em outro terminal:

```bash
MATCH_SEED=CIGKV-REPLAY-01 npm run server
```

O servidor escuta `ws://localhost:8787`, executa o tick fixo de 20 Hz, controla a simulação, aceita inputs com sequência monotônica e rejeita vetores de movimento, mira, timing e mensagens inválidas. O servidor mantém a autoridade sobre posição, munição, dano, loot, ring e resultado.

## Sistema de replay

O domínio compartilhado em `src/shared/simulation.js` grava cada input com tick, seed e taxa de simulação. No console do navegador:

```js
const replay = window.KhaaosReplay.export();
// salvar JSON.stringify(replay)
window.KhaaosReplay.load(replay);
```

A mesma seed produz o mesmo spawn de bots, loot e evolução procedural. O replay deve ser usado como evidência de partida e base para testes de regressão.

## Catálogo e loot

`src/shared/weapons.js` define pistola 9MM, M4, MP5, Barrett MRAD MK22, rifle de pulso e lança de sucata, com dano, cadência, alcance, munição, carregador, raridade e peso. O loot é rolado por zona (`armory`, `industrial`, `park`, `extraction`) com raridade ponderada e seed determinística.

## Testes

```bash
npm test
```

Os testes cobrem RNG, loot por seed, raridade, reconstrução de replay e validação anti-cheat.

Este projeto ainda é um protótipo local: não há conta, blockchain, dinheiro real ou persistência de inventário. A camada multiplayer atual é uma fundação authoritative de desenvolvimento e precisa de autenticação, matchmaking, persistência e observabilidade antes de produção.
