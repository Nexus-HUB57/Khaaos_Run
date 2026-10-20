# Zu 1 CIGKV – Caminhão Atropelando Bois  
**Implementação End-to-End** (alinhada ao README oficial)

## Visão Geral

| Elemento              | Valor oficial                          |
|-----------------------|----------------------------------------|
| Dinâmica              | Caminhão atropela bois / rochas        |
| Pop-up                | “Risco de Colisão – Apertar os Cintos S/N” |
| Cinto apertado        | 0 % dano                               |
| Sem cinto             | −30 % Vitalidade                       |
| Loot                  | Caixotes (facas, 9mm, kits)            |
| Áudio                 | Metal rangendo + voz distorcida do Marechal |
| Voz                   | “Atenção, Zheers… o Khaaos não perdoa covardes.” |

---

## 1. Arquivos C++ criados

```
Source/KhaaosRun/Public/CIGKV/
├── Zu1CigkvImpact.h
└── Zu1ChoiceWidget.h

Source/KhaaosRun/Private/CIGKV/
├── Zu1CigkvImpact.cpp
└── Zu1ChoiceWidget.cpp
```

Adicione os arquivos ao módulo `KhaaosRun` (ou ao módulo de gameplay correspondente) e recompile.

---

## 2. Passo a passo no Unreal Editor

### 2.1 Criar o Blueprint do Actor

1. Clique direito no Content Browser → **Blueprint Class** → escolha **Zu1CigkvImpact** (C++).
2. Nome: `BP_Zu1_Cigkv_Impact`
3. No Details:
   - **Vehicle Mesh** → atribua o Static Mesh do caminhão
   - **Crash FX** → Niagara System (criar abaixo)
   - **Crash Sound** → Sound Cue 3D
   - **Marechal Voice Cue** → Sound Cue da voz distorcida
   - **Choice Widget Class** → `WBP_Zu1_Choice`
   - **Loot Crate Class** → `BP_Zu1_Loot_Crate` (ou o interactable já existente)
   - Ajuste `ImpactForce = 12000`, `LootCrateCount = 5`

### 2.2 Widget de Escolha (`WBP_Zu1_Choice`)

1. Crie **Widget Blueprint** herdando de `Zu1ChoiceWidget` (C++).
2. Layout sugerido:
   - Canvas Panel
   - Background semi-transparente (preto 70 %)
   - Texto grande: **“RISCO DE COLISÃO”**
   - Texto secundário: “Apertar os Cintos?”
   - Dois botões lado a lado:
     - **APERTAR CINTO** (verde) → `OnClicked` → `ChooseSeatbelt`
     - **NÃO APERTAR** (vermelho) → `OnClicked` → `ChooseNoSeatbelt`
   - Texto de voz do Marechal no rodapé (opcional)

3. No Event Graph do Widget:
   - `Event Construct` → se quiser, toque a voz novamente.

### 2.3 Niagara – FX_Crash_Impact

Crie um **Niagara System**:

- **Emitter 1 – Smoke**
  - Spawn Rate: 40–60
  - Lifetime: 6–10 s
  - Color: Preto → Cinza escuro
  - Size: 80 → 200
  - Velocity: leve para cima + turbulência

- **Emitter 2 – Debris**
  - Spawn Rate: 25
  - Mesh particles (pedaços de metal)
  - Lifetime: 4–7 s
  - Gravity + drag

- **Emitter 3 – Dust**
  - Spawn Rate: 80
  - Color: Marrom claro / cinza
  - Size pequeno, lifetime curto

Salve como `NS_Zu1_Crash_Impact` e atribua no BP.

### 2.4 Som 3D

1. Importe o áudio de metal rangendo / colisão.
2. Crie **Sound Cue** → `SC_Zu1_Crash_Metal`.
3. Adicione **Attenuation** (Radius 3000–5000, Falloff Linear).
4. Atribua no BP.

Para a voz do Marechal:
- Importe a frase distorcida.
- Sound Cue 2D (ou Spatialized com radius grande).
- Texto padrão: *“Atenção, Zheers… o Khaaos não perdoa covardes.”*

### 2.5 Caixote de Loot

Use o sistema de interactable já existente no projeto (`BP_InteractableItem` ou equivalente).  
Itens recomendados para Zu 1:
- Faca Tática
- Pistola 9mm + munição
- Kit Médico N1
- Colete leve (opcional)

---

## 3. Colocação no Nível

1. Arraste `BP_Zu1_Cigkv_Impact` para a cena do CIGKV (no início do percurso do caminhão).
2. Posicione o Trigger Volume na frente do jogador.
3. Garanta que o Player Pawn tenha a tag / canal de colisão correto (ECC_Pawn).
4. Play in Editor → o overlap inicia a sequência automaticamente.

---

## 4. Integração com Vitalidade

No método `ApplyVitalityDamage` (Zu1CigkvImpact.cpp) substitua o fallback pelo componente real do projeto:

```cpp
if (UPlayerVitalityComponent* Vitality = PlayerPawn->FindComponentByClass<UPlayerVitalityComponent>())
{
    Vitality->ApplyPercentageDamage(DamagePercent); // −0.30 * multiplier
}
```

---

## 5. Testes recomendados

| Teste                        | Resultado esperado                          |
|-----------------------------|---------------------------------------------|
| Cinto apertado              | 0 dano, log “imune”                         |
| Sem cinto                   | −30 % (ou 45 % com multiplier 1.5)          |
| Loot spawn                  | 5 caixotes em círculo de 250 u              |
| Niagara + Som               | Visível e audível no ponto de impacto       |
| Widget                      | Aparece após 1.5 s, fecha após escolha      |
| Múltiplos overlaps          | Só dispara uma vez (`bCrashTriggered`)      |

---

## 6. Próximos passos sugeridos

- Zu 2 (Capotamento) e Zu 3 (Queda na ponte) seguindo o mesmo padrão.
- DataTable de Loot por Zu.
- Integração com Bankhaoos (crédito de 1000 KRC no primeiro Zu).
- Persistência parcial via ZEX.

---

**Arquivos prontos para copiar no projeto.**  
Compile o módulo C++, crie os Blueprints/Niagara e teste no Editor.
