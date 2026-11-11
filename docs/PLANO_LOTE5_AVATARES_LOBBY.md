# Lote 5 — Retratos realistas no lobby

**Branch:** `feat/lote5-realistic-lobby-roster`
**Dependência:** PR #365 / `feat/lote4-avatars-realistas` (catálogo, arte e integração de perfil/Studio).
**Escopo:** fechar a jornada do retrato selecionado até a lista de operativos da sala, sem introduzir personagens, alterar IDs ou mexer em assets 3D.

## Diagnóstico

O perfil persistia `selectedOperativeId` e o `RoomManager` já serializava `avatar` a partir do catálogo local confiável. Contudo, o tipo runtime não carregava a rota opcional de WebP e o lobby renderizava diretamente `avatarPath` (SVG). Assim, o roster podia voltar ao desenho vetorial ao entrar na sala, mesmo com um personagem do Lote 4 selecionado.

## Implementação deste incremento

1. Expandir o contrato `OperativeAvatarRuntime` com `realisticAvatarPath?`, ainda derivado da lista whitelist do catálogo.
2. No lobby, resolver novamente o ID pelo catálogo local e preferir o caminho realista do payload runtime ou do catálogo. Nunca usar um host/URL vindo de perfil do jogador.
3. Em falha de carregamento do WebP, voltar para o SVG canônico conhecido. Operativos militares, TALON, snapshots antigos e IDs inválidos continuam funcionando sem migração.
4. Acrescentar teste de contrato cobrindo os 16 WebPs, o fallback SVG, roster militar e ID inválido.

## Critérios de aceite

- `npm run check`: PASS após restaurar deps via `npm ci`.
- Contratos `character-studio` e `militia-roster`: 11/11 PASS; inclui projeção server/runtime e fallback.
- `npm run build`: PASS; bundle do lobby gerado.
- `npx playwright test tests/e2e/war-i-ui.spec.ts -g 'lobby carrega retrato realista'`: 1/1 PASS no browser local; valida cartão PIXEL, identidade/codinome e `naturalWidth > 0` do WebP servido pelo Vite.
- Ainda pendente: confirmação dos mesmos paths no ambiente web de homologação e smoke pós-deploy com commit/SHA esperado.

## Status em 2026-11-11

**Implementação local:** concluída na branch acima. **Aceite end-to-end:** UI + asset provados localmente; implantação remota segue bloqueada.

- O workflow manual legado Deploy (`43082003968`) compilou as imagens e tentou acionar Render, mas falhou no health gate `/readyz` exigindo Postgres/Redis; o serviço não serviu `/` nem os WebPs nessa verificação.
- O inventário Render confirmou que `khaaos-run-staging` está configurado com build/start `cd game-runtime && ...` e branch `main`, ou seja, é o runtime autoritativo e não o serviço web React que contém `/profile` e `client/public/avatars/realistic`.
- O host VPS `staging.143-95-213-237.sslip.io` serve o cliente Game Runtime, mas os novos WebPs retornam 404. Não enviar o artefato web para esse host.
- Não criar nem reconfigurar um serviço Render sem decisão explícita de plataforma/custo. Próximo passo de operação é o dono do projeto definir/restaurar um alvo web de staging que execute o app raiz, ou habilitar o alvo/secret correto; depois executar smoke de saúde, SHA e os 16 paths.

## Limites

Esta etapa é apenas UI 2D para retratos selecionáveis. Não produz mesh, animação ou rig, não altera gameplay e não muda schema de persistência. A publicação do Lote 5 deve acontecer após o aceite/merge da dependência #365 para evitar um PR dependente de uma branch ainda não integrada.
