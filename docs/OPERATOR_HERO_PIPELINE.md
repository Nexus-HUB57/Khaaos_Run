# Operator Hero — pipeline de produção

## Estado

O asset gerado ainda não está disponível: a operação 3D exige 91 créditos e a conta possui 82. Nenhum crédito foi consumido e nenhum `.fbx` foi criado. O pipeline de integração já está preparado em `game-runtime/src/game3d/hero3d.js` e permanece opt-in; o personagem procedural continua sendo o fallback oficial.

## Alinhamento com o documento canônico de modelagem

Este pipeline segue o contrato de produção definido em `Epic Games/IMPLEMENTACAO_GRAFICA/KHAAOS_RUN_Modelagem_3D_Revisao_Tecnica.docx`, especialmente o fluxo **briefing aprovado → fonte DCC → validação → export intermediário → transformação por destino → validação pós-transformação → importação → validação in-engine → cook → teste em aparelho**. O `.blend` e as texturas de autoria continuam sendo a fonte-mestre; FBX/glTF são derivados versionados por `source_sha256`, receita, toolchain e perfil de destino.

O documento canônico usa a escala de autoria como referência e recomenda budgets por erro projetado. Para o runtime Three.js atual, a ponte operacional é explícita: o hero DCC pode chegar a 120k triângulos, mas o asset de gameplay full permanece em **≤6.500 triângulos**, o proxy em **≤900** e a silhouette em **≤200**, com no máximo 12 draw calls no hero full. A escala ilustrativa do documento canônico (`24k → 12k → 6k → 3k`) é uma hipótese de produção e não substitui a medição do runtime; qualquer redução deve ser aprovada por silhueta, deformação, materiais, sockets e frame time.

### Plano de implementação sincronizado — Operator Hero

1. **Manifesto e fonte:** registrar `asset_id`, revisão, unidade `1 m`, eixos `+Y/-Z`, pivôs `hip=0.84` e `neck/head=1.68`, hashes da fonte DCC, receita de export, materiais, sockets e colisores.
2. **Blockout humano:** validar proporções, sexo, idade, biotipo, centro de massa, mãos, pés, hitbox e leitura a 3 m/15 m/30 m antes de adicionar detalhe.
3. **Sculpt e retopologia:** esculpir crânio, rosto, mãos e roupa; retopologizar com loops contínuos de pálpebra, nariz, boca, mandíbula, pescoço, ombro, cotovelo, punho, quadril, joelho e tornozelo.
4. **UV e materiais:** criar UVs por região, atlas de pele/roupa/equipamento e mapas mipados por plataforma; detalhes menores que não alteram a silhueta devem migrar para normal, roughness, decalque ou máscara.
5. **Rig e deformação:** aplicar o esqueleto humanoide do contrato, no máximo 4 influências no corpo e 2 em acessórios deformáveis, bind/T-pose, sockets estáveis, retarget por proporção e validação de pesos.
6. **Cabelo e rosto:** produzir hair cards/groom com LOD, olhos com controles separados, blendshapes faciais básicos e corretivos de pálpebra, bochecha, lábio e pescoço.
7. **Animação e IK:** integrar locomoção, mira, dano, queda, recuperação, foot planting, IK contextual e microexpressões; rejeitar foot sliding, joelho invertido, equipamento flutuante ou interseção.
8. **Redução por destino:** gerar hero full, gameplay full, proxy e silhouette com redução por erro projetado; comparar o conjunto vestido, não somente o corpo isolado.
9. **Integração opt-in:** carregar via `loadHeroOperative()`, manter o procedural como fallback e ativar o hero apenas após validação High/Medium/Low, 100 atores e smoke test de armas/câmera.
10. **Aceite:** anexar evidências de round-trip, screenshots a 3/15/30 m, contagem de triângulos/draw calls, frame time, memória residente, testes de rede e checklist humano de semelhança.

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

### Perfil de milícia

**Leitura visual:** força irregular organizada, com mistura de peças civis resistentes e excedente militar. A silhueta deve sugerir prontidão e improviso controlado, sem parecer um uniforme oficial completo. A paleta usa tons terrosos, verde desbotado, cinza, azul-marinho ou cores locais discretas; a cor de facção aparece em braçadeira, fita, patch ou detalhe de equipamento, nunca como pintura uniforme em todo o corpo.

**Vestuário-base:** calça cargo ou jeans reforçado com joelheiras de lona, camiseta ou camisa de manga longa, sobrecamisa, jaqueta utilitária e botas de trabalho ou coturnos gastos. Misturar tecidos e idades de peça é obrigatório: uma peça pode estar nova enquanto outra apresenta desbotamento, remendo, abrasão e manchas de poeira. Modelagem deve respeitar sexo, idade e biotipo do avatar; bolsos, punhos e barras precisam acompanhar a deformação da rig.

**Proteção e carga:** colete modular simples ou chest rig de baixa a média cobertura, cinto utilitário, rádio, lanterna, cantil, bolsa médica compacta e mochila pequena ou média. O equipamento deve parecer adquirido, adaptado ou reparado, com fivelas diferentes, costuras visíveis e peças substituídas. Não usar excesso de placas ou acessórios que transformem o perfil em operador militar de elite.

**Identidade de grupo:** patches ficcionais, números de pelotão, faixas de tecido, símbolos geométricos e marcações feitas à mão podem comunicar hierarquia e pertencimento. Evitar símbolos reais de extremismo, organizações criminosas ou grupos políticos. Insígnias devem ser legíveis apenas em curta distância e contar com variantes por desgaste, posição e cor.

**Materiais e mapas PBR:** lona e nylon com trama visível, couro seco nas botas, metal pintado com bordas polidas pelo uso, borracha opaca e poeira acumulada em bainhas e joelhos. Albedo deve variar por painel; roughness mais alta em tecido e mais baixa em metal manuseado; normal map reservado para costuras, trama, zíperes e rebites. Ao molhar o personagem, escurecer tecido e reduzir roughness sem apagar manchas permanentes.

### Perfil de gangue

**Leitura visual:** identidade territorial e expressão individual, com roupa urbana adaptada para mobilidade. A silhueta deve nascer do corte da jaqueta, do moletom, da calça e dos acessórios, não de armadura pesada. Cada membro precisa manter um elemento comum da facção e dois ou três elementos pessoais, permitindo reconhecer o grupo e diferenciar os personagens.

**Vestuário-base:** moletom, camiseta estampada, camisa aberta, jaqueta jeans, bomber ou corta-vento; calça cargo, jeans ou utilitária; tênis reforçado, botas urbanas ou calçado de trabalho. Modelagens, penteados, barba, maquiagem, tatuagens e acessórios devem refletir idade e biotipo individuais sem reduzir identidade étnica a figurino. Barra, manga e capuz devem ter simulação visual de volume e deformar sem atravessar o corpo.

**Equipamentos e acessórios:** pochete ou sling bag, rádio curto, celular, luvas leves, máscara ou bandana contextual, corrente, boné, gorro, óculos, joelheira improvisada e pequenos kits de ferramentas. Itens pendentes precisam de pontos de attachment e limites de oscilação; itens próximos ao rosto ou às mãos devem ter LOD próprio para não gerar interseções durante corrida, escalada e mira.

**Identidade de grupo:** paleta de duas ou três cores, grafismos abstratos, tags ficcionais, patches costurados e decalques removíveis. A marca da facção deve existir em pelo menos três estados — nova, desbotada e parcialmente removida — e nunca depender de uma cor única para ser reconhecida. Não utilizar símbolos reais de gangues, supremacistas ou organizações criminosas; criar linguagem visual original para o universo de Khaaos Run.

**Materiais e mapas PBR:** algodão e moletom com roughness alta e microtrama, denim com variação azul/cinza e abrasão em joelhos e bolsos, couro sintético com brilho irregular, borracha de tênis com sujeira de contato e metal de correntes com riscos finos. Tatuagens, estampas e tags devem ser overlays/albedo regionais, não geometria pesada. A aparência de tecido molhado deve ser localizada nas áreas expostas à chuva e nas dobras inferiores.

### Perfil de forças regulares

**Leitura visual:** unidade oficial treinada, padronizada e logisticamente abastecida. A silhueta deve ser limpa e funcional, com peças de corte semelhante entre os integrantes, mas com diferenças humanas de ajuste, altura, postura, idade, desgaste e acessórios autorizados. O conjunto precisa comunicar disciplina e organização sem apagar a individualidade facial, corporal ou cultural do avatar.

**Vestuário-base:** uniforme de combate em camisa e calça coordenadas, camiseta técnica, cinto de serviço, botas regulamentares e cobertura de cabeça conforme o ambiente. A camuflagem ou cor sólida deve pertencer ao mundo e à unidade narrativa; cada peça recebe escala, repetição e orientação de tecido coerentes, evitando textura esticada. Bolsos, joelheiras integradas, cotoveleiras, punhos, gola e barras devem acompanhar a deformação do esqueleto.

**Proteção e carga:** colete balístico ou plate carrier de configuração padronizada, placas representadas por volume discreto, porta-carregadores, rádio, identificação, lanterna, kit médico, luvas e mochila regulamentar. O peso visual deve ser distribuído ao redor do centro de massa: ombros e quadril suportam a carga, enquanto itens pequenos não devem flutuar ou atravessar braços e torso. Capacetes, óculos, protetores auriculares e máscaras devem ser attachment meshes com pontos de encaixe consistentes.

**Padronização e variação:** 70–80% do conjunto deve seguir o kit da unidade; os 20–30% restantes podem variar entre manga dobrada, segunda camada, luvas, óculos, cobertura de cabeça, mochila e estado de conservação. Insígnias e patches devem ser ficcionais ou licenciados, posicionados em áreas coerentes e legíveis apenas na distância de combate. A variação nunca deve alterar a leitura de aliado/inimigo ou a silhueta de hitbox.

**Materiais e mapas PBR:** ripstop e nylon com trama direcional, tecido com roughness alta e variação de sujeira nas áreas de contato, borracha fosca, polímero texturizado e metal pintado com desgaste nos fechos. A camuflagem deve usar albedo e roughness regionais; costuras, velcro, zíperes e presilhas entram no normal map. Lama e chuva são estados temporários; desgaste estrutural permanece como variante determinística.

### Perfil de operadores especiais

**Leitura visual:** equipe de missão especializada, com kit modular, acabamento superior e configuração orientada à função. A silhueta deve parecer compacta e móvel, com menos elementos soltos e maior integração entre roupa, proteção e sensores. O perfil não deve virar um personagem coberto por tecnologia: rosto, biotipo, postura e movimento continuam visíveis e humanos.

**Vestuário-base:** base layer ajustada, uniforme de baixa assinatura visual, overshirt ou jaqueta técnica, calça articulada com reforços, botas de aderência e luvas de precisão. Painéis de tecido podem ter cores e roughness diferentes para indicar áreas flexíveis, impermeáveis e resistentes à abrasão. Costuras e reforços devem seguir quadril, joelho, cotovelo e ombro para deformar naturalmente durante corrida, agachamento e mira.

**Proteção e carga:** plate carrier leve ou harness modular, cinto de missão, rádio com headset, proteção ocular, joelheiras articuladas, kit médico compacto, ferramentas, sensores e mochila de perfil baixo. Cada operador especial deve ter uma função visual dominante — reconhecimento, brecha, suporte, precisão ou mobilidade — expressa por dois ou três módulos de equipamento, nunca por dezenas de gadgets. Itens eletrônicos precisam de materiais emissivos discretos e estados de energia controlados pelo runtime.

**Integração e personalização:** o kit pode receber módulos assimétricos, mas deve manter um eixo de equilíbrio perceptível. Camuflagem, acabamento fosco, coberturas de proteção e marcas de missão devem combinar com o mundo de origem. Patches e símbolos são ficcionais, com versões nova, usada e parcialmente removida; não utilizar insígnias de forças reais, grupos extremistas ou organizações criminosas.

**Materiais e mapas PBR:** nylon laminado, tecidos elásticos, polímero reforçado, borracha de vedação, cerâmica fosca, metal anodizado e lentes com roughness controlada. Normal maps devem concentrar-se em trama, costuras, placas, trilhos, fechos e sensores; detalhes que não alteram a silhueta devem migrar para albedo, roughness ou decalque. Pequenas telas e indicadores não podem competir com o rosto nem iluminar o cenário de modo artificial.

**Animação e leitura funcional:** movimentos de operadores especiais devem mostrar treinamento sem parecer robótico: transições rápidas, mas com desaceleração, transferência de peso, controle dos ombros e retorno do equipamento após cada ação. A pose de mira, corrida, queda e recuperação deve ser ajustada ao biotipo de cada avatar. Módulos rígidos seguem os bones de attachment; correias, tecidos e cabos usam deformação ou física limitada para evitar chicote visual e custo excessivo.

## Especificação de shaders PBR — pele e cabelo

### Pele do hero

O material de pele deve usar um fluxo linear PBR com `metalness=0`, `ior≈1.40`, `specular` controlado por região e roughness não uniforme. O conjunto mínimo de texturas é `skin_albedo`, `skin_normal`, `skin_roughness`, `skin_subsurface` e `skin_cavity`; o canal alpha da máscara de subsurface pode reservar regiões para orelha, nariz, bochecha, lábio e ponta dos dedos. Albedo não deve carregar iluminação pintada, blush uniforme ou poros de alta frequência que virem ruído em baixa resolução.

No hero full, aplicar normal de média frequência mais micro-normal procedural ou atlas, roughness na faixa aproximada de `0.38–0.72`, variação de oleosidade sutil na testa/nariz e máscara de espessura para orelhas, nariz e dedos. O subsurface deve ser uma aproximação móvel e limitada: diffuse wrap ou SSS de uma amostra com espessura, intensidade baixa e sem halo visível. No Three.js, implementar a variante hero por `onBeforeCompile`/shader patch sobre o material PBR existente; manter `MeshStandardMaterial` procedural como fallback seguro para tiers sem suporte.

O shader deve calcular a luz em espaço linear, preservar normal maps em tangent space, usar a mesma exposição e tone mapping do mundo e receber `envMapIntensity` do perfil de iluminação. Sombras de contato e SSAO devem reforçar cavidades, não substituir o mapa de roughness. Pele molhada altera roughness e brilho especular por máscara ambiental temporária, mas não remove cicatrizes, manchas, poros ou desgaste persistente do albedo.

### Cabelo

O cabelo deve usar hair cards orientados por fluxo, textura de cor com alpha e normal/tangent coerentes. O material requer alpha test ou alpha hashed preferencialmente a blending transparente, `side=DoubleSide` somente quando necessário e `depthWrite` preservado no caminho hashed. A máscara deve ter borda suave sem transformar o penteado em uma placa cinza; cards próximos ao rosto recebem prioridade de densidade.

No hero full, usar direção de fibra no tangent map, duas lobes especulares anisotrópicas aproximadas, roughness em torno de `0.35–0.60`, variação de cor por raiz/mecha e um mapa de `flow` para orientar o brilho. O valor de shift de anisotropia deve ser parametrizado por penteado, com destaque estreito para cabelo liso e mais quebrado para cabelo crespo/cacheado. Não usar transparência aditiva nem emissivo no cabelo.

No proxy, reduzir cards, desligar a segunda lobe especular e usar uma única textura compartilhada por família de penteado. Na silhouette, substituir cards por volume opaco ou cor de silhueta. A troca de tier deve manter a massa visual do penteado, evitar popping e não gerar overdraw incompatível com 100 jogadores.

### Contrato de implementação e validação

- `skin_albedo`: sRGB, sem sombras baked; `normal`, `roughness`, `subsurface`, `cavity` e `flow`: linear.
- Mipmaps obrigatórios; compressão deve preservar alpha de cabelo e canais de máscara; proibir 4K em assets comuns sem evidência de pixels projetados.
- Hero full pode usar shader patch com SSS/anisotropia; Medium usa uma amostra de subsurface e uma lobe capilar; Low usa PBR padrão sem SSS e cabelo simplificado.
- Validar pele seca, molhada, sombra, contra-luz, interior e iluminação colorida; validar cabelo contra céu, fumaça, chuva e movimento.
- Rejeitar material com aspecto plástico, subsurface leitoso, cabelo com halo branco, alpha sorting instável, normal invertida, mudança de cor por espaço sRGB incorreto ou custo que retire o frame budget do combate.

## Movimentação, animação e microexpressões

### Fundação comum de movimento

Todos os perfis devem compartilhar uma base humanoide natural, com variações parametrizadas por sexo, idade, altura, massa corporal, comprimento de pernas e condicionamento físico. A animação não pode simplesmente escalar a mesma pose: passada, amplitude de braços, inclinação do tronco, tempo de apoio e recuperação precisam ser recalibrados para o biotipo.

- **Locomoção:** caminhada, trote, corrida, sprint, agachamento, deslocamento lateral, recuo, subida, descida e mudança de direção com aceleração e desaceleração progressivas.
- **Contato com o chão:** foot planting, ajuste de tornozelo ao relevo, compressão visual do joelho e transferência de peso antes do próximo passo; evitar deslizamento em rampas e durante mira.
- **Centro de massa:** quadril e tórax respondem à carga, à velocidade e à frenagem; mochila, colete e acessórios acompanham o movimento com atraso pequeno e controlado.
- **Camadas aditivas:** respiração, fadiga, balanço da carga, mira, manuseio de arma, dano e estado ambiental devem ser aplicados por camadas com limites, sem destruir a animação locomotora.
- **Transições:** todas as trocas de estado usam blend trees ou crossfades com duração baseada na ação; parada brusca, aterrissagem, giro e levantamento devem mostrar antecipação e recuperação.
- **Rede e desempenho:** o servidor replica estado e parâmetros essenciais, não cada oscilação de osso. Em distância, reduzir frequência de atualização, desativar microexpressões e usar poses LOD; perto da câmera, ativar o conjunto completo.

### Forças regulares — linguagem corporal

Forças regulares devem transmitir treinamento coletivo, disciplina e economia de movimento, mas sem rigidez robótica. A passada tende a ser consistente; ombros e cotovelos ficam mais controlados; a postura de patrulha mantém o torso organizado e o olhar varre o ambiente. O peso do kit deve aparecer em pequenas compensações do quadril, na aterrissagem do pé e na estabilização antes da mira.

- **Patrulha:** cabeça e olhos fazem varreduras discretas, com o tronco seguindo depois; braços mantêm amplitude reduzida quando o equipamento está pronto.
- **Corrida:** mochila e colete produzem atraso curto; o peito permanece estável, enquanto quadril, joelhos e braços absorvem a aceleração.
- **Mira e troca de direção:** primeiro estabilizar a base dos pés, depois alinhar quadril, ombros e braços; evitar que a arma gire sozinha ou que o torso atravesse o colete.
- **Fadiga e impacto:** reduzir amplitude da passada, aumentar respiração e tensão de ombros gradualmente; dano altera equilíbrio e expressão, mas não deve produzir espasmos irreais.
- **Microexpressões:** foco visual, mandíbula levemente firme, sobrancelhas baixando de modo assimétrico, piscadas espaçadas e breve compressão dos lábios durante esforço. Em repouso, relaxar testa, boca e ombros para não manter a expressão de combate o tempo todo.

### Operadores especiais — linguagem corporal

Operadores especiais devem transmitir experiência e prontidão por antecipação, leitura do espaço e controle fino, não por poses exageradas. Os movimentos são eficientes e mais rápidos, mas mantêm atrito, desaceleração e recuperação. O equipamento modular deve responder ao corpo sem dominar a animação.

- **Deslocamento tático:** passadas curtas em baixa postura, inclinação controlada ao contornar obstáculos, cabeça estabilizada e olhos direcionados antes do tronco.
- **Ações rápidas:** entrada, saída de cobertura, troca de postura, transição de mira e interação com objetos usam antecipação curta, pico de velocidade e assentamento do centro de massa.
- **Precisão:** respiração desacelera antes da ação; ombros descem, dedos e punhos reduzem tensão, e o olhar permanece estável durante a mira. A animação não deve congelar o corpo inteiro.
- **Mobilidade:** saltos, escaladas, quedas e recuperações exibem absorção nos tornozelos, joelhos e quadril; correias e tecidos têm atraso limitado para não parecerem rígidos nem elásticos demais.
- **Microexpressões:** foco concentrado com movimentos oculares pequenos, piscada reduzida durante aquisição de alvo, narinas e mandíbula respondendo ao esforço e relaxamento rápido após a ação. A emoção deve ser sutil, legível em close-up e reduzida a LOD baixo.

### Sistema facial e microexpressões

O rosto deve usar uma combinação de joints faciais ou blendshapes corretivos, com prioridade para deformação limpa de pálpebras, sobrancelhas, bochechas, lábios, mandíbula e pescoço. Microexpressões são sinais curtos sobre uma expressão-base, não poses faciais permanentes.

- **Estados-base:** neutro, alerta, foco, esforço, dor, fadiga, alívio e comunicação silenciosa.
- **Sinais mínimos:** piscada, squint, contração de sobrancelha, assimetria labial, compressão da mandíbula, respiração nasal, dilatação sutil das narinas e movimento ocular antecipatório.
- **Coerência corporal:** expressão, respiração, ombros e mãos devem reagir ao mesmo evento; não aplicar dor facial sem alteração de postura ou esforço sem mudança respiratória.
- **Variação humana:** frequência de piscada, assimetria facial, tempo de recuperação e intensidade emocional variam por avatar e seed, mantendo limites realistas.
- **Câmera e LOD:** microexpressões completas apenas no hero full e close-up; a 15 m reduzir para olhos, mandíbula e respiração; a 30 m usar somente silhueta, postura e orientação da cabeça.
- **Segurança de deformação:** olhos não atravessam pálpebras, dentes e língua permanecem ocultos quando a boca está fechada, e nenhuma expressão pode deslocar o pivô canônico do pescoço em `y=1.68`.

### Critérios de aceitação de animação

O perfil só passa para o asset hero quando completar, em todos os biotipos aprovados, um ciclo de caminhada, corrida, sprint, agachamento, mira, giro, queda, recuperação, dano leve e respiração em repouso sem foot sliding, interseções críticas ou perda de equilíbrio. A validação deve ser feita em câmera de close-up e gameplay, em High/Medium/Low, com 100 atores simulados e redução progressiva das camadas faciais por distância.

## Geração procedural por IA — rostos e biotipos

### Objetivo e limites

A IA deve gerar variação controlada sobre uma base humanoide retopologizada, nunca substituir os critérios anatômicos, de rig ou de identidade do pipeline. Cada resultado precisa ser uma pessoa adulta coerente, com assimetria natural, traços humanos e proporções compatíveis com animação. Etnia, sexo, idade e biotipo são parâmetros de referência visual, não rótulos de personalidade, função ou moralidade.

O modelo deve receber uma única identidade determinística por `operativeId` e `seed`; o mesmo par deve reproduzir os mesmos parâmetros e mapas. A IA pode propor aparência e variações de superfície, mas o sistema de validação deve rejeitar malha, textura ou combinação que quebre olhos, boca, mãos, pivôs, hitbox ou orçamento de renderização.

Os prompts e parâmetros versionados estão em [`config/hero_face_generation_prompts.json`](../config/hero_face_generation_prompts.json). O validador independente de engine está em [`tools/validate_operator_hero.py`](../tools/validate_operator_hero.py) e recebe um manifesto JSON exportado pelo DCC ou pela etapa de geração. Exemplo de execução:

```bash
python3 tools/validate_operator_hero.py path/to/hero_candidate.json --strict-human-review
```

O comando retorna JSON com `accepted`, `rejections` e `warnings`, usa código de saída `0` somente quando os critérios automatizados e a aprovação humana obrigatória são satisfeitos, e pode ser executado no CI sem instalar a engine.

### Schema de parâmetros

```json
{
  "operativeId": "OP_REGULAR_001",
  "seed": 184729,
  "profile": "regular_force",
  "sexPresentation": "masculine",
  "ageRange": [28, 36],
  "ancestryReferences": ["african_diaspora", "coastal_south_american"],
  "bodyType": "athletic_medium",
  "heightCm": 178,
  "massKg": 78,
  "muscleDefinition": 0.58,
  "bodyFat": 0.18,
  "shoulderWidth": 0.54,
  "hipWidth": 0.42,
  "limbProportion": 0.50,
  "faceShape": "oval-angular",
  "skinTone": "deep_brown_neutral",
  "skinFeatures": ["subtle_pores", "faint_scars", "under_eye_variation"],
  "hair": { "style": "short_tightly_curled", "density": 0.78, "color": "dark_brown" },
  "facialHair": { "style": "short_beard", "density": 0.42 },
  "expressionBaseline": "calm_alert",
  "clothingProfile": "regular_force_standard",
  "variationBudget": { "face": 0.70, "body": 0.55, "wear": 0.40 }
}
```

#### Parâmetros e faixas

- `ageRange`: somente adultos, com faixa estreita por personagem; rugas, volume facial e postura devem ser coerentes com a faixa escolhida.
- `ancestryReferences`: uma ou mais referências humanas visuais; nunca usar uma única característica como marcador étnico e nunca converter ancestralidade em estereótipo.
- `bodyType`: `slim`, `athletic_light`, `athletic_medium`, `athletic_heavy`, `stocky`, `compact` ou `tall_lean`; o biotipo altera massa, centro de gravidade e passada, não apenas a escala do mesh.
- `heightCm` e `massKg`: valores dentro de limites humanos plausíveis; recalcular volume e proporção para evitar escala uniforme.
- `muscleDefinition` e `bodyFat`: valores contínuos com transições suaves, preservando anatomia e deformação em ombros, abdômen, quadril e membros.
- `faceShape`: controla volume de testa, maçãs, mandíbula, queixo e largura facial; sempre conservar loops de olhos, nariz e boca.
- `skinFeatures`: detalhes sutis e distribuídos; cicatrizes, manchas e poros nunca podem virar ruído uniforme ou estereótipo.
- `variationBudget`: limite de divergência em relação à base do perfil; valores altos exigem revisão de silhueta, rig e facial blendshapes.

### Prompt-base de rosto

```text
Retrato de personagem humano adulto para um jogo de ação realista, identidade única e natural, referência de ancestralidade {ANCESTRY_REFERENCES}, apresentação de sexo {SEX_PRESENTATION}, faixa etária {AGE_RANGE}. Formato facial {FACE_SHAPE}, pele {SKIN_TONE} com {SKIN_FEATURES}, cabelo {HAIR_STYLE} de densidade {HAIR_DENSITY}, barba {FACIAL_HAIR}. Assimetria facial sutil e humana, poros e variação de pele realistas, olhos alinhados, pálpebras com volume, nariz e lábios anatomicamente coerentes, expressão-base {EXPRESSION_BASELINE}, iluminação neutra de estúdio, vista frontal e três quartos consistentes, fundo simples, sem maquiagem exagerada, sem caricatura, sem estereótipos étnicos.
```

### Prompt-base de biotipo e corpo

```text
Corpo humano adulto completo, biotipo {BODY_TYPE}, altura aproximada {HEIGHT_CM} cm, massa aproximada {MASS_KG} kg, definição muscular {MUSCLE_DEFINITION}, gordura corporal {BODY_FAT}, proporção de membros {LIMB_PROPORTION}. Anatomia realista e funcional para corrida, agachamento, mira, queda e recuperação; centro de massa plausível, ombros, quadril, joelhos, mãos e pés bem formados, volumes naturais sob a roupa, postura relaxada em T-pose simétrica para rig. Malha limpa, mãos com dedos separados, rosto e pescoço contínuos, sem acessórios, sem arma e sem equipamento.
```

### Prompts de variação por perfil

**Forças regulares:**

```text
Avatar humano adulto de força regular oficialmente treinada, biotipo {BODY_TYPE}, aparência individual {FACE_AND_HAIR_VARIATION}, postura disciplinada porém relaxada, musculatura funcional sem exagero, uniforme padronizado reservado para a etapa de vestuário. A identidade facial permanece humana e distinta; a unidade não altera etnia, sexo ou personalidade do personagem.
```

**Operadores especiais:**

```text
Avatar humano adulto de operador especial, biotipo {BODY_TYPE}, mobilidade e condicionamento funcional, rosto {FACE_AND_HAIR_VARIATION}, postura pronta mas não rígida, mãos e ombros preparados para animações de precisão. Aparência humana individual, equipamento modular será adicionado separadamente, sem armadura exagerada, sem tecnologia cobrindo o rosto e sem anatomia de super-herói.
```

**Milícias e gangues:**

```text
Avatar humano adulto de {PROFILE}, biotipo {BODY_TYPE}, identidade facial única, vestuário será aplicado em etapa separada. Preservar assimetria natural, idade, ancestralidade de referência e proporções humanas. A facção deve ser comunicada depois por roupas, materiais, desgaste e símbolos ficcionais, nunca por etnia, sexo, corpo ou caricatura.
```

### Prompt negativo comum

```text
cartoon, chibi, doll face, beauty filter, plastic skin, exaggerated muscles, unrealistic thinness, childlike proportions, deformed anatomy, asymmetrical eyes, crossed eyes, broken eyelids, fused fingers, missing fingers, extra limbs, duplicated face, open mouth with malformed teeth, floating parts, disconnected neck, stretched textures, ethnicity stereotype, racist caricature, sexualized uniform, extremist insignia, real criminal insignia, weapon, armor, props, logo, text, watermark, low-poly artifact, non-manifold mesh
```

### Regras de amostragem e identidade

1. Derivar sub-seeds estáveis de `hash(operativeId + seed)`: `face`, `body`, `hair`, `skin`, `wear` e `motion` não devem usar aleatoriedade global.
2. Gerar primeiro os parâmetros anatômicos; somente depois criar cabelo, pele, roupa e desgaste. Isso evita que roupa ou textura esconda defeitos de proporção.
3. Manter correlação plausível entre idade, pele, cabelo, barba, massa corporal e postura, mas permitir exceções naturais para impedir clones estatísticos.
4. Produzir pelo menos três candidatos por identidade e selecionar por anatomia, legibilidade, diversidade e compatibilidade com a rig; nunca selecionar apenas por beleza.
5. Fixar olhos, boca, mãos, pés e pivôs canônicos antes de qualquer variação cosmética ou de roupa.
6. Não usar atributos sensíveis como gatilho de agressividade, inteligência, confiabilidade, raridade ou valor de gameplay.

### Validação automática e humana

- **Geometria:** simetria estrutural com assimetria facial controlada, malha contínua, sem partes flutuantes, olhos alinhados e dedos separados.
- **Anatomia:** razão cabeça/corpo, largura de ombros e quadril, comprimento de membros, volume de mãos e pés dentro da faixa humana do biotipo.
- **Deformação:** teste de piscada, fala silenciosa, sorriso leve, esforço, dor, respiração, corrida, mira, queda e recuperação sem atravessamento.
- **Identidade:** comparar frontal, três quartos e perfil; o personagem precisa permanecer reconhecível sob iluminação neutra, colorida, chuva e poeira.
- **Diversidade:** medir distância de embedding visual e parâmetros morfológicos para evitar clones, sem transformar diversidade em pontuação de valor humano.
- **Desempenho:** gerar full, proxy e silhouette; preservar o orçamento de até 120k triângulos no hero, proxy de até 900 triângulos e máximo de 12 draw calls.
- **Revisão humana:** aprovação por artista de personagem e responsável de animação antes de entrar no catálogo; rejeitar resultados que pareçam estereotipados, sexualizados, infantis, inumanos ou incompatíveis com a função narrativa.

## Rigging, blendshapes faciais e cinemática inversa

### Rig humanoide e convenções

O rig deve ser um esqueleto humanoide único, compatível com retargeting e com a API atual do runtime. A escala de referência é 1 unidade = 1 metro, eixo vertical `+Y`, frente do personagem em `-Z` e origem no chão entre os pés. O asset deve preservar quadril em `y=0.84` e referência de pescoço/cabeça em `y=1.68`; qualquer diferença de escala deve ser corrigida no importador, não na animação.

Hierarquia mínima obrigatória:

```text
root
└─ pelvis
   ├─ spine_01
   │  └─ spine_02
   │     └─ spine_03
   │        └─ neck
   │           └─ head
   ├─ thigh_l ─ calf_l ─ foot_l ─ toe_l
   ├─ thigh_r ─ calf_r ─ foot_r ─ toe_r
   ├─ clavicle_l ─ upperarm_l ─ forearm_l ─ hand_l
   └─ clavicle_r ─ upperarm_r ─ forearm_r ─ hand_r
```

Bones opcionais para o hero incluem `breastplate`, `backpack`, `weapon_l`, `weapon_r`, `headset_l`, `headset_r`, `strap_*` e cadeias curtas de dedos. Equipamentos rígidos devem ser filhos de sockets/attachments, não deformados pelo torso. Nomes devem ser estáveis, sem espaços, com sufixo `_l`/`_r`, e documentados no manifesto do asset.

### Skinning, pesos e retargeting

- Usar smooth bind com no máximo 4 influências por vértice no corpo e 2 em acessórios deformáveis; mãos, rosto e ombros podem usar pesos corretivos aprovados pelo artista.
- Manter loops de deformação no ombro, cotovelo, punho, quadril, joelho, tornozelo, pescoço, pálpebra e boca; não quebrar a continuidade facial para simplificar o skinning.
- Normalizar pesos por vértice, detectar somas diferentes de 1 e rejeitar vértices órfãos, envelopes invertidos ou influência de bones ausentes.
- O retargeting deve usar proporções do avatar — comprimento de fêmur, tíbia, braço, largura de ombros e altura do quadril — em vez de apenas aplicar escala global.
- Preservar o deslocamento do quadril e o contato do pé ao trocar entre sexos, idades e biotipos; recalcular alcance de mãos e altura de mira por perfil.
- Exportar pose neutra, T-pose, bind pose e uma pose de verificação com braços a 90 graus, joelhos flexionados e boca neutra.

### Blendshapes faciais

O conjunto facial deve separar regiões para permitir microexpressões combináveis, sem exigir um rig facial pesado em todos os LODs:

- **Olhos e sobrancelhas:** `blink_l`, `blink_r`, `squint_l`, `squint_r`, `brow_up_l`, `brow_up_r`, `brow_down_l`, `brow_down_r`, `look_up`, `look_down`, `look_in`, `look_out`.
- **Nariz e bochechas:** `nose_wrinkle`, `nostril_flare`, `cheek_raise_l`, `cheek_raise_r`, `cheek_suck_l`, `cheek_suck_r`.
- **Boca e mandíbula:** `jaw_open`, `jaw_forward`, `jaw_left`, `jaw_right`, `lip_press`, `lip_corner_up_l`, `lip_corner_up_r`, `lip_corner_down_l`, `lip_corner_down_r`, `mouth_funnel`, `mouth_pucker`.
- **Pescoço e correções:** `neck_tension_l`, `neck_tension_r`, `jaw_neck_corrective`, `smile_cheek_corrective`, `blink_lid_corrective`.
- **Estados compostos:** `neutral`, `alert`, `focus`, `effort`, `pain`, `fatigue`, `relief` e `silent_comms` devem ser combinações de canais básicos, não meshes faciais isoladas.

Cada blendshape deve ter amplitude normalizada de `0..1`, limites de combinação e máscara regional. Corretivos de pálpebra, bochecha, lábio e pescoço devem ser acionados por pose para evitar atravessamento. Olhos devem mirar por controle separado; a rotação ocular não substitui deformação de pálpebra. Dentes e língua permanecem ocultos em repouso e só entram em close-up quando a boca realmente abre.

### Cinemática inversa (IK)

O sistema deve usar IK de baixo custo e ativação contextual, com animação FK como fonte principal:

- **Pés:** solver de duas articulações `thigh → calf → foot`, alvo no ponto de contato e pole vector orientado pelo joelho. Aplicar raycast do tornozelo ao terreno, limitar rotação de tornozelo e distribuir correção entre quadril, joelho e pé.
- **Mãos:** solver `upperarm → forearm → hand` para apoio em cobertura, escalada, interação e encaixe em arma; usar pole vector estável no cotovelo e preservar pose dos dedos.
- **Arma e mira:** mão dominante segue o socket da arma; mão de apoio usa alvo secundário com peso gradual. O torso recebe rotação limitada para evitar torção de coluna e atravessamento do colete.
- **Corpo:** manter offset de pelvis/root separado do alvo do pé; limitar correção vertical e lateral para não alterar hitbox nem produzir alongamento visível.
- **Blend:** peso IK `0..1` com entrada/saída suave de 80–180 ms; desligar IK quando o alvo estiver inválido, muito distante ou fora da banda de animação.
- **Terreno:** amostrar somente colisão gameplay validada, ignorar objetos cosméticos e aplicar filtro temporal para evitar tremor em superfícies trianguladas.

### LOD, rede e validação do rig

- **Hero full:** skeleton completo, dedos, sockets, IK contextual e blendshapes faciais; atualizar microexpressões somente em close-up ou quando o avatar for foco da câmera.
- **Proxy:** manter `root`, `pelvis`, coluna, cabeça, braços e pernas; remover dedos, facial detalhado e IK de mãos; usar apenas foot planting simplificado quando necessário.
- **Silhouette:** sem animação óssea individual; manter transformação do root e rotação de morte ou queda pré-cozida.
- **Rede:** replicar estado locomotor, velocidade, direção, pose de mira, contato de pé e eventos faciais compactos; não replicar pesos de blendshape ou transformações de cada osso.
- **Testes:** validar pesos, escalas, bind pose, sockets, alcance de IK, contato dos pés, troca de biotipo, expressões extremas, roupa equipada e 100 atores em High/Medium/Low.
- **Critério de rejeição:** qualquer pop de retargeting, foot sliding persistente, joelho invertido, mão desalinhada, olho atravessando pálpebra, mandíbula quebrada, equipamento flutuante ou aumento de custo acima do orçamento bloqueia a publicação do asset.

### Regras comuns de produção

- Cada roupa precisa de versão full, proxy e silhouette; detalhes menores que não alteram a silhueta migram para normal/roughness ou decalque.
- Mochilas, rádios, lanternas, correntes e acessórios rígidos devem ser attachment meshes com pivô próprio; jaquetas, calças, coletes e tecidos aderidos permanecem skinned.
- Variantes de desgaste devem ser determinísticas por `operativeId` e seed, evitando que 100 jogadores pareçam cópias ou que o custo de material cresça por ator.
- Nenhuma facção será definida por etnia, nacionalidade, sexo ou biotipo. A diferenciação vem de contexto narrativo, construção das peças, paleta, marcas ficcionais e estado de conservação.
- A validação final exige leitura a 3 m, 15 m e 30 m, ausência de interseções durante locomoção/mira e custo dentro do orçamento de 100 jogadores por partida.

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
