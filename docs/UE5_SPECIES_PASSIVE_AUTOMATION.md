# Automation Tests — passivas de espécie (UE 5.8)

## Cobertura adicionada

O arquivo `Unreal/KhaaosRun/Source/KhaaosRun/Private/Tests/KhaaosOtherSpeciesPassiveTests.cpp` registra testes independentes:

- `Khaaos.GAS.Species.Zheers.ActivationContract`
- `Khaaos.GAS.Species.Skeetw.ActivationContract`
- `Khaaos.GAS.Species.Huran.ActivationContract`
- `Khaaos.GAS.Species.Venex.ActivationContract`
- `Khaaos.GAS.Species.Khael.ActivationContract`

Cada teste verifica os parâmetros padrão declarados no CDO e a fronteira de ciclo de vida no ASC servidor: o spec pode ser concedido/ativado, continua ativo após a ativação e termina ao ser cancelado. Isso valida a infraestrutura GAS e os valores de configuração, mas **não afirma que o efeito de gameplay da passiva já esteja implementado**.

## Lacunas funcionais explícitas

As implementações atuais de Zheers, Skeetw, Huran, Venex e Khael ainda contêm comentários/logs de intenção em `KhaaosAbility_SpeciesPassives.cpp`, sem aplicação de efeito de gameplay. Depois que cada efeito for implementado, seus testes devem cobrir comportamento e rede, por exemplo:

- **Zheers:** resistência ambiental só para os tipos de ambiente previstos, com valor e limite definidos.
- **Skeetw:** janela de glide, velocidade/gravidade no ar, aterrissagem, cancelamento e autoridade servidor.
- **Huran:** regeneração somente na condição aquática definida, bônus de cura sem duplicação e limpeza do timer.
- **Venex:** gatilho de eliminação, aumento de cadência/reload durante 5 s, expiração e ausência de stack indevido.
- **Khael:** custo de energia e cooldown efetivos, clamp/rounding e ausência de redução em custos não pertencentes à habilidade.

Não se deve marcar paridade funcional dessas passivas como concluída somente com os testes de ativação/configuração.

## Execução no Unreal Editor 5.8

Com o projeto compilado por UnrealBuildTool e aberto no Editor, executar:

```text
Automation RunTests Khaaos.GAS.Species
```

Para testar apenas uma espécie, use o nome completo da lista acima. O ambiente de desenvolvimento desta alteração não contém UnrealEditor nem UnrealBuildTool; portanto, esses Automation Tests ainda precisam de execução em runner/instalação UE 5.8 licenciada.
