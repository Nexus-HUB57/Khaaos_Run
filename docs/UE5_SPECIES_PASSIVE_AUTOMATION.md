# Automation Tests — passivas de espécie (UE 5.8)

## Zheers — Adaptabilidade

A passiva Zheers está implementada como Gameplay Ability persistente, executada pela autoridade do servidor, que aplica um GameplayEffect infinito com **10% de redução somente para dano tipado como ambiental** (`Effect.Damage.Environment`). O código integra o cálculo em `KhaaosAttributeSet`, valida o mundo de origem ativo pela política server-authoritative `KhaaosEnvironmentalDamagePolicy` e encaminha hazards de mundo e a chuva ácida de Barburhen pelo pipeline ambiental.

A decisão de escopo é intencional: não reduz dano de armas/projéteis, explosões, corpo a corpo, fogo genérico, queda, safe zone ou Pulso. A mitigação depende de tag ambiental válida e de um identificador de mundo ativo correspondente; IDs ausentes ou de outro mundo devem falhar fechados.

O teste nativo `Unreal/KhaaosRun/Source/KhaaosRun/Private/Tests/KhaaosZheersPassiveTests.cpp` registra:

- `Khaaos.GAS.Species.Zheers.EnvironmentMitigation`
- tag ambiental registrada, comparação de IDs (case-insensitive), rejeição de ID divergente e falha fechada quando o ID está ausente;
- concessão/ativação autoritativa da passiva, permanência ativa e valor efetivo de 10% no GameplayEffect;
- dano ambiental de 100 reduzido a 90 no cálculo e no caminho tipado do AttributeSet;
- ausência de mitigação para Bullet, Explosion, Fire, Melee, Zone, Pulso e Fall;
- cancelamento da ability removendo o efeito persistente.

Esse teste cobre o contrato GAS e o caminho tipado de dano; não substitui um teste em mundo/mapa carregado com os emissores reais de hazard e chuva ácida. As alterações de Health/MaxHealth e Shield/MaxShield no AttributeSet são espelhadas para o Character replicado; Health também atualiza o componente de Vitalidade. Uma eliminação ambiental recebe a causa `AMBIENTE` e o GameMode finaliza o estado de morte do Character. Essa integração está implementada, mas ainda precisa de execução no runner UE5.8 antes de declarar o aceite de engine completo.

### Cenários E2E obrigatórios no runner

1. Com defesa 0 e sem escudo, aplicar 100 de dano do hazard ativo de Barburhen a Zheers e confirmar 90 de dano, Health igual a 10 no AttributeSet, PlayerState, Character e VitalityComponent; confirmar que não houve segunda mitigação.
2. Repetir com Shield 50 e confirmar que o escudo e a vida do Character acompanham exatamente o AttributeSet após a absorção GAS.
3. Aplicar dano ambiental letal e confirmar uma única eliminação, `EliminationCause=AMBIENTE`, sem `EliminatorId`, movimento desativado e evento `OnDeath` emitido uma vez.
4. Repetir com um `SourceWorldId` divergente ou ausente e confirmar que não há alteração de Health/Shield, XP, Rating ou estado da partida.
5. Confirmar que Bullet, Explosion, Fire genérico, Melee, Zone, Pulso e Fall continuam sem mitigação Zheers.

## Outras passivas

O teste histórico `KhaaosOtherSpeciesPassiveTests.cpp` inclui contratos de ativação/configuração de Skeetw, Huran, Venex e Khael. Esses contratos não devem ser tratados como prova de paridade funcional de gameplay. A cobertura comportamental de cada espécie deve ser adicionada e executada separadamente conforme seu efeito seja implementado. Onith possui implementação e documentação próprias; esta suíte Zheers não altera nem amplia seu escopo.

## Execução e evidências

No Unreal Editor 5.8, com o projeto compilado por UnrealBuildTool, executar:

```text
Automation RunTests Khaaos.GAS.Species
```

Para isolar Zheers:

```text
Automation RunTests Khaaos.GAS.Species.Zheers
```

O teste portátil `npm run test:ue5:logic` cobre regras sem o Editor/UBT; na revisão local de 2026-11-01 passou com **49 verificações de lógica**. Isso não é um build C++ nem execução de Automation Tests do Unreal. O ambiente desta alteração não contém `UnrealEditor` ou `UnrealBuildTool`; portanto, o teste nativo e o build UE5.8 seguem pendentes de um runner/instalação UE 5.8 licenciada. Não marcar o gate de engine como concluído até obter artefatos e exit code do runner.
