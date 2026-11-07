# Roteiro de apresentação — Khaaos Run
## Performance UE5.8, stress dos cinco mundos e FPS Live Action

**Duração sugerida:** 10 a 12 minutos
**Público:** engenharia, produção, direção técnica e stakeholders de gameplay
**Base:** `UE58_LIVE_ACTION_FPS_REPORT.md` e `ue58-all-worlds-stress.json`

> **Mensagem de precisão:** os números de FPS deste ciclo são métricas do proxy determinístico da simulação autoritativa. O FPS de renderização do Unreal Engine 5.8 ainda não foi medido, porque o editor licenciado não estava disponível no ambiente.

## 1. Objetivo do ciclo — 1 minuto

“Este ciclo teve dois objetivos: verificar se a simulação sustenta os cinco mundos simultaneamente sob uma carga de 300 operadores e estruturar o gate visual para a experiência Live Action em primeira pessoa.

Vamos separar duas camadas. A simulação autoritativa foi medida neste ambiente. A renderização final em Unreal Engine 5.8 depende de um runner licenciado e de hardware gráfico compatível.”

**Mostrar:** cinco mundos, 60 operadores por mundo, 300 no total, stress de 30 segundos e orçamento de servidor de 33,33 ms por tick.

## 2. Escopo do teste — 1 minuto

| Mundo | Jogadores | Tempo | Ticks |
|---|---:|---:|---:|
| CIGKV | 60 | 30 s | 900 |
| Barburhen | 60 | 30 s | 900 |
| Priadus | 60 | 30 s | 900 |
| Ckesalth | 60 | 30 s | 900 |
| Arukheea | 60 | 30 s | 900 |
| **Total** | **300** | **30 s simultâneos** | **4.500** |

“A carga foi executada simultaneamente. Não é a soma de testes sequenciais: os cinco mundos avançaram no mesmo ciclo de execução.”

## 3. Resultado executivo — 1 minuto

- Gate da simulação: **PASS**.
- p95 agregado: **1,062 ms** por tick.
- Orçamento do servidor: **33,33 ms** por tick.
- Proxy server-equivalente agregado: **941,62 FPS**.
- Renderização UE5.8: **não medida** neste ambiente.

“O resultado é positivo para a camada autoritativa. O valor de 941,62 FPS é uma conversão do custo de simulação em tempo de tick. Não é FPS de tela, não mede GPU, Lumen ou Nanite e não deve ser apresentado como desempenho gráfico do Unreal.”

## 4. Comparação por mundo — 1 minuto e 30 segundos

| Mundo | p50 | p95 | p99 | Proxy server-equivalente | Gate |
|---|---:|---:|---:|---:|---|
| CIGKV | 0,154 ms | 0,999 ms | 1,629 ms | 1001,32 | PASS |
| Barburhen | 0,181 ms | 1,062 ms | 1,732 ms | 941,91 | PASS |
| Priadus | 0,174 ms | 1,043 ms | 1,708 ms | 958,67 | PASS |
| Ckesalth | 0,231 ms | 0,998 ms | 1,599 ms | 1002,46 | PASS |
| Arukheea | 0,138 ms | 0,984 ms | 1,480 ms | 1016,48 | PASS |

“Barburhen apresentou o maior p95, com 1,062 ms, seguido de Priadus, com 1,043 ms. Ainda assim, ambos ficaram muito abaixo do limite de 33,33 ms. A conclusão é que nenhum mundo provocou saturação do tick autoritativo.”

## 5. O que foi medido e o que falta — 1 minuto

**Medido:** tempo de tick, p50, p95, p99, máximos, execução simultânea, eventos, hazards e gate de servidor.

**Ainda não medido:** FPS de GPU, frame time de Lumen, Nanite e Virtual Shadow Maps, shader hitch, PSO warm-up, VRAM, draw calls e custo de animação, partículas e pós-processamento.

“Não declaramos aprovação gráfica antes da captura no Unreal Engine 5.8 com os mapas cookados, os materiais finais, os efeitos e a câmera de primeira pessoa ativos.”

## 6. Gate visual Live Action — 1 minuto

| Métrica | Alvo | Critério |
|---|---:|---|
| FPS de renderização | ≥ 60 FPS | p95 de frame time ≤ 16,67 ms |
| Frame time de render | ≤ 16,67 ms | Captura Stat Unit/CSV no UE5.8 |
| Server tick | ≥ 30 Hz | p95 ≤ 33,33 ms |
| LOD/frustum gate | Ativo | Confirmar ganho no Unreal Insights |
| PBR/Lumen | Sem hitch crítico | Warm-up de shaders e PSO |

“A meta de 60 FPS significa um orçamento de 16,67 ms por frame no cliente. Esse orçamento é diferente dos 33,33 ms do tick do servidor.”

## 7. Estratégia de otimização — 1 minuto e 30 segundos

1. Manter personagens próximos em LOD completo.
2. Usar proxy e silhueta para distâncias maiores.
3. Aplicar culling por frustum antes de aumentar a densidade de props.
4. Tratar High como referência, Medium como alvo operacional de 60 FPS e Low como fallback.
5. Escalonar Lumen e Virtual Shadow Maps por perfil.
6. Fazer warm-up de PSO e shaders antes das capturas oficiais.
7. Instrumentar Unreal Insights, Stat UnitGraph, GPU Visualizer e CSV.

“A estratégia é preservar a leitura Live Action em primeira pessoa e remover custo onde ele é menos percebido: atores distantes, objetos fora do frustum, sombras secundárias e densidade de props.”

## 8. Pipeline de release — 1 minuto

“O workflow `UE5.8 Release CI/CD` valida TypeScript, runtime e regras UE5; executa o stress; e gera um pacote reprodutível. Com um runner UE5.8 licenciado, ele também faz build, cook, stage, pak e executa o hook de stress real.

Publicação e deploy são separados por ambientes protegidos. Um teste de performance não autoriza automaticamente uma promoção para produção.”

**Mostrar:** `.github/workflows/ue58-release-cd.yml`, relatório Markdown, JSON de stress e manifesto do pacote.

## 9. Próximos passos — 1 minuto e 30 segundos

1. Configurar runner self-hosted com Unreal Engine 5.8 e hardware alvo.
2. Executar os cinco mapas com Unreal Insights, Stat UnitGraph e GPU Visualizer.
3. Repetir o stress por 10 minutos por mundo e em execução simultânea.
4. Medir High, Medium e Low com a mesma seed e replay.
5. Registrar frame time p1/p5/p95, FPS, VRAM, draw calls e custo de GPU.
6. Bloquear o release se o cliente exceder 16,67 ms no p95, o servidor exceder 33,33 ms ou houver hitch persistente, crash ou crescimento de memória.

## Encerramento

“Os cinco mundos suportaram 300 operadores no proxy autoritativo, todos os gates de simulação passaram e o pior p95 ficou muito abaixo do orçamento de servidor. A parte gráfica ainda não foi aprovada porque o Unreal Engine 5.8 não estava disponível para medir GPU e frame time de renderização.

O próximo marco é executar o mesmo protocolo em um runner licenciado, com mapas cookados, hardware alvo e instrumentação Unreal Insights. Assim teremos a separação correta entre capacidade da simulação e FPS Live Action real.”

## Perguntas prováveis

**Podemos dizer que o jogo roda a 941 FPS?**

Não. É FPS server-equivalente do proxy de simulação, não FPS de tela.

**O gate da simulação passou?**

Sim. Os cinco mundos passaram o limite de 33,33 ms por tick; o pior p95 foi 1,062 ms em Barburhen.

**O jogo já está aprovado para 60 FPS?**

Ainda não. É preciso medir p95 de frame time de renderização ≤ 16,67 ms no hardware alvo e no perfil Medium do UE5.8.

**Qual mundo foi mais pesado?**

Barburhen pelo p95 do proxy, com 1,062 ms, seguido de Priadus, com 1,043 ms.

**O que falta para a validação gráfica?**

Runner UE5.8 licenciado, mapas cookados, captura de Unreal Insights/Stat Unit/GPU Visualizer, warm-up de shaders e soak test nos perfis High, Medium e Low.
