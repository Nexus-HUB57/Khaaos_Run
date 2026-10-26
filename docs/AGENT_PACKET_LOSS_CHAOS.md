# Chaos tests de perda de pacotes dos agentes KR

## Objetivo e escopo

O cenário `tests/official/agent-packet-loss-chaos.test.ts` exercita a fronteira assíncrona `CouncilAgentAdapter` com perda de mensagens determinística. Um LCG sem dependência de relógio, serviço externo ou `Math.random()` torna as falhas reproduzíveis. A matriz percorre 0%, 10%, 25% e 50% de perda sobre até 40 conselhos com evento crítico de RTT por perfil, e depois força perda em cada agente nas fases de análise e revisão.

O teste verifica que um conselho só termina `complete` se todas as mensagens necessárias chegarem; um drop deixa resultado `partial`, o agente afetado em `hold`, reason code para revisão humana e nenhuma resolução executável. Também limita cada adapter a uma tentativa por fase para deixar explícito que não há retries implícitos ou duplicação de chamadas.

## Executar

```bash
npm run test:agent-packet-loss
npm run check
npm run test:official
```

O caso novo também é descoberto por `npm run test:official` e pode rodar em CI de PR. Nenhuma URL, conta, segredo, banco, deploy ou ambiente compartilhado é acessado pelo harness.

## Limite entre simulação e staging

A orquestração atual injeta `CouncilAgentAdapter` como porta de processo: os adapters usados nos testes são funções locais em memória, não conexões de rede independentes para cada agente. Por isso, a matriz acima simula drops na fronteira das mensagens entre agentes, mas **não aplica perda de pacotes à infraestrutura real de staging** nem comprova qualidade de rede no host staging. Um `tc/netem` no runner ou uma perda no tráfego cliente → API não isolaria o tráfego interagentes inexistente.

Para caos de rede real no staging, a arquitetura precisa primeiro expor/adotar transporte de agente que possa ser roteado via proxy de caos (por exemplo, Toxiproxy) e instrumentar a taxa real de perda, timeouts e recuperação. A campanha externa requer um staging isolado identificado, janela aprovada, limite de tráfego, identidade de teste allowlisted e plano de limpeza/rollback; não deve atingir produção nem jogadores reais. Não execute tráfego de caos externo sem esses controles.
