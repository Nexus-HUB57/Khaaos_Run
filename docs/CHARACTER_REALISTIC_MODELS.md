# Modelos de personagem realistas

A integração de personagens realistas já está presente no checkout versionado e foi validada nesta preparação do PR.

## Pipeline

- `game-runtime/src/game3d/avatars3d.js` mantém o catálogo de 10 avatares GLB, com tiers `static`, `rigged` e `animated`.
- `loadAvatarGlb()` carrega os modelos de forma assíncrona e memoizada.
- Cada avatar é normalizado para a altura canônica de 1,8 m e apoiado no chão.
- Falhas de rede, parse ou ausência de asset retornam `null`; o runtime mantém o personagem procedural como fallback e não quebra o boot.
- `main3d.js` conecta o carregamento opcional dos GLBs ao fluxo de operativos e preserva o fallback procedural.
- `lod3d.js` mantém full/proxy/hidden com histerese e orçamento reduzido para atores distantes.
- `entities3d.js` fornece anatomia curva, materiais de pele memoizados, micro-SSS, animação contínua e API de `parts` compatível com armas e câmera.

## Validação executada

Os testes focados de áudio e personagens passaram, incluindo:

```text
50 passed, 0 failed
```

A suíte cobre o contrato de `audiomix.js`, os 10 GLBs, escala e grounding, realismo anatômico, orçamento de triângulos, compartilhamento de geometria, animação, LOD e fallback headless.

Os binários GLB existentes são tratados como assets fornecidos pelo repositório. Nenhum serviço pago ou geração externa foi usado para esta integração.
