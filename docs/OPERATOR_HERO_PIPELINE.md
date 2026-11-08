# Operator Hero — pipeline de produção

## Estado

O asset gerado ainda não está disponível: a operação 3D exige 91 créditos e a conta possui 82. Nenhum crédito foi consumido e nenhum `.fbx` foi criado. O pipeline de integração já está preparado em `game-runtime/src/game3d/hero3d.js` e permanece opt-in; o personagem procedural continua sendo o fallback oficial.

## Contrato do asset-base

- Arquivo esperado: `game-runtime/public/assets/models/operative_hero_base.fbx`
- Formato: FBX com topologia quad, T-pose simétrica e origem compatível com o runtime.
- Corpo: humano adulto, anatomia atlética natural, sem armas, mochila, capacete ou acessórios.
- Cabeça: uma malha facial contínua com loops de pálpebra, nariz, boca, mandíbula e queixo; expressão neutra para blendshapes.
- Mãos: palma, quatro dedos e polegar separados, webbing e nós dos dedos; sem luvas-mitten ou dedos fundidos.
- Pivôs canônicos: quadril em `y=0.84`; pescoço/cabeça em `y=1.68`.
- Orçamento inicial: até 120k triângulos no hero full, proxy até 900 triângulos e no máximo 12 draw calls no full asset.

## Realismo humano e identidade

O objetivo é máxima semelhança humana, sem aparência de boneco ou caricatura. Cada avatar deve ser construído a partir de referências humanas coerentes para etnia, sexo, faixa etária e biotipo, preservando variações naturais de estrutura facial, pele, cabelo, proporções, massa muscular e postura. Etnia deve orientar referências de traços e cabelo, nunca estereótipos ou exageros.

O rosto precisa suportar expressão neutra, esforço, dor, concentração e respiração por blendshapes ou joints faciais. Olhos, pálpebras, lábios, mandíbula e pescoço devem deformar sem atravessar a malha. O cabelo deve usar hair cards ou groom compatível com o LOD, com silhueta e densidade adequadas ao penteado.

## Movimento natural

O sistema de animação deve preservar peso e equilíbrio: plantio do pé, centro de massa, inclinação do tronco, balanço dos braços, respiração aditiva e recuperação após aceleração, parada, mira e impacto. Locomoção, mira, manuseio de arma e reação a dano devem ser camadas combináveis, sem a rigidez de uma marionete. A captura ou animação de referência deve ser ajustada ao biotipo do avatar, evitando retargeting que altere a passada ou desloque o quadril.

## Roupas e grupos de origem

Militares, milícias, gangues e sobreviventes devem ser distinguíveis pela construção das roupas e pelo contexto, não por caricaturas. Cada perfil recebe peças com tecido, costuras, fechos, desgaste, poeira, umidade, remendos, bolsos, coldres, coletes, patches e decalques coerentes com sua função e facção. Equipamentos que deformam com o corpo devem ser skinned; itens rígidos permanecem attachment meshes para não quebrar a animação.

## Integração segura

`loadHeroOperative()` carrega o FBX de modo assíncrono, normaliza sombras, escala e metadados de pivô, e retorna `null` em qualquer falha. A troca do procedural só deve acontecer depois de validar rig, animação, silhueta e custo de renderização em High/Medium/Low.

## Próximas etapas

1. Gerar o FBX quando houver pelo menos 9 créditos adicionais.
2. Verificar malha, UVs, escala e orientação em ferramenta DCC.
3. Retopologizar rosto e mãos mantendo loops para deformação.
4. Criar mapas regionais: albedo, normal, roughness e subsurface da pele; hair cards separados.
5. Fazer rig humanoide preservando os pivôs do runtime.
6. Produzir LOD full/proxy/silhouette e comparar frame time com 100 atores.
7. Integrar por feature flag; só então substituir o procedural nos close-ups.
