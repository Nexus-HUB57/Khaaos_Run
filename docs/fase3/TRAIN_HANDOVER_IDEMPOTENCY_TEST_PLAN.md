# Plano de testes C++ — Idempotência do handover do trem

**Fase:** 3 — Ingresso pelo trem
**Mundo alvo:** Barburhen / W1
**Protocolo:** `ZU_TRAIN_V1`
**Estado:** plano de implementação
**Duração canônica:** 3.400 ms

## 1. Objetivo

Provar que o handover do ingresso ferroviário é uma operação server-authoritative, idempotente e segura contra chamadas duplicadas, concorrentes, atrasadas ou fora de ordem. Para um mesmo `ingressId`, o sistema deve transferir o jogador para o spawn de Barburhen no máximo uma vez, liberar o gameplay no máximo uma vez e emitir exatamente um evento de conclusão.

O teste não deve validar apenas o valor final do estado. Ele deve contar efeitos colaterais: teleporte, desbloqueio de input, mudança de fase, liberação da reserva de spawn, recompensa/evento de conclusão e eventos de telemetria.

## 2. Definição operacional de idempotência

Para um ingresso válido `I`, qualquer sequência de chamadas de conclusão que contenha uma ou várias ocorrências de:

```cpp
CompleteHandover(I, reason);
```

deve produzir o mesmo resultado observável que uma única chamada:

```text
state                 = Completed
teleportCount         = 1
unlockGameplayCount   = 1
spawnReleaseCount     = 1
completionEventCount  = 1
failureEventCount     = 0
finalLocation         = reserved spawn
combatLocked          = false
```

Chamadas posteriores devem retornar um resultado idempotente, por exemplo `AlreadyCompleted`, sem repetir efeitos. Não é obrigatório que chamadas duplicadas retornem `true`; é obrigatório que não repitam efeitos colaterais.

## 3. Escopo de implementação testável

O plano assume uma camada de domínio fina, sem exigir `UWorld` nos testes host:

```cpp
class IKhaaosTrainHandoverPort
{
public:
    virtual ~IKhaaosTrainHandoverPort() = default;
    virtual bool TeleportPlayer(const FGuid& PlayerId, const FVector& Location, const FRotator& Rotation) = 0;
    virtual bool UnlockGameplay(const FGuid& PlayerId) = 0;
    virtual bool ReleaseSpawnReservation(const FGuid& IngressId) = 0;
    virtual void EmitTelemetry(const FKhaaosTrainTelemetryEvent& Event) = 0;
};
```

A implementação autoritativa deve concentrar a deduplicação em `IngressId`, não em timestamps ou em ponteiros de `PlayerController`:

```cpp
enum class EKhaaosHandoverResult : uint8
{
    Completed,
    AlreadyCompleted,
    Rejected,
    Failed
};

EKhaaosHandoverResult CompleteHandover(
    const FString& IngressId,
    const FName Reason);
```

O `IngressId` deve ser único por jogador e ingresso. Uma nova entrada do mesmo jogador em outra partida precisa possuir outro identificador.

## 4. Fixtures C++

Criar um fixture de domínio em:

```text
Unreal/KhaaosRun/Source/KhaaosRun/Tests/TrainHandoverIdempotencySpec.cpp
```

Se a implementação ainda não estiver separada dos tipos Unreal, criar também o teste portável em:

```text
tests/ue5/train_handover_idempotency_test.cpp
```

O fake deve registrar contadores e chamadas:

```cpp
struct FTrainHandoverFakePort final : IKhaaosTrainHandoverPort
{
    int32 TeleportCount = 0;
    int32 UnlockGameplayCount = 0;
    int32 SpawnReleaseCount = 0;
    TArray<FKhaaosTrainTelemetryEvent> Events;
    TArray<FString> Calls;
    bool bTeleportSucceeds = true;
    bool bUnlockSucceeds = true;
    bool bReleaseSucceeds = true;

    bool TeleportPlayer(const FGuid&, const FVector&, const FRotator&) override;
    bool UnlockGameplay(const FGuid&) override;
    bool ReleaseSpawnReservation(const FGuid&) override;
    void EmitTelemetry(const FKhaaosTrainTelemetryEvent&) override;
};
```

O fake não deve deduplicar chamadas. A deduplicação deve ser responsabilidade do sistema sob teste; caso contrário, o teste pode esconder um bug de múltiplos teleports.

## 5. Dados canônicos do fixture

```cpp
const FString IngressId = TEXT("match-test-001/player-test-007/ingress-001");
const FGuid PlayerId(0x11111111, 0x22222222, 0x33333333, 0x44444444);
const FVector BarburhenSpawn(1840.0f, -620.0f, 112.0f);
const FRotator BarburhenRotation(0.0f, 92.0f, 0.0f);
```

O fixture deve iniciar com:

```text
state                 = Handover
combatLocked          = true
teleportCount         = 0
unlockGameplayCount   = 0
spawnReleaseCount     = 0
completionEventCount  = 0
```

## 6. Casos unitários obrigatórios

### TH-001 — primeira conclusão executa o handover

**Dado:** ingresso válido no estado `Handover`.

**Quando:** `CompleteHandover(IngressId, "server_deadline")` é chamado uma vez.

**Então:**

- resultado é `Completed`;
- estado vira `Completed`;
- teleporte ocorre uma vez;
- input/gameplay é liberado uma vez;
- reserva é liberada uma vez;
- é emitido exatamente um `barburhen_train_handover_completed`;
- `combatLocked == false`;
- posição final é exatamente o spawn reservado.

### TH-002 — chamada duplicada sequencial não repete efeitos

**Dado:** TH-001 já foi concluído.

**Quando:** `CompleteHandover` é chamado novamente com o mesmo `IngressId` e outro motivo.

**Então:**

- resultado é `AlreadyCompleted`;
- `TeleportCount == 1`;
- `UnlockGameplayCount == 1`;
- `SpawnReleaseCount == 1`;
- existe apenas um evento de conclusão;
- o segundo motivo não sobrescreve o motivo original.

### TH-003 — três chamadas duplicadas são equivalentes a uma

Executar:

```cpp
CompleteHandover(IngressId, TEXT("client_ready"));
CompleteHandover(IngressId, TEXT("server_deadline"));
CompleteHandover(IngressId, TEXT("timeout_guard"));
```

Validar os mesmos invariantes de TH-002. Este caso protege contra callbacks simultâneos do cliente, deadline do servidor e watchdog.

### TH-004 — chamada duplicada com payload diferente não altera o destino

A segunda chamada deve tentar fornecer localização, rotação ou `spawnId` diferentes, se a API expuser esses dados.

**Esperado:** o destino reservado na primeira conclusão permanece autoritativo; a segunda chamada é rejeitada ou tratada como `AlreadyCompleted`, sem teleporte adicional.

### TH-005 — pedido para outro `IngressId` não reutiliza conclusão

Concluir `Ingress-A` e depois tentar `Ingress-B` com o mesmo jogador.

**Esperado:**

- `Ingress-B` permanece independente;
- não herda o estado `Completed` de `Ingress-A`;
- possui contadores próprios;
- somente seu próprio `IngressId` pode ser deduplicado.

### TH-006 — ingresso cancelado não pode ser concluído

Cancelar o ingresso e chamar `CompleteHandover` duas vezes.

**Esperado:**

- resultado `Rejected` ou `AlreadyCancelled`;
- nenhum teleporte;
- nenhum desbloqueio;
- nenhum evento de conclusão;
- um único evento `barburhen_train_ingress_cancelled`.

### TH-007 — jogador desconectado antes do handover

Marcar o jogador como desconectado antes da conclusão.

**Esperado:**

- handover não acontece;
- reserva é liberada uma vez;
- evento de cancelamento contém `reason = player_disconnected`;
- nova chamada não pode teleportar um jogador inexistente.

### TH-008 — falha de teleporte é terminal e não duplica tentativa sem política explícita

Configurar `bTeleportSucceeds = false`.

**Esperado:**

- resultado `Failed`;
- nenhum desbloqueio de gameplay;
- evento `barburhen_train_ingress_failed`;
- reserva é liberada ou marcada para fallback de acordo com a política definida;
- chamadas seguintes não devem repetir teleporte indefinidamente.

Se houver retry, ele deve possuir contador e estado explícitos, por exemplo `RetryPending`, nunca reutilizar silenciosamente `Handover`.

### TH-009 — falha de desbloqueio não libera combate parcialmente

Configurar teleporte com sucesso e `bUnlockSucceeds = false`.

**Esperado:**

- não declarar `Completed` enquanto o jogador ainda estiver bloqueado;
- emitir falha de handover;
- preservar `combatLocked == true`;
- não emitir conclusão falsa;
- teleporte não deve ser repetido automaticamente sem política de compensação.

### TH-010 — chamada não autorizada não produz efeitos

Executar o método em contexto de cliente não autoridade, se a camada possuir essa informação.

**Esperado:**

- retorno `Rejected`;
- zero teleports;
- zero unlocks;
- zero eventos de conclusão;
- evento de rejeição com `reason = non_authority` ou log equivalente.

### TH-011 — ingresso expirado usa o handover do servidor uma vez

Simular callback de cliente após `handoverAtServerMs` e depois executar o watchdog do servidor.

**Esperado:** apenas uma conclusão, independentemente da ordem:

```text
cliente → watchdog
watchdog → cliente
watchdog → watchdog → cliente
```

### TH-012 — duplicata fora de ordem não reabre o ingresso

Enviar eventos na ordem:

```text
HandoverCompleted
VisualStarted
ReadyForHandover
HandoverCompleted
```

**Esperado:** eventos antigos não fazem o estado retroceder nem reabrem o ingresso.

## 7. Testes de propriedade

Além dos casos fixos, executar uma sequência determinística de operações gerada por seed:

```cpp
enum class EOperation
{
    ClientReady,
    ServerDeadline,
    TimeoutGuard,
    DuplicateComplete,
    Cancel,
    Reconnect,
    LateJoinSnapshot,
    InvalidPayload
};
```

Para cada sequência de até 100 operações, verificar:

```text
teleportCount <= 1
unlockGameplayCount <= 1
spawnReleaseCount <= 1
completionEventCount <= 1
completed implies combatLocked == false
cancelled implies completionEventCount == 0
```

A seed deve ser impressa quando houver falha para permitir reprodução local e no CI.

## 8. Teste de concorrência simulada

O teste host não precisa criar threads reais inicialmente. Deve simular uma fila de callbacks no mesmo frame:

```cpp
TArray<FHandoverCommand> Commands = {
    ClientReadyCommand,
    ServerDeadlineCommand,
    TimeoutGuardCommand,
    ClientReadyCommand,
};

for (const FHandoverCommand& Command : Commands)
{
    System.Dispatch(Command);
}
```

Depois, criar uma variante com duas threads somente se a implementação tiver estado compartilhado fora do game thread. O objetivo é confirmar que o lock/deduplicação usa `IngressId` e não depende da ordem casual dos callbacks.

Critérios:

- exatamente um vencedor do handover;
- nenhum double-free ou corrupção de estado;
- nenhum evento de conclusão duplicado;
- estado final determinístico.

## 9. Contrato de telemetria a validar

Cada teste deve inspecionar o fake de telemetria. Para sucesso normal:

```text
barburhen_train_ingress_reserved       1
barburhen_train_ingress_announced      1
barburhen_train_visual_started         0 ou 1
barburhen_train_handover_started       1
barburhen_train_handover_completed     1
barburhen_train_ingress_failed         0
barburhen_train_ingress_cancelled      0
```

Para duplicatas:

```text
barburhen_train_handover_completed     1
barburhen_train_handover_duplicate     0 ou N, conforme decisão do contrato
```

A recomendação é emitir `barburhen_train_handover_duplicate` em nível debug/diagnóstico, mas nunca emitir um segundo evento de sucesso de negócio.

Cada evento deve manter:

- mesmo `ingressId`;
- mesmo `matchId`;
- mesmo `playerId`;
- `eventId` único;
- `sequence` monotônico;
- motivo da primeira conclusão preservado.

## 10. Testes Unreal Automation / PIE

Os testes host não substituem o teste de engine. Em uma máquina com Unreal Editor, adicionar testes `IMPLEMENT_SIMPLE_AUTOMATION_TEST` para:

### PIE-001 — dois callbacks no mesmo frame

- iniciar uma partida PIE;
- criar ingresso Barburhen;
- chamar callback de cliente e deadline no mesmo frame;
- confirmar um único teleport e uma única liberação.

### PIE-002 — dois clientes

- iniciar servidor PIE e dois clientes;
- concluir o ingresso do cliente A duas vezes;
- concluir o ingresso do cliente B uma vez;
- validar isolamento por `IngressId`/`PlayerId`.

### PIE-003 — reconnect durante a timeline

- desconectar o cliente após `Visualizing`;
- reconectar antes do deadline;
- enviar snapshot ativo;
- concluir uma única vez.

### PIE-004 — late join após 3.400 ms

- conectar depois do deadline;
- não reproduzir a cutscene do início;
- executar handover imediato idempotente;
- não conceder invulnerabilidade adicional.

### PIE-005 — colisão/spawn inválido

- forçar spawn dentro de colisão;
- confirmar evento de falha/fallback;
- garantir que fallback não produza dois handovers.

### PIE-006 — servidor dedicado

- executar o mesmo cenário em dedicated server;
- confirmar que a lógica não depende de câmera ou componente visual do cliente.

## 11. Integração no gate

Adicionar o teste portável ao runner:

```text
scripts/test_ue5_logic.sh
```

Ordem recomendada:

1. compilar regras e fake de handover;
2. executar `train_handover_idempotency_test`;
3. executar regras Zu/CIGKV existentes;
4. executar Barburhen rules;
5. executar integração MapData;
6. executar demais testes UE5 portáveis.

O teste deve falhar com código diferente de zero quando qualquer contador exceder um, mesmo que o estado final pareça correto.

No ambiente Unreal licenciado, o pipeline adicional deve executar:

```text
UHT
BuildCookRun ou build editor
Automation Tests
PIE multiplayer smoke
Dedicated server smoke
```

## 12. Critérios de aceite

A implementação será aceita quando:

- todos os casos TH-001 a TH-012 passarem;
- todas as propriedades de contagem forem invariantes;
- sequências aleatórias determinísticas passarem com pelo menos 1.000 seeds;
- concorrência simulada passar em todas as ordens testadas;
- nenhum `handover_completed` duplicado aparecer na telemetria;
- `TeleportCount == 1` para todo ingresso concluído;
- `UnlockGameplayCount == 1` para todo ingresso concluído;
- late join e reconnect não reiniciarem a timeline;
- o estado não retroceder após conclusão;
- o gate portável passar no CI;
- os testes PIE e dedicated server passarem no ambiente UE5.

## 13. Fora do escopo deste plano

Este plano não valida:

- qualidade artística do trem;
- modelagem da locomotiva;
- materiais e Niagara;
- balanceamento de Barburhen;
- dano do ring;
- chuva ácida;
- loot ou terminal ZEX, exceto quando sua execução depender de `combatLocked`;
- performance visual completa em dispositivos móveis.

Esses itens devem possuir gates próprios. Este plano valida exclusivamente a propriedade crítica de que o handover do trem acontece no máximo uma vez, de forma server-authoritative e observável.
