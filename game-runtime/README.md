# Khaaos Run

Vertical slice jogável do **Campo de Instrução de Guerra Khaaos Ville (CIGKV)** com simulação modular, seeds reproduzíveis, catálogo de armas, loot ponderado e backend authoritative multiplayer.

## Escopo e instalação
Este pacote é um runtime JavaScript independente, com `package.json` e `package-lock.json` próprios. Ele não é iniciado pelo servidor web da raiz e não inicializa nem integra automaticamente o servidor Unreal Engine.

Execute a partir da raiz do repositório:
```bash
npm ci --prefix game-runtime
npm --prefix game-runtime run dev
npm --prefix game-runtime test
```
Dentro deste diretório, os comandos equivalentes são `npm ci`, `npm run dev` e `npm test`. Use `npm ci` para respeitar o lockfile; `npm install` fica reservado a alterações intencionais de dependências.

O desenvolvimento local e os testes unitários não exigem a configuração dos adapters PostgreSQL/Redis. Testes/adapters reais e execução server-side com persistência exigem serviços e variáveis explicitamente configurados.

## Modo 3D — Battle Royale TPS (FreeFire-style)

`index.html` (raiz do runtime) inicia o **modo 3D**: terceira pessoa (TPS) sobre a simulação determinística `src/game3d/sim3d.js`, renderizada com Three.js. `classic.html` preserva o modo tático 2D original. O build é multi-página (`vite.config.js`) e o deploy do GitHub Pages publica ambos (`/` 3D, `/classic.html` 2D).

| Sistema | Módulo | Responsabilidade |
|---------|--------|------------------|
| Simulação headless | `src/game3d/sim3d.js` | Movimento, balística com convergência de mira, IA dos bots (patrulha→engajar→caçar), zona em pulsos, loot, terminais ZEX, replay/snapshot. Determinística por seed (mesma sequência de RNG da trilha 2D). |
| Layout procedural | `src/game3d/layout3d.js` | Distritos (Pátio de Armamento, Proving Grounds, Parque Abandonado, Setor Industrial, Terminal ZEX), colliders AABB, pontos de loot/spawn. Mesma seed ⇒ mesmo mundo. |
| Mundo | `src/game3d/world3d.js` | Céu de crepúsculo (paleta Mystic Chaos), sol com sombras PCFSoft, fog, terreno, estruturas, grama instanciada, parede do anel (shader). |
| Entidades | `src/game3d/entities3d.js` | Operativos humanoides articulados (8 tons de pele canônicos), arsenal low-poly por arma, loot com feixe de raridade, terminais ZEX. |
| Efeitos/Áudio | `src/game3d/effects3d.js`, `audio3d.js` | Tracers, muzzle flash, impactos, sangue + SFX WebAudio 100% procedurais (tiro por arma, hitmarker, pulso, heartbeat). |
| HUD | `src/game3d/hud3d.js` | Barras VL/VD, munição, minimapa com anel atual/alvo, killfeed, crosshair dinâmico, objetivos, modais ZU/Marechal, controles touch. |

**Controles desktop:** `WASD` mover · `Mouse` mirar/atirar · `RMB` mira precisa (ADS) · `Shift` correr · `Espaço` saltar · `R` recarregar · `E` coletar/interagir · `Q` medkit · `1`/`2` slots · `ESC` liberar mouse.
**Controles touch:** joystick virtual à esquerda, botões de ação (fogo, ADS, salto, recarga, coleta, medkit) à direita.

## Modo Online 3D — Battle Royale autoritativo

`index.html?online=1` inicia o **modo multiplayer**: o servidor (`server/room3d.js`) roda a
`MatchRoom3D` — autoridade total de movimento, balística, zona, loot e eliminação para
todos os operativos (humanos + bots preenchendo o ring até a capacidade). O cliente envia
somente inputs e interpreta snapshots interpolados, com o mesmo contrato
"simulação headless → renderizador burro" do modo offline.

| Sistema | Módulo | Responsabilidade |
|---------|--------|------------------|
| Sala autoritativa | `server/room3d.js` | `MatchRoom3D`: humanos + bots (IA engajar/caçar/patrulhar), zona em pulsos, balística projetil-a-projetil com headshot ×1.75, loot/terminais compartilhados, eventos por jogador, snapshot filtrado por espectador. Reutiliza os helpers de física de `sim3d.js` (mesmas constantes e colisões do offline). |
| Anti-cheat 3D | `server/antiCheat.js` | `validateInput3D`: seq monotônica, vetor de movimento ≤ 1.01, pitch ±1.4, taxa de yaw ≤ 14 rad/s (com wrap), tipos estritos dos one-shots, `clientDt`. Violações alimentam o `ViolationTracker` existente (ban no limiar). |
| Matchmaking por modo | `server/matchmaking.js` | `chooseRoom(rooms, region, capacity, mode)`: salas 2D e 3D nunca se misturam; `mode` vem do query `?mode=3d` do handshake WS. |
| Transporte | `server/server.js` | Tick 20 Hz compartilhado, broadcast de snapshot por cliente (eventos embutidos), `ping`/`pong` para RTT, rate limit por modo (2D 30 msg/s, 3D 90 msg/s — `KR_INPUT_LIMIT`), `resume` reconstrói sessão por 15 s. |
| Cliente de rede | `src/game3d/net3d.js` | `NetClient3D`: login HTTP + WS `?token&mode=3d`, inputs a 30 Hz, buffer de 3 snapshots com interpolação (delay 110 ms), reconexão com backoff e `kr_resume_3d`. |
| Jogo online | `src/game3d/online3d.js` | `OnlineGame3D` (estende `Game3D`): `Sim3DView` traduz snapshots para o contrato da sim local — renderizador, HUD e áudio do offline funcionam sem fork; yaw/pitch da câmera permanecem locais (responsivos), posição vem do servidor. |

**Fluxo de desenvolvimento (2 terminais):**
```bash
KR_DEV_AUTH=1 npm run server          # terminal 1 — API + WS na :8787 (usuários kr_player/kr123 e kr_admin/kr123)
npm run dev                            # terminal 2 — Vite na :5173 com proxy /ws, /auth, /admin
```
Abra `http://localhost:5173/?online=1`, faça login (`kr_player`/`kr123` no console:
`await window.KhaaosOnline3D.net.constructor.login('', 'kr_player', 'kr123')`) — ou grave o JWT
em `localStorage.kr_token` antes de abrir. Em produção (`/auth/login` + `localStorage.kr_token`),
o fluxo é idêntico ao do cliente online 2D.

**Notas de segurança:** `KR_DEV_AUTH=1` é apenas para desenvolvimento local (nunca em produção);
produção continua usando `KR_USERS_JSON`/Postgres como documentado acima. O input 3D passa pelo
mesmo pipeline de validação/strikes/ban do 2D, e snapshots nunca expõem `ai`/inventário de terceiros.

### Netfeel — predição, reconciliação e lag compensation (Fase 3)

| Sistema | Módulo | Comportamento |
|---------|--------|---------------|
| Movimento compartilhado | `src/game3d/sim3d.js` | `stepActorMovement(a, input, dt, world)` é a ÚNICA implementação de cinemática — usada pela `MatchRoom3D`, pela sim offline e pela predição do cliente (cliente e servidor jamais divergem na física). |
| Fila de inputs + ack | `server/room3d.js` | `input()` enfileira por `seq` (rejeita replay/duplicado, cap 60); cada tick processa até `MAX_INPUTS_PER_TICK=3` inputs com `dt=1/30` — drena rajadas sem permitir speedhack. O snapshot expõe `player.ackSeq` (último seq processado). |
| Predição client-side | `src/game3d/predict3d.js` | `LocalPredictor` prevê o movimento local no exato instante do input; a cada snapshot rewinda para o estado autoritativo no `ackSeq`, replays os inputs pendentes e converte o erro em um offset visual com decaimento exponencial (correção suave, sem rubber band). Drift > 8 m (teleport/spawn) faz snap seco. Morte segue o servidor. |
| Lag compensation | `server/room3d.js` | Histórico de posições por tick (buffer ~1,3 s). Tiro humano é testado contra as posições rebobinadas de `rtt + 110 ms (interp) + 25 ms (meia tick)` — "atira onde vê, acerta onde vê". Bots atiram no estado vivo atual; vítima morta no presente não recebe dano retroativo. `rayCharacter` agora respeita a base `y` do ator (acerto real em alvos no ar). |
| RTT no input | `net3d.js` / `antiCheat.js` | Cliente embute `rtt` (medido via ping/pong) no input; anticheat valida o tipo, servidor faz clamp [0, 600] ms e usa na lag compensation. |

**Realismo "Live Action" (render):** `src/game3d/postfx3d.js` encadeia
`RenderPass → UnrealBloomPass → grade cinematográfico → OutputPass` — bloom sutil,
vinheta, grão de filme animado, contraste/saturação leves e tinta de cinema
(sombras frias, altas luzes quentes) sobre o tone mapping ACES existente.
`?fx=0` desliga o pipeline (fallback render direto); touch usa qualidade reduzida.
O disparo próprio adiciona recuo visual à câmera (`camKick`, não afeta a mira).

**Testes:** `node --test test/sim3d.test.js` cobre a sim offline (determinística de mundo/loot,
movimento+colisão, balística corpo/headshot ×1.75, pulsos e dano de zona, coleta, recarga, fim de
partida, replay e snapshot roundtrip). `node --test test/room3d.test.js` cobre a sala autoritativa,
o anti-cheat 3D, a fila de inputs (`ackSeq`, cap anti-speedhack), e a lag compensation (rewind
acerta a posição passada; alvo fora do rewind não é atingido). `node --test test/predict3d.test.js`
cobre a predição (réplica exata do servidor, replay de pendentes, offset visual com decaimento,
snap de teleport, morte). `node --test test/server3d.test.js` valida o end-to-end real (login HTTP →
matchmaking 3D → partida com inputs → anti-cheat → isolamento 2D/3D → healthz).

## Relação com a aplicação web e UE5
A aplicação principal (`server/`, `client/`, `shared/`) e `game-runtime/` têm manifests, processos e scripts distintos. A trilha UE5 é um componente C++ separado. Este repositório ainda não documenta aqui um protocolo versionado nem uma jornada integrada validada entre esses componentes. Consulte [`../Unreal/README.md`](../Unreal/README.md) e [`../docs/ROADMAP.md`](../docs/ROADMAP.md) para o estado e os gates pendentes.

## Autenticação e RBAC

O servidor usa tokens assinados HMAC-SHA256 com expiração, hash de senha `scrypt` e papéis `player`, `moderator` e `admin`. Configure produção com `AUTH_SECRET` forte e `KR_USERS_JSON` contendo usuários pré-provisionados com `passwordHash` gerado por `hashPassword`.

```bash
AUTH_SECRET='segredo-longo' ADMIN_TOKEN='chave-legada-temporaria' KR_SESSION_STORE=postgres KR_DATABASE_URL='postgresql://runtime:senha@db:5432/khaaos_runtime' KR_RATE_STORE=redis REDIS_URL='redis://redis:6379' npm run server
```

O login é feito em `POST /auth/login` com `{ "username": "...", "password": "..." }`. WebSocket exige `?token=...`. O painel administrativo exige token JWT com role `admin`; o `ADMIN_TOKEN` existe apenas como compatibilidade operacional temporária.

## Cliente online, reconexão e regiões

```bash
npm ci
npm run dev
```

Abra `/?online=1` depois de salvar o JWT em `localStorage.kr_token`, ou use `NetworkClient.login('/...', username, password)`. O cliente envia somente inputs, conecta no `/ws`, guarda o `resumeToken` e reconecta automaticamente com backoff. Sessões ficam reservadas por 15 segundos para retomada.

O matchmaking usa `region` do token (`sa-east`, `us-east` ou `eu-west`) e latências reportadas, agrupando jogadores apenas em salas compatíveis. Salas têm capacidade padrão de 16.

## Persistência e rate limiting

Em produção, o runtime usa `PostgresSessionStore` quando `KR_SESSION_STORE=postgres`, com `KR_DATABASE_URL`/`DATABASE_URL`, migração versionada em `migrations/001_runtime_sessions.sql` e expiração no banco. O rate limiter usa `RedisRateStore` quando `KR_RATE_STORE=redis`, com `REDIS_URL`/`KR_REDIS_URL`; cada incremento executa `INCR` e `PEXPIRE` na mesma operação Lua, compartilhando contadores entre réplicas. O `DurableJsonStore` e `SharedMemoryRateStore` permanecem apenas para desenvolvimento/testes explícitos.

Para levantar dependências reais localmente:

```bash
docker compose -f docker-compose.real.yml up -d
export KR_DATABASE_URL='postgresql://runtime:runtime_dev_only@127.0.0.1:55433/khaaos_runtime'
export REDIS_URL='redis://127.0.0.1:56379'
npm run db:migrate
npm run test:real
KR_SESSION_STORE=postgres KR_RATE_STORE=redis npm run server
```

## Painel anti-cheat

```bash
http://localhost:8787/admin.html
```

Com JWT admin, o painel atualiza a cada segundo com conexões, autenticações falhas, rate limits, violações, bans, sessões, fila, regiões, salas e clientes suspeitos. A API é `GET /admin/metrics` com `Authorization: Bearer <jwt>`.

Para observabilidade de infraestrutura, `GET /healthz` é um liveness público e não consulta dependências lentas. `GET /readyz` é um readiness público que confirma a presença dos adapters obrigatórios de sessão e rate limit. O WebSocket limita payloads a 16 KiB, desativa compressão por mensagem e encerra conexões que acumularem mais de 256 KiB de saída pendente.

## Testes

```bash
npm test
npm run test:infra
npm run test:stress
```

Os testes cobrem assinatura/RBAC, persistência, reconexão, escolha regional, rate limiting compartilhado entre duas instâncias e 24 conexões WebSocket autenticadas em múltiplas salas.

Antes de produção ainda é necessário substituir o arquivo JSON por storage transacional, conectar um adapter Redis real, usar TLS, adicionar rotação de chaves, SSO/RBAC operacional, matchmaking por ping real e observabilidade distribuída.
