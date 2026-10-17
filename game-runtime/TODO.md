# Khaaos Run — Backlog de Produção

## Entregas comprovadas

- [x] Entregar vertical slice jogável do CIGKV.
- [x] Modularizar simulação, RNG, armas, loot e replay.
- [x] Criar servidor authoritative com anti-cheat.
- [x] Integrar cliente online com snapshots e interpolação.
- [x] Adicionar matchmaking por salas e regiões.
- [x] Implementar tokens assinados, hash scrypt e RBAC base.
- [x] Implementar reconexão por resume token com janela de 15 segundos.
- [x] Implementar persistência atômica de sessões no adapter local.
- [x] Implementar rate limit com adapter compartilhável em memória.
- [x] Adicionar testes de autenticação, persistência, reconexão, regiões e concorrência.
- [x] Expor liveness público em `GET /healthz`, com teste de contrato e sem dados sensíveis.

## Próxima entrega de código

- [x] Formalizar a máquina de estados da sala (`LOBBY → IN_PROGRESS → FINISHED`) com transições válidas, idempotência de início, snapshot da fase e teste de sequência monotônica.
- [x] Garantir sequência monotônica de snapshots/ticks e rejeição de input fora da fase `IN_PROGRESS`.
- [x] Aplicar limite de payload WebSocket de 16 KiB, limite de buffer de saída de 256 KiB e encerramento controlado sob backpressure.
- [x] Expor `GET /readyz` separado de liveness, verificando os adapters obrigatórios sem consultar dependências lentas.
- [x] Adicionar métricas de saturação, mensagens rejeitadas, payloads excedentes e backpressure ao endpoint administrativo.

## Integrações de produção pendentes

- [ ] Substituir `DurableJsonStore` por banco transacional com migrações, fencing e testes de recuperação.
- [ ] Conectar adapter Redis/KeyDB real com `INCR` + expiração atômica cross-process.
- [ ] Adicionar TLS, rotação de chaves, revogação e SSO/OIDC operacional.
- [ ] Implementar RBAC com auditoria e permissões por recurso.
- [ ] Adicionar ping real, health/readiness de dependências, backpressure e autoscaling por região.
- [ ] Testar múltiplas instâncias, falha de processo, reconnect após reinício, soak e fault injection.
- [ ] Definir economia e compliance antes de conectar qualquer valor real, carteira, resgate ou custódia.

## Dependências externas bloqueadoras

- [ ] Compilar UE5.8 com UnrealBuildTool e executar Automation Tests em ambiente com Editor/SDK.
- [ ] Criar/importar `.umap`, meshes, materiais e Niagara dos mundos jogáveis.
- [ ] Integrar binários oficiais do EAC SDK e validar build cliente/servidor.
