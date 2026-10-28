# Zu 4 CIGKV – "Risco de Queda na Ponte" (guia de extensão de lore)

> **Status: PROPOSTA DE EXTENSÃO — não implementado no motor.** O Protocolo
> de Ingresso canônico é **3 Zu por ring** (README oficial e
> `Game/World/Zu/ZuIngressRules`). O spec de automação
> `Tests/ZuIngressRulesSpec.cpp` inclusive assegura que a variante 4 NÃO
> existe no CIGKV. Este guia captura o Zu 4 descrito no documento de lore
> ("Sistema do Khaaos") e prepara a implementação para quando o produto
> decidir estender o protocolo de ingresso do continente (W1/C1 Barburhen).

---

## Resumo (lore)

| Campo | Valor |
|---|---|
| Nome oficial | Zu 4 – Risco de Queda na Ponte (Continente) |
| Cena | Caminhão/trem desce ponte antiga em desmoronamento; o veículo cai no abismo |
| Escolha correta | **Apertar Cinto** (âncora de corpo) |
| Penalidade se falhar | −30% Vitalidade (×2.0 crítico) + visão embaçada 5 s + risco de ataque imediato |
| Loot típico | 12 crates — carga pesada: armadilhas + munição |
| Voz do Marechal | "Atenção, Zheers… a ponte acabou. O Khaaos não perdoa quem hesita." |
| Parâmetros | ImpactForce 32.000 · CriticalDamageMultiplier 2.0 · LootRadius 200 |

Diferenças intencionais do Zu 3 (também "ponte"): o Zu 3 é a queda/submersão
com **máscara O₂** (deck inferior); o Zu 4 é a queda do **vagão no vão**
(cinto) com crítico maior e loot mais pesado — a dificuldade sobe no fim da
sequência de ingresso.

---

## O que muda no motor (checklist de implementação)

1. **`Game/World/Zu/ZuIngressRules.h/.cpp`**
   - Adicionar a variante 4 ao `FSpec` do ring alvo (mantendo 3 variantes nos
     rings que não recebem a extensão).
   - `HazardAt`: registrar o hazard `KneeBuckle`/queda com `bSeatbeltSafe`.
   - `LootStock`: manifesto das 12 crates (armadilhas + munição pesada).
2. **`Game/CIGKV/`** — espelhar o padrão Zu 1–3:
   ```
   Source/KhaaosRun/Public/CIGKV/Zu4CigkvImpact.h
   Source/KhaaosRun/Public/CIGKV/Zu4ChoiceWidget.h
   Source/KhaaosRun/Private/CIGKV/Zu4CigkvImpact.cpp
   Source/KhaaosRun/Private/CIGKV/Zu4ChoiceWidget.cpp
   ```
   - Herdar a mesma espinha dorsal de `AZu3CigkvImpact` (trigger box →
     `TriggerCrash` → física com impulso/torque → Niagara/som → pop-up com
     delay → dano/debuff via `UKhaaosVitalityComponent` → loot com
     line-trace de chão).
   - Debuff do Zu 4: visão embaçada (`ApplyVisionBlur`) — reusar o caminho
     existente; NÃO introduzir novo estado de Vitalidade sem passar pelo
     componente.
3. **Widget**: `WBP_Zu4_Choice` — Botão 1 **APERTAR CINTO** (verde) →
   `ChooseSeatbelt`; Botão 2 **NÃO APERTAR** (vermelho) → `ChooseNoSeatbelt`;
   texto: "Risco de Queda na Ponte – Apertar o Cinto?".
4. **FX/Áudio**:
   - `NS_Zu4_Crash_Ponte` (destroços + fogo + poeira, scale 2.2×, lifetime 10 s)
   - `NS_Zu4_Water_Impact` (impacto no fundo do vão)
   - `SC_Zu4_Crash_Metal_3D`, `SC_Zu4_Marechal_Voz_Distorcida`
5. **Automação**: atualizar `ZuIngressRulesSpec.cpp` — remover a asserção
   `TestFalse(... FindSpec(ERing::CIGKV, 4, ...))` para o ring alvo e cobrir
   as novas invariates (aceitar cinto = imune com lock 5–7 s; recusar =
   −30% com crítico aplicado).
6. **Balanceamento**: com crítico 2.0, a penalidade efetiva é −60% Vitalidade
   — validar com `Combat_and_Vitality.md` se o gate de mortalidade no ingresso
   continua justo (o lore exige punição real, não morte instantânea).

---

## Critério de aceite (quando implementado)

- [ ] `FindSpec(ring, 4, Spec)` resolve para o ring estendido e falha nos demais
- [ ] Aceitar cinto: 0 dano, control lock 5–7 s, sem blur
- [ ] Recusar cinto: −30% × 2.0, blur 5 s, `bCanActImmediately`
- [ ] 12 crates com manifesto `LootStock` e spawn com line-trace de chão
- [ ] Smoke de UX: pop-up 2 s após o impacto; voz do Marechal antes do pop-up
