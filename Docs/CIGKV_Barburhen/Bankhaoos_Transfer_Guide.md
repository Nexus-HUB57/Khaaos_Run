# Bankhaoos + Transferência Parcial CIGKV → W1/C1

Implementação alinhada ao **README oficial**.

---

## 1. Bankhaoos (`UKhaaosBankhaoosComponent`)

### Regras oficiais
- Conta criada automaticamente no **primeiro Zu 1** do CIGKV
- **1000 KRC** creditados na criação
- Gera `AccountId` (`KR-XXXXXXXX`) e `DepositAddress`
- Eventos: `OnAccountCreated`, `OnKRCChanged`

### Como usar
1. Adicione o componente no Character do jogador.
2. O Zu 1 chama `CreateAccount()` automaticamente no `TriggerCrash`.
3. Para a Forja do Armeiro / loot:
   ```cpp
   Bank->CreditKRC(50, TEXT("ZEX terminal"));
   Bank->DebitKRC(200, TEXT("Forja – Pistola 9mm"));
   ```

### Bridge para API (produção)
Substitua os logs por chamadas HTTP ao Economy microservice:
```
POST /api/bankhaoos/create  { playerId, initialKRC: 1000 }
POST /api/bankhaoos/credit  { accountId, amount, reason }
POST /api/bankhaoos/debit   { accountId, amount, reason }
```

---

## 2. Transferência Parcial (`UKhaaosTransferSystem`)

### Regras oficiais (README)
| Regra | Valor |
|-------|-------|
| % de KRC/itens dos ZEX transferidos | **20 %** |
| Token de Veterano + Pack UE5 | **Top 50** |
| Persistência parcial | **Top 1000** |

### Fluxo
1. Durante o CIGKV, terminais **ZEX** chamam:
   ```cpp
   Transfer->RegisterZEXKRC(150);
   Transfer->RegisterZEXItem(FName("Knife_Tactical"), 2);
   ```
2. Ranking service atualiza:
   ```cpp
   Transfer->SetCIGKVRank(37); // exemplo
   ```
3. Ao sair do ring / entrar em Barburhen:
   ```cpp
   FTransferPayload Payload = Transfer->ExecuteTransfer();
   // Payload.TransferredKRC, .TransferredItems, .bHasVeteranToken, .bHasUE5Pack
   ```

### Eventos
- `OnTransferCompleted` → UI de “conquistas salvas”
- `OnVeteranTokenGranted` → pop-up especial do Marechal

---

## 3. Componentes no Character

```
Character (Player)
├── KhaaosVitalityComponent
├── KhaaosBankhaoosComponent
└── KhaaosTransferSystem
```

---

## 4. Pop-up sugerido (transferência)

Texto oficial de imersão:
> “Marechal, as conquistas foram salvas. Bem-vindo ao Barburhen, Zheers.”

---

## 5. Arquivos criados

```
Source/KhaaosRun/
├── Public/Economy/
│   ├── KhaaosBankhaoosComponent.h
│   └── KhaaosTransferSystem.h
└── Private/Economy/
    ├── KhaaosBankhaoosComponent.cpp
    └── KhaaosTransferSystem.cpp
```

Zu 1 já cria a conta Bankhaoos automaticamente.

---

**Bankhaoos + Transferência parcial implementados.**
Compile, adicione os componentes ao Character e teste o fluxo Zu 1 → ZEX → ExecuteTransfer.
