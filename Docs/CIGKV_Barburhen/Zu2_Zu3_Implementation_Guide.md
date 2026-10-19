# Zu 2 & Zu 3 CIGKV – Implementação Completa

Alinhado ao **README oficial** do repositório Nexus-HUB57/Khaaos_Run.

---

## Resumo Oficial

| Zu | Nome oficial              | Escolha correta     | Penalidade se falhar                          | Loot típico                  |
|----|---------------------------|---------------------|-----------------------------------------------|------------------------------|
| 2  | Capotamento / Desmoronamento | **Saltar**         | −30 % Vitalidade + **Atordoamento 5 s**      | Facas, munição, kits (8 crates) |
| 3  | Queda na ponte / Submersão  | **Usar Máscara O₂** | −30 % Vitalidade + **Visão embaçada 5 s**    | Armadilhas de caça (6 crates) |

---

## Arquivos C++

```
Source/KhaaosRun/Public/CIGKV/
├── Zu2CigkvImpact.h
├── Zu2ChoiceWidget.h
├── Zu3CigkvImpact.h
└── Zu3ChoiceWidget.h

Source/KhaaosRun/Private/CIGKV/
├── Zu2CigkvImpact.cpp
├── Zu2ChoiceWidget.cpp
├── Zu3CigkvImpact.cpp
└── Zu3ChoiceWidget.cpp
```

---

## Blueprints a criar no Editor

### Zu 2
1. `BP_Zu2_Cigkv_Impact` → herda de `Zu2CigkvImpact`
2. `WBP_Zu2_Choice` → herda de `Zu2ChoiceWidget`
   - Botão 1: **SALTAR** (verde) → `ChooseJump`
   - Botão 2: **PERMANECER** (vermelho) → `ChooseStay`
   - Texto: “Área com Alto Risco de Desmoronamento – Saltar do Caminhão?”

### Zu 3
1. `BP_Zu3_Cigkv_Impact` → herda de `Zu3CigkvImpact`
2. `WBP_Zu3_Choice` → herda de `Zu3ChoiceWidget`
   - Botão 1: **USAR MÁSCARA** (azul) → `ChooseMask`
   - Botão 2: **NÃO USAR** (vermelho) → `ChooseNoMask`
   - Texto: “Risco de Queda – Usar Máscara de Oxigênio?”

---

## Niagara recomendado

### Zu 2 – `NS_Zu2_Crash_Capotamento`
- Smoke denso + fogo + destroços grandes
- Scale 1.8×
- Lifetime 8–12 s

### Zu 3 – `NS_Zu3_Crash_Queda` + `NS_Zu3_Water_Splash`
- Crash: metal + fumaça
- Splash: água + gotículas + ripple
- Scale 2.0–2.5×

---

## Valores padrão (já no código)

| Parâmetro              | Zu 2     | Zu 3     |
|------------------------|----------|----------|
| ImpactForce            | 18.000   | 25.000   |
| CriticalDamageMultiplier | 1.5    | 1.8      |
| Debuff Duration        | 5 s stun | 5 s blur |
| LootCrateCount         | 8        | 6        |
| LootSpawnRadius        | 280      | 220      |
| PopUpDelay             | 1.8 s    | 2.0 s    |

---

## Debuffs implementados

### Zu 2 – Atordoamento
- Desativa movimento do Character (`DisableMovement`)
- Restaura após `StunDuration` (padrão 5 s)
- Pronto para ser expandido com Gameplay Effect (GAS)

### Zu 3 – Visão embaçada
- Reduz FOV temporariamente (sensação de blur)
- Restaura após `BlurDuration`
- **Recomendação de produção**: usar Material Parameter Collection ou Post-Process Volume com Depth of Field para blur real.

---

## Integração com Vitalidade

Nos três arquivos (`Zu1`, `Zu2`, `Zu3`) o método `ApplyVitalityDamage` usa o fallback `UGameplayStatics::ApplyDamage`.

Substitua pela API real do projeto:

```cpp
if (UPlayerVitalityComponent* Vitality = PlayerPawn->FindComponentByClass<UPlayerVitalityComponent>())
{
    Vitality->ApplyPercentageDamage(DamagePercent);
}
```

---

## Ordem de colocação no nível CIGKV

1. `BP_Zu1_Cigkv_Impact` (entrada inicial – caminhão)
2. `BP_Zu2_Cigkv_Impact` (meio do percurso – capotamento)
3. `BP_Zu3_Cigkv_Impact` (final – ponte)

Cada um dispara apenas uma vez por sessão (`bCrashTriggered`).

---

## Checklist de testes

| Teste                     | Zu 2 esperado                     | Zu 3 esperado                          |
|---------------------------|-----------------------------------|----------------------------------------|
| Escolha correta           | 0 dano                            | 0 dano                                 |
| Escolha errada            | −30 % + stun 5 s                  | −30 % + blur 5 s                       |
| Loot                      | 8 crates                          | 6 crates                               |
| Niagara + Som             | Capotamento + fogo                | Queda + splash de água                 |
| Debuff limpa corretamente | Movimento volta após 5 s          | FOV restaura após 5 s                  |
| Só dispara uma vez        | Sim                               | Sim                                    |

---

**Todos os 3 Zu do CIGKV estão implementados em C++.**  
Compile o módulo, crie os Blueprints/Niagara e teste no Editor.
