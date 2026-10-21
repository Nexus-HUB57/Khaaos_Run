# Terminais ZEX – Zona de Extração de XP

Implementação alinhada ao **README oficial** (15 terminais no CIGKV).

---

## Visão geral

| Elemento | Valor |
|----------|-------|
| Quantidade no CIGKV | **15** (dispersos) |
| Visual | Luz **azul** que intensifica com extrações |
| Recompensa base | 25 KRC × Multiplier |
| Persistência | 20 % registrados no `UKhaaosTransferSystem` |
| Crédito imediato | 100 % creditado no Bankhaoos (jogador sente o ganho) |
| Cooldown | 8 s por jogador |

---

## Arquivo

```
Source/KhaaosRun/
├── Public/CIGKV/KhaaosZEXTerminal.h
└── Private/CIGKV/KhaaosZEXTerminal.cpp
```

---

## Como usar no Editor

1. Crie **BP_ZEX_Terminal** herdando de `KhaaosZEXTerminal`.
2. Atribua:
   - **Terminal Mesh** (coluna / console futurista)
   - **Idle FX** – Niagara de brilho azul constante
   - **Extract FX** – pulso / partículas azuis
   - **Extract Sound** – som eletrônico / confirmação
3. Ajuste `BaseKRCReward` e `RewardMultiplier` por terminal (terminais “lendários” com multiplier 2.0–3.0).
4. Coloque **15 instâncias** no mapa do CIGKV (perímetros oficiais).

---

## Fluxo de extração

```
Player entra no InteractionVolume
        ↓
TryExtract()
        ↓
┌───────────────────────────────────────┐
│ 1. Calcula KRC (Base × Multiplier)    │
│ 2. RegisterZEXKRC / RegisterZEXItem   │  ← TransferSystem (20 % futuros)
│ 3. Bankhaoos->CreditKRC               │  ← crédito imediato
│ 4. Luz azul intensifica               │
│ 5. Niagara + Som                      │
│ 6. OnExtracted broadcast              │
└───────────────────────────────────────┘
```

---

## Integração com sistemas existentes

O terminal procura automaticamente no Pawn:

- `UKhaaosTransferSystem` → registra para transferência parcial
- `UKhaaosBankhaoosComponent` → credita KRC na hora

Garanta que o Character tenha os dois componentes.

---

## Variações recomendadas (perímetro CIGKV)

| Local | Multiplier | Nota |
|-------|------------|------|
| Pátio de Armamento | 1.0 | Seguro, baixo risco |
| Setor de Testes | 1.5 | Mais disputado |
| Parque Abandonado | 2.0–2.5 | Alto risco / alto reward |
| Perto de emboscadas | 3.0 | “Lendário” |

---

## UI sugerida

- Texto flutuante: `+25 KRC` (fade out)
- Barra de “carga” do terminal (ExtractCount)
- Ícone de raio azul no minimapa

---

## Teste rápido

1. Adicione os componentes Bankhaoos + Transfer no Character.
2. Coloque 1 terminal no nível.
3. Play → entre no volume.
4. Verifique log: `[ZEX] Extração | +25 KRC`
5. Verifique saldo Bankhaoos e `ZEXCollectedKRC` no TransferSystem.

---

**Terminais ZEX prontos.**  
Compile, crie o Blueprint, coloque 15 no CIGKV e o ciclo de persistência fica completo.
