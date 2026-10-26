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

## Modo 3D — Battle Royale FPS (ritmo Free Fire/Fortnite)

`index.html` (raiz do runtime) inicia o **modo 3D** em primeira pessoa (FPS) sobre a simulação determinística `src/game3d/sim3d.js`, renderizada com Three.js. `?view=tps` mantém a câmera anterior para comparação e regressão visual. `classic.html` preserva o modo tático 2D original. O build é multi-página (`vite.config.js`) e o deploy do GitHub Pages publica ambos (`/` 3D, `/classic.html` 2D).

| Sistema | Módulo | Responsabilidade |
|---------|--------|------------------|
| Simulação headless | `src/game3d/sim3d.js` | Movimento, balística com convergência de mira, IA dos bots (patrulha→engajar→caçar), zona em pulsos, loot, terminais ZEX, replay/snapshot. Determinística por seed (mesma sequência de RNG da trilha 2D). |
| Layout procedural | `src/game3d/layout3d.js` | Distritos (Pátio de Armamento, Proving Grounds, Parque Abandonado, Setor Industrial, Terminal ZEX), colliders AABB, pontos de loot/spawn. Mesma seed ⇒ mesmo mundo. |
| Mundo | `src/game3d/world3d.js` | Céu de crepúsculo (paleta Mystic Chaos), sol com sombras PCFSoft, fog, terreno, estruturas, grama instanciada, parede do anel (shader). |
| Entidades | `src/game3d/entities3d.js` | Operativos humanoides articulados (8 tons de pele canônicos), arsenal low-poly por arma, loot com feixe de raridade, terminais ZEX. |
| Efeitos/Áudio | `src/game3d/effects3d.js`, `audio3d.js` | Tracers, muzzle flash, impactos, sangue + SFX WebAudio 100% procedurais (tiro por arma, hitmarker, pulso, heartbeat). |
| HUD | `src/game3d/hud3d.js` | Barras VL/VD, munição, minimapa com anel atual/alvo, killfeed, crosshair dinâmico, objetivos, modais ZU/Marechal, controles touch. |

**Controles desktop:** `WASD` mover · `Mouse` mirar/atirar · `RMB` mira precisa (ADS) · `Shift` correr · `Espaço` saltar · `R` recarregar · `E` coletar/interagir · `Q` medkit · `G` granada FRAG · `F` Gloo Wall · `1`/`2` slots · `ESC` liberar mouse.
**Controles touch:** joystick virtual à esquerda, botões de ação (fogo, ADS, salto, recarga, coleta, medkit, 💣 granada, 🧊 gloo) à direita.

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
snap de teleport, morte). `node --test test/phase4.test.js` cobre a Fase 4 (infiltração aérea
determinística, granada com dano radial/attenuação por parede via `rayAabb`, Gloo Wall bloqueando
movimento/balas e expirando, throw/gloo autoritativos com replicação no snapshot, anti-cheat dos
one-shots e predição durante a queda). `node --test test/server3d.test.js` valida o end-to-end real
(login HTTP → matchmaking 3D → partida com inputs → anti-cheat → isolamento 2D/3D → healthz).

### Infiltração Aérea + Arremessáveis Táticos + Realismo PBR (Fase 4)

| Sistema | Módulo | Comportamento |
|---------|--------|---------------|
| Infiltração aérea | `src/game3d/sim3d.js` | `start()` lança todos os operativos de `DROP_START_Y=140m`: queda livre (`sky`, cap −52 m/s) até 45 m, abertura automática do paraquedas (`chute`, cap −9 m/s), aterrissagem em tempo finito. Física em `stepActorMovement` — sim offline, `MatchRoom3D` e preditor replicam exatamente. No ar não há tiro/coleta/arremesso; deriva horizontal ×2,6 direciona o destino. Opção `airdrop: false` preserva partidas de solo (usada pelos testes das fases 1–3). |
| Granada FRAG | `sim3d.js` + `room3d.js` | Item looteável (`kind: 'frag'`, cap 3, 1 no spawn). Tecla `G` (one-shot `throw`): projétil balístico com gravidade, quique amortecido (0.38) em chão/AABBs, pavio de 2,2 s. Explosão: 110 de dano no epicentro, decaimento linear até 9 m, atenuação ×0.25 quando `rayAabb` encontra parede entre epicentro e alvo (auto-dano incluído). Granada também desgasta Gloo Walls no raio. |
| Gloo Wall | `sim3d.js` + `room3d.js` | Item looteável (`kind: 'gloo'`, cap 2, 1 no spawn). Tecla `F` (one-shot `gloo`): parede 4×3×0.4 m a 2,2 m à frente (rotação 0/90°), HP 220, dura 60 s. Entra nos colliders dinâmicos (`physicsWorld`): bloqueia movimento, balas (desgastam o HP — impacto `kind: 'gloo'`), LOS e granadas. Deploy rejeitado sobre collider existente. Expiração/destruição emitem `glooDown` e removem o collider. |
| Replicação online | `server/room3d.js` + `net3d.js` | Snapshot expõe `grenades` (interpolação posicional no cliente) e `walls` (id/x/z/rot/hp). Eventos `airdrop`, `land`, `frag`, `explosion`, `gloo`, `glooDown` entregues por raio. Anti-cheat `validateInput3D` valida `throw`/`gloo` como booleanos. Preditor local respeita as paredes autoritativas (colliders reconstruídos por snapshot, sem mutar o layout cacheado). |
| Realismo PBR | `textures3d.js` + `world3d.js` | Normal maps procedurais (Sobel sobre o canvas de cor) para concreto/metal/terreno/asfalto — relevo real sob o sol. `scene.environment` via PMREM+RoomEnvironment (metais refletem de verdade, intensidade sutil 0.35). Vegetação instanciada (46 árvores em 2 draw calls + 30 pedras) fora dos distritos, decorativa (sem colisão — sim idêntica). 14 nuvens de crepúsculo com deriva lenta. |
| Apresentação | `entities3d.js`, `effects3d.js`, `audio3d.js`, `hud3d.js` | Paraquedas procedural (dossel + suspensórios, só na fase `chute`), pose de queda com braços abertos; granada com LED do pavio piscando e tombo em voo; gloo com animação de deploy (ease-out) e brilho que decai com o HP. Explosão: bola de fogo + fumaça + debris + luz + tremor de câmera proporcional à distância. Áudio 100% procedural: vento de queda, abertura do paraquedas, aterrissagem, whoosh do arremesso, detonação (sub-bass + estilhaços), cristalização do gloo. HUD: altímetro com marca de abertura (45 m), contagens 💣/🧊 com teclas, botões touch novos. |

### Agachamento, Espectador e Impactos de Combate (Fase 5)

| Sistema | Módulo | Comportamento |
|---------|--------|---------------|
| Agachar | `src/game3d/sim3d.js` + `server/antiCheat.js` | Tecla `C` (toggle; touch segura ⤓): velocidade ×0.5, dispersão ×0.72, sprint cancelado enquanto agachado (e `jump` prevalece no frame do salto). `stepActorMovement` marca `a.crouching` (só no chão, nunca em queda/airdrop) — sim offline, `MatchRoom3D` e preditor replicam a mesma física. Snapshot replica `crouching` em `player` e `others`; `validateInput3D` aceita apenas booleano. Pose procedural: coxas à frente, joelhos dobrados, tronco −0.34 m; câmera desce de 1.62 m para ~1.15 m com interpolação. |
| Combate bot-vs-bot | `sim3d.js` | A IA agora seleciona o ator vivo mais próximo COM linha de visão — jogador OU outros bots (antes só o jogador). O ring fica vivo: combates distantes acontecem sem o jogador. Alvo sob camuflagem (`concealment`) é ignorado na seleção. |
| Modo espectador | `sim3d.js` + `room3d.js` + `main3d.js` + `hud3d.js` | Após a eliminação, a partida CONTINUA: o cliente entra em transmissão (`enterSpectate`) seguindo outro operativo vivo (←/→ ou botões ‹ › alternam; ✕ encerra). `KhaaosSim3D({ spectate: true })` segue até o último vivo/tempo; `MatchRoom3D` só encerra por tempo, último vivo ou sala vazia (humanos mortos permanecem recebendo snapshots — evento `eliminated` agora traz `placement`, e `matchEnd` traz `winner`). Tela final mostra posição (#N) e vencedor do ring. Legado `spectate: false` preservado (testes das fases 1–4). |
| Impactos de combate | `effects3d.js` + `main3d.js` | Orifícios de bala persistentes em paredes/Gloo (sprites escuros com rotação aleatória, fade em 7 s, pool de 30 com reciclagem). Sangue/projeção de impacto mantidos do pool de partículas. |
| FIX crítico de balística | `sim3d.js` + `room3d.js` | **Os projéteis dos bots nasciam NaN desde a Fase 3**: o tiro bot passava `{tx,ty,tz}` sem a origem do cano — `dir.tx - undefined = NaN` — e nenhum bot jamais acertou um tiro (offline E online). O disparo agora passa `ox/oy/oz` do `#muzzle`. Com o fix, bots realmente acertam (dano ×0.55 e erro humano preservados — dificuldade justa). |

### Aprimoramento Gráfico — personagens e cenário nível FreeFire (Fase 6)

| Sistema | Módulo | Comportamento |
|---------|--------|---------------|
| Operativos detalhados | `src/game3d/entities3d.js` + `textures3d.js` | Modelo humanoid completo em primitivas: rosto PINTADO por textura procedural (olhos/sobrancelhas/boca com tom de pele/olho/cabelo do catálogo), capacete tático com trilhos + mount NVG + faixa de óculos reflexiva (ou boina com cabelo), colete com 3 pouches de carregador + rádio com antena, cinto com coldre, ombreiras/cotoveleiras/joelheiras, luvas, botas com sola, mochila com bedroll e faixa reflexiva emissiva. Camuflagem procedural (4 paletas com trama de tecido e tiling sem emenda) coerente com a cor do colete. API `parts`/`animateOperative` PRESERVADA (zero mudança em sim/rede/testes). |
| Animação enriquecida | `entities3d.js` | Respiração no idle, sway de tronco no passo, cabeça acompanhando, braços com fase própria — mesmas assinaturas da Fase 5 (crouch/morte/queda intactos). |
| Arsenal enriquecido | `entities3d.js` | Massas de mira (front + rear), trilhos com slots, carregadores curvos, coronhas/mobiliário com pintura camuflada, luneta com lente emissiva (Barrett), bipé, muzzle brake, vents de energia (Pulse), serrilhas (G19). Muzzle marker inalterado (balística intocada). |
| Rig FPS com luvas | `entities3d.js` | Mãos enluvadas com dedos à mostra agarrando a arma, mangas camufladas, punho e peitoral do colete — materiais por instância (o recolor do seletor não vaza para outros operativos). |
| Viação urbana | `detail3d.js` + `world3d.js` + `textures3d.js` | Estradas com faixa central amarela tracejada, bordas brancas, remendos e rachaduras; calçadas de lajes nas duas margens; faixas de pedestre na saída da praça. Roteamento determinístico: cada distrito recebe um ponto de aproximação com linha de visada limpa da praça (varredura de direções giradas) e joelhos contornam estruturas — nenhuma estrada termina dentro de um galpão. Anel de perímetro liga os 4 distritos. |
| Fachadas detalhadas | `detail3d.js` + `world3d.js` | Portas com batente, faixas de janelas emissivas por andar (3 buckets de tamanho), ACs no topo com grade, caixas d'água com tampa cônica em torres, tubulações verticais e placas de setor (ARMAMENTO/SUPRIMENTOS/PROVING/CIVIC) — tudo como decoro SEM colliders, anexado ao mesh da estrutura (herda rotação). |
| Props instanciados | `detail3d.js` + `world3d.js` | Postes de luz com cabeça emissiva, barris em pé/deitados com anéis e ferrugem, pneus, pilhas de sacos de areia (3 peças), paletes e barricadas Jersey — InstancedMesh com colocação determinística fora de colliders/loot (mín. 2,4 m entre props). |
| Natureza e horizonte | `world3d.js` | Copas com cor POR INSTÂNCIA (4 tons de oliveira/outonal via `setColorAt`), troncos com inclinação orgânica, arbustos baixos, grama em DUAS tonalidades, cordilheira de fundo procedural (4 painéis com silhueta de cristas tingida pelo horizonte do cenário). |
| Iluminação PBR | `world3d.js` + `textures3d.js` | Envmap gerado do PRÓPRIO céu do cenário (PMREM de mini-cena com céu + solo tintado — antes: RoomEnvironment genérico) → reflexos coerentes com o crepúsculo; `environmentIntensity` 0.45. Cache de materiais (memo) evita regeneração de canvas por operativo. |
| Testes | `test/graphicsdetail.test.js` | 11 testes da lógica pura: estradas conectam os 4 distritos sem atravessar colliders no chão, props fora de colliders/loot com tipos conhecidos, fachadas dentro dos limites da estrutura (monólito/caixas excluídos), determinismo por seed e paleta de copas fechada. |

### Squad com Revive (DBNO), Salas Privadas e Polimento de Combate (Fase 7)

| Sistema | Módulo | Comportamento |
|---------|--------|---------------|
| DBNO / knockdown | `src/game3d/sim3d.js` (`DBNO`, `knockActor`, `stepRevive`) | No modo squad, dano letal NÃO elimina: o operativo cai NOCAUTEADO (rasteja a 42% da velocidade, não atira/coleta/salta) e sangra por 45 s — cada nocaute subsequente sangra 28% mais rápido (`bleedOutDecay` 0.72). Dano recebido já caído é letal (finalização); caído sob a zona do anel também morre. |
| Revive | `sim3d.js` + `server/room3d.js` | Aliado do MESMO esquadrão, de pé, que segurar INTERAGIR (E) a até 2,4 m canaliza 3,2 s e restaura 40% da vida. Soltar E ou sair do alcance zera o progresso. Bots aliados (offline) buscam e resgatam companheiros caídos (IA de resgate). Online, o revive é canalizado por inputs reais do humano. |
| Squads | `assignSquads` + `room3d.js` | Grupos de 4 por ordem de entrada: offline o jogador lidera o `sq-1` com 3 bots aliados (nametags VERDES); bots inimigos formam `sqE-*` e não cruzam fogo amigo. Salas privadas sempre são squad. |
| Salas privadas | `server/matchmaking.js` + `server/server.js` + `net3d.js` | `create_private` cria sala squad com código de convite de 6 caracteres (alfabeto sem ambíguos 0/O/1/5/8/B); `join_private` aceita o código normalizado (case-insensitive, ignora pontuação). Códigos inválidos/cheios/iniciados → `private_not_found`. UI no modal ZU (modo online): CRIAR SALA / ENTRAR com código. |
| HUD de nocaute | `hud3d.js` + `index.html` + `styles3d.css` | Overlay NOCAUTEADO com barra de sangramento em tempo real, barra de progresso do revive ("REVIVENDO…"), prompt contextual ([E] SEGURE para reviver / REVIVENDO VOCÊ — %), killfeed com marcador "◌ NOCAUTE". |
| Balanceamento dos bots | `BOT_COMBAT` (sim3d.js, consumido por sim + room) | Pós-fix NaN: tempo de reação de 0,38–0,8 s ao adquirir alvo, erro de mira crescendo com a distância (0,5 m base → teto 1,35 m), rajadas de 2–5 tiros (antes 3–6), pausa entre rajadas 1,25–2,7 s e dano em decaimento por distância (0.55 boca do cano → 0.34 a 64 m). Bots continuam letais de perto e toleráveis de longe. |
| Assets GLTF reais | `scripts/build-gltf-assets.mjs` + `assets3d.js` + `world3d.js` | Pipeline real de assets: gerador de glTF 2.0 (geometria com normais + buffer base64 embutido) produz `public/assets/models/{barrel,crate,cone,barrier}.gltf`; `GLTFLoader` busca com base-aware (`import.meta.env.BASE_URL`), memoiza e aplica clones por prop. Qualquer falha de fetch mantém o fallback procedural — zero regressão. |
| Sombras de contato | `textures3d.js` + `world3d.js` | Blob shadow radial (textura procedural em cache) sob TODOS os props (postes/barris/pneus/sacos/paletes/barricadas/caixotes/cones), árvores e pedras — 1 InstancedMesh com stagger anti z-fighting; ancora os objetos no chão independentemente do shadow map. |
| Acessórios por operativo | `entities3d.js` | `createOperative({ variant })` deriva por hash determinístico: bandana/lanterna de capacete/antena/meia-máscara, óculos empurrados, faca embainhada/patch emissivo/granada no colete, bandoleira, cantil, pouch de coxa e faixa de braço — cada operativo tem identidade visual estável. |
| Skins de arma por raridade | `entities3d.js` + `sim3d.js`/`room3d.js` | Arma coletada registra `weaponSkin` (raridade do loot); o furniture é tingido com a cor da raridade + brilho emissivo + gema no receiver (COMUM cinza → LENDÁRIO dourado). Skin viaja no snapshot (self/others) e some ao trocar de slot. |
| LOD mobile | `quality3d.js` | Tiers low/medium/high (?q= tem precedência; touch ou deviceMemory ≤ 4 GB → low): pixelRatio 1.2–1.75, shadow map 1024–2048, grama 35–100%, árvores 55–100%, nuvens 7–14, bloom off no low. Sombras de contato permanecem (custo de 1 draw call). |
| Ajuste visual | `world3d.js` | Sol menos saturado (#ffc98f, 2.35), hemisfério reforçado (1.18) amarrando chão ao céu, fill suave (0.72), fog calibrada — contraste cinematográfico sem lavar sombras; +30% de densidade de props com caixotes (crates) junto a depósitos e cones nas radiais. |
| Testes | `test/squad3d.test.js` (25) + smoke `scripts/smoke-private-3d.mjs` | Helpers de DBNO, squads determinísticos, nocaute/bleed-out/finalização offline e online (room), revive por input, caído sem tiro, snapshot com knocked/squad/skin, códigos de convite (formato/normalização/eligibilidade), tiers de qualidade. Smoke ao vivo: sala privada ponta a ponta (criar → código → entrar → partida squad → nocaute autoritativo → revive por input). |

### Identidade Operativa Online, Habilidades Autoritativas, Céu Dinâmico e Tráfego Urbano (Fase 8)

| Sistema | Módulo | Comportamento |
|---------|--------|---------------|
| Identidade do operativo online | `server/room3d.js` + `server/server.js` + `net3d.js` | O cliente declara o operativo com `set_operative` (mensagem WS; também reenviada em match_found/private_created/joined e no start). O servidor valida contra o catálogo (apenas em LOBBY) e replica `operativeId` no snapshot self/others (`op`). Bots recebem operativo determinístico do RNG da sala — paleta, acessórios e rosto são renderizados pelo `b.op` do snapshot (fallback: paleta hash do id para clientes legados). |
| Habilidades autoritativas | `server/room3d.js` + `operativeAbilities.js` | As 16 habilidades do catálogo agora são resolvidas PELO SERVIDOR no modo online: Q/toque envia `input.ability` (booleano aceito pelo `validateInput3D`). Efeitos autoritativos: heal (+VL com teto), dash (orçamento de 8 m via `abilityDistanceBudget`), speed (multiplicador no passo do ator), precision (multiplicador no spread do `#fire`), damageReduction e ringResistance (mitigação no `#damage`), temporaryArmor (soak antes da armadura fixa, expira zerando), recon (marca `revealedTicks` nos bots → minimapa), stun (bot congelado, sem mover/atirar), concealment (IA perde o alvo ocultado), ringRead/ringForecast/terminalScan (eventos com dados do anel/terminal). Bloqueadas caído, no ar (infiltração) e em cooldown; cooldown/duração avançam no TEMPO DO ATOR (dt do input, igual à sim offline) e viajam no snapshot como `abilityState.cooldownTicks/activeTicks` (convenção 30 Hz). |
| HUD de habilidade online | `hud3d.js` + `main3d.js` | O chip de habilidade funciona nos dois modos: cooldown lido do `abilityState` do snapshot ("Q · 54,6 s" / "Q · PRONTA"); evento `ability` chega a humanos próximos com `by`/`isSelf` (feed "HABILIDADE" distingue o próprio disparo do de outro operativo); minimapa desenha contatos de recon (`revealed` do snapshot). |
| Céu dinâmico dia/noite | `skyPhase.js` (puro) + `world3d.js` + `main3d.js` | Cada pulso do Ring aprofunda a noite (5 pulsos = noite profunda): shader do céu mistura por banda para paleta noturna (zênite #060913, horizonte roxo-tempestade), estrelas ganham peso, halo/disco solar cedem; fog, sol (2.35 → 0.5, cor vira "lua" #8ea6ff), hemisfério/fill/back escurecem e janelas emissivas brilham +50%. Cliente interpola ~12 s por transição; `applyNightness` é idempotente (re-aplica só quando muda > 0.001). |
| Tráfego urbano estático | `detail3d.js` + `world3d.js` | Carros e vans abandonados nas faixas das estradas (mão dupla, ~1 a cada 34 m × densidade do tier), alinhados à via, com 6 cores, cabine escura, rodas low-poly e sombras de contato. Determinístico por seed; sem colisão (decoração) e afastados de loot/estruturas ≥ 4,5 m e entre si ≥ 9 m. Tier low reduz a densidade (0.45). |
| Login da plataforma no ZU | `index.html` + `online3d.js` + `styles3d.css` | Modal ZU ganha caixa CONEXÃO // QG-WAR'I: aparece sem `kr_token` ou no status "LOGIN NECESSÁRIO"; autentica via `POST /auth/login`, salva o token e reconecta o matchmaking 3D — sem recarregar a página. |
| Testes | `test/online-identity.test.js` (23) + smoke `scripts/smoke-fase8-3d.mjs` | Identidade (setOperative/validação/LOBBY-only/snapshot self+others), todos os efeitos autoritativos (heal/dash/speed/precision/damageReduction/temporaryArmor/recon/stun/concealment/ringResistance/bloqueios), anticheat do campo ability, tráfego (determinismo/corredores limpos/espaçamento) e céu (nightness/interpolação). Smoke ao vivo: sala privada → identidade sincronizada (self + 14 bots) → dano de zona → HEAL autoritativo (+VL) → cooldown no snapshot → ring.pulse p/ céu. |

### VFX/SFX de Habilidade para Remotos, Paraquedistas Intocáveis e Protocolo de Ordem de Jogo (Fase 9)

| Sistema | Módulo | Comportamento |
|---------|--------|---------------|
| VFX/SFX de habilidade para remotos | `effects3d.js` + `audio3d.js` + `main3d.js` + `sim3d.js`/`room3d.js` | O evento `ability` agora carrega a posição do caster (`x/y/z`) além de `effect`, `by` e `isSelf` — offline e online. O cliente desenha a aura no caster (anel de solo aditivo que expande e some em 0,55 s + coluna de partículas ascendente + brilho pontual no peito) com cor por família de efeito (heal verde, speed/dash ciano, precision âmbar, armor aço, recon azul, stun violeta, ringRead laranja, terminalScan verde) e toca uma assinatura sonora sintetizada por família (whoosh, shimmer, sonar, zap, clank, chirp) com atenuação por distância (raio de 90 m no online). |
| Paraquedistas intocáveis | `sim3d.js` (`DROP_ENGAGEMENT`) + `server/room3d.js` | Rebalance da letalidade contra paraquedistas com tabela única offline/online: queda livre ('sky') NUNCA é engajada; paraquedas aberto só é engajável abaixo de 18 m (últimos metros da descida) com erro ×2 e dano ×0.45; pós-pouso existe janela de "impacto de pouso" de 1,5 s (`landGraceT`, decai no `stepActorMovement`) com erro ×1.6 e dano ×0.55. Helpers puros `botCanEngage`/`botTargetModifiers` são consumidos pela IA da sim e da sala — nenhum operativo morre no céu. |
| POJ — Protocolo de Ordem de Jogo | `src/game3d/poj.js` (motor puro) | Regramento canônico determinístico em 11 artigos: alistamento → 50% (500.000) abre o CIGKV → 1.000.000ª inscrição fecha o alistamento e arma contagem de 24 h → guerra em 4 mundos × 7 dias (Barburhen → Priadus → Ckesalth → Arukheea) → desempate do 11º. Preceito fundamental: UMA vida — morreu, eliminado, `sem_reingresso`. Artigos 7º/9º: os 3 Oficiais de Classe Especial entram no 7º dia de Arukheea (>100.000 sobreviventes → mínimo 3 min por Ring; últimas 6 h por faixa: >1000 → 5 min, 750–1000 → 3 min, 500–750 → 1 min, <500 → não entram). Artigo 8º: evasão nas primeiras 12 h do 7º dia — mais de 3 evasões → Corte Marcial. Artigo 10º: última hora com convocação obrigatória — desobediência → Corte Marcial. Anti-covardia: zero incursões em qualquer mundo → Corte Marcial. Desempate: Patente → Incursões → Kills → XP → Decisão do Marechal (duelo/combate/missão de sobrevivência, sorteados por seed determinística). Constantes comprimíveis (`daySeconds`, `enlistmentTotal`) para simulações e staging. |
| POJ na superfície HTTP | `server/poj.js` + `server/server.js` + `rbac.js` | `/poj/state` público (fase, inscritos, CIGKV, mundo/dia, sobreviventes, plano dos oficiais, janelas dos artigos 8º/9º/10º); `/poj/register` com identidade do token (patente validada na hierarquia de 10 patentes); `/poj/attend` e `/poj/eliminate` por si (player) ou por id (admin); `/poj/summon`, `/poj/close`, `/poj/advance`, `/poj/champion` e `/poj/court-martial` sob permissão nova `poj:command` (RBAC + auditoria). Erros com códigos estáveis (`alistamento_encerrado`, `inscricao_duplicada`, `sem_reingresso` → 403, `fora_de_guerra` → 409). |
| Painel POJ no modal ZU | `index.html` + `online3d.js` + `styles3d.css` | O modal de inserção ganha a faixa FASE / INSCRITOS / CIGKV / MUNDO / DIA / SOBREVIVENTES, que lê `/poj/state` (proxy vite incluso) a cada 15 s — o alistamento e o avanço da guerra ficam visíveis antes de entrar no ring. |
| Testes | `test/drop-engagement.test.js` (12) + `test/poj-protocol.test.js` (22) + `test/poj-server.test.js` (1 integração HTTP) | Proteção da queda (sky/chute alto intocáveis, chute baixo com teto de dano, janela de pouso), payload de posição no evento de habilidade (offline/online) e paridade do bloqueio no ar; os 11 artigos do POJ com tempo comprimido (alistamento, CIGKV, contagem, covardia, oficiais, evasão, hora final, desempate e determinismo do Marechal); superfície HTTP com RBAC e preceito da vida única. Suíte completa: **262 testes → 250 pass / 0 fail / 12 skipped**. |
| Smokes e staging | `scripts/smoke-fase9-3d.mjs` + `scripts/staging-smoke-fase9.sh` | Smoke F9: cast autoritativo com payload de VFX/SFX (posição + effect), infiltração sem dano no ar (42 amostras, dano 0) e ciclo POJ completo por REST (alistamento → contagem → guerra → incursão → baixa sem reingresso). Staging: servidor em perfil de staging (gate `KR_READY_MAX_CONNECTIONS`) com sondas `/readyz`, `/healthz`, `/poj/state`, ciclo POJ comprimido e `STAGING_OK`; suítes legadas verdes (SMOKE_OK, PRIV_SMOKE_OK, F8_SMOKE_OK). |

### Ponte Partida→POJ, Oficiais de Classe Especial no Ring e Patente do Perfil (Fase 10)

| Sistema | Módulo | Comportamento |
|---------|--------|---------------|
| Ponte partida → POJ | `server/poj.js` (`reportMatchResult`) + `server/server.js` (`handleMatchEnd`) | O fim de cada incursão REAL (MatchRoom3D) alimenta o protocolo automaticamente: cada partida espelha UMA incursão própria (summon → attend → close). Sobreviventes comparecem (`attend`); caídos consomem a ÚNICA vida (`died: true` → `sem_reingresso`); kills/XP viram carreira (`reportCareer`). Idempotente por `matchId` (cache com teto de 2000 partidas; repetição devolve `replay: true`). Jogador sem identidade resolvida ou não alistado é SKIPPED — nunca inventamos alistamento. O fechamento usa `evaluateAbsentees: false` (aditivo no motor): quem não esteve na sala NÃO é evasor — os artigos 8º/10º continuam punindo ausência apenas nas incursões canônicas convocadas pelo Marechal. Falha é contida: o POJ nunca derruba a recompensa nem o tick. |
| Oficiais de Classe Especial no Ring | `src/game3d/officers.js` (puro) + `server/room3d.js` + `sim3d.js` | Os 3 oficiais canônicos (OCE-VALKON / OCE-MORRAK / OCE-SYLVEX) são entidades de elite jogáveis: a sala recebe `officerPlanFn` (função injetada — `() => pojService.officerPlan()`, consultada no início da partida) e implanta os oficiais ACIMA do botFill quando o 7º/9º artigo autoriza. Combate de elite derivado de `BOT_COMBAT` (`officerCombatParams`): reação ×0.55, erro humano ×0.55, rajadas disciplinadas, dano ×0.9 — mesma curva de decaimento, nunca dano inflado. Blindagem/velocidade próprias (50–70 / 5.05–5.5). Retirada autoritativa: ao fim de `minutesPerRing` × 60 s eles SAEM do Ring (`officers_departed`) sem crédito de kill para ninguém — "por no mínimo 3 minutos por Ring" vira duração exata. Respeitam a proteção de paraquedistas da Fase 9 e entram na infiltração aérea. Prévia offline: `?officers=1` (plano demonstrativo do 9º — 5 min). |
| Patente do perfil (liderança) | `src/shared/rank.js` (puro, compartilhado) + `server/server.js` (`/profile`) | A hierarquia canônica do POJ vira progressão de carreira: KRC acumulado no ledger define a patente (Recruta 0 → Soldado 500 → Cabo 1.500 → Sargento 3.500 → Sargento-Mor 7.000 → Tenente 12.000 → Capitão 20.000 → Major 32.000 → Coronel 50.000 → General 75.000). `GET /profile` devolve `{ patente, peso, nextPatente, xpForNext, progress, krc, poj }` (qualquer sessão autenticada lê o PRÓPRIO perfil); `/poj/register` sem patente explícita deriva a inicial da progressão KRC. `rankProgress` casa 1:1 com `PATENTE_HIERARQUIA`/`pesoPatente` — o 1º critério de desempate do 11º artigo usa exatamente esta tabela. |
| Render dourado dos oficiais | `main3d.js` + `styles3d.css` | Oficiais recebem paleta canônica dourada (colete #b98a1e, variant OCE_OFFICER), nametag com moldura/texto dourado (#ffd75e) e escala maior; o snapshot carrega `officer`/`officerCallsign` por ator. Feed HUD: `officers_deployed` (artigo + nomes) e `officers_departed` entram no canal POJ. |
| Chip PATENTE no painel POJ | `index.html` + `online3d.js` + `styles3d.css` | A faixa do modal ZU ganha o chip dourado PATENTE (ex.: "Soldado · 0% p/ Cabo"), alimentado por `/profile` a cada ciclo de 15 s; proxy vite incluso. |
| Testes | `test/officers.test.js` (11) + `test/poj-link.test.js` (8) + `test/rank.test.js` (4) | Catálogo/implantação/combate de elite/retirada dos oficiais (puro + sala real + paridade offline), ponte partida→POJ (attend/eliminate/carreira, idempotência, `sem_reingresso`, não-punição pela ponte × Corte Marcial canônica na última hora) e limiares da patente. Suíte completa: **285 testes → 273 pass / 0 fail / 12 skipped**. |
| Smokes e staging | `scripts/smoke-fase10-3d.mjs` + `scripts/staging-smoke-fase10.sh` | Smoke F10 in-process: sala real → oficiais implantados e retirados → partida encerra → KRC concedido (500 → Soldado) → POJ com presença/queda/carreira (`attended=2 eliminated=1`) → idempotência. Staging: servidor real valida `/profile` 401/200, patente automática no alistamento, ciclo POJ comprimido, `officerPlan` no estado e `STAGING_OK`; suítes legadas verdes (SMOKE_OK, PRIV_SMOKE_OK, F8_SMOKE_OK, F9_SMOKE_OK). |

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

### Testes reais e resiliência de adapters

Os adapters reais (`PostgresSessionStore`, `RedisRateStore`) têm cobertura opt-in contra servidores de verdade — em CI, o job **Game Runtime Tests** provisiona `postgres:16-alpine` e `redis:7-alpine`, aplica as migrações e executa:

```bash
npm run test:real         # persistência de sessão e atomicidade INCR+PEXPIRE reais
npm run test:resilience   # falha de dependência, timeout e recuperação
```

O `test:resilience` cobre exatamente os modos de falha esperados em produção:

- **Falha de dependência**: store apontando para dependência inacessível rejeita `ready()` (o `/readyz` vira `503`), em tempo limitado.
- **Timeout**: host non-routable respeita `connectionTimeoutMillis`/`connectTimeout` e rejeita sem travar o processo.
- **Recuperação**: perda forçada das conexões no servidor (`pg_terminate_backend` no Postgres, `CLIENT KILL` no Redis) é absorvida pelo pool/client — a operação seguinte reconecta sozinha e os dados persistem.
- **Expiração**: sessões vencidas ficam invisíveis para `getSession` e são removidas do banco por `cleanupExpired()`.

Para rodar localmente com dependências efêmeras:

```bash
docker compose -f ../docker-compose.test.yml up -d
export KR_DATABASE_TEST_URL='postgresql://test:test_pw@127.0.0.1:55432/khaaos_test'
export KR_REDIS_TEST_URL='redis://127.0.0.1:56379'
npm run db:migrate && npm run test:real && npm run test:resilience
```

Fluxo: `GET /auth/oidc/start` → 302 para o IdP com `state` single-use (cookie `HttpOnly` `SameSite=Lax`) e `nonce`; `GET /auth/oidc/callback?code&state` valida state (cookie ∩ query, TTL de 10 min, single-use), troca o código, verifica o `id_token` e provisiona o usuário (`preferred_username`/`email`, role `player` por padrão) emitindo a sessão KR. Cobertura: `test/security.test.js` (8 testes — rotação, revogação, TLS real com certificado openssl e fluxo OIDC contra um IdP HTTP local real).

## Ping real, readiness e autoscaling por região

O `/readyz` deixou de ser booleano e passou a executar **sondas reais** por dependência com latência medida (`SELECT 1` no Postgres, `PING` no Redis), timeout por sonda (`2 s`) e cache curto (`5 s`) para não martelar o banco a cada checagem:

```json
{ "status": "ready", "checks": { "sessionStore": true, "rateStore": true },
  "latencyMs": { "sessionStore": 2, "rateStore": 1 },
  "load": { "connections": 12, "queue": 0, "maxConnections": 200 } }
```

- **Ping real de operação**: `GET /admin/ping` força sondas frescas (sem cache) de todas as dependências — é o roundtrip de verdade, útil para dashboards e paginador.
- **Gate de saturação (backpressure no readiness)**: com `readyGate: { maxConnections }` (ou `KR_READY_MAX_CONNECTIONS`), a instância passa a responder `503 { status: "overload" }` acima do limite vivo de conexões — sai da rotação do balanceador antes de degradar, e volta sozinha ao esvaziar.
- **Autoscaling por região**: cálculo puro em `server/autoscale.js` sobre o estado de salas — utilização por região (jogadores/assentos), fila global distribuída na região mais cheia e recomendação determinística (`scale_out` ≥ 85% ou com fila; `scale_in` < 30% sem fila; `ok` na banda saudável). Exposto publicamente em `/healthz` (`regions[]`) e com thresholds em `GET /admin/regions`.
- `server/health.js` é agnóstico de adapter: qualquer dependência com `ready()` entra no monitor (`sessionStore`, `rateStore`, audit store persistente).

Cobertura: `test/health-autoscale.test.js` (5 testes — latência real, `probe_timeout`, monitor padrão, recomendação por região e ponta a ponta com gate de saturação).

## RBAC com auditoria e permissões por recurso

Catálogo declarativo em `server/rbac.js` — única fonte de verdade de autorização:

| Permissão | player | moderator | admin |
|---|---|---|---|
| `room:join` / `room:start` / `room:input` | ✔ (restrito à própria sala) | ✔ | ✔ |
| `admin:metrics` | — | ✔ (payload sem dados por usuário) | ✔ (completo) |
| `audit:read` | — | ✔ | ✔ |
| `keys:rotate` | — | — | ✔ |

- **Por recurso**: permissões `room:*` respeitam o escopo da identidade — `can(identity, 'room:start', roomId)` nega sala alheia; o WebSocket aplica a guarda no `start` e responde `{ type: 'forbidden', permission }`.
- **HTTP**: negativas viram `403 { error: 'forbidden', permission }` (antes `401` — autenticado ≠ autorizado). Token legacy de operações continua válido como `admin`.
- **Auditoria append-only** (`server/audit.js`): ring buffer em memória com ids monotônicos + persistência opcional `PostgresAuditStore` (`KR_AUDIT_STORE=postgres`, migração `002_audit_events.sql`). Eventos: `auth.login` (allow/deny), `auth.logout`, `auth.oidc`, `key.rotate`, `key.drop`, `room.start` (por sala), `rbac.deny` (HTTP e WS, toda negativa é registrada; allows só em operações sensíveis para não gerar ruído).
- **Consulta**: `GET /admin/audit?actor=&action=&outcome=&sinceId=&limit=` (exige `audit:read`), paginação estável por id.

## Multi-instância, falha de processo, soak e fault injection

O runtime é horizontal por design: sessões vivem no store compartilhável e o rate limit é atômico entre réplicas. A camada de resiliência operacional cobre:

- **Multi-instância**: duas réplicas simultâneas compartilham o store em arquivo (ou Postgres/Redis em produção). Jogador da réplica A reconectando na réplica B degrada de forma graciosa — salas são por processo, então a sessão vira alocação nova, **nunca erro**.
- **Falha de processo e reconnect pós-restart**: o `resumeToken` persistido sobrevive ao encerramento; a instância que sobe em seguida aceita o jogador de volta (alocação nova, sem crash).
- **Fail-fresh na leitura de sessão**: store indisponível na conexão não bloqueia a entrada — o jogador entra novo e `metrics.storeReadFailures` sinaliza a degradação.
- **Fail-open no rate limit**: Redis fora não derruba a partida; inputs continuam fluindo e `metrics.rateStoreFailures` expõe o período sem limite para alarme.
- **Auditoria nunca bloqueia**: audit store quebrado é engolido silenciosamente — login e RBAC seguem normais.
- **Soak com duração limitada**: 12 jogadores com churn contínuo (sai 1 / entra 1 a cada 300 ms), invariâncias de fluxo de snapshots, fila vazia, contadores consistentes e zero rejeições não tratadas. `KR_SOAK_MS` estende a duração em ambientes de soak reais.

Cobertura: `test/multiinstance.test.js` (2), `test/fault-injection.test.js` (3) e `test/soak.test.js` (1, aceita `KR_SOAK_MS`).

## Painel anti-cheat

```bash
http://localhost:8787/admin.html
```

Com JWT admin, o painel atualiza a cada segundo com conexões, autenticações falhas, rate limits, violações, bans, sessões, fila, regiões, salas e clientes suspeitos. A API é `GET /admin/metrics` com `Authorization: Bearer <jwt>`.

Para observabilidade de infraestrutura, `GET /healthz` é um liveness público e não consulta dependências lentas. `GET /readyz` é um readiness público que confirma a presença dos adapters obrigatórios de sessão e rate limit. O WebSocket limita payloads a 16 KiB, desativa compressão por mensagem e encerra conexões que acumularem mais de 256 KiB de saída pendente.

## Economia virtual e compliance (KRC)

Contrato definido em `docs/economy-compliance.md` e aplicado por código em `server/economy.js`: moeda única **KRC** (soft currency de gameplay), **sem compra, venda, saque, carteira, resgate ou custódia** — `REAL_MONEY_ENABLED` é `false` congelado e `assertRealMoneyDisabled()` falha alto em qualquer trilha de valor real.

- **Ledger de dupla entrada append-only**: todo lançamento move valor inteiro positivo de uma conta para outra (`treasury:rewards` → `player:*`, `player:*` → `treasury:spends`); saldo é derivado, nunca mutado; correção é lançamento de reversão. Implementações: `Ledger` (memória) e `PostgresEconomyStore` (`KR_ECONOMY_STORE=postgres`, migração `003_economy_ledger.sql`).
- **Idempotência por chave única** (`idempotency_key` no banco): retry nunca duplica prêmio — replay devolve o lançamento original.
- **Teto diário por jogador** (`KR_ECONOMY_DAILY_CAP`, padrão 250.000 KRC) com `economy_cap_exceeded` auditado; concessão é permissão `economy:grant` (admin) na matriz RBAC.
- **Odds publicadas obrigatórias**: sorteio sem `registerOdds()` não rola (`requireOdds` → `odds_not_published`); probabilidades fora de 1 são rejeitadas — transparência de loot box antes de qualquer mecânica de azar existir.
- **Leitura só do próprio ledger**: `/economy/balance` e `/economy/history` derivam a conta do token (`actor.sub`), nunca de parâmetro; `/economy/grant` exige `economy:grant`; `/economy/compliance` (admin) reporta moeda, integridade do ledger, odds publicadas e guards ativos.

Cobertura: `test/economy.test.js` (6 testes — ledger, idempotência, teto, bloqueio de valor real, odds, HTTP ponta a ponta + PostgreSQL opt-in).

## Testes

```bash
npm test
npm run test:infra
npm run test:stress
```

Os testes cobrem assinatura/RBAC, persistência, reconexão, escolha regional, rate limiting compartilhado entre duas instâncias e 24 conexões WebSocket autenticadas em múltiplas salas.

Antes de produção ainda é necessário: multi-instância com falha de processo/soak/fault injection, economia e compliance, e observabilidade distribuída (traces/logs agregados).
