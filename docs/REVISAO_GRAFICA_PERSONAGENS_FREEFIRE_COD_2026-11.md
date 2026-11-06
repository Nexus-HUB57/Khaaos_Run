# Revisão visual — personagens e gráficos

**Data:** 2026-11-06
**Escopo:** personagens jogáveis, assets 3D, materiais, animação, LOD, iluminação e evidência de renderização UE5.8.
**Referência de qualidade:** padrão competitivo de battle royale com leitura visual, acabamento de personagem e resposta de combate no nível esperado de Free Fire e Call of Duty; não é alegação de paridade com esses produtos.

## Veredito

O Khaaos Run possui uma base de engenharia visual ampla, mas ainda não possui evidência de um pacote gráfico de produção no nível solicitado. O código contém sistemas de LOD, materiais por espécie, customização, sockets, VFX e locomotion natural; porém os assets 3D não estão integrados ao conteúdo Unreal validado, o roster jogável ainda depende de SVGs/figuras GLB de prova e o pipeline Mixamo recebido não está alinhado ao esqueleto canônico Manny/Gwen.

**Estado atual:** `INFRAESTRUTURA_VISUAL_FORTE / CONTEÚDO_3D_DE_PRODUÇÃO_BLOQUEADO`.

## Evidências auditadas

| Área | Evidência atual | Leitura de produção |
|---|---|---|
| Conteúdo Unreal | `0` arquivos `.uasset` e `.umap`; `17` marcadores `pending_import` | Não há prova de mapa, skeletal mesh, material ou Animation Blueprint importado e cookado |
| Pacote MVP | `CHR_Zheers_Base` com OBJ/DAE e poucos vértices; armas/loot em OBJ/FBX | Serve como prova de pipeline, não como personagem hero de produção |
| Avatares de interface | 33 SVGs 512×512 e catálogo persistido | Boa cobertura de identidade/UI, mas não substitui corpo 3D, rosto, cabelo, roupa e silhueta em jogo |
| Figuras 3D | 6 GLBs de manequim, aproximadamente 18 KB cada | Viewer/prova de perfil; não é roster jogável texturizado |
| GLBs recebidos | 10 arquivos, 10,8–11,6k tris, PBR 2048², 5 animações em um export | Qualidade técnica inicial boa, mas bloqueada por identidade, rig, escala, pose e licença |
| Rig | 23 joints Mixamo; sem dedos e sem twist bones | Incompatível diretamente com o ADR `SK_Manny/SK_Gwen` e insuficiente para mãos/armas premium |
| Materiais | Pipeline C++ com BaseColor, ORM, normal, emissive, subsurface, clear coat e rim light | Infraestrutura de shading configurada; materiais reais e instâncias de personagem ainda não comprovados no editor |
| LOD/animação | Sistema de distância, budget de animação e quatro níveis de LOD em código | Boa estratégia de escala, mas sem captura de execução no UE5.8 não há prova de resultado visual/performance |
| Iluminação | Configurações e diretores para Lumen, atmosfera, LUT e VSM | Não há frame real de GPU/Lumen/Nanite nem screenshot de aceite no hardware alvo |

## Gaps que impedem o salto de qualidade

### P0 — integração real no Unreal

Os assets precisam sair do estado de fonte/placeholder e entrar em `Content/Characters/<Espécie>/` com skeletal meshes, physics assets, materiais, texturas, Animation Blueprints, IK Retargeters e montagens de combate. O preflight atual declara explicitamente `BLOCKED_NO_IMPORTED_UE_CONTENT_OR_MAP`.

**Aceite:** cinco mundos com mapas cookados, pelo menos um personagem hero e um inimigo/bot por espécie, spawn no mapa CIGKV, câmera terceira/primeira pessoa, arma anexada e captura de frame no runner UE5.8.

### P0 — identidade e silhueta

Os GLBs analisados não estão amarrados ao cânon: há divergências de pele, cabelo e rosto para M-04, F-03 e M-01, além da ausência dos traços visuais de espécies como penas, escamas e quitina. Isso reduz a legibilidade de personagem a um nível de protótipo.

**Aceite:** cada operador possui ficha `slot → mesh → espécie → sexo → skin → paleta → prompt/proveniência`, checklist de rosto/cabelo/roupa e silhueta reconhecível a 20–30 metros.

### P0 — rig e combate

O rig Mixamo de 23 joints é funcional para locomoção básica, mas não entrega o controle de mãos, dedos, twist, recoil, ADS e contato de equipamento esperado de um shooter competitivo.

**Aceite:** retarget Mixamo→Manny/Gwen ou re-rig equivalente; dedos e twist preservados; IK de pés e mãos; animações de idle, walk, run, sprint, crouch, slide, jump, land, reload, equip, ADS, fire, hit-react, DBNO e death; validação sem foot sliding e sem clipping de arma.

### P1 — materiais de personagem

A infraestrutura possui parâmetros avançados, mas ainda falta demonstrar materiais autorais com separação correta de pele, tecido, borracha, metal pintado, metal exposto, cabelo, vidro e emissive. Aplicar um `RimLight` forte não substitui microdetalhe, roughness variation, pores, fuzz, anisotropy e resposta consistente à luz.

**Aceite:** material master com instâncias por espécie/skin; BaseColor, Normal, ORM, height/parallax quando justificado, máscara de tecido/pele/metal, subsurface controlado e testes em sol, sombra, noite e interior. Nenhum material deve depender de emissive para esconder ausência de detalhe.

### P1 — cabelo, roupa e acessórios

A referência visual atual ainda depende de avatares 2D e modelos de prova. Para chegar ao patamar pedido, o personagem precisa de camadas de roupa e acessórios com sockets, deformação e LOD próprios.

**Aceite:** cabelo com groom/cards apropriados, roupa separável sem clipping, mochila/coldre/arma/parachute/helmet em sockets, skinning validado em sprint/slide/DBNO e pelo menos três skins com leitura visual realmente distinta.

### P1 — iluminação, pós-processamento e VFX

Lumen, LUTs, atmosfera, outline e VFX aparecem no código, mas ainda não existe screenshot review de produção ou comparação controlada entre presets. O risco é o visual ficar estilizado por parâmetros declarados, sem uma direção de arte consistente.

**Aceite:** matriz de screenshots dos cinco mundos em Low/Medium/High/Ultra; sol, golden hour, noite, interior, chuva/névoa e hazard; leitura de personagem a curta e média distância; sem halo excessivo, banding, flicker, ghosting ou VSM acne.

### P1 — performance gráfica real

O proxy autoritativo passou nos testes de servidor, mas não mede FPS de tela. O dry-run do replay corrigido informa `configurationPass=true` e `realRunnerPass=false`, pois Lumen GPU e fallback Nanite ainda não possuem amostras reais.

**Aceite:** runner UE5.8 com GPU e replay de 10 minutos produzindo Game Thread, Render Thread, GPU, Lumen GPU, fallback Nanite, VRAM, draw calls, shader/PSO hitch e memória. Gate inicial: cliente p95 ≤ 16,67 ms no preset Medium, sem hitch persistente ou crescimento de memória.

## Priorização executável

1. **Fechar o registro de proveniência e mapeamento:** adicionar `assets_3d` ao manifest com slot canônico, SHA-256, gerador, prompt/seed, licença, altura, rig, escala e status.
2. **Escolher um vertical slice:** CIGKV, um operador humano e uma espécie não-humana, uma arma de assalto, um inimigo e uma skin.
3. **Corrigir escala e pose:** alturas canônicas de 168–190 cm, T-pose uniforme, origem no chão, forward +X e convenção de unidades UE.
4. **Retarget/re-rig:** Manny/Gwen, IK de pés/mãos, fingers/twist e pacote mínimo de combate.
5. **Produzir material master:** instâncias de tecido/pele/metal/cabelo com mapas reais e variação de roughness.
6. **Importar no UE5.8:** skeletal mesh, physics asset, ABP, PA, sockets, VFX e cook do mapa CIGKV.
7. **Fazer screenshot review:** comparação por distância, iluminação e preset antes de expandir para as seis espécies.
8. **Rodar o replay gráfico real:** só então declarar o primeiro mundo aprovado visualmente.
9. **Escalar para os cinco mundos:** reutilizar o pipeline de personagem, mas criar lighting/VFX/skin matrices específicas por bioma.

## Critérios de “pronto” para personagens

- Roster 3D integrado e identificável; SVG não conta como substituto.
- Corpo, rosto, cabelo, roupa, acessórios e arma sem clipping nas ações críticas.
- Rig compatível com Manny/Gwen ou retarget formalmente validado.
- 4+ LODs com transição sem pop perceptível.
- PBR consistente em sol, sombra, noite e interiores.
- Material com roughness/normal/microdetail; emissive usado apenas como detalhe de design.
- Animações de combate e locomoção sincronizadas com gameplay e áudio.
- Capturas reais de UE5.8, não apenas manifests, C++ ou proxy Three.js.
- Licença/proveniência de assets de IA resolvida antes de produção/comercialização.

## Conclusão

A direção correta não é adicionar mais subsistemas C++ neste momento. O gargalo principal mudou de engenharia para **conteúdo integrado e prova visual**. O próximo ciclo deve ser um vertical slice UE5.8 completo e filmável, começando pelo CIGKV, antes de ampliar o roster e declarar que os gráficos alcançaram o nível de referência. O projeto pode chegar a esse padrão, mas ainda não há evidência suficiente para afirmar que já chegou.
