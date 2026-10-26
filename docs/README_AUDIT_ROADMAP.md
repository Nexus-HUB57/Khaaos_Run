# README Audit Roadmap — P0/P1

**Repositório:** `Nexus-HUB57/Khaaos_Run`
**Documento auditado:** [`README.md`](../README.md)
**Escopo:** consistência documental, caminhos reproduzíveis, semântica de status e rastreabilidade entre README e artefatos versionados.
**Princípio:** manter o nível técnico “Devs Ph.D” sem apresentar código, stubs ou configuração como produção validada.

## Resultado executivo

A auditoria encontrou quatro classes de divergência:

1. **Status superafirmado:** “Produção”, “Implementado” e “CÓDIGO COMPLETO” eram usados para componentes cujo build UE5, assets 3D, credenciais EOS/EAC, staging ou evidência operacional ainda estão pendentes.
2. **Caminhos não reproduzíveis:** comandos e links omitidos ou apontados para a raiz errada.
3. **Métricas sem critério explícito:** contagens de arquivos/linhas e número de serviços não informavam escopo de contagem.
4. **Histórico/documentação de execução desatualizados:** o histórico de PRs não acompanha o estado recente e não diferenciava artefato criado de critério de aceite validado.

## Matriz P0 — auditoria cirúrgica

| ID | Achado | Evidência observada | Risco | Correção aplicada | Aceite |
|---|---|---|---|---|---|
| P0-01 | Status de produção inconsistente | Seções `Status do Projeto` e `Limitações Conhecidas` | Leitura equivocada de readiness | Status reescrito como código, staging, dependência externa ou pendência | Nenhum componente é declarado operacional sem evidência explícita |
| P0-02 | Build UE5 com caminho incorreto | README apontava `Unreal/KhaaosRun/Build/build-server.sh`; artefato real: `scripts/build-server.sh` | Onboarding falha no primeiro comando | Comandos agora usam `bash scripts/build-server.sh ...` | `test -x scripts/build-server.sh` e help do script são caminhos canônicos |
| P0-03 | Compose com caminho implícito/quantidade incorreta | Compose real em `Unreal/KhaaosRun/Build/docker-compose.yml`, com 5 serviços e 1 rede | Deploy local ambíguo | Comandos usam `docker compose -f ...`; inventário corrigido | `docker compose -f ... config` funciona quando Docker está disponível |
| P0-04 | Scripts de fase citados sem subdiretório | Artefatos em `scripts/fase2/` e `scripts/fase5/` | Operação não reproduzível | Todos os exemplos apontam ao caminho real | Cada caminho documentado existe no checkout |
| P0-05 | Links e paths UE5 incompletos | Módulos reais em `Unreal/KhaaosRun/Source/KhaaosRun/Game/`; convenções em `Unreal/KhaaosRun/Docs/` | Navegação e manutenção degradadas | Links e mapa de código corrigidos | Verificador de links internos sem referências quebradas |
| P0-06 | “Concluído” confundido com “aceite” | Fases 0–5 marcadas como concluídas enquanto build/assets/go-live estão pendentes | Go-live prematuro | Nota de semântica e títulos “artefatos implementados / aceite pendente” | Cada fase distingue implementação de validação |
| P0-07 | Métricas e histórico sem escopo/data | 16.165 vs. 25.000+ linhas; histórico termina no PR #15 | Auditoria técnica não reproduzível | Métricas qualificadas e histórico tratado como snapshot | Contagem informa escopo; histórico não é apresentado como completo |

## P1 — correções aplicadas end to end

- [x] README atualizado com uma legenda operacional de status.
- [x] Status inicial reclassificado para não confundir código com produção.
- [x] Caminhos de build, Compose, scripts de fase e documentação UE5 corrigidos.
- [x] Inventário Docker alinhado ao Compose versionado: 5 serviços, 1 rede e 6 volumes nomeados.
- [x] Instruções locais passaram a ser executáveis a partir da raiz do repositório.
- [x] Roadmap passou a diferenciar “artefato implementado” de “critério de aceite validado”.
- [x] Link de `ASSET_NAMING_CONVENTIONS.md` corrigido.
- [x] Métricas de linhas/arquivos qualificadas por escopo.
- [x] Alterações locais preexistentes em `game-runtime/*.ini` preservadas.

## Checklist de validação

Executar a partir da raiz do repositório:

```bash
test -f README.md
test -f scripts/build-server.sh
test -f Unreal/KhaaosRun/Build/docker-compose.yml
test -f scripts/configure_webhooks_v2.sh
test -f scripts/fase2/setup_eos_production.sh
test -f scripts/fase5/deploy_multiregion.sh
test -f scripts/fase5/golive_checklist.sh
test -f Unreal/KhaaosRun/Docs/ASSET_NAMING_CONVENTIONS.md
bash scripts/build-server.sh --help
bash -n scripts/fase5/golive_checklist.sh
npm run check
```

O build UE5 e o Compose não são declarados como validados neste ambiente: o primeiro requer UE5.8/Linux SDK e o segundo requer Docker e suas imagens/dependências. A auditoria P0 valida a presença dos artefatos e a coerência documental; a validação operacional é um gate separado.

### Resultado desta execução

- **PASS:** 18 links internos do README resolvidos.
- **PASS:** caminhos canônicos de build, Compose, scripts de fase e convenções UE5 presentes.
- **PASS:** `bash scripts/build-server.sh --help` e `bash -n scripts/fase5/golive_checklist.sh`.
- **PASS:** `npm ci` restaurou as dependências declaradas no lockfile e `npm run check` concluiu sem erros (`typescript@5.6.3`, `@types/node@20.19.27`, `vite@7.3.7`).

## Gates seguintes

### P1.1 — Documentação

- Atualizar este snapshot quando houver mudança estrutural de scripts, Compose ou workflows.
- Anexar evidência de CI/staging aos status “validado”.
- Manter o histórico de PRs em changelog ou release notes, não como lista manual incompleta no README.

### P1.2 — Engenharia/Go-live

- Compilar e empacotar o dedicated server UE5.
- Importar e validar mapas/assets jogáveis.
- Validar EOS em staging com Product/Sandbox/Deployment IDs reais.
- Integrar e testar o binário EAC aprovado.
- Executar stress test com relatório versionado.
- Validar ledger, compliance e controles antes de qualquer valor monetário real.
- Demonstrar rollback, failover e health checks em cada região.

## Regra de manutenção

Toda nova afirmação de “produção”, “go live” ou “concluído” no README deve apontar para uma evidência verificável: workflow/run, relatório de teste, configuração versionada, release ou documento de aceite. Código presente sozinho deve permanecer como **implementado**, não **operacional**.

## Snapshot incremental — 2026-10-26

A auditoria foi repetida contra o checkout da branch de documentação e contra o estado atual do GitHub, sem incorporar PRs ainda abertos:

| Verificação | Resultado | Consequência documental |
|---|---|---|
| Workflows versionados | 16 arquivos em `.github/workflows/` | README deixou de declarar 8 workflows e passou a distinguir automação de aceite |
| Escopo UE5 reproduzível | 108 `.cpp`, 107 headers e 46.843 linhas em `Unreal/**/*.cpp|*.h|*.hpp` | Métricas históricas sem escopo foram removidas do baseline principal |
| PRs no GitHub | 97 mesclados e 4 abertos em 2026-10-26 | PRs #102, #111, #112 e #113 foram explicitamente marcados como fora da base `main` até merge |
| Checklist UE5 | `KhaaosLaunchChecklist` registra 14 checks | README diferencia esse checklist do `scripts/fase5/golive_checklist.sh`, que possui 25 checks |
| CI de cobertura | Nenhuma referência a `npm run test:coverage` nos workflows | README registra cobertura como validação local, não como gate CI |
| Gates locais | `npm run check` e `npm run test:official` passaram | README registra 220 testes aprovados, 1 skip e 0 falhas |

Também foi corrigida a semântica do roadmap: `✅` nas fases significa artefato/lógica versionado; aceite operacional continua condicionado ao critério verificável da própria linha. As alterações não commitadas em `game-runtime/*.ini` foram preservadas e ficaram fora da auditoria documental.
