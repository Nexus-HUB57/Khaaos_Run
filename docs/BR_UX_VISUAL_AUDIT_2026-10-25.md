# Auditoria Battle Royale: UX, balanceamento e prontidão visual

**Data:** 25/10/2026
**Escopo:** relatórios e dados locais de Khaaos Run. Nenhum benchmark externo foi inferido; nenhum valor de arma ou coordenada de mapa foi alterado para “forçar” aprovação.

## Conclusão executiva

Os arquivos chamados de “paridade Free Fire/Fortnite” são inventários de implementação e metas, não evidências de equivalência. A documentação original sobre parâmetros Free Fire não apresenta fontes, versões, aparelho nem metodologia; suas cifras devem ser tratadas como hipóteses, não reproduzidas literalmente no Unreal. O projeto tem sistemas C++ úteis como base, mas não há Unreal Editor acessível, `.uasset`/`.umap` importados, build, cook ou captura jogável nesta execução. Assim, **não é possível afirmar gráficos de última geração, experiência end-to-end ou desempenho acima de qualquer baseline**.

A prioridade técnica imediata é tornar a evidência verdadeira e reproduzível: o branch adiciona um verificador de métricas teóricas de armas, corrige o gate de CI que mascarava a ausência do script e adiciona um preflight de conteúdo visual que diferencia OBJ/TGA fonte de conteúdo Unreal importado.

## Achados verificáveis

### 1. Relatórios e Free Fire

- `PR_CONSOLE_E2E.md` descrevia “Console Quality Complete” e “Free Fire/Fortnite Parity”, embora os perfis fossem apenas metas e os artefatos de engine necessários não estivessem presentes. O documento foi reclassificado como inventário de código-fonte e lista as validações ainda faltantes.
- `docs/Comandos de Console e Parâmetros de Configuração` continha números de Dalvik, qualidade gráfica, atraso de toque, sensibilidade, refresh rate e DNS sem fonte reproduzível. O texto foi revisado: as cifras são hipóteses históricas, não settings confirmados de Free Fire nem defaults para Unreal.
- Não encontrei no repositório uma série de partidas, gravação de benchmark ou metodologia comparável que permita afirmar paridade medida com Free Fire.

### 2. Prontidão de arte e renderização

- `mvp_output/assets/asset_report.json` registra 11 meshes com 502 vértices e 812 faces somados, além de seis entradas de VFX. Os 12 TGAs examinados são 64×64 px.
- `Unreal/KhaaosRun/Content` contém 17 marcadores `*_pending_import` e zero `.uasset`/`.umap`; o ambiente não encontra `UnrealEditor`/`UnrealEditor-Cmd`.
- O relatório legado de 103/103 verifica existência/estrutura de placeholders e quantidade mínima. Não demonstra importação, cook, materiais finais, Lumen/Nanite, VFX Niagara, FPS ou qualidade visual.
- O novo comando `python3 scripts/mvp/step4_3d_assets/check_visual_readiness.py` gera um status advisory. Atualmente deve resultar em `BLOCKED_NO_IMPORTED_UE_CONTENT_OR_MAP`. O JSON de estado versionável está em `mvp_output/assets/visual_readiness_report.json`.

### 3. Balanceamento de armas

- O relatório antigo declarava `balance_status: VALID`, DPS máximo/mínimo de 5,53× e TTK teórico de 0,286 s para algumas armas automáticas.
- A fórmula é um cálculo contínuo que pressupõe todos os projéteis/pellets atingirem. Não inclui hit rate, dispersão, recuo, falloff, armadura, intervalo discreto entre disparos, rede ou telemetria de partidas.
- Há fontes de design discordantes: `asset_manifest_mvp.json` registra, por exemplo, AR com dano 28 e shotgun 120/8 pellets; `components_dev/weapons/*.json` registra AR com 35 e shotgun 12/9 pellets. Não se deve nerfar ou buffar armas sem confirmar qual tabela é a fonte autoritativa e recolher dados de playtest.
- Foi criado `scripts/validate_weapon_balance.py`. Ele reproduz as fórmulas de `KhaaosWeaponDataAsset::CalculateDPS`, detecta divergência de fonte/relatório e mantém `balance_status: UNVERIFIED` até existir evidência de playtest. O workflow GitHub Actions deixou de ignorar falha do validador.

### 4. Dados do mapa CIGKV

- O guia CIGKV e `DefaultCIGKV.ini` indicam 10.000 × 10.000 unidades/cm, mas `config/levels/CIGKV_level_data.json` e sua cópia no Content indicam 2.048 × 2.048 cm.
- A fonte JSON tem distribuição de spawn 5/25/20; o validador espera 5/20/25; o guia textual declara 15/20/15. A raridade JSON 30/17/8/3/2 diverge do alvo do relatório 30/15/10/3/2; o teste de `UKhaaosCIGKVMapData` usa outra distribuição espacial de loot, 10/25/25 por setor.
- O relatório existente conta 280 pares de spawn a menos de 500 cm e 26 proximidades spawn–ZEX. Esses números reproduzem os limiares codificados, mas 500 cm ainda não está confirmado como regra de fairness e a escala/fonte de runtime diverge. **Não foi feita alteração de coordenadas** para evitar codificar uma decisão de design especulativa.

## Mudanças desta entrega

1. `scripts/validate_weapon_balance.py`: cálculo determinístico, validação de IDs únicos/valores e status de evidência não certificado.
2. `scripts/mvp/step4_3d_assets/check_visual_readiness.py`: geometria OBJ, dimensões TGA, contagem de `.uasset`/`.umap` e marcadores de importação; presença de arquivos segue explicitamente não validada.
3. `tests/python/test_quality_preflights.py`, `npm run test:python` e `verify:all`: testes automatizados das regras acima.
4. `.github/workflows/08-weapon-balance.yml`: falhas do script não são mais mascaradas com `|| echo`.
5. Revisões de `PR_CONSOLE_E2E.md` e do documento de parâmetros para distinguir implementação, hipótese e evidência.
6. [Protocolo de playtest de armas](WEAPON_PLAYTEST_TELEMETRY_PROTOCOL.md) e `scripts/analyze_weapon_playtests.py`: contrato CSV v1 e resumo descritivo reproduzível. O analyzer não certifica balanceamento; a captura Unreal end-to-end não está habilitada.
7. [ADR espacial CIGKV em rascunho](ADR-CIGKV-SPATIAL-CONTRACT-DRAFT.md): questões/owners organizados sem aprovar valores nem modificar coordenadas.

## Próximos gates para UX de última geração

1. Escolher uma fonte autoritativa para escala, setores, spawns, ZEX, loot e distribuição; alinhar JSON, `AKhaaosCIGKVLevelData`, `UKhaaosCIGKVMapData`, teste e gerador. Depois, revisar fairness espacial com regra de clearance aprovada.
2. Definir plataformas/hardware de referência e metas por perfil. Importar arte final de personagens, armas, ambiente, materiais, animações e VFX; abrir o mapa em Unreal 5.8, compilar, cozinhar e capturar frame-time/resolução.
3. Executar sessões de playtest com telemetria contextual: spawn/POI, mortes por causa, TTK, hit rate, loot por raridade, win/pick rate, RTT/jitter e feedback de legibilidade do HUD.
4. Somente então ajustar parâmetros e declarar desempenho ou paridade. O Unreal Engine é a ferramenta, não um benchmark; “acima do nível Unreal” precisa ser traduzido em métricas observáveis por hardware e build.

## Validação realizada nesta branch

- `python3 tests/python/test_quality_preflights.py` — 8 testes passaram.
- `python3 scripts/validate_weapon_balance.py --check` — passou; 11 armas reproduzidas e relatório consistente.
- `npm run verify:all` — **PASSOU em 31/10/2026**: TypeScript, build, suíte oficial, 35 testes Python + validador de armas, regras portáveis UE5 e build/testes do runtime (967 passaram, 13 foram ignorados, 0 falharam). A integração PostgreSQL opt-in foi ignorada porque `TEST_DATABASE_URL` não estava configurada.
- O pipeline acima não contém build/cook do Unreal Editor; esse gate permanece pendente por ausência de Unreal Editor e conteúdo importado.
- O analyzer de playtest passou em 15 testes unitários usando fixtures sintéticas apenas para testar o código; o template CSV vazio foi rejeitado como esperado. Nenhum dado real de playtest foi fornecido/analisado; o balanceamento continua **UNVERIFIED**.
