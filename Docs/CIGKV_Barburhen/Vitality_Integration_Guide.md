# Integração Real – UKhaaosVitalityComponent

## O que foi implementado

Componente de Vitalidade completo que:

1. **Serve de API única** para os Zu 1–3 (`ApplyPercentageDamage`, `ApplyStun`, `ApplyVisionBlur`)
2. **Camadas de sobrevivência** do lore (Fome, Sede, Cansaço, Medo)
3. **Pronto para GAS** – sincroniza com o AttributeSet de Health quando existir
4. **Debuffs com tags** (`Debuff.Stun`, `Debuff.VisionBlur`)
5. **Fallback seguro** – se o componente não estiver no Character, os Zu usam `ApplyDamage` padrão

---

## Arquivos

```
Source/KhaaosRun/
├── Public/Player/
│   └── KhaaosVitalityComponent.h
└── Private/Player/
    └── KhaaosVitalityComponent.cpp
```

Os três Zu (`Zu1/2/3CigkvImpact.cpp`) já foram atualizados para chamar o componente.

---

## Como adicionar no Character

1. Abra o Blueprint do Character do jogador (ou a classe C++).
2. **Add Component** → `KhaaosVitalityComponent`.
3. (Opcional) No `BeginPlay` do Character, chame `InitializeFromASC` se o ASC estiver no PlayerState.

```cpp
// Exemplo em AKhaaosCharacter::BeginPlay()
if (UKhaaosVitalityComponent* Vitality = FindComponentByClass<UKhaaosVitalityComponent>())
{
    if (UAbilitySystemComponent* ASC = GetAbilitySystemComponent())
    {
        Vitality->InitializeFromASC(ASC);
    }
}
```

---

## API principal

| Método | Uso |
|--------|-----|
| `ApplyPercentageDamage(0.30f)` | −30 % da vitalidade máxima (Zu 1–3) |
| `ApplyStun(5.0f)` | Atordoamento 5 s (Zu 2) |
| `ApplyVisionBlur(5.0f)` | Visão embaçada 5 s (Zu 3) |
| `GetVitalityPercent()` | 0.0–1.0 para UI |
| `OnVitalityChanged` | Bind no HUD (coração batendo, etc.) |
| `OnVitalityDepleted` | Morte / eliminação |

---

## Sincronização com GAS (próximo passo)

Quando o `UKhaaosAttributeSet` (Health / MaxHealth) estiver estável, descomente o bloco em `SyncToGASHealth()` e em `InitializeFromASC()` para manter Health e Vitalidade sempre iguais.

---

## UI sugerida (HUD)

- Barra de Vitalidade ligada a `OnVitalityChanged`
- Ícones de Fome / Sede / Cansaço / Medo
- Heartbeat mais rápido quando `Fear > 60` ou perto de prédios instáveis (pode ser controlado por Blueprint)

---

**Integração concluída.** Compile o módulo, adicione o componente ao Character e teste os 3 Zu.
