# Política de superfícies e orientação gráfica dos mundos

**Status:** proposta de implementação visual. Este arquivo registra escolhas atuais de preview/runtime; não cria coordenadas, medidas ou regras viárias canônicas.

## Referências e convenção de orientação

As referências oficiais definem identidades, setores, proporções e landmarks dos mundos, mas em geral não fixam quantidade, largura, pavimentação ou geometria direcional de ruas. Barburhen tem suporte textual para estradas rachadas; isso não especifica uma malha urbana exata. Em Priadus, Ckesalth e Arukheea, a ausência de uma especificação de ruas não deve ser interpretada como proibição canônica. A decisão nesta implementação é evitar que uma rede asfaltada universal seja renderizada como se fosse regra de todos os biomas.

O preview usa norte para cima: linhas verticais representam eixos norte–sul e horizontais, leste–oeste. No runtime 3D, `x` representa leste–oeste e `z` norte–sul, com `+z` ao sul. As dimensões do ring/preview e a escala local do runtime são contratos diferentes; esta nota não converte nem reconcilia essas escalas.

## Política visual por cenário

| Mundo | Tratamento atual no runtime e no preview | Limite de fidelidade |
|---|---|---|
| **CIGKV / Khaaos Ville** | O runtime mantém quatro acessos radiais de treinamento, sem anel viário; a praça asfaltada central fica exclusiva deste cenário. O preview desenha quatro eixos de acesso esquemáticos, orientados aos quadrantes. | Os documentos descrevem o campo fortificado, Armory, Proving Grounds, parque e ZEX, mas não fixam essa planta viária. Os acessos são uma escolha visual, não cânone. |
| **Barburhen** | O runtime usa uma malha urbana ortogonal fixa, interrompida onde estruturas ocupam o traçado. A superfície é asfalto sem sinalização central contínua; calçadas são renderizadas apenas aqui. O preview usa eixos N–S/E–O estáveis e rotula a malha como esquemática. | Estradas rachadas são compatíveis com o texto oficial; quantidade, coordenadas, cruzamentos e largura continuam sendo proposta. A afirmação “Parque central” e a posição atual do setor ainda precisam de reconciliação macroespacial separada. |
| **Priadus** | Não há asfalto, calçadas, faixas ou tráfego rodoviário genérico. O preview não desenha uma rede de ruas e indica que a planta de caminhos/passarelas ainda não está definida. | Selva, pântanos, rios, decks, plataformas e trem constam das referências; nenhuma rota natural recebe coordenadas aqui. A política não declara que trilhas sejam proibidas. |
| **Ckesalth** | Não há malha viária asfaltada genérica. Os arcos internos do preview são classificados e estilizados como cristas de duna/relevo, nunca como ruas. | A refinaria, oleodutos, vilarejo, resort, lagoas de óleo e areia movediça são referências do cenário; oleodutos não são tratados como vias e nenhum caminho de serviço é inventado. |
| **Arukheea** | Não há asfalto, calçadas, faixas ou tráfego rodoviário genérico. O preview informa que a geometria de trilhas/ponte ainda não está plantada. | As referências mencionam caminhos na mata/cavernas e ponte à prisão, mas não definem sua projeção cardinal. As passagens deverão ser desenhadas quando a escala e as âncoras direcionais forem reconciliadas. |

## Implementação e invariantes

A configuração de superfície está em `game-runtime/src/game3d/scenarios.js` (`roadPolicy`) e é propagada pelo layout em `game-runtime/src/game3d/layout3d.js`. `detail3d.js` gera acessos de CIGKV e a grade cardinal de Barburhen; os demais cenários recebem zero segmentos rodoviários. `world3d.js` evita a praça universal, calçadas e superfície urbana nos mapas naturais. O preview correspondente está em `client/src/components/world-map-preview.tsx`; cristas de Ckesalth têm uma legenda e um estilo próprios.

Essas mudanças afetam apenas desenho/dressing. Os colliders, geometria de gameplay, regras de ring, pontos de loot e economia não são alterados por esta política. As rotas e grades são determinísticas; a grade de Barburhen só abre lacunas quando o segmento colide com estruturas.

## Pendências antes de fixar uma planta canônica

1. Aprovar se CIGKV terá acessos formais/pavimentados e qual deve ser a planta dos três ambientes oficiais.
2. Resolver a relação entre o Parque central de Barburhen e as posições de setor usadas no runtime.
3. Definir âncoras cardinais e reconciliar a posição do Templo de Priadus, da Refinaria/Vila Sombria de Ckesalth e da Prisão/Marina de Arukheea.
4. Reconciliar as escalas divergentes de ring, preview e runtime antes de publicar coordenadas métricas.
5. Usar uma futura fonte única de landmarks/rotas somente após aprovação de produto/arte; RNG seedado deve continuar restrito a variação decorativa, não à orientação macro.
