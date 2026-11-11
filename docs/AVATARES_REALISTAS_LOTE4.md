# Avatares realistas — Lote 4

**Branch de desenvolvimento:** `feat/lote4-avatars-realistas`
**Roster:** 16 personagens existentes (8 masculinos, 8 femininos; 8 MILICIA_URBANA e 8 GANGUE_URBANA).
**Status:** retratos 2D fotorrealistas ligados ao perfil e ao Character Studio; SVGs canônicos preservados como fallback. Não são modelos 3D riggados nem assets UE5.

## Fontes e build do pacote

As fontes PNG de 1920×1920 ficam em `.generated/lote4/` e não são rastreadas pelo Git. Para reproduzir o pacote web, instalar Pillow com suporte WebP e executar na raiz do repositório:

```bash
python3 scripts/lote4_milicias/build_realistic_avatar_pack.py
```

O script exige todos os 16 PNGs, verifica o roster contra `Content/Avatars/avatar_catalog.json`, converte cada imagem para WebP quadrado de 768×768, qualidade 86, e grava os arquivos em `client/public/avatars/realistic/`. Também gera `avatar_catalog.json` com ID, facção, resolução, hashes SHA-256 da fonte e derivado, caminho, status de uso e ressalva de licença.

## Integração de produto

`shared/operative-avatar-catalog.ts` disponibiliza `realisticAvatarPath` somente para os 16 operantes do Lote 4. O perfil persistente e o `OperativeAvatarBadge` do Character Studio preferem a imagem realista; quando o WebP falha ao carregar, o SVG existente é mantido/retomado automaticamente. Os 16 militares canônicos e TALON não mudam.

O teste `Lote 4: pacote realista WebP com 16 retratos, proveniência e fallback SVG` valida cardinalidade, IDs, caminhos, metadados, formato RIFF/WEBP, limite de tamanho e SHA dos derivados. Ele não avalia artisticamente semelhança facial nem prova que os PNGs correspondem perfeitamente a cada prompt.

## Estado e limites

Os retratos são arte conceitual 2D com aparência fotorrealista para UI/roster. A existência de um PNG/WebP não cria mesh, textura UV, skinning, animação, skeleton SK_Manny/SK_Gwen, LOD ou import/cook de Unreal. Para produção 3D continuam necessários modelagem/retopologia, rig/retarget, validação de altura/pose, importação no Editor UE5.8 e aceite visual.

O pacote é AI-generated. O campo `commercial_use` fica em `requires separate rights/license approval`: não foi feita determinação jurídica de licença comercial. Antes de lançamento comercial, registrar procedência e obter a aprovação de direitos/licenças exigida pelo projeto.
