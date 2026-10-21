# Forja do Armeiro – Guia de Implementação

Marketplace de equipamentos pagos em **KRC**, alinhado ao README oficial.

---

## Arquivos

```
Source/KhaaosRun/
├── Public/Economy/
│   ├── KhaaosForgeItem.h          (struct + enum do catálogo)
│   └── KhaaosArmorerForge.h
└── Private/Economy/
    └── KhaaosArmorerForge.cpp
```

---

## Catálogo (DataTable)

1. Crie um **DataTable** com row struct = `FKhaaosForgeItemRow`.
2. Nome sugerido: `DT_ForgeCatalog`.
3. Preencha os itens (exemplos oficiais / lore):

| ItemId | DisplayName | Category | PriceKRC | Qty |
|--------|-------------|----------|----------|-----|
| Pistol_9mm | Pistola 9mm | Weapon | 150 | 1 |
| Knife_Tactical | Faca Tática | Weapon | 50 | 1 |
| MedKit_N1 | Kit Médico N1 | Medical | 80 | 1 |
| Vest_Light | Colete Leve Kevlar | Armor | 200 | 1 |
| Ammo_9mm_30 | Caixa Munição 9mm | Tool | 40 | 30 |
| Grenade_Frag | Granada Fragmentação | Throwable | 120 | 1 |
| Mine_Claymore | Mina Claymore | Throwable | 180 | 1 |
| Barrett_MRAD | Barrett MRAD | Weapon | 800 | 1 |
| GasMask_N1 | Máscara de Gás N1 | Armor | 100 | 1 |

No CIGKV (`bIgnoreRankRestriction = true`) qualquer um pode comprar tudo (objetivo de balanceamento).

---

## Blueprint no Editor

1. Crie `BP_Armorer_Forge` herdando de `KhaaosArmorerForge`.
2. Atribua:
   - Mesh da forja / bancada
   - `CatalogDataTable` = DT_ForgeCatalog
   - `ShopWidgetClass` = WBP_ForgeShop
   - Niagara idle (faíscas / fogo)
   - Sons de compra e erro
3. Coloque no **Pátio de Armamento** do CIGKV (zona neutra ⅛).

---

## Widget de loja (WBP_ForgeShop)

Sugestão de layout:

- Lista de itens (Scroll Box) preenchida com `GetCatalogItems()`
- Cada linha: Ícone | Nome | Preço KRC | Botão COMPRAR
- Header: saldo atual (`Bankhaoos->GetBalance()`)
- Botão FECHAR → `CloseShop()`

No botão COMPRAR:
```
Forge->TryPurchase(Player, ItemId)
```

Bind nos eventos:
- `OnPurchaseSuccess` → feedback verde + atualiza saldo
- `OnPurchaseFailed` → mensagem de erro (saldo insuficiente, etc.)

---

## Fluxo de compra

```
Player entra no volume / Interact
    → OpenShop() → UI
Player clica COMPRAR (ItemId)
    → TryPurchase()
        → Valida item no DataTable
        → Valida Bankhaoos + saldo
        → DebitKRC(preço)
        → GiveItemToPlayer()
        → FX + som + OnPurchaseSuccess
```

---

## Integração

| Sistema | Uso |
|---------|-----|
| Bankhaoos | `DebitKRC` na compra |
| Inventário | `GiveItemToPlayer` (expandir com InventoryComponent) |
| Vitalidade | Kits médicos podem chamar `ApplyHeal` |
| CIGKV | Sem restrição de patente |

---

## Teste rápido

1. Character com Bankhaoos (após Zu 1 → 1000 KRC).
2. Coloque a Forja no nível.
3. Entre no volume → UI abre.
4. Compre “Faca Tática” (50 KRC).
5. Log: `[Forja] Compra OK | Knife_Tactical por 50 KRC | Saldo restante 950`

---

**Forja do Armeiro pronta.**  
Compile, crie o DataTable + Widget e coloque no Pátio de Armamento.
