# Combate + Vitalidade — Khaaos Run

## Sistema de Combate

### Camadas
1. **Abilities (GAS)** — `KhaaosAbility_Shoot`, Melee, Ultimate em `Game/AbilitySystem/`
2. **Projéteis** — `AKhaaosProjectile` (pool, server-auth, hit/overlap)
3. **AttributeSet** — `UKhaaosAttributeSet` Health / MaxHealth / Energy / Credits
4. **Vitalidade** — `UKhaaosVitalityComponent` (sobrevivência + sync GAS)

### Fluxo de tiro (Ability Shoot)
```
Input → Ability Activate
  → Server line trace / spawn projectile
  → Hit: headshot? BaseDamage × HeadshotMultiplier
  → Aplicar dano no alvo (ASC / Vitality / fallback)
  → Client VFX impacto
```

### Fluxo de projétil
```
Activate(pos, dir, instigator, damage)
  → movimento server-only + replicate location
  → OnHit / OnOverlap
  → ApplyDamageToActor (Authority only):
       1. Vitality->ApplyDamage(Damage) se existir
       2. senão AttributeSet->ApplyDamage
       3. senão UGameplayStatics::ApplyDamage
  → Deactivate (volta ao pool)
```

### Características
- Dano de combate em **pontos** (não % de mundo)
- Server authority
- Object pooling de projéteis
- Headshot via bone name na ability de tiro

---

## Sistema de Vitalidade

### Papel
Camada de **sobrevivência** (lore CIGKV/Barburhen) por cima do Health do GAS.

| API | Uso |
|-----|-----|
| ApplyPercentageDamage | Zu, Ring, chuva (fração da Max) |
| ApplyDamage | Combate / pontos absolutos |
| ApplyStun / ApplyVisionBlur | Debuffs Zu 2/3 |
| Hunger / Thirst / Fear | Tick de sobrevivência |
| SyncToGASHealth | Espelha % no AttributeSet |

### Fontes que usam %
| Fonte | Quantidade |
|-------|------------|
| Zu escolha errada | ~30 % |
| Ring fora | ~5 %/s (× DeltaTime) |
| Chuva ácida | 1 % / 10 s |

### Integração combate ↔ vitalidade
Projétil prioriza `ApplyDamage` na Vitalidade; a vitalidade sincroniza Health do GAS. Assim tiro e Ring/chuva compartilham a mesma barra de vida efetiva.

---

## Character recomendado
```
Character
├── AbilitySystemComponent + AttributeSet
├── KhaaosVitalityComponent
├── KhaaosBankhaoosComponent
└── KhaaosTransferSystem
```
