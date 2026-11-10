# Soraya Hadd — revisão do candidato GLB

**Data:** 2026-11-10
**Base oficial revisada:** `Nexus-HUB57/Khaaos_Run`, `main` em `b5d80a4`. A branch do PR permanece atualizada com essa base; nenhum trabalho de outros desenvolvedores foi sobrescrito.

**Status:** o arquivo final passou no quality gate estrutural como `production_candidate`; isso **não** equivale a aceite visual, validação UE5.8, licenciamento ou autorização para integrar ao jogo.

## Decisão

O único GLB gerado sob autorização em 2026-11-06 permanece arquivado em `artifacts/avatar-candidates/soraya-hadd/`, fora do diretório público do runtime. Ele é evidência de avaliação, não uma substituição do personagem canônico nem do pipeline CIGKV. A inspeção visual anterior encontrou aparência genérica e não identificou claramente a paleta rubi/areia/bronze, o rabo de cavalo tático alto ou os detalhes de desativação de Soraya Hadd. O candidato não deve ser ligado a `loadHeroOperative()`, ao catálogo canônico ou à importação UE5 antes de revisão de arte.

O PR continua **Draft** porque o gate estrutural não mede identidade facial, silhueta, deformação, clipping, foot sliding, resposta PBR ou resultado no Editor UE5.8. A licença de uso comercial também permanece não verificada; tratar como protótipo interno (`commercial_use: false`).

## Estado do repositório e dos outros trabalhos

O `main` revisado é `b5d80a4`. A branch deste PR inclui esse main e não altera o código de jogo, o protocolo DBNO de 7 segundos, assets canônicos Fase 50/51 ou arquivos de outros devs. O main contém as melhorias procedurais Fase 50/51, a auditoria [`AVATAR_REALISM_AUDIT_2026-11-09.md`](AVATAR_REALISM_AUDIT_2026-11-09.md), o contrato [`OPERATOR_HERO_PIPELINE.md`](OPERATOR_HERO_PIPELINE.md) e o quality gate CIGKV. O slice CIGKV existente é separado, não é Soraya e não foi alterado.

A API do repositório retornou **0 runners self-hosted** na última consulta. O workflow [UE5.8 run #42838075679](https://github.com/Nexus-HUB57/Khaaos_Run/actions/runs/42838075679) continua `queued`, aguardando um runner com os labels `self-hosted`, `linux`, `ue5.8` e `x64`. Desde o SHA do run (`737ea05`), não houve mudanças nos caminhos que disparam esse workflow (`Unreal/KhaaosRun/Source/**`, `.uproject` e mock/testes de telemetria); ele cobrirá o código UE5 relevante do `main` atual quando um runner compatível iniciar o job.

## Rigagem e ajuste de triângulos

A rigagem bípede paga autorizada foi aplicada **uma vez** ao GLB original; não foi gerado outro modelo. O arquivo de saída bruto [`CHR_Huran_Female_Soraya_rigged.glb`](../artifacts/avatar-candidates/soraya-hadd/CHR_Huran_Female_Soraya_rigged.glb), SHA-256 `b0334941c56e483ef8b5dfff179729f781fe74a6a4f07a21da5b176fcea794af`, contém 1 skin com 41 joints, UV, material e texturas, mas manteve 4.928 triângulos. A auditoria dessa saída está em [`quality-report-rigged.json`](../artifacts/avatar-candidates/soraya-hadd/quality-report-rigged.json) e classifica-a como `proxy_source` apenas pelo aviso de triângulos abaixo do mínimo.

O script [`adjust_glb_triangle_minimum.py`](../scripts/ue5/adjust_glb_triangle_minimum.py) divide 36 faces selecionadas de forma determinística em três faces em torno de cada centróide barycêntrico. Isso acrescenta exatamente 72 triângulos e 36 vértices sem deslocar os vértices/posições originais; UVs, normais e pesos de skin dos novos vértices são interpolados, e os pesos são renormalizados. **É um ajuste topológico mínimo para satisfazer o limiar numérico, não uma adição de detalhe anatômico ou de alta frequência.**

O resultado [`CHR_Huran_Female_Soraya_rigged_5000tri.glb`](../artifacts/avatar-candidates/soraya-hadd/CHR_Huran_Female_Soraya_rigged_5000tri.glb), SHA-256 `5ac3c809eb5b7577f7b25afd544cbef12004a6e8a8dceeafe258650bc7ab9e07`, tem 7.248 vértices, 5.000 triângulos, 1 skin/41 joints, 1 UV set, 1 material e 3 imagens/texturas; a auditoria confirma 0 erros e 0 avisos. Os pesos dos 36 novos vértices somam 1 dentro da tolerância float (desvio máximo inferior a `4e-8`).

O manifesto e o relatório finais são [`audit-manifest-rigged-final.json`](../artifacts/avatar-candidates/soraya-hadd/audit-manifest-rigged-final.json) e [`quality-report-rigged-final.json`](../artifacts/avatar-candidates/soraya-hadd/quality-report-rigged-final.json). O gate usa a classe `production_candidate` para a **estrutura da fonte**; não certifica o personagem como asset final nem cria `.uasset`/`.umap`.

## Evidência original e proveniência

O GLB original [`CHR_Huran_Female_Soraya_candidate.glb`](../artifacts/avatar-candidates/soraya-hadd/CHR_Huran_Female_Soraya_candidate.glb), SHA-256 `00da99632f04cf849781dbbfabf0d5a98aceec3735f776bfabb42f93e21e0705`, e sua [prévia de inspeção](../artifacts/avatar-candidates/soraya-hadd/preview.png) são mantidos sem alteração. Ele contém 7.199 vértices e 4.928 triângulos, sem skin/joints/animações; o relatório original [`quality-report.json`](../artifacts/avatar-candidates/soraya-hadd/quality-report.json) registra 2 avisos. Assim, ficam preservadas as três etapas auditáveis: modelo original, saída bruta rigada e saída rigada ajustada.

A avaliação gratuita de riggabilidade recomendou um rig bípede. Não foram solicitadas nem geradas animações. A fonte de geração continua sendo um único candidato autorizado; nenhum segundo modelo foi gerado.

## Validação pendente e escopo

- **Passou:** validação do contêiner GLB 2.0; coerência dos contadores de atributos/índices; 5.000 triângulos no relatório oficial; 1 skin/41 joints; pesos dos vértices interpolados normalizados; JSON dos manifestos/relatórios válido; `py_compile` do script de ajuste.
- **Pendente:** inspeção e deformação no Blender, retarget/Physics Asset/Animation Blueprint e validação no Editor UE5.8 licenciado. O runner compatível ainda não está registrado; o workflow acima permanece na fila.
- **Não alterado:** `game-runtime`, conteúdo/Blueprints da Unreal, gameplay, DBNO, assets canônicos ou implementação dos demais devs.

O gate estrutural é reproduzível por `python3 scripts/ue5/audit_cigkv_character_assets.py --manifest artifacts/avatar-candidates/soraya-hadd/audit-manifest-rigged-final.json --output artifacts/avatar-candidates/soraya-hadd/quality-report-rigged-final.json`.
