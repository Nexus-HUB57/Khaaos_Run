# Plano de refatoração de concorrência e locks Redis

**Projeto:** Khaaos_Run  
**Data:** 2026-10-27  
**Escopo:** locks Redis, matchmaking distribuído, fechamento de ranking e recovery do Marshal Council.

## 1. Resumo executivo

A auditoria confirmou quatro condições de corrida de alta gravidade:

1. `DistributedState.releaseLock()` fazia `GET` seguido de `DEL`; um processo pausado podia apagar o lock adquirido por outro processo.
2. `renewRoomOwner()` fazia `GET` seguido de `PEXPIRE` e identificava o proprietário somente por `nodeId`; um worker antigo podia renovar a lease de um novo proprietário.
3. O matchmaking mantinha entradas importadas de Redis depois de elas serem removidas por outro nó e, em falha de criação do lobby, restaurava somente o mapa local.
4. O ranking aplicava alterações de stats e gravava o resultado em operações separadas, sem uma chave de idempotência por `(room_id, user_id)`.
5. O recovery do Marshal Council transformava jobs antigos em `queued` sem fencing token; workers antigos ainda podiam gravar resultados.

A primeira etapa aplicada nesta branch corrige o núcleo Redis, o rollback do matchmaking, o claim idempotente do ranking e o fencing de councils. O lifecycle de renovação de ownership de salas e a cobertura de testes Redis continuam como próximos passos.

## 2. Invariantes de segurança

As seguintes propriedades devem ser verdadeiras em todos os nós:

- Somente o token atualmente armazenado na chave pode liberar ou renovar um lock.
- Expiração de uma lease invalida definitivamente o token antigo; nenhum retry tardio pode recuperar ownership.
- Um enqueue mais novo nunca pode ser sobrescrito por rollback de um match antigo.
- Uma entrada ausente no hash Redis não pode continuar sendo casada por um snapshot local importado.
- Um jogador pode receber no máximo um resultado de ranking por partida.
- Stats e histórico de ranking devem ser confirmados na mesma transação.
- Um council só pode aceitar resultado do `attempt_id` que detém a lease vigente.
- Resultado de worker obsoleto deve ser descartado sem alterar estado ou propostas.

## 3. Scripts Lua Redis

### 3.1 Release compare-and-delete

```lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
```

**Contrato:** `KEYS[1]` é a chave do lock e `ARGV[1]` é o token completo. O script é uma operação indivisível: depois de validar o token, a exclusão ocorre no mesmo ciclo do Redis. Retorno `1` significa que o owner liberou o lock; `0` significa token ausente, expirado ou pertencente a outro owner.

### 3.2 Renew compare-and-expire

```lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
```

**Contrato:** a lease só é renovada quando o token ainda é exatamente o valor da chave. O cliente deve tratar retorno `0` como perda de ownership e interromper a operação protegida; não deve tentar renovar novamente com o mesmo token.

### 3.3 Acquire

O acquire continua usando `SET key token NX PX ttl`, que já é atômico. O token deve ser único por aquisição, por exemplo `nodeId:randomUUID()`. `nodeId` sozinho não é fencing token suficiente porque duas aquisições do mesmo processo podem ter o mesmo identificador lógico.

### 3.4 Ownership de salas

`setRoomOwner(roomId)` passa a gravar o token de aquisição, e `renewRoomOwner(roomId, token)` recebe ou recupera esse token. O token precisa ser retido pelo dono local enquanto a sala estiver ativa. A renovação deve ocorrer com margem: iniciar quando restar menos que 1/3 do TTL e nunca bloquear o event loop por tempo superior ao restante da lease.

A próxima etapa deve adicionar uma rotina de lifecycle explícita em `RoomManager`:

1. guardar `{ roomId, token, timer }` somente após acquire bem-sucedido;
2. renovar periodicamente com o token;
3. se renovar retornar `false`, marcar a sala como não autoritativa e interromper mutações;
4. cancelar o timer ao destruir a sala;
5. nunca assumir ownership novamente sem um novo token.

## 4. Matchmaking distribuído

### Alterações aplicadas

- `dequeue(userId)` agora sempre executa `HDEL`, mesmo que a entrada não exista no mapa local.
- O tick remove do mapa local entradas importadas sem socket quando elas desaparecem do hash Redis.
- Rollback de criação usa `HSETNX` (`restoreQueueEntryIfAbsent`) para não sobrescrever um enqueue posterior do mesmo jogador.
- O release do lock do tick agora usa compare-and-delete Lua.

### Próxima etapa recomendada

O claim de candidatos deve carregar uma geração/epoch no valor Redis. O fluxo ideal é:

1. ler candidatos;
2. adquirir lock determinístico de claim;
3. remover somente os valores cuja geração ainda coincide;
4. criar lobby;
5. em falha, restaurar somente via `HSETNX` ou CAS da mesma geração;
6. publicar `match_found` somente depois de confirmar o lobby e ownership da sala.

A solução de longo prazo é substituir snapshots de hash por uma fila Redis com claim explícito, mas o CAS por geração é uma transição compatível e menor.

## 5. Ranking idempotente

### Migration planejada

Adicionar:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS match_results_room_user_uq
  ON match_results (room_id, user_id);
```

Antes da migration, executar uma consulta de diagnóstico para detectar duplicatas existentes e decidir uma política de retenção. A migration deve falhar fechada se houver duplicatas não tratadas, em vez de criar uma constraint incorreta.

### Contrato de storage planejado

Criar `applyMatchRankingAtomic(roomId, participant)` em uma transação:

1. inserir/claimar o resultado com `ON CONFLICT (room_id, user_id) DO NOTHING`;
2. se não inseriu, ler o resultado já persistido e retornar replay sem alterar stats;
3. bloquear a linha `player_stats` com `FOR UPDATE`;
4. calcular o novo estado a partir da linha bloqueada;
5. atualizar stats e inserir o resultado dentro da mesma transação;
6. retornar `created` ou `replay`.

O ranking de todos os participantes deve calcular o field average uma vez, mas cada participante precisa ser aplicado por transação idempotente. Se for necessário atomicidade do grupo inteiro, envolver todos os participantes em uma única transação com ordenação determinística dos `userId` para reduzir deadlocks.

## 6. Marshal Council com fencing token

### Migration planejada

Adicionar às tabelas de council:

- `attempt_id` UUID/token não nulo quando `status = running`;
- `lease_expires_at` timestamp com timezone;
- índice `(status, lease_expires_at)`.

### Fluxo planejado

`claimQueuedCouncil` deve fazer update condicional de `queued` para `running`, gerando novo `attempt_id` e `lease_expires_at`, e retornar o registro com o token. Recovery deve transformar `running` expirado em `queued` somente limpando a lease anterior.

`saveCouncilResult` e `markCouncilFailed` devem exigir:

```text
id = requestId
AND status = running
AND attempt_id = workerAttemptId
AND lease_expires_at > now()
```

A inserção das propostas e o update final do council devem permanecer na mesma transação. Se a condição não afetar uma linha, o worker perdeu a lease e deve descartar o resultado sem retry destrutivo.

O heartbeat deve renovar a lease com update condicional pelo mesmo `attempt_id`. A duração da lease precisa exceder o pior caso de execução do adapter, e o recovery deve usar uma margem separada para evitar requeue prematuro durante pausas curtas.

## 7. Testes obrigatórios

### Redis

- owner A expira; owner B adquire; release tardio de A não remove B;
- renew tardio de A não estende B;
- token diferente nunca libera nem renova;
- dois releases concorrentes são idempotentes;
- fallback local mantém semântica de token por processo.

### Matchmaking

- remoção Redis em outro nó remove snapshot stale no próximo tick;
- dequeue sem entrada local ainda faz `HDEL`;
- falha de `createLobby` restaura o candidato;
- enqueue novo durante rollback não é sobrescrito;
- dois ticks concorrentes não casam o mesmo usuário.

### Ranking

- dois fechamentos simultâneos produzem um único `match_results`;
- retry após queda entre update e resposta não duplica XP/stats;
- conflito retorna o resultado persistido;
- participantes são aplicados com lock ordenado sem deadlock.

### Councils

- worker A perde lease e worker B assume;
- resultado tardio de A não altera status nem insere propostas;
- falha tardia de A não sobrescreve resultado de B;
- replay de submit continua idempotente;
- recovery não reencaminha lease ainda válida.

## 8. Rollout e observabilidade

1. Aplicar migrations em staging com diagnóstico de duplicatas.
2. Ativar métricas de `lock_lost`, `stale_queue_removed`, `ranking_replay`, `council_lease_lost`.
3. Fazer canary com TTLs conservadores e logs sem expor tokens.
4. Comparar contagem de partidas, resultados e stats antes/depois.
5. Só depois habilitar recovery agressivo de leases expiradas.

Tokens nunca devem aparecer em logs, mensagens WebSocket ou respostas HTTP. Logs devem usar apenas hash truncado ou identificador de operação.

## 9. Achados adicionais da varredura backend

A varredura paralela encontrou os seguintes problemas confirmados fora das quatro áreas iniciais:

- **Alta — dano de zona e eliminação:** `applyZoneDamage` e `eliminatePlayer` usam snapshots sem lock/UPDATE condicional; ticks concorrentes podem perder dano ou registrar duas eliminações.
- **Alta — kills:** `addKill` faz `SELECT` seguido de `UPDATE kills = snapshot + 1`; abates concorrentes podem perder incrementos.
- **Média — cura:** `healPlayer` usa read-modify-write e pode sobrescrever dano/cura concorrente.
- **Alta — RoomEventMesh:** `leaseAlive` seguido de `removeRecord` é TOCTOU; uma sala pode ser removida depois de renovar a lease.
- **Média — criação de lobby privado:** falhas depois da criação local ou do publish podem deixar `rooms`, owner e broadcast divergentes.
- **Média — lobby do matchmaking:** há caminhos de criação sem saga compensatória completa para sala, owner e mappings.
- **Média — MatchFlow:** countdown timeout não é cancelado em `destroy()`, permitindo que um objeto destruído inicie partida posteriormente.

Prioridade recomendada: RoomEventMesh e dano/kills primeiro, depois sagas de lobby e cleanup do countdown.

## 10. Estado desta execução

- [x] Scripts Lua de release e renew adicionados ao `DistributedState`.
- [x] Ownership de sala passou a usar token único por aquisição.
- [x] Rollback de matchmaking protegido contra sobrescrita de enqueue posterior.
- [x] Dequeue e reconciliação de snapshots stale iniciados.
- [x] Migration e transação idempotente do ranking (`0009_concurrency_fencing.sql`).
- [x] Migration e fencing token do Marshal Council (`attempt_id` + `lease_expires_at`).
- [x] Testes de integração Redis com servidor efêmero (`tests/integration/redis-locks.test.ts`, 2/2).
- [x] Varredura focada dos módulos backend restantes.
- [x] Dano de zona/eliminação transacional e sem dupla contagem.
- [x] Cura de jogador/loot com `LEAST(max_health, health + amount)` atômico.
- [x] Incremento de kills com expressão SQL, sem lost update.
- [x] Remoção do RoomEventMesh protegida por compare-and-delete Lua.
- [x] Lifecycle de ownership integrado: heartbeat em 2/3 do TTL, perda cancela o timer e `destroyRoom` libera por CAS.
- [x] Cleanup de countdown do `MatchFlow`: handle explícito, cancelamento idempotente e teardown não inicia partida destruída.
- [x] Rollback de criação de lobby cobre falha de ownership/publicação e libera jogadores, índice local e lease.
- [ ] Saga completa para falha no meio do seating de matchmaking e cleanup integrado do countdown no `RoomManager`.

## 11. Evidência de desempenho Redis/Lua

Benchmark reproduzível: `npm run bench:redis-locks`, contra Redis 7 local, com
`BENCH_ROUNDS=5000` e `BENCH_CONCURRENCY=128`.

- Contenção em uma chave: 1.280.000 operações, 5.000 aquisições vencedoras,
  531.480 ops/s; p50 0,349 ms, p95 0,650 ms, p99 0,994 ms, máximo 4,040 ms.
- Chaves independentes: 10.000 operações, 232.504 ops/s; p50 0,789 ms,
  p95 2,769 ms, p99 7,102 ms, máximo 7,140 ms.
- Segurança de owner obsoleto: release tardio e renew tardio retornaram rejeição
  e preservaram o token do owner B.

Esses números são baseline de uma instância local, não SLO de produção. O
benchmark deve ser repetido em staging com latência de rede, Redis configurado
com persistência e carga concorrente das demais operações da aplicação antes de
alterar TTLs ou limites.
