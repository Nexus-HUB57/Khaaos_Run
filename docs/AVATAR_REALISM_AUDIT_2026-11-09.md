# Auditoria de qualidade dos avatares

**Projeto:** Khaaos Run
**Data:** 2026-11-09
**Escopo:** semelhança humana, anatomia, rosto, cabelo, roupas, equipamentos, animação, materiais, LOD e desempenho.
**Comparativos:** Free Fire/Free Fire MAX como referência de realismo estilizado mobile e Call of Duty como referência de operador militar fotorealista em close-up.

## Veredito

Os avatares atuais estão em **realismo estilizado procedural adequado para gameplay**, mas ainda não atingem a qualidade visual de um operador de Call of Duty em close-up. Em leitura de combate e distância média, a silhueta, as cores de facção, os rostos diferenciados e o LOD funcionam bem. Em câmera próxima, a composição de primitivas, a ausência de uma cabeça retopologizada de produção, o cabelo geométrico e os equipamentos rígidos denunciam o caráter procedural.

A posição atual é:

- **Gameplay e leitura de silhueta:** forte, aproximadamente na faixa de um battle royale mobile estilizado.
- **Rosto e semelhança humana em close-up:** abaixo do padrão Free Fire MAX mais polido e claramente abaixo de Call of Duty.
- **Roupa e equipamento:** boa leitura funcional, porém ainda distante da autenticidade material e do desgaste de produção de Call of Duty.
- **Movimento:** acima de um sistema puramente rígido, com passada, peso e reação; ainda não há um pipeline completo de captura, rig humanoide e IK de produção.
- **Performance:** muito bem controlada para 100 jogadores, mas o orçamento atual limita a quantidade de detalhe que pode ser colocada no hero full.

A conclusão técnica é **“aprovado como base de gameplay; reprovado como claim de fotorealismo AAA”**.

## Evidência local do repositório

O runtime já possui um kit facial canônico com famílias craniofaciais, olhos 3D, íris, pupilas, pálpebras, nariz, lábios, cabelo e barba em [`heads3d.js`](../game-runtime/src/game3d/heads3d.js). O código preserva os pivôs do runtime e gera variações determinísticas por operador.

A auditoria de geometria executada em `game-runtime/scripts/audit-f51-tris.mjs` mediu os 33 operadores canônicos. O menor custo foi de **6.244 triângulos** e o maior de **6.456**, com gate de 6.500. Após a redução do cabelo procedural, `OP_MIL_FEMALE_SORO` caiu para **6.402 triângulos**, com 98 de margem; o pior caso atual é `OP_GNG_MALE_VENTANIA`, com 44 de margem. Isso confirma que o orçamento de gameplay é respeitado, mas ainda requer uma reserva explícita para acessórios futuros.

A revisão anterior também registrou aproximadamente **112–124 meshes por operador**, cabeça na faixa de **1.334–1.514 triângulos** e proxy abaixo de 900 triângulos. A geometria compartilhada e o LOD reduzem o custo de memória, mas a quantidade de submeshes e a composição de caixas, esferas e cápsulas continuam visíveis em close-up. Consulte [`Khaaos_Run_character_realism_review.md`](../Khaaos_Run_character_realism_review.md) e [`lod3d.js`](../game-runtime/src/game3d/lod3d.js).

O sistema facial existente expõe expressões como `neutral`, `blink`, `pain`, `shout`, `death` e `knocked`. Isso é uma boa base de gameplay, mas não equivale ainda a um conjunto de blendshapes corretivos para pálpebras, bochechas, lábios, mandíbula, nariz e pescoço. O próprio pipeline atualizado já define o próximo estágio em [`OPERATOR_HERO_PIPELINE.md`](OPERATOR_HERO_PIPELINE.md).

## Comparação com Free Fire

A referência oficial da Garena posiciona Free Fire como um battle royale acessível, com partidas de 10 minutos, escolha de personagens e foco em estilo, identidade e diversão. A página oficial de personagens apresenta personagens com nomes, codinomes e identidades próprias, como Ray, Morse, Nero, Rin e Kairos. [1] [2]

Isso torna Free Fire uma referência mais próxima de **legibilidade, variedade, estilo e performance mobile** do que de anatomia fotográfica. Khaaos Run já acompanha esse eixo em silhueta, variedade de facções, cores e leitura de função. A diferença principal é de acabamento: o avatar atual comunica a categoria do personagem, mas ainda não tem a mesma sensação de asset autoral finalizado em cabelo, rosto, roupa e acessórios.

Contra esse benchmark, a avaliação é:

- **Silhueta e leitura a distância:** próximo do objetivo.
- **Variedade de personagens:** forte; o catálogo canônico cobre 33 IDs e várias famílias visuais.
- **Identidade de facção:** boa, mas ainda concentrada em cor, colete e acessórios geométricos.
- **Rosto:** funcional e legível, porém mais próximo de estilização procedural do que de um rosto de produção.
- **Animação:** boa base de passada e reação; precisa de mais variação de biotipo e expressões para superar a sensação de rig compartilhado.
- **Performance:** compatível com a ambição mobile, desde que o full LOD não seja aplicado aos 100 atores.

**Resultado:** o projeto está competitivo no eixo de gameplay estilizado, mas precisa de melhorias de acabamento para alcançar uma apresentação premium consistente em telas de seleção, replay e close-up.

## Comparação com Call of Duty

A Activision descreve Modern Warfare como um projeto orientado a uma aparência visceral e realista, usando fotogrametria para construir modelos detalhados. A documentação também destaca materiais de perto, roupas, equipamentos, sujeira, vincos, couro desgastado, tecido, física de peças pendentes e personagens integrados a ambientes fotográficos. [3]

O material oficial de arte de Modern Warfare separa character art, weapon art, vehicle art e environment art. Para personagens, destaca face, hair, outfit, postura e estrutura esquelética, além de motion capture e rigging técnico. [4]

O benchmark atual de operadores de Call of Duty também mostra uma grande quantidade de operadores e facções com identidade de loadout, skins e equipamentos, reforçando que a diferenciação visual não depende só da cor do colete. [5]

Contra esse benchmark, as lacunas de Khaaos Run são objetivas:

1. **Cabeça:** `sculptSkullGeo` deforma uma esfera procedural. Isso cria diversidade de silhueta, mas não fornece loops faciais de produção nem microdeformações corretivas.
2. **Pele:** os mapas procedurais de poros e roughness reduzem o aspecto plástico, mas não substituem albedo, normal, roughness e subsurface regionais capturados ou pintados por artista.
3. **Cabelo:** tufos e segmentos funcionam para silhueta, mas faltam hair cards com alpha, anisotropia, breakup de densidade e variação de fios.
4. **Mãos:** a leitura melhorou com dedos e polegar, porém a composição procedural ainda não equivale a uma malha contínua com deformação de punho, dedos e articulações.
5. **Roupas:** colete, straps, pouches e mochila têm leitura funcional, mas muitos volumes continuam sendo caixas ou painéis sem costuras, vincos dependentes da pose ou simulação leve de tecido.
6. **Desgaste:** existem microdetalhes PBR, mas faltam estados persistentes de sujeira, suor, poeira, lama, abrasão, rasgos e material molhado por região.
7. **Animação:** há peso, passada, respiração, micro-olhar e reação; falta um esqueleto humanoide com retargeting por biotipo, IK contextual e captura/ajuste de referência em escala de produção.
8. **Apresentação:** não há evidência de um showcase hero com o mesmo nível de iluminação, ambiente fotográfico e close-up usado para vender a autenticidade do operador.

**Resultado:** o gap para Call of Duty é grande em close-up, mas concentrado em produção de asset e materiais, não em falta de arquitetura de runtime.

## Pontuação de auditoria

A pontuação abaixo é uma avaliação interna de prontidão visual, não uma medição oficial dos jogos comparados:

- **Anatomia e silhueta:** 6,5/10.
- **Semelhança facial:** 4,5/10.
- **Cabelo e pele:** 4,0/10.
- **Roupas e equipamentos:** 5,5/10.
- **Movimento e expressividade:** 6,0/10.
- **LOD e desempenho:** 8,0/10.
- **Identidade de elenco e facções:** 7,0/10.

**Índice geral atual:** **5,9/10**.
**Faixa de gameplay mobile estilizado:** atingida.
**Faixa Free Fire MAX premium em close-up:** parcialmente atingida.
**Faixa Call of Duty operator fotorealista:** não atingida.

A nota baixa não significa que o runtime esteja quebrado. Ela reflete a diferença entre um personagem procedural eficiente e um asset hero produzido com sculpt, retopologia, mapas de material, cabelo e captura de movimento.

## Riscos de performance

Aumentar o detalhe sem mudar o orçamento pode piorar o resultado. O pior operador atual chega a 6.456 de 6.500 triângulos antes de incluir novos componentes; o caso SORO foi otimizado para 6.402. Além disso, 112–124 meshes por avatar podem pressionar draw calls quando os materiais não são agrupados.

Para 100 jogadores em partidas de 10 minutos, o padrão recomendado é manter o procedural atual ou um hero retopologizado simplificado na maior parte dos atores. O hero full deve ser reservado ao jogador local, close-ups, telas de seleção, replays e atores dentro da distância de combate. O proxy e a silhouette precisam continuar responsáveis pela maioria dos atores distantes.

Não é recomendado elevar todos os personagens para dezenas ou centenas de milhares de triângulos. O ganho de realismo percebido virá primeiro de rosto, mãos, olhos, cabelo, roughness, sombras de contato, roupas e animação, não de aumentar indiscriminadamente a contagem de polígonos.

## Plano de correção priorizado

### P0 — elevar o rosto hero

Criar um único operador hero com cabeça esculpida e retopologizada, loops de pálpebra, nariz, boca e mandíbula, UVs limpos e blendshapes corretivos. Produzir mapas de pele por região, incluindo albedo, normal, roughness e subsurface. Validar frontal, três quartos, perfil, iluminação neutra, contra-luz, chuva e close-up.

### P1 — mãos, cabelo e materiais

Substituir mãos compostas por uma malha contínua com dedos e deformação de punho. Converter o cabelo principal para hair cards de baixa densidade com alpha test e LOD. Criar variantes de roughness, poeira, suor, lama e tecido molhado para os perfis de forças regulares, operadores especiais, milícias e gangues.

### P1 — rig e movimento

Implementar o esqueleto humanoide definido no pipeline, retargeting por comprimento de membros e IK de pés/mãos. Adicionar microexpressões combináveis para piscar, foco, esforço, dor, fadiga e alívio. O runtime deve enviar estado compacto pela rede, sem replicar cada osso ou peso facial.

### P2 — apresentação e validação visual

Criar snapshots automatizados do hero em 3 m, 15 m e 30 m, com High, Medium e Low. Comparar lado a lado o mesmo avatar em iluminação diurna, noturna, contra-luz, chuva e poeira. Medir triângulos, meshes, draw calls, frame time com 100 atores e estabilidade de LOD.

## Conclusão

Khaaos Run possui uma base de avatar tecnicamente disciplinada, com determinismo, identidade de elenco, animação funcional e LOD adequado ao contrato de 100 jogadores. A qualidade atual é suficiente para um battle royale mobile estilizado e para leitura de combate, mas não deve ser apresentada como equivalente a Call of Duty em realismo facial e material.

A melhor estratégia é manter o sistema procedural como camada de gameplay e produzir um único hero de alta fidelidade. Esse hero deve servir de referência de sculpt, rig, materiais, cabelo, roupa e animação; depois, suas decisões devem ser reduzidas para variantes de produção. Isso aumenta o realismo percebido sem sacrificar o orçamento de 100 jogadores.

## Referências

[1]: https://ff.garena.com/ "Garena Free Fire — página oficial"
[2]: https://ff.garena.com/en/chars/ "Garena Free Fire — personagens oficiais"
[3]: https://blog.activision.com/cn/zh/call-of-duty/2019-06/Initial-Intel-How-Photogrammetry-is-Helping-to-Shape-Call-of-Duty-Modern-Warfare-into-a-new-high-watermark-for-graphics-in-gaming "Activision — fotogrametria e realismo visual em Call of Duty Modern Warfare"
[4]: https://blog.activision.com/pt/call-of-duty/2019-10/The-Making-of-Call-of-Duty-Modern-Warfare-art-book-is-available-today "Activision — arte de personagens, motion capture e rigging em Modern Warfare"
[5]: https://www.callofduty.com/blog/2026/10/call-of-duty-modern-warfare-4-launch-multiplayer-operators-weapons-equipment-create-a-class "Call of Duty — operadores, facções, equipamentos e loadouts"
