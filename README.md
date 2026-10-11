# Khaaos Run

Vertical slice jogável do **Campo de Instrução de Guerra Khaaos Ville (CIGKV)** com simulação modular, seeds reproduzíveis, catálogo de armas, loot ponderado e backend authoritative multiplayer.

## Cliente local e online

```bash
npm install
npm run dev
```

- Modo local: abra o endereço padrão do Vite.
- Modo online authoritative: abra `/?online=1`. O cliente conecta em `/ws`, entra no matchmaking, envia apenas inputs e interpola a posição entre snapshots do servidor.
- O campo `SEED` no HUD controla o modo local. No modo online a seed é definida pela sala.

## Servidor e matchmaking

```bash
ADMIN_TOKEN=troque-esta-chave MATCH_SEED=CIGKV-ONLINE PORT=8787 npm run server
```

O servidor escuta HTTP e WebSocket em `:8787`. Salas são criadas automaticamente, com capacidade padrão de 16 jogadores. Cada cliente recebe uma sala, um estado authoritative e snapshots a 20 Hz. A posição, dano, munição, tiro, loot e Ring são decididos no backend; o navegador nunca é a fonte de verdade.

## Painel anti-cheat

Abra `http://localhost:8787/admin.html`, informe `ADMIN_TOKEN` e conecte. O painel atualiza a cada segundo com conexões, mensagens, rejeições, violações, bans, filas, salas, jogadores e clientes suspeitos. A API protegida é `GET /admin/metrics?token=...`; em produção, substitua o token simples por autenticação administrativa real e HTTPS.

## Replay e seeds

No modo local, use no console do navegador:

```js
const replay = window.KhaaosReplay.export();
window.KhaaosReplay.load(replay);
```

A mesma seed reproduz spawn de bots, loot e evolução procedural.

## Testes

```bash
npm test
npm run test:stress
```

Os testes cobrem RNG, loot, replay, anti-cheat, matchmaking concorrente e snapshots para múltiplos jogadores. O stress test abre 24 clientes simultâneos e verifica a distribuição em salas.

O sistema é uma fundação de desenvolvimento: ainda precisa de autenticação, matchmaking com regras de região/ping, persistência, escalabilidade horizontal, rate limit distribuído, observabilidade e revisão de segurança antes de produção.
