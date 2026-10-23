# Passiva Onith — Pele Escamosa (UE 5.8)

## Regra de jogo

A passiva reduz em **15%** o dano recebido identificado como `Effect.Damage.Bullet` ou `Effect.Damage.Explosion`. O modificador é aplicado antes da defesa/armadura existente. Dano de fogo, corpo a corpo, queda, zona e Pulso não recebe essa redução.

## Implementação

- `UKhaaosAbility_OnithPassive` é uma `UGameplayAbility` persistente, executada pelo servidor. Na ativação, cria e aplica o efeito a si própria no ASC do `AKhaaosPlayerState`.
- `UKhaaosGameplayEffects::CreateOnithPassiveEffect` cria um `UGameplayEffect` de duração infinita. O efeito soma o percentual configurado aos atributos GAS separados de redução contra projéteis e explosões e concede `Species.Onith` enquanto estiver ativo.
- O `AKhaaosPlayerState` guarda o handle da habilidade de espécie. Uma troca de espécie cancela/remove a habilidade anterior antes de conceder a próxima; `EndAbility` remove os handles de GameplayEffect.
- `AKhaaosCharacter::PossessedBy` e `OnRep_PlayerState` atualizam o par Owner/Avatar do ASC. A passiva é concedida por `AKhaaosGameMode::AssignSpecies` e, quando aplicada diretamente, por `AKhaaosCharacter::ApplySpecies`.
- Hitscan e projéteis propagam uma tag de dano. Projéteis com raio usam explosão por padrão; projéteis sem raio usam bullet. `DamageTypeTag` pode substituir essa inferência nos defaults do projétil.
- A mitigação é aplicada no servidor nos caminhos `UKhaaosAttributeSet::ApplyDamage`, `AKhaaosCharacter::ApplyDamage` e `AKhaaosPlayerState::ApplyDamageOfType`. Dano ambiental da zona permanece no método separado e não é mitigado por Onith.

## Teste de automação

`Private/Tests/KhaaosOnithPassiveTests.cpp` registra `Khaaos.GAS.Species.Onith.PeleEscamosa`. O teste concede/ativa a habilidade num ASC de teste, verifica os dois modificadores em 0,15, confirma que 100 de dano bullet e explosão deixam 15 de vida, verifica que fogo não é reduzido e confirma que cancelar a habilidade remove os modificadores.

Executar no Unreal Editor/Automation Test Framework (com o projeto compilado):

```text
Automation RunTests Khaaos.GAS.Species.Onith.PeleEscamosa
```

A validação C++/Automation precisa ser executada em uma instalação de Unreal Engine 5.8. O ambiente de trabalho usado para esta alteração não contém UnrealEditor/UnrealBuildTool; portanto, a execução do teste e o build do módulo ficam como gate pendente no staging/CI UE5.8.
