/**
 * Lote 4 — Milícias e Gangues Urbanas (16 operantes não-militares).
 * Complementam os 16 militares canônicos: controle territorial informal
 * (milícias, MIL-01..08) e facções de rua (gangues, GNG-01..08).
 * Rig base por sexo (ADR-ESQUELETO-RIG-POR-SEXO); facção declarada em `faction`.
 */
export const KHAAOS_MILITIA_ARCHETYPES: OperativeArchetype[] = [

  // ── Milícias urbanas: controle territorial, estrutura paramilitar informal ──
  {
    id: "OP_MIL_MALE_VULTO",
    ueAssetId: "CHR_Zheers_Male_Vulto",
    codename: "VULTO",
    fullName: "Rui 'Vulto' Nascimento · Comandante de Bloco MIL-01",
    gender: "MASCULINO",
    faction: "MILICIA_URBANA",
    rank: "ONITH",
    specializationId: "INFANTARIA",
    defaultWorldId: "Barburhen",
    skinRarity: "RARO",
    roleTitle: "Comando Territorial & Defesa de Perímetro",
    ethnicity: "Afro-Brasileiro / Sertão Nordestino",
    heritageLore:
      "Comandante de bloco em Barburhen, ex-bombeiro civil que perdeu a equipe no primeiro colapso do anel urbano. Governa 4 lajes e 2 galerias com regras próprias: ninguém passa sem registro e ninguém morre de sede sob sua guarda.",
    avatarVisual: {
      skinToneHex: "#7A4A24",
      hairStyle: "Buzz-cut com degradê militar",
      hairColorHex: "#9CA3AF",
      eyeColorHex: "#F59E0B",
      facialFeature: "Cicatriz de queimadura no antebraço direito e olhar de quem já ordenou luto",
      headgearOrVisor: "Bandana âmbar de perímetro com nó lateral",
      avatarThemeGradient: ["#D97706", "#4B5563"],
    },
    appearancePromptEn:
      "Weathered Afro-Brazilian male militia block commander (44 years old), salt-and-pepper buzz cut, trimmed goatee, burn-scarred forearms, broad tired shoulders, steady commanding gaze under a dusty amber bandana",
    appearancePromptPt:
      "Comandante de bloco miliciano afro-brasileiro de pele marcada (44 anos), cabeça raspada com os cabelos salpicados de grisalho, cavanhaque aparado, antebraços com cicatriz de queimadura, ombros largos e cansados, olhar firme sob bandana âmbar empoeirada",
    wardrobePromptEn:
      "Wearing a worn-out grey Khaaos Run militia plate carrier patched with mismatched ceramic plates, folded sleeves of a faded brick-red work shirt, zip-tied spare mag pouches, civilian steel-toe boots, amber taxi-yellow perimeter armband, and a hand-painted block number on the chest",
    wardrobePromptPt:
      "Vestindo colete miliciano cinza desbotado do Khaaos Run com placas cerâmicas desparejas amarradas por abraçadeiras, manga dobrada de camisa de trabalho tijolo, porta-cartuchos improvisados, bota de obra, braçadeira amarelo-táxi de perímetro e o número do bloco pintado à mão no peito",
    weaponHandlingEn:
      "Holding a battered pump shotgun with electrical-tape grip wrap (WPN_Shotgun_Breach), steady two-hand hold with strict trigger discipline learned in fire brigades",
    weaponHandlingPt:
      "Empunhando escopeta de bombeamento gasta com fita isolante no punho (WPN_Shotgun_Breach), empunhadura firme de duas mãos e disciplina de gatilho aprendida no corpo de bombeiros",
    accentColors: {
      primaryHex: "#D97706",
      secondaryHex: "#4B5563",
      trimHex: "#FACC15",
      label: "Âmbar Laje + Cinza-Urubu + Amarelo-Táxi",
    },
    biomechanics: {
      heightCm: 184,
      massKg: 88,
      sprintSpeedMps: 7.0,
      slideFrictionCoeff: 0.74,
      recoilAbsorptionDeg: 2.2,
      vaultClearanceCm: 112,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_MALE_ECO",
    ueAssetId: "CHR_Skeetw_Male_Eco",
    codename: "ECO",
    fullName: "Zico 'Eco' Amaral · Radarista das Lajes MIL-02",
    gender: "MASCULINO",
    faction: "MILICIA_URBANA",
    rank: "ZHEERS",
    specializationId: "COMUNICACOES_HACKER",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Vigilância de Laje & Rede Rádio da Milícia",
    ethnicity: "Pardo Amazônido / Ribeirinho Belenense",
    heritageLore:
      "Subiu no telhado do CIGKV aos 12 anos e nunca mais desceu: das lajes coordena a rede de rádios HT e espelhos solares da milícia. Dizem que escuta um drone ligando 3 quadras antes de ele aparecer no horizonte.",
    avatarVisual: {
      skinToneHex: "#B07B4F",
      hairStyle: "Dreadlocks curtos com argolas",
      hairColorHex: "#1F2937",
      eyeColorHex: "#22D3EE",
      facialFeature: "Rosto enxuto com olhos sempre em rotação de vigia e marca de sol em arco no pescoço",
      headgearOrVisor: "Headset de vigia com antena improvisada",
      avatarThemeGradient: ["#0EA5E9", "#374151"],
    },
    appearancePromptEn:
      "Lean river-dwelling mixed-heritage male militia radio watcher (22 years old), short dreadlocks with tiny reflective rings, sun-arc tan line on the neck, quick scanning eyes, cyan-tinted tactical headset with improvised antenna",
    appearancePromptPt:
      "Vigia de rádio miliciano pardo amazônido magro (22 anos), dreadlocks curtos com argolinhas refletivas, marca de sol em arco no pescoço, olhos em varredura constante e headset tático ciano com antena improvisada",
    wardrobePromptEn:
      "Wearing a faded sky-blue militia windbreaker over a mesh tracer vest with zip-tied radio batteries, lightweight cargo shorts over compression leggings, worn running shoes, clipboard of patrol codes taped to the PackBack strap",
    wardrobePromptPt:
      "Vestindo corta-vento azul-céu de milícia desbotado sobre colete de rastreamento com pilhas de rádio amarradas, bermuda cargo sobre legging de compressão, tênis de corrida gasto e prancheta de códigos de ronda presa à alça da PackBack",
    weaponHandlingEn:
      "Holding a compact survival pistol (WPN_Pistol_MK1) low-ready in one hand while the other taps the radio keyer, trigger finger indexed along the slide",
    weaponHandlingPt:
      "Segurando pistola compacta de sobrevivência (WPN_Pistol_MK1) em guarda baixa com uma mão enquanto a outra toca o manipulador do rádio, dedo de gatilho alinhado ao ferrolho",
    accentColors: {
      primaryHex: "#0EA5E9",
      secondaryHex: "#374151",
      trimHex: "#22D3EE",
      label: "Céu-Laje + Grafite + Ciano-Radar",
    },
    biomechanics: {
      heightCm: 174,
      massKg: 63,
      sprintSpeedMps: 7.6,
      slideFrictionCoeff: 0.62,
      recoilAbsorptionDeg: 3.4,
      vaultClearanceCm: 124,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_MALE_FERRAZ",
    ueAssetId: "CHR_Onith_Male_Ferraz",
    codename: "FERRAZ",
    fullName: "Tonho Ferraz · Armeiro de Quintal MIL-03",
    gender: "MASCULINO",
    faction: "MILICIA_URBANA",
    rank: "ONITH",
    specializationId: "ENGENHARIA_TATICA",
    defaultWorldId: "Barburhen",
    skinRarity: "RARO",
    roleTitle: "Fabricação Artesanal & Manutenção de Campo",
    ethnicity: "Caipira Paulista / Italiano-Luso",
    heritageLore:
      "Transforma gás, cano de água e mola de caminhão em escopeta confiável dentro do quintal de Barburhen. A milícia inteira atira com o que a bancada dele aprova — e o punho do Ferraz grava o lacre de qualidade em cada arma.",
    avatarVisual: {
      skinToneHex: "#E8B98A",
      hairStyle: "Cabeça raspada com brilho de suor",
      hairColorHex: "#6B7280",
      eyeColorHex: "#78716C",
      facialFeature: "Bigode de açogueiro sobre barba grisalha e queimaduras de solda nos antebraços",
      headgearOrVisor: "Óculos de solda pousados na testa",
      avatarThemeGradient: ["#B45309", "#57534E"],
    },
    appearancePromptEn:
      "Heavyset back-yard gunsmith male militia artisan (51 years old), shaved head with grey stubble shadow, thick butcher moustache over a grey beard, weld-burn speckles on forearms, calm craftsman squint",
    appearancePromptPt:
      "Armeiro de quintal miliciano de porte pesado (51 anos), cabeça raspada com sombra de barba grisalha, bigode grosso sobre barba cinza, salpicos de queimadura de solda nos antebraços e olhar sereno de artesão",
    wardrobePromptEn:
      "Wearing a scorched leather blacksmith apron over a bronze-brown Khaaos Run militia overalls, rolled sleeves with duct-tape tool loops, heavy welding gloves hooked on the belt, stamped quality seal hanging from the neck chain",
    wardrobePromptPt:
      "Vestindo avental de forja couro chamuscado sobre jardineira milicia bronze do Khaaos Run, mangas enroladas com laços de fita isolante para ferramentas, luvas de solda grossas no cinto e lacre de qualidade estampado pendurado na corrente do pescoço",
    weaponHandlingEn:
      "Holding his own hand-stamped breach shotgun (WPN_Shotgun_Breach) with raw-steel finish and hand-filed rifling, confident relaxed muzzle-down carry",
    weaponHandlingPt:
      "Empunhando escopeta de brecha estampada por ele mesmo (WPN_Shotgun_Breach) com acabamento de aço cru e cano raiado à lima, cano para baixo em portea confiante",
    accentColors: {
      primaryHex: "#B45309",
      secondaryHex: "#57534E",
      trimHex: "#F59E0B",
      label: "Bronze-Fornalha + Metal Sujo + Âmbar",
    },
    biomechanics: {
      heightCm: 178,
      massKg: 97,
      sprintSpeedMps: 6.4,
      slideFrictionCoeff: 0.78,
      recoilAbsorptionDeg: 1.9,
      vaultClearanceCm: 100,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_MALE_GRAU",
    ueAssetId: "CHR_Venex_Male_Grau",
    codename: "GRAU",
    fullName: "Márcio 'Grau' Quispe · Motoqueiro de Esquina MIL-04",
    gender: "MASCULINO",
    faction: "MILICIA_URBANA",
    rank: "ZHEERS",
    specializationId: "MOTORISTA_PESADOS",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Mobilidade Moto & Recado Urgente da Milícia",
    ethnicity: "Mestiço Andino / Peruano-Limeño",
    heritageLore:
      "Atravessa o CIGKV de costas da moto em 4 minutos no pico do bloqueio. É o recado vivo da milícia: se o Grau chegou de mau humor, o perímetro já sabe que algo caiu.",
    avatarVisual: {
      skinToneHex: "#C68A53",
      hairStyle: "Undercut com coque alto",
      hairColorHex: "#111827",
      eyeColorHex: "#65A30D",
      facialFeature: "Nariz torto de queda de moto e meio-sorriso desafiador",
      headgearOrVisor: "Boné verde-oliva virado com pin",
      avatarThemeGradient: ["#65A30D", "#44403C"],
    },
    appearancePromptEn:
      " wiry Andean mixed-heritage male militia moto-runner (25 years old), black undercut topknot, crooked nose from a bike crash, defiant half-smile, olive-green backwards cap, highway dust on the cheekbones",
    appearancePromptPt:
      "Motoqueiro miliciano mestiço andino magro (25 anos), undercut preto com coque, nariz torto de queda de moto, meio-sorriso desafiador, boné verde-oliva virado e poeira de estrada nos maçãs do rosto",
    wardrobePromptEn:
      "Wearing a delivery-scarred olive-green militia moto jacket with reflective taxi-yellow tape strips, armored knee slides, fingerless riding gloves, mismatched shin guards and a coiled tow strap over the shoulder",
    wardrobePromptPt:
      "Vestindo jaqueta moto milícia verde-oliva marcada por entregas com fitas refletivas amarelo-táxi, joelheiras de deslizamento, luvas de pilotar sem dedos, caneleiras desparejas e cinta de reboque enrolada no ombro",
    weaponHandlingEn:
      "Holding a compact submachine gun (WPN_SMG_MK2) sideways-ready across the tank of his bike, disciplined index finger despite the showy angle",
    weaponHandlingPt:
      "Segurando submetralhadora compacta (WPN_SMG_MK2) atravessada no tanque da moto, dedo indicador disciplinado apesar do ângulo exibido",
    accentColors: {
      primaryHex: "#65A30D",
      secondaryHex: "#44403C",
      trimHex: "#FDE047",
      label: "Verde-Entrega + Asfalto + Amarelo-Farol",
    },
    biomechanics: {
      heightCm: 173,
      massKg: 68,
      sprintSpeedMps: 7.4,
      slideFrictionCoeff: 0.66,
      recoilAbsorptionDeg: 2.9,
      vaultClearanceCm: 122,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_FEMALE_NOTA",
    ueAssetId: "CHR_Zheers_Female_Nota",
    codename: "NOTA",
    fullName: "Dandara 'Nota' Lisboa · Cobradora de Proteção MIL-05",
    gender: "FEMININO",
    faction: "MILICIA_URBANA",
    rank: "ZHEERS",
    specializationId: "FUZILEIROS",
    defaultWorldId: "Barburhen",
    skinRarity: "COMUM",
    roleTitle: "Cobrança Territorial & Controle de Loot da Milícia",
    ethnicity: "Afro-Brasileira / Periferia Carioca",
    heritageLore:
      "Cobradora de 'proteção' com caderneta mimeografada: cada venda de Barburhen tem sua linha, cada linha tem prazo. Trata a caderneta como arquivo de guerra — quem a acha, acha o mapa inteiro do território.",
    avatarVisual: {
      skinToneHex: "#5C3A21",
      hairStyle: "Tranças box com miçangas brancas",
      hairColorHex: "#101010",
      eyeColorHex: "#E879F9",
      facialFeature: "Brincos de argola pesados e olhar de contadora de guerra",
      headgearOrVisor: "Bandana vermelha no pescoço e argola dourada",
      avatarThemeGradient: ["#DC2626", "#52525B"],
    },
    appearancePromptEn:
      "Sharp-featured Afro-Brazilian female militia toll collector (29 years old), box braids with small white beads, heavy gold hoop earrings, ledger-keeper's focused gaze, red neck bandana, ink smudge on the wrist",
    appearancePromptPt:
      "Cobradora miliciana afro-brasileira de traços marcados (29 anos), tranças box com miçangas brancas, argolas douradas pesadas, olhar focado de quem confere contas, bandana vermelha no pescoço e mancha de tinta no pulso",
    wardrobePromptEn:
      "Wearing a brick-red militia armband over a patched utility vest with transparent card pockets full of stamped collection slips, reinforced cargo skirt over tactical leggings, laced ankle boots, mimeographed ledger strapped to the thigh",
    wardrobePromptPt:
      "Vestindo braçadeira milícia vermelho-tijolo sobre colete utilitário remendado com portas-cartão cheios de comprovantes carimbados, saia cargo reforçada sobre legging tática, bota de cano alto amarrada e caderneta mimeografada presa à coxa",
    weaponHandlingEn:
      "Holding a worn militia-pattern assault rifle (WPN_AssaultRifle_MK1) with red-taped magazine, strict trigger discipline while the ledger dangles from the wrist strap",
    weaponHandlingPt:
      "Empunhando fuzil de padrão miliciano desgastado (WPN_AssaultRifle_MK1) com carregador marcado por fita vermelha, disciplina estrita de gatilho com a caderneta balançando na alça do pulso",
    accentColors: {
      primaryHex: "#DC2626",
      secondaryHex: "#52525B",
      trimHex: "#E7E5E4",
      label: "Vermelho-Tijolo + Zinco + Papel-Moeda",
    },
    biomechanics: {
      heightCm: 170,
      massKg: 64,
      sprintSpeedMps: 7.2,
      slideFrictionCoeff: 0.68,
      recoilAbsorptionDeg: 2.6,
      vaultClearanceCm: 116,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_FEMALE_SIRENE",
    ueAssetId: "CHR_Khael_Female_Sirene",
    codename: "SIRENE",
    fullName: "Marisa 'Sirene' Kalinda · Oradora de Perímetro MIL-06",
    gender: "FEMININO",
    faction: "MILICIA_URBANA",
    rank: "SKEETW",
    specializationId: "COMUNICACOES_HACKER",
    defaultWorldId: "CIGKV",
    skinRarity: "RARO",
    roleTitle: "Propaganda de Guerra & Moral da Milícia",
    ethnicity: "Cigana Calon (Romani Brasileira) / Interior Sudeste",
    heritageLore:
      "Comanda o alto-falante de 400 watts no topo da laje-mãe do CIGKV: anúncio de curfew, listagem de desaparecidos e hinos de resistência. Os portões abrem quando a Sirene fala — e fecham quando ela repete três vezes.",
    avatarVisual: {
      skinToneHex: "#C99B6E",
      hairStyle: "Cabelo longo ondulado preso",
      hairColorHex: "#2B1D12",
      eyeColorHex: "#A78BFA",
      facialFeature: "Lenço de flores amarrado à cabeça e olhar que mede plateias inteiras",
      headgearOrVisor: "Lenço roxo de flores amarrado à cabeça",
      avatarThemeGradient: ["#7C3AED", "#3F3F46"],
    },
    appearancePromptEn:
      "Charismatic Calon Romani Brazilian female militia perimeter orator (38 years old), long wavy dark-brown hair under a purple floral headscarf, expressive wide gaze, small gold tooth glint, sun-lifted chin of someone addressing a crowd",
    appearancePromptPt:
      "Oradora miliciana cigana calon carismática (38 anos), cabelo castanho escuro longo e ondulado sob lenço roxo de flores, olhar largo e expressivo, brilho de dente de ouro e queixo erguido de quem fala para plateia",
    wardrobePromptEn:
      "Wearing a smoke-grey militia speaker vest with a hand-painted megaphone emblem, layered calico skirts over thermal leggings, fingerless gloves, portable PA rig clipped to the PackBack frame, purple ribbon around the wrist",
    wardrobePromptPt:
      "Vestindo colete milícia cinza-fumaça com emblema de megafone pintado à mão, saias de chita em camadas sobre legging térmica, luvas sem dedos, módulo de som portátil preso à estrutura PackBack e fita roxa no pulso",
    weaponHandlingEn:
      "Holding a compact carbine (WPN_AssaultRifle_MK1) slung across the back while both hands keep the megaphone steady, disciplined posture of a commander who speaks before shooting",
    weaponHandlingPt:
      "Carabina compacta (WPN_AssaultRifle_MK1) a tiracolo nas costas enquanto as duas mãos firmam o megafone, postura disciplinada de comandante que fala antes de atirar",
    accentColors: {
      primaryHex: "#7C3AED",
      secondaryHex: "#3F3F46",
      trimHex: "#FB7185",
      label: "Roxo-Corredor + Fumaça + Rosa-Sirene",
    },
    biomechanics: {
      heightCm: 168,
      massKg: 66,
      sprintSpeedMps: 6.8,
      slideFrictionCoeff: 0.7,
      recoilAbsorptionDeg: 3.1,
      vaultClearanceCm: 108,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_FEMALE_SORO",
    ueAssetId: "CHR_Huran_Female_Soro",
    codename: "SORO",
    fullName: "Hana 'Soro' Seo · Enfermeira de Clínica MIL-07",
    gender: "FEMININO",
    faction: "MILICIA_URBANA",
    rank: "ZHEERS",
    specializationId: "MEDICO_COMBATE",
    defaultWorldId: "Barburhen",
    skinRarity: "RARO",
    roleTitle: "Suporte Médico Improvisado & Estabilização",
    ethnicity: "Coreana / Liberdade, São Paulo",
    heritageLore:
      "Mantém a clínica de andar térreo de Barburhen funcionando com soro caseiro, anestesia de aquário e luz de celular. A regra dela é absoluta: dentro da sala, nenhuma arma carregada — nem a da milícia.",
    avatarVisual: {
      skinToneHex: "#F3C89D",
      hairStyle: "Bob liso com franja reta",
      hairColorHex: "#2D1B0E",
      eyeColorHex: "#38BDF8",
      facialFeature: "Olhos calmos sob franja reta e mãos com tinta de iodo persistente",
      headgearOrVisor: "Touca cirúrgica verde com máscara no queixo",
      avatarThemeGradient: ["#10B981", "#475569"],
    },
    appearancePromptEn:
      "Composed Korean-Brazilian female militia clinic nurse (31 years old), straight-fringe bob, calm steady eyes, persistent iodine stains on the hands, green surgical cap slightly askew, surgical mask pulled under the chin",
    appearancePromptPt:
      "Enfermeira de clínica miliciana coreano-brasileira serena (31 anos), bob com franja reta, olhos calmos e firmes, manchas de iodo persistentes nas mãos, touca cirúrgica verde levemente torta e máscara abaixada no queixo",
    wardrobePromptEn:
      "Wearing a clinic-green militia tabard with red cross patch stitched from salvage, triple-stacked trauma shears on a chest loop, zip-tied IV bags, sturdy trousers with knee reinforcement, slip-resistant shoes",
    wardrobePromptPt:
      "Vestindo tabardo milícia verde-clínica com remendo de cruz vermelha costurado de sucata, tesouras de trauma triplas no peitoral, bolsas de soro amarradas, calça reforçada nos joelhos e sapato antiderrapante",
    weaponHandlingEn:
      "Holding a compact service pistol (WPN_Pistol_MK1) with magazine removed as house rule, calm two-hand grip that signals she can use it when rules break",
    weaponHandlingPt:
      "Segurando pistola de serviço compacta (WPN_Pistol_MK1) com carregador retirado por regra da casa, empunhadura calma de duas mãos que avisa que ela sabe usar quando a regra quebra",
    accentColors: {
      primaryHex: "#10B981",
      secondaryHex: "#475569",
      trimHex: "#5EEAD4",
      label: "Verde-Enfermaria + Aço + Menta-Soro",
    },
    biomechanics: {
      heightCm: 165,
      massKg: 57,
      sprintSpeedMps: 7.0,
      slideFrictionCoeff: 0.66,
      recoilAbsorptionDeg: 3.3,
      vaultClearanceCm: 110,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_FEMALE_CORUJA",
    ueAssetId: "CHR_Skeetw_Female_Coruja",
    codename: "CORUJA",
    fullName: "Nina 'Coruja' Mamani · Vigia Noturna MIL-08",
    gender: "FEMININO",
    faction: "MILICIA_URBANA",
    rank: "ZHEERS",
    specializationId: "RASTREADORES",
    defaultWorldId: "Priadus",
    skinRarity: "COMUM",
    roleTitle: "Observação Noturna & Avanço Silencioso",
    ethnicity: "Boliviana Aymara / El Alto",
    heritageLore:
      "Vigia as bordas do perímetro de Priadus das 22h às 5h da milícia do posto avançado. Treinou os olhos nas madrugadas frias de El Alto: conta silhuetas antes de contar estrelas e nunca acende lamparina perto do vidro.",
    avatarVisual: {
      skinToneHex: "#A9714B",
      hairStyle: "Coque baixo compacto",
      hairColorHex: "#141414",
      eyeColorHex: "#FBBF24",
      facialFeature: "Olhos amendoados acostumados ao escuro e mantô de lã fino no pescoço",
      headgearOrVisor: "Capuz azul-ardósia de vigia noturna",
      avatarThemeGradient: ["#334155", "#1E293B"],
    },
    appearancePromptEn:
      "Quiet Aymara Bolivian female militia night watcher (27 years old), dark hair pulled into a low bun under a slate-blue hood, almond eyes adapted to darkness, thin alpaca wool scarf, still patient posture",
    appearancePromptPt:
      "Vigia noturna miliciana aymara boliviana silenciosa (27 anos), cabelo escuro preso em coque baixo sob capuz azul-ardósia, olhos amendoados adaptados ao escuro, mantô de lã de alpaca fino e postura parada e paciente",
    wardrobePromptEn:
      "Wearing a slate-blue militia watcher hood over a quilted liner vest, muted grey poncho folded on the PackBack, soft-soled scout boots, matte binoculars hanging on the chest, watch rotation chalk marks on the sleeve",
    wardrobePromptPt:
      "Vestindo capuz milícia azul-ardósia sobre colete acolchoado de forro, poncho cinza apagado dobrado na PackBack, bota de batedora de sola macia, binóculo fosco no peito e marcas de giz da escala de vigília na manga",
    weaponHandlingEn:
      "Holding a suppressed bolt rifle (WPN_Sniper_MK3) resting on the parapet, disciplined slow breathing between observation sweeps",
    weaponHandlingPt:
      "Segurando rifle ferrolhado com supressor (WPN_Sniper_MK3) apoiado no parapeito, respiração lenta e disciplinada entre varreduras de observação",
    accentColors: {
      primaryHex: "#334155",
      secondaryHex: "#1E293B",
      trimHex: "#94A3B8",
      label: "Azul-Laje Noturna + Sombra + Prata-Lua",
    },
    biomechanics: {
      heightCm: 162,
      massKg: 58,
      sprintSpeedMps: 7.1,
      slideFrictionCoeff: 0.72,
      recoilAbsorptionDeg: 2.8,
      vaultClearanceCm: 118,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },

  // ── Gangues urbanas: facções de rua, velocidade, infiltração e comando de zona ──
  {
    id: "OP_GNG_MALE_SPRAY",
    ueAssetId: "CHR_Khael_Male_Spray",
    codename: "SPRAY",
    fullName: "Dudu 'Spray' Cavalcanti · Grafiteiro de Viaduto GNG-01",
    gender: "MASCULINO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "INFANTARIA",
    defaultWorldId: "Barburhen",
    skinRarity: "COMUM",
    roleTitle: "Marcação Territorial & CQB de Viaduto",
    ethnicity: "Pardo Nordestino / Recife",
    heritageLore:
      "Marca território da facção com grafite visível só sob luz negra — mapa codificado que a polícia fotografa e não entende. Dentro do viaduto, ele conhece cada pilar de cor e cada rota de fuga pintada à mão.",
    avatarVisual: {
      skinToneHex: "#8D5524",
      hairStyle: "Afro curto com desenho navalhado",
      hairColorHex: "#151515",
      eyeColorHex: "#A3E635",
      facialFeature: "Manchas de tinta spray nas costas da mão e sorriso rápido",
      headgearOrVisor: "Respirador verde de tinta no pescoço",
      avatarThemeGradient: ["#22C55E", "#6D28D9"],
    },
    appearancePromptEn:
      "Energetic mixed-heritage northeast-Brazilian male gang graffiti tagger (23 years old), short afro with a shaved line design, spray-paint freckles on the hands, quick grin, green respirator mask hanging on the neck, lime-green accents",
    appearancePromptPt:
      "Grafiteiro de gangue pardo nordestino inquieto (23 anos), afro curto com desenho navalhado, sardas de tinta spray nas mãos, sorriso rápido, respirador verde pendurado no pescoço e acentos verde-lima",
    wardrobePromptEn:
      "Wearing an indigo hooded gang jacket with paint-bleached patches, cargo pants stiff with layered overspray, duct-wrapped sneakers, lime-green spray can holsters on the belt, stencil tag patch sewn on the chest",
    wardrobePromptPt:
      "Vestindo jaqueta de gangue índigo com capuz e remendos clareados por tinta, calça cargo endurecida de tinta em camadas, tênis enrolados de fita, porta-latas verde-lima no cinto e remendo de tag estencil costurado no peito",
    weaponHandlingEn:
      "Holding a sawed-off improvisation shotgun (WPN_Shotgun_Breach) one-handed at low ready inside tight viaduct pillars, disciplined trigger despite street swagger",
    weaponHandlingPt:
      "Segurando escopeta serrada improvisada (WPN_Shotgun_Breach) com uma mão em guarda baixa entre os pilares do viaduto, disciplina de gatilho apesar da pose de rua",
    accentColors: {
      primaryHex: "#22C55E",
      secondaryHex: "#6D28D9",
      trimHex: "#A3E635",
      label: "Verde-Spray + Índigo + Lima-Neon",
    },
    biomechanics: {
      heightCm: 176,
      massKg: 70,
      sprintSpeedMps: 7.5,
      slideFrictionCoeff: 0.64,
      recoilAbsorptionDeg: 3.0,
      vaultClearanceCm: 125,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_MALE_VENTANIA",
    ueAssetId: "CHR_Venex_Male_Ventania",
    codename: "VENTANIA",
    fullName: "Leleco 'Ventania' Souza · Corredor de Galho GNG-02",
    gender: "MASCULINO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "RASTREADORES",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Fuga de Alta Velocidade & Linhas de Borrão",
    ethnicity: "Afro-Brasileiro / Pelourinho, Salvador",
    heritageLore:
      "Corredor de galho da facção do CIGKV: atravessa laje, muro e varal sem derrubar uma prega de roupa. Corre porque é o único do bairro que consegue — e volta com o lanche de todos.",
    avatarVisual: {
      skinToneHex: "#4A2C17",
      hairStyle: "Dreads altos amarrados em nó",
      hairColorHex: "#101010",
      eyeColorHex: "#FDBA74",
      facialFeature: "Sorriso largo de quem respira fácil e cicatriz de varal no ombro",
      headgearOrVisor: "Faixa de suor laranja de corredor",
      avatarThemeGradient: ["#F97316", "#1F2937"],
    },
    appearancePromptEn:
      "Bouncy Afro-Brazilian male gang runner (20 years old), tall dreads tied up in a high knot, wide easy grin, rooftop-run callouses, orange sweatband, lean sprinter build caught mid-stride",
    appearancePromptPt:
      "Corredor de gangue afro-brasileiro solto (20 anos), dreads altos amarrados em nó, sorriso largo e fácil, calos de corrida de laje, faixa de suor laranja e biotipo de velocista em passada",
    wardrobePromptEn:
      "Wearing a charcoal sleeveless gang hoodie tied at the waist, taped fingerless running gloves, lightweight parkour trousers with knee scuffs, worn flat-soled running shoes, orange flag-line wound around the forearm",
    wardrobePromptPt:
      "Vestindo moletom de gangue sem mangas amarrado na cintura, luvas de corrida sem dedos enroladas de fita, calça de parkour leve com roções no joelho, tênis de sola lisa gasto e corda de bandeirinha laranja enrolada no antebraço",
    weaponHandlingEn:
      "Holding a compact SMG (WPN_SMG_MK2) pressed against the chest on a one-point sling so it does not bounce while sprinting, trigger discipline absolute",
    weaponHandlingPt:
      "Segurando submetralhadora compacta (WPN_SMG_MK2) colada no peito em sling de um ponto para não balançar na corrida, disciplina de gatilho absoluta",
    accentColors: {
      primaryHex: "#F97316",
      secondaryHex: "#1F2937",
      trimHex: "#FDBA74",
      label: "Laranja-Ventania + Carvão + Pêssego",
    },
    biomechanics: {
      heightCm: 175,
      massKg: 62,
      sprintSpeedMps: 7.9,
      slideFrictionCoeff: 0.6,
      recoilAbsorptionDeg: 3.5,
      vaultClearanceCm: 128,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_MALE_CORTA",
    ueAssetId: "CHR_Onith_Male_Corta",
    codename: "CORTA",
    fullName: "Goran 'Corta' Vukas · Soldado de Facção GNG-03",
    gender: "MASCULINO",
    faction: "GANGUE_URBANA",
    rank: "ONITH",
    specializationId: "INFANTARIA",
    defaultWorldId: "Barburhen",
    skinRarity: "RARO",
    roleTitle: "Combate de Facção & Pressão de Rua",
    ethnicity: "Balcânico Bósnio / Imigrante Brasileiro",
    heritageLore:
      "Soldado de primeira linha da facção de Barburhen, veterano de duas guerras que não têm nome nos mapas. Ensina os mais novos a contar cartuchos antes de contar vítimas — a facção dele atira para terminar discussão, não para abri-la.",
    avatarVisual: {
      skinToneHex: "#E0AC69",
      hairStyle: "Buzz-cut com linhas navalhadas",
      hairColorHex: "#6B4423",
      eyeColorHex: "#57534E",
      facialFeature: "Quebrado no nariz duas vezes e olhar que fecha assunto",
      headgearOrVisor: "Bandana balística vermelha com listras",
      avatarThemeGradient: ["#EF4444", "#171717"],
    },
    appearancePromptEn:
      "Stoic Bosnian-Brazilian male gang enforcer (34 years old), buzz cut with shaved ruled lines, twice-broken nose, ash-grey eyes that end conversations, red ballistic bandana, quiet heavy stance",
    appearancePromptPt:
      "Capanga de facção bósnio-brasileiro estoico (34 anos), cabeça raspada com linhas navalhadas, nariz quebrado duas vezes, olhos cinza-fuligem que fecham conversa, bandana balística vermelha e postura pesada silenciosa",
    wardrobePromptEn:
      "Wearing a black gang field jacket with torn insignia, chest rig of mismatched pouches, ribbed knuckle gloves, steel-toe boots with red laces, faction stencil sprayed on the shoulder plate",
    wardrobePromptPt:
      "Vestindo jaqueta de campo de gangue preta com insígnia rasgada, colete de peitoral de porta-cartuchos desparejos, luvas de malha com proteção de nódos, coturno com cadarço vermelho e stencil da facção sprayado na placa do ombro",
    weaponHandlingEn:
      "Holding a full-size faction assault rifle (WPN_AssaultRifle_MK1) with red-lace sling, unshaking C-clamp grip and a carry that says the argument is over",
    weaponHandlingPt:
      "Segurando fuzil de facção completo (WPN_AssaultRifle_MK1) com sling de cadarço vermelho, empunhadura C-clamp imóvel e porte que encerra a discussão",
    accentColors: {
      primaryHex: "#EF4444",
      secondaryHex: "#171717",
      trimHex: "#F87171",
      label: "Vermelho-Facção + Preto-Asfalto + Brasa",
    },
    biomechanics: {
      heightCm: 186,
      massKg: 92,
      sprintSpeedMps: 6.8,
      slideFrictionCoeff: 0.76,
      recoilAbsorptionDeg: 1.8,
      vaultClearanceCm: 106,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_MALE_BAILE",
    ueAssetId: "CHR_Khael_Male_Baile",
    codename: "BAILE",
    fullName: "Ras 'Baile' Thompson · DJ do Comando GNG-04",
    gender: "MASCULINO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "COMUNICACOES_HACKER",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Sonorização de Zona & Comando de Baile",
    ethnicity: "Afro-Caribenho / Jamaicano-Paulistano",
    heritageLore:
      "É o DJ que avisa por som qual rua está livre no CIGKV: o baile começa quando o perímetro está limpo e acaba em scratch se algo dá errado. A pista dele é o radar — quem dança, está seguro; quem sai, avisa os outros.",
    avatarVisual: {
      skinToneHex: "#4A2F1A",
      hairStyle: "Fios de rasta sob gorro escuro",
      hairColorHex: "#1C1917",
      eyeColorHex: "#22D3EE",
      facialFeature: "Fones DJ no pescoço e olhos que leem pista e porta ao mesmo tempo",
      headgearOrVisor: "Fones DJ magenta com brilho de LED",
      avatarThemeGradient: ["#EC4899", "#18181B"],
    },
    appearancePromptEn:
      "Magnetic Afro-Caribbean male gang block-party DJ (28 years old), rasta strands under a dark beanie, trimmed goatee, DJ headphones around the neck, cyan LED glint in the eyes, relaxed crowd-reading stance",
    appearancePromptPt:
      "DJ de baile de gangue afro-caribenho magnético (28 anos), fios de rasta sob gorro escuro, cavanhaque aparado, fones de DJ no pescoço, brilho de LED ciano nos olhos e postura relaxada de quem lê a pista e a porta",
    wardrobePromptEn:
      "Wearing a magenta-accented gang bomber over a black tank top, gold chain over the collarbone, mix-desk calluses, cargo joggers with cable loops, limited-edition sneakers, cable-coiled belt",
    wardrobePromptPt:
      "Vestindo bomber de gangue com acentos magenta sobre regata preta, corrente de ouro sobre a clavícula, calos de mesa de mixagem, jogger cargo com laços de cabo, tênis de edição limitada e cinto enrolado de cabos",
    weaponHandlingEn:
      "Holding a compact pistol (WPN_Pistol_MK1) tucked but ready on the booth edge, hand near but never on it while the set runs",
    weaponHandlingPt:
      "Segurando pistola compacta (WPN_Pistol_MK1) pousada na mesa, à mão mas nunca empunhada enquanto o set roda",
    accentColors: {
      primaryHex: "#EC4899",
      secondaryHex: "#18181B",
      trimHex: "#22D3EE",
      label: "Magenta-Baile + Carvão + Ciano-LED",
    },
    biomechanics: {
      heightCm: 180,
      massKg: 76,
      sprintSpeedMps: 7.0,
      slideFrictionCoeff: 0.68,
      recoilAbsorptionDeg: 2.7,
      vaultClearanceCm: 114,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_FEMALE_ROTA",
    ueAssetId: "CHR_Venex_Female_Rota",
    codename: "ROTA",
    fullName: "Mirta 'Rota' Benítez · Entregadora da Facção GNG-05",
    gender: "FEMININO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "MOTORISTA_PESADOS",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Logística de Moto & Rota de Fuga",
    ethnicity: "Paraguaia / Ciudad del Este",
    heritageLore:
      "Leva e traz a logística da facção pelas ciclovias do CIGKV: nenhum checkpoint olha duas vezes para uma entregadora de app. Guarda o mapa das rotas na cabeça e a chave de contato no punho.",
    avatarVisual: {
      skinToneHex: "#D29B6E",
      hairStyle: "Rabo de cavalo alto de motoqueira",
      hairColorHex: "#3B2314",
      eyeColorHex: "#84CC16",
      facialFeature: "Cicatriz fina de capacete na testa e olhar de trajeto calculado",
      headgearOrVisor: "Capacete de moto âmbar de viseira aberta",
      avatarThemeGradient: ["#F59E0B", "#3F3F46"],
    },
    appearancePromptEn:
      "Alert Paraguayan female gang moto-courier (26 years old), high ponytail escaping an amber open-face moto helmet, thin visor scar on the forehead, route-calculating eyes, delivery-bag strap crossing the chest",
    appearancePromptPt:
      "Entregadora de gangue paraguaia atenta (26 anos), rabo de cavalo alto escapando do capacete âmbar de moto aberto, cicatriz fina de viseira na testa, olhos que calculam rota e alça de bag de entrega cruzada no peito",
    wardrobePromptEn:
      "Wearing a scuffed amber moto jacket with gang patch taped over, thermal-lined gloves, knee-slide plates, waterproof delivery bag repainted with the faction mark, ankle holster",
    wardrobePromptPt:
      "Vestindo jaqueta moto âmbar riscada com remendo de facção por cima, luvas térmicas, placas de deslizamento no joelho, bag de entrega impermeável repintada com a marca da facção e coldre de canela",
    weaponHandlingEn:
      "Holding a compact carbine (WPN_AssaultRifle_MK1) resting across the handlebars, quick-draw discipline of a courier who plans two exits per street",
    weaponHandlingPt:
      "Segurando carabina compacta (WPN_AssaultRifle_MK1) apoiada no guidão, disciplina de saque rápido de entregadora que planeja duas saídas por rua",
    accentColors: {
      primaryHex: "#F59E0B",
      secondaryHex: "#3F3F46",
      trimHex: "#FBBF24",
      label: "Amarelo-Rota + Zinco + Sinalização",
    },
    biomechanics: {
      heightCm: 167,
      massKg: 60,
      sprintSpeedMps: 7.3,
      slideFrictionCoeff: 0.66,
      recoilAbsorptionDeg: 2.9,
      vaultClearanceCm: 120,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_FEMALE_COTOVELA",
    ueAssetId: "CHR_Zheers_Female_Cotovela",
    codename: "COTOVELA",
    fullName: "Iara 'Cotovela' Teixeira · Lutadora de Galpão GNG-06",
    gender: "FEMININO",
    faction: "GANGUE_URBANA",
    rank: "ONITH",
    specializationId: "INFANTARIA",
    defaultWorldId: "Barburhen",
    skinRarity: "RARO",
    roleTitle: "Luta Corporal & Demolição de Galpão",
    ethnicity: "Nordestina Litorânea / Fortaleza",
    heritageLore:
      "Campeã do galpão: luta por dinheiro e por respeito no anel improvisado de Barburhen. A facção a levou quando descobriu que ela abre portas blindadas com cotovelada e fecha discussões com uma só.",
    avatarVisual: {
      skinToneHex: "#9C6644",
      hairStyle: "Moicano tingido com laterais desbotadas",
      hairColorHex: "#EC4899",
      eyeColorHex: "#F43F5E",
      facialFeature: "Sobrancelha partida e ombro tatuado com o escudo do galpão",
      headgearOrVisor: "Protetor auricular rosa de ringue",
      avatarThemeGradient: ["#F43F5E", "#292524"],
    },
    appearancePromptEn:
      "Powerful coastal northeast-Brazilian female gang pit-fighter (30 years old), dyed pink mohawk with faded sides, split eyebrow, shoulder tattoo of the warehouse crest, taped knuckles, champion's calm before the bell",
    appearancePromptPt:
      "Lutadora de galpão nordestina litorânea forte (30 anos), moicano rosa com laterais desbotadas, sobrancelha partida, tatuagem do escudo do galpão no ombro, nós dos dedos enrolados de fita e calma de campeã antes do sino",
    wardrobePromptEn:
      "Wearing a rose-accented ring jacket with the sleeves cut off, taped forearms, fight shorts over compression leggings, wrestling ear protector, gold-champion belt buckle repurposed as the PackBack latch",
    wardrobePromptPt:
      "Vestindo jaqueta de ringue com acentos rosa e mangas cortadas, antebraços enfaixados, short de luta sobre legging de compressão, protetor auricular de luta e fivela de cinturão de campeã adaptada como fecho da PackBack",
    weaponHandlingEn:
      "Holding a compact SMG (WPN_SMG_MK2) like an extension of the taped fist, short controlled bursts of the same economy as her punches",
    weaponHandlingPt:
      "Segurando submetralhadora compacta (WPN_SMG_MK2) como extensão do punho enfaixado, rajadas curtas com a mesma economia dos seus golpes",
    accentColors: {
      primaryHex: "#F43F5E",
      secondaryHex: "#292524",
      trimHex: "#FBBF24",
      label: "Rosa-Lona + Carvão + Ouro-Cinto",
    },
    biomechanics: {
      heightCm: 172,
      massKg: 72,
      sprintSpeedMps: 7.1,
      slideFrictionCoeff: 0.7,
      recoilAbsorptionDeg: 2.1,
      vaultClearanceCm: 118,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_FEMALE_SOMBRA",
    ueAssetId: "CHR_Huran_Female_Sombra",
    codename: "SOMBRA",
    fullName: "Bruna 'Sombra' Bellini · Batedora de Território GNG-07",
    gender: "FEMININO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "RASTREADORES",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Infiltração Silenciosa & Recon de Território",
    ethnicity: "Italo-Gaúcha / Serra Rio-Grandense",
    heritageLore:
      "Bate o território antes de qualquer movimento da facção: entra pelo telhado, conta camêras, cães e turnos, e sai sem som. Nunca foi vista duas vezes no mesmo ponto — os rivalês acham que Sombra são duas pessoas.",
    avatarVisual: {
      skinToneHex: "#F0C8A0",
      hairStyle: "Cabelo preto liso em camadas",
      hairColorHex: "#0B0B0C",
      eyeColorHex: "#94A3B8",
      facialFeature: "Rosto neutro impossível de lembrar e reflexo prateado nos olhos sob luz de lanterna",
      headgearOrVisor: "Capuz fino cinza fosco de batedora",
      avatarThemeGradient: ["#64748B", "#0F172A"],
    },
    appearancePromptEn:
      "Unremarkable-by-design Italian-Gaucho female gang scout (24 years old), straight black hair under a thin slate hood, forgettable neutral face with a silver glint under flashlight, silent flat-footed stance",
    appearancePromptPt:
      "Batedora de gangue ítalo-gaúcha de rosto proposital esquecível (24 anos), cabelo preto liso sob capuz fino cinza, fisionomia neutra com reflexo prateado sob lanterna e passos silenciosos e planos",
    wardrobePromptEn:
      "Wearing a slim slate-grey scout shell over a dark base layer, soft-shell gloves with grip pads, quiet-flex tactical trousers, reflective thread stripe on the PackBack for roof recognition, hood edges taped matte",
    wardrobePromptPt:
      "Vestindo casca fina de batedora cinza-ardósia sobre camada escura, luvas soft-shell com almofadas de grip, calça tática de movimento silencioso, fio refletivo na PackBack para reconhecimento de telhado e aba do capuz coberta de fosco",
    weaponHandlingEn:
      "Holding a suppressed compact pistol (WPN_Pistol_MK1) angled down, weight shifted to keep floorboards silent",
    weaponHandlingPt:
      "Segurando pistola compacta com supressor (WPN_Pistol_MK1) apontada para baixo, peso deslocado para não ranger o assoalho",
    accentColors: {
      primaryHex: "#64748B",
      secondaryHex: "#0F172A",
      trimHex: "#CBD5E1",
      label: "Cinza-Sombra + Meia-noite + Prata",
    },
    biomechanics: {
      heightCm: 168,
      massKg: 59,
      sprintSpeedMps: 7.4,
      slideFrictionCoeff: 0.74,
      recoilAbsorptionDeg: 3.2,
      vaultClearanceCm: 122,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_FEMALE_PIXEL",
    ueAssetId: "CHR_Skeetw_Female_Pixel",
    codename: "PIXEL",
    fullName: "Linh 'Pixel' Trần · Hacker de Lan House GNG-08",
    gender: "FEMININO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "COMUNICACOES_HACKER",
    defaultWorldId: "Ckesalth",
    skinRarity: "RARO",
    roleTitle: "Clonagem de Chip & Guerra Eletrônica de Rua",
    ethnicity: "Vietnamita-Brasileira / Zona Leste de São Paulo",
    heritageLore:
      "Roda a lan house da facção num entreposto de Ckesalth: clona chip, quebra bloqueio de drone e vende sinal para quem precisa. Dizem que ela derruba o saldo do rival na hora do saque — e que o led ciano nunca apaga antes dela.",
    avatarVisual: {
      skinToneHex: "#F5CBA7",
      hairStyle: "Bob assimétrico com mechas ciano",
      hairColorHex: "#22D3EE",
      eyeColorHex: "#A78BFA",
      facialFeature: "Mecas ciano no bob assimétrico e olhos de quem lê código no ar",
      headgearOrVisor: "Óculos AR ciano com código refletido",
      avatarThemeGradient: ["#06B6D4", "#27272A"],
    },
    appearancePromptEn:
      "Focused Vietnamese-Brazilian female gang street-hacker (21 years old), asymmetric bob with cyan-dyed streaks, violet AR visor glasses with scrolling reflections, keyboard-typed callouses, coiled USB cable on the wrist",
    appearancePromptPt:
      "Hacker de rua vietnamita-brasileira de gangue focada (21 anos), bob assimétrico com mecas tingidas de ciano, óculos AR violeta com reflexos de código rolando, calos de teclado e cabo USB enrolado no pulso",
    wardrobePromptEn:
      "Wearing a cyan-accented oversized tech jacket with patched LAN-house logos, cargo joggers with drive pockets, fingerless typing gloves, clipped RFID cloner on the chest strap, cyan cable braided through the PackBack",
    wardrobePromptPt:
      "Vestindo jaqueta tech oversized com acentos ciano e logos de lan house remendados, jogger cargo com porta-drives, luvas de digitação sem dedos, clonador RFID preso no peitoral e cabo ciano trançado na PackBack",
    weaponHandlingEn:
      "Holding a compact SMG (WPN_SMG_MK2) between the knees while both hands run the cloner, disciplined muzzle direction learned the hard way",
    weaponHandlingPt:
      "Segurando submetralhadora compacta (WPN_SMG_MK2) entre os joelhos enquanto as duas mãos rodam o clonador, direção de cano disciplinada aprendida do jeito difícil",
    accentColors: {
      primaryHex: "#06B6D4",
      secondaryHex: "#27272A",
      trimHex: "#A78BFA",
      label: "Ciano-Pixel + Carvão + Violeta-Circuito",
    },
    biomechanics: {
      heightCm: 163,
      massKg: 55,
      sprintSpeedMps: 7.2,
      slideFrictionCoeff: 0.64,
      recoilAbsorptionDeg: 3.3,
      vaultClearanceCm: 116,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
];

/** Roster jogável completo: militares canônicos + lote de milícias/gangues. */
export const ALL_KHAAOS_OPERATIVE_ARCHETYPES: OperativeArchetype[] = [
  ...KHAAOS_OPERATIVE_ARCHETYPES,
  ...KHAAOS_MILITIA_ARCHETYPES,
];
