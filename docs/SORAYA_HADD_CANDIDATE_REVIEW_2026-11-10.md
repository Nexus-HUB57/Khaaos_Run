# Soraya Hadd — revisão do candidato GLB

**Data:** 2026-11-10

**Base oficial revisada:** `Nexus-HUB57/Khaaos_Run`, `main` em `b5d80a4`. A branch deste PR foi fast-forwardada para essa base antes de adicionar os arquivos; não substitui trabalho recente dos demais devs.

**Status do asset:** `proxy_source`, somente para avaliação; não aprovado para produção, não carregado no jogo e não destinado a uso comercial.

## Decisão

O único GLB gerado sob autorização em 2026-11-06 fica arquivado em `artifacts/avatar-candidates/soraya-hadd/`, fora do diretório público do runtime. Ele serve como evidência reproduzível de avaliação, não como substituto do personagem canônico nem do pipeline CIGKV. A inspeção encontrou aparência genérica cinza e não identificou com clareza a paleta rubi/areia/bronze, o rabo de cavalo tático alto ou os detalhes de desativação de Soraya Hadd. Portanto, não deve ser ligado a `loadHeroOperative()`, ao catálogo canônico ou à importação UE5.

## Estado do repositório e dos outros trabalhos

O `main` avançou 158 commits desde a base observada em 2026-11-06. Antes de editar a branch, ela foi sincronizada por fast-forward até `b5d80a4`; não havia PR aberto nem arquivos com os mesmos caminhos. O main atual já contém as melhorias procedurais Fase 50/51, a auditoria [`AVATAR_REALISM_AUDIT_2026-11-09.md`](AVATAR_REALISM_AUDIT_2026-11-09.md), o contrato [`OPERATOR_HERO_PIPELINE.md`](OPERATOR_HERO_PIPELINE.md), quality gates CIGKV e um slice humano diferente (Khael/Zheers). A auditoria do main classifica os avatares atuais como adequados para gameplay estilizado, mas aquém do realismo de close-up de um operador AAA.

O slice CIGKV já contém uma fonte GLB rigada separada e um pacote de retarget pendente de validação no Editor. Seu manifesto marca a proveniência como `unverified_internal_prototype`, `commercial_use: false` e revisão de identidade pendente; ele não é Soraya e não foi alterado por este PR. O runtime hero existente espera um FBX em `game-runtime/public/assets/models/operative_hero_base.fbx`, mantém o procedural como fallback e permanece opt-in. O candidato deste documento não é compatível com esse contrato de integração.

A consulta read-only ao endpoint do GitHub Actions retornou **0 self-hosted runners** no repositório. A validação final UE5.8 continua pendente de runner/Editor licenciado; não alegamos aceite em engine.

## Evidência e quality gate

O GLB [`CHR_Huran_Female_Soraya_candidate.glb`](../artifacts/avatar-candidates/soraya-hadd/CHR_Huran_Female_Soraya_candidate.glb) tem 1.830.152 bytes e SHA-256 `00da99632f04cf849781dbbfabf0d5a98aceec3735f776bfabb42f93e21e0705`. A [prévia de inspeção](../artifacts/avatar-candidates/soraya-hadd/preview.png) preserva a aparência efetivamente gerada. O arquivo contém uma malha, um material, três imagens 2048×2048 e um conjunto UV, mas Base Color é praticamente monocromático. A avaliação estrutural encontrou 7.199 vértices e 4.928 triângulos; o GLB não contém skin, joints ou animações.

O quality gate oficial `scripts/ue5/audit_cigkv_character_assets.py`, executado com [`audit-manifest.json`](../artifacts/avatar-candidates/soraya-hadd/audit-manifest.json), produziu [`quality-report.json`](../artifacts/avatar-candidates/soraya-hadd/quality-report.json): **1 proxy_source, 0 production_candidate, 0 bloqueios estruturais e 2 avisos** (`proxy_or_low_detail_mesh_below_5000_triangles`, `no_skeletal_skin_detected`). O limite vigente é de 5.000 vértices e 5.000 triângulos, UV, material/textura e skin para personagens animados. O candidato excede o mínimo de vértices, mas fica 72 triângulos abaixo do mínimo e não tem skin. `proxy_source` significa somente que o arquivo é legível; não é aceite visual, rig ou produção.

A avaliação gratuita de riggabilidade informou `riggable=true` e bípede recomendado. O usuário autorizou uma única operação paga de rigging, mas ela **não foi submetida**: a ferramenta exigia 65 créditos, havia 37 (déficit de 28); nenhum crédito foi cobrado e nenhum GLB rigado foi criado. Não foram geradas animações nem um segundo modelo.

## Proveniência e limites

A geração 3D foi autorizada pelo usuário como uma única tentativa para Soraya Hadd. Não há confirmação independente de licença de uso comercial; manter como `unverified_internal_prototype` e `commercial_use: false` até revisão. A geração adicional não está autorizada. O PR mantém o binário apenas como candidato de avaliação e não o marca como asset aprovado.

## Escopo desta alteração

Este PR acrescenta apenas o candidato em `artifacts`, sua prévia, manifesto/relatório do quality gate e este registro. Não altera `game-runtime`, os assets de outros devs, o cânone visual Fase 50/51, os sistemas de jogo, o protocolo DBNO de 7 segundos ou a configuração do runner. Testes de runtime não foram repetidos, pois não há alteração de código de runtime; o gate estrutural do asset foi executado e o resultado permanece explicitamente `proxy_source`.
