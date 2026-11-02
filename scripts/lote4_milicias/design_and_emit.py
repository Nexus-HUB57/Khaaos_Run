#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lote 4 — Milícias e Gangues Urbanas (16 personagens, 8M/8F).
Fonte única de verdade do lote: emite o bloco TS (KHAAOS_MILITIA_ARCHETYPES),
os 16 SVGs (byte-idênticos em Content/Avatars e client/public/avatars),
atualiza avatar_catalog.json (ambas as cópias) e o asset_manifest.json.

Uso: python3 scripts/lote4_milicias/design_and_emit.py [--ts-only|--assets-only]
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT_TS = REPO / "scripts/lote4_milicias/militia_block.ts"

FACTIONS = {"MIL": "MILICIA_URBANA", "GNG": "GANGUE_URBANA"}

# ─────────────────────────────────────────────────────────────────────────────
# DADOS DOS 16 PERSONAGENS
# ─────────────────────────────────────────────────────────────────────────────
C = []

def add(**kw):
    C.append(kw)

# ══ MILÍCIAS (8: 4 M + 4 F) ══════════════════════════════════════════════════
add(
    id="OP_MIL_MALE_VULTO", faction="MIL", tag="MIL-01",
    ueAssetId="CHR_Zheers_Male_Vulto", codename="VULTO",
    fullName="Rui 'Vulto' Nascimento · Comandante de Bloco MIL-01",
    gender="MASCULINO", rank="ONITH", spec="INFANTARIA", world="Barburhen",
    rarity="RARO", role="Comando Territorial & Defesa de Perímetro",
    ethnicity="Afro-Brasileiro / Sertão Nordestino",
    heritage=(
        "Comandante de bloco em Barburhen, ex-bombeiro civil que perdeu a equipe no primeiro "
        "colapso do anel urbano. Governa 4 lajes e 2 galerias com regras próprias: ninguém "
        "passa sem registro e ninguém morre de sede sob sua guarda."),
    skin="#7a4a24", skin2="#54301a",
    hairStyle="buzz", hair="#9ca3af", eye="#f59e0b",
    face="Cicatriz de queimadura no antebraço direito e olhar de quem já ordenou luto",
    headgear="bandana", headgearColor="#D97706",
    beard="goatee",
    grad=["#D97706", "#4B5563"],
    appearance_en=("Weathered Afro-Brazilian male militia block commander (44 years old), "
        "salt-and-pepper buzz cut, trimmed goatee, burn-scarred forearms, broad tired shoulders, "
        "steady commanding gaze under a dusty amber bandana"),
    appearance_pt=("Comandante de bloco miliciano afro-brasileiro de pele marcada (44 anos), "
        "cabeça raspada com os cabelos salpicados de grisalho, cavanhaque aparado, antebraços com "
        "cicatriz de queimadura, ombros largos e cansados, olhar firme sob bandana âmbar empoeirada"),
    wardrobe_en=("Wearing a worn-out grey Khaaos Run militia plate carrier patched with mismatched "
        "ceramic plates, folded sleeves of a faded brick-red work shirt, zip-tied spare mag pouches, "
        "civilian steel-toe boots, amber taxi-yellow perimeter armband, and a hand-painted block number on the chest"),
    wardrobe_pt=("Vestindo colete miliciano cinza desbotado do Khaaos Run com placas cerâmicas "
        "desparejas amarradas por abraçadeiras, manga dobrada de camisa de trabalho tijolo, "
        "porta-cartuchos improvisados, bota de obra, braçadeira amarelo-táxi de perímetro e o número "
        "do bloco pintado à mão no peito"),
    weapon_en=("Holding a battered pump shotgun with electrical-tape grip wrap (WPN_Shotgun_Breach), "
        "steady two-hand hold with strict trigger discipline learned in fire brigades"),
    weapon_pt=("Empunhando escopeta de bombeamento gasta com fita isolante no punho "
        "(WPN_Shotgun_Breach), empunhadura firme de duas mãos e disciplina de gatilho aprendida no corpo de bombeiros"),
    accents=["#D97706", "#4B5563", "#FACC15", "Âmbar Laje + Cinza-Urubu + Amarelo-Táxi"],
    bio=dict(h=184, m=88, sprint=7.0, slide=0.74, recoil=2.2, vault=112),
    svg=dict(bg="#D97706", motif="faixa"),
)

add(
    id="OP_MIL_MALE_ECO", faction="MIL", tag="MIL-02",
    ueAssetId="CHR_Skeetw_Male_Eco", codename="ECO",
    fullName="Zico 'Eco' Amaral · Radarista das Lajes MIL-02",
    gender="MASCULINO", rank="ZHEERS", spec="COMUNICACOES_HACKER", world="CIGKV",
    rarity="COMUM", role="Vigilância de Laje & Rede Rádio da Milícia",
    ethnicity="Pardo Amazônido / Ribeirinho Belenense",
    heritage=(
        "Subiu no telhado do CIGKV aos 12 anos e nunca mais desceu: das lajes coordena a rede de "
        "rádios HT e espelhos solares da milícia. Dizem que escuta um drone ligando 3 quadras antes "
        "de ele aparecer no horizonte."),
    skin="#b07b4f", skin2="#8a5c38",
    hairStyle="dreads", hair="#1f2937", eye="#22d3ee",
    face="Rosto enxuto com olhos sempre em rotação de vigia e marca de sol em arco no pescoço",
    headgear="headset", headgearColor="#0EA5E9",
    beard="none",
    grad=["#0EA5E9", "#374151"],
    appearance_en=("Lean river-dwelling mixed-heritage male militia radio watcher (22 years old), "
        "short dreadlocks with tiny reflective rings, sun-arc tan line on the neck, quick scanning "
        "eyes, cyan-tinted tactical headset with improvised antenna"),
    appearance_pt=("Vigia de rádio miliciano pardo amazônido magro (22 anos), dreadlocks curtos com "
        "argolinhas refletivas, marca de sol em arco no pescoço, olhos em varredura constante e "
        "headset tático ciano com antena improvisada"),
    wardrobe_en=("Wearing a faded sky-blue militia windbreaker over a mesh tracer vest with zip-tied "
        "radio batteries, lightweight cargo shorts over compression leggings, worn running shoes, "
        "clipboard of patrol codes taped to the PackBack strap"),
    wardrobe_pt=("Vestindo corta-vento azul-céu de milícia desbotado sobre colete de rastreamento "
        "com pilhas de rádio amarradas, bermuda cargo sobre legging de compressão, tênis de corrida "
        "gasto e prancheta de códigos de ronda presa à alça da PackBack"),
    weapon_en=("Holding a compact survival pistol (WPN_Pistol_MK1) low-ready in one hand while the "
        "other taps the radio keyer, trigger finger indexed along the slide"),
    weapon_pt=("Segurando pistola compacta de sobrevivência (WPN_Pistol_MK1) em guarda baixa com uma "
        "mão enquanto a outra toca o manipulador do rádio, dedo de gatilho alinhado ao ferrolho"),
    accents=["#0EA5E9", "#374151", "#22D3EE", "Céu-Laje + Grafite + Ciano-Radar"],
    bio=dict(h=174, m=63, sprint=7.6, slide=0.62, recoil=3.4, vault=124),
    svg=dict(bg="#0EA5E9", motif="grade"),
)

add(
    id="OP_MIL_MALE_FERRAZ", faction="MIL", tag="MIL-03",
    ueAssetId="CHR_Onith_Male_Ferraz", codename="FERRAZ",
    fullName="Tonho Ferraz · Armeiro de Quintal MIL-03",
    gender="MASCULINO", rank="ONITH", spec="ENGENHARIA_TATICA", world="Barburhen",
    rarity="RARO", role="Fabricação Artesanal & Manutenção de Campo",
    ethnicity="Caipira Paulista / Italiano-Luso",
    heritage=(
        "Transforma gás, cano de água e mola de caminhão em escopeta confiável dentro do quintal de "
        "Barburhen. A milícia inteira atira com o que a bancada dele aprova — e o punho do Ferraz "
        "grava o lacre de qualidade em cada arma."),
    skin="#e8b98a", skin2="#c2905f",
    hairStyle="careca", hair="#6b7280", eye="#78716c",
    face="Bigode de açogueiro sobre barba grisalha e queimaduras de solda nos antebraços",
    headgear="goggles", headgearColor="#B45309",
    beard="full",
    grad=["#B45309", "#57534E"],
    appearance_en=("Heavyset back-yard gunsmith male militia artisan (51 years old), shaved head with "
        "grey stubble shadow, thick butcher moustache over a grey beard, weld-burn speckles on "
        "forearms, calm craftsman squint"),
    appearance_pt=("Armeiro de quintal miliciano de porte pesado (51 anos), cabeça raspada com sombra "
        "de barba grisalha, bigode grosso sobre barba cinza, salpicos de queimadura de solda nos "
        "antebraços e olhar sereno de artesão"),
    wardrobe_en=("Wearing a scorched leather blacksmith apron over a bronze-brown Khaaos Run militia "
        "overalls, rolled sleeves with duct-tape tool loops, heavy welding gloves hooked on the belt, "
        "stamped quality seal hanging from the neck chain"),
    wardrobe_pt=("Vestindo avental de forja couro chamuscado sobre jardineira milicia bronze do Khaaos "
        "Run, mangas enroladas com laços de fita isolante para ferramentas, luvas de solda grossas no "
        "cinto e lacre de qualidade estampado pendurado na corrente do pescoço"),
    weapon_en=("Holding his own hand-stamped breach shotgun (WPN_Shotgun_Breach) with raw-steel finish "
        "and hand-filed rifling, confident relaxed muzzle-down carry"),
    weapon_pt=("Empunhando escopeta de brecha estampada por ele mesmo (WPN_Shotgun_Breach) com acabamento "
        "de aço cru e cano raiado à lima, cano para baixo em portea confiante"),
    accents=["#B45309", "#57534E", "#F59E0B", "Bronze-Fornalha + Metal Sujo + Âmbar"],
    bio=dict(h=178, m=97, sprint=6.4, slide=0.78, recoil=1.9, vault=100),
    svg=dict(bg="#B45309", motif="chispa"),
)

add(
    id="OP_MIL_MALE_GRAU", faction="MIL", tag="MIL-04",
    ueAssetId="CHR_Venex_Male_Grau", codename="GRAU",
    fullName="Márcio 'Grau' Quispe · Motoqueiro de Esquina MIL-04",
    gender="MASCULINO", rank="ZHEERS", spec="MOTORISTA_PESADOS", world="CIGKV",
    rarity="COMUM", role="Mobilidade Moto & Recado Urgente da Milícia",
    ethnicity="Mestiço Andino / Peruano-Limeño",
    heritage=(
        "Atravessa o CIGKV de costas da moto em 4 minutos no pico do bloqueio. É o recado vivo da "
        "milícia: se o Grau chegou de mau humor, o perímetro já sabe que algo caiu."),
    skin="#c68a53", skin2="#a06a3b",
    hairStyle="undercut_bun", hair="#111827", eye="#65a30d",
    face="Nariz torto de queda de moto e meio-sorriso desafiador",
    headgear="bone", headgearColor="#65A30D",
    beard="stubble",
    grad=["#65A30D", "#44403C"],
    appearance_en=(" wiry Andean mixed-heritage male militia moto-runner (25 years old), black undercut "
        "topknot, crooked nose from a bike crash, defiant half-smile, olive-green backwards cap, "
        "highway dust on the cheekbones"),
    appearance_pt=("Motoqueiro miliciano mestiço andino magro (25 anos), undercut preto com coque, "
        "nariz torto de queda de moto, meio-sorriso desafiador, boné verde-oliva virado e poeira de "
        "estrada nos maçãs do rosto"),
    wardrobe_en=("Wearing a delivery-scarred olive-green militia moto jacket with reflective taxi-yellow "
        "tape strips, armored knee slides, fingerless riding gloves, mismatched shin guards and a "
        "coiled tow strap over the shoulder"),
    wardrobe_pt=("Vestindo jaqueta moto milícia verde-oliva marcada por entregas com fitas refletivas "
        "amarelo-táxi, joelheiras de deslizamento, luvas de pilotar sem dedos, caneleiras desparejas e "
        "cinta de reboque enrolada no ombro"),
    weapon_en=("Holding a compact submachine gun (WPN_SMG_MK2) sideways-ready across the tank of his "
        "bike, disciplined index finger despite the showy angle"),
    weapon_pt=("Segurando submetralhadora compacta (WPN_SMG_MK2) atravessada no tanque da moto, dedo "
        "indicador disciplinado apesar do ângulo exibido"),
    accents=["#65A30D", "#44403C", "#FDE047", "Verde-Entrega + Asfalto + Amarelo-Farol"],
    bio=dict(h=173, m=68, sprint=7.4, slide=0.66, recoil=2.9, vault=122),
    svg=dict(bg="#65A30D", motif="rayo"),
)

add(
    id="OP_MIL_FEMALE_NOTA", faction="MIL", tag="MIL-05",
    ueAssetId="CHR_Zheers_Female_Nota", codename="NOTA",
    fullName="Dandara 'Nota' Lisboa · Cobradora de Proteção MIL-05",
    gender="FEMININO", rank="ZHEERS", spec="FUZILEIROS", world="Barburhen",
    rarity="COMUM", role="Cobrança Territorial & Controle de Loot da Milícia",
    ethnicity="Afro-Brasileira / Periferia Carioca",
    heritage=(
        "Cobradora de 'proteção' com caderneta mimeografada: cada venda de Barburhen tem sua linha, "
        "cada linha tem prazo. Trata a caderneta como arquivo de guerra — quem a acha, acha o mapa "
        "inteiro do território."),
    skin="#5c3a21", skin2="#3f2716",
    hairStyle="braids", hair="#101010", eye="#e879f9",
    face="Brincos de argola pesados e olhar de contadora de guerra",
    headgear="neckband", headgearColor="#DC2626",
    beard="none",
    grad=["#DC2626", "#52525B"],
    appearance_en=("Sharp-featured Afro-Brazilian female militia toll collector (29 years old), "
        "box braids with small white beads, heavy gold hoop earrings, ledger-keeper's focused gaze, "
        "red neck bandana, ink smudge on the wrist"),
    appearance_pt=("Cobradora miliciana afro-brasileira de traços marcados (29 anos), tranças box com "
        "miçangas brancas, argolas douradas pesadas, olhar focado de quem confere contas, bandana "
        "vermelha no pescoço e mancha de tinta no pulso"),
    wardrobe_en=("Wearing a brick-red militia armband over a patched utility vest with transparent "
        "card pockets full of stamped collection slips, reinforced cargo skirt over tactical leggings, "
        "laced ankle boots, mimeographed ledger strapped to the thigh"),
    wardrobe_pt=("Vestindo braçadeira milícia vermelho-tijolo sobre colete utilitário remendado com "
        "portas-cartão cheios de comprovantes carimbados, saia cargo reforçada sobre legging tática, "
        "bota de cano alto amarrada e caderneta mimeografada presa à coxa"),
    weapon_en=("Holding a worn militia-pattern assault rifle (WPN_AssaultRifle_MK1) with red-taped "
        "magazine, strict trigger discipline while the ledger dangles from the wrist strap"),
    weapon_pt=("Empunhando fuzil de padrão miliciano desgastado (WPN_AssaultRifle_MK1) com carregador "
        "marcado por fita vermelha, disciplina estrita de gatilho com a caderneta balançando na alça do pulso"),
    accents=["#DC2626", "#52525B", "#E7E5E4", "Vermelho-Tijolo + Zinco + Papel-Moeda"],
    bio=dict(h=170, m=64, sprint=7.2, slide=0.68, recoil=2.6, vault=116),
    svg=dict(bg="#DC2626", motif="linha"),
)

add(
    id="OP_MIL_FEMALE_SIRENE", faction="MIL", tag="MIL-06",
    ueAssetId="CHR_Khael_Female_Sirene", codename="SIRENE",
    fullName="Marisa 'Sirene' Kalinda · Oradora de Perímetro MIL-06",
    gender="FEMININO", rank="SKEETW", spec="COMUNICACOES_HACKER", world="CIGKV",
    rarity="RARO", role="Propaganda de Guerra & Moral da Milícia",
    ethnicity="Cigana Calon (Romani Brasileira) / Interior Sudeste",
    heritage=(
        "Comanda o alto-falante de 400 watts no topo da laje-mãe do CIGKV: anúncio de curfew, "
        "listagem de desaparecidos e hinos de resistência. Os portões abrem quando a Sirene fala — "
        "e fecham quando ela repete três vezes."),
    skin="#c99b6e", skin2="#a3764c",
    hairStyle="long", hair="#2b1d12", eye="#a78bfa",
    face="Lenço de flores amarrado à cabeça e olhar que mede plateias inteiras",
    headgear="lenco", headgearColor="#7C3AED",
    beard="none",
    grad=["#7C3AED", "#3F3F46"],
    appearance_en=("Charismatic Calon Romani Brazilian female militia perimeter orator (38 years old), "
        "long wavy dark-brown hair under a purple floral headscarf, expressive wide gaze, small gold "
        "tooth glint, sun-lifted chin of someone addressing a crowd"),
    appearance_pt=("Oradora miliciana cigana calon carismática (38 anos), cabelo castanho escuro longo e "
        "ondulado sob lenço roxo de flores, olhar largo e expressivo, brilho de dente de ouro e queixo "
        "erguido de quem fala para plateia"),
    wardrobe_en=("Wearing a smoke-grey militia speaker vest with a hand-painted megaphone emblem, layered "
        "calico skirts over thermal leggings, fingerless gloves, portable PA rig clipped to the PackBack "
        "frame, purple ribbon around the wrist"),
    wardrobe_pt=("Vestindo colete milícia cinza-fumaça com emblema de megafone pintado à mão, saias de "
        "chita em camadas sobre legging térmica, luvas sem dedos, módulo de som portátil preso à "
        "estrutura PackBack e fita roxa no pulso"),
    weapon_en=("Holding a compact carbine (WPN_AssaultRifle_MK1) slung across the back while both hands "
        "keep the megaphone steady, disciplined posture of a commander who speaks before shooting"),
    weapon_pt=("Carabina compacta (WPN_AssaultRifle_MK1) a tiracolo nas costas enquanto as duas mãos "
        "firmam o megafone, postura disciplinada de comandante que fala antes de atirar"),
    accents=["#7C3AED", "#3F3F46", "#FB7185", "Roxo-Corredor + Fumaça + Rosa-Sirene"],
    bio=dict(h=168, m=66, sprint=6.8, slide=0.7, recoil=3.1, vault=108),
    svg=dict(bg="#7C3AED", motif="ondas"),
)

add(
    id="OP_MIL_FEMALE_SORO", faction="MIL", tag="MIL-07",
    ueAssetId="CHR_Huran_Female_Soro", codename="SORO",
    fullName="Hana 'Soro' Seo · Enfermeira de Clínica MIL-07",
    gender="FEMININO", rank="ZHEERS", spec="MEDICO_COMBATE", world="Barburhen",
    rarity="RARO", role="Suporte Médico Improvisado & Estabilização",
    ethnicity="Coreana / Liberdade, São Paulo",
    heritage=(
        "Mantém a clínica de andar térreo de Barburhen funcionando com soro caseiro, anestesia de "
        "aquário e luz de celular. A regra dela é absoluta: dentro da sala, nenhuma arma carregada — "
        "nem a da milícia."),
    skin="#f3c89d", skin2="#d9a673",
    hairStyle="bob", hair="#2d1b0e", eye="#38bdf8",
    face="Olhos calmos sob franja reta e mãos com tinta de iodo persistente",
    headgear="touca", headgearColor="#10B981",
    beard="none",
    grad=["#10B981", "#475569"],
    appearance_en=("Composed Korean-Brazilian female militia clinic nurse (31 years old), straight-fringe "
        "bob, calm steady eyes, persistent iodine stains on the hands, green surgical cap slightly "
        "askew, surgical mask pulled under the chin"),
    appearance_pt=("Enfermeira de clínica miliciana coreano-brasileira serena (31 anos), bob com franja "
        "reta, olhos calmos e firmes, manchas de iodo persistentes nas mãos, touca cirúrgica verde "
        "levemente torta e máscara abaixada no queixo"),
    wardrobe_en=("Wearing a clinic-green militia tabard with red cross patch stitched from salvage, "
        "triple-stacked trauma shears on a chest loop, zip-tied IV bags, sturdy trousers with knee "
        "reinforcement, slip-resistant shoes"),
    wardrobe_pt=("Vestindo tabardo milícia verde-clínica com remendo de cruz vermelha costurado de "
        "sucata, tesouras de trauma triplas no peitoral, bolsas de soro amarradas, calça reforçada nos "
        "joelhos e sapato antiderrapante"),
    weapon_en=("Holding a compact service pistol (WPN_Pistol_MK1) with magazine removed as house rule, "
        "calm two-hand grip that signals she can use it when rules break"),
    weapon_pt=("Segurando pistola de serviço compacta (WPN_Pistol_MK1) com carregador retirado por regra "
        "da casa, empunhadura calma de duas mãos que avisa que ela sabe usar quando a regra quebra"),
    accents=["#10B981", "#475569", "#5EEAD4", "Verde-Enfermaria + Aço + Menta-Soro"],
    bio=dict(h=165, m=57, sprint=7.0, slide=0.66, recoil=3.3, vault=110),
    svg=dict(bg="#10B981", motif="cruz"),
)

add(
    id="OP_MIL_FEMALE_CORUJA", faction="MIL", tag="MIL-08",
    ueAssetId="CHR_Skeetw_Female_Coruja", codename="CORUJA",
    fullName="Nina 'Coruja' Mamani · Vigia Noturna MIL-08",
    gender="FEMININO", rank="ZHEERS", spec="RASTREADORES", world="Priadus",
    rarity="COMUM", role="Observação Noturna & Avanço Silencioso",
    ethnicity="Boliviana Aymara / El Alto",
    heritage=(
        "Vigia as bordas do perímetro de Priadus das 22h às 5h da milícia do posto avançado. Treinou "
        "os olhos nas madrugadas frias de El Alto: conta silhuetas antes de contar estrelas e nunca "
        "acende lamparina perto do vidro."),
    skin="#a9714b", skin2="#855637",
    hairStyle="bun", hair="#141414", eye="#fbbf24",
    face="Olhos amendoados acostumados ao escuro e mantô de lã fino no pescoço",
    headgear="capuz", headgearColor="#334155",
    beard="none",
    grad=["#334155", "#1E293B"],
    appearance_en=("Quiet Aymara Bolivian female militia night watcher (27 years old), dark hair pulled "
        "into a low bun under a slate-blue hood, almond eyes adapted to darkness, thin alpaca wool "
        "scarf, still patient posture"),
    appearance_pt=("Vigia noturna miliciana aymara boliviana silenciosa (27 anos), cabelo escuro preso em "
        "coque baixo sob capuz azul-ardósia, olhos amendoados adaptados ao escuro, mantô de lã de alpaca "
        "fino e postura parada e paciente"),
    wardrobe_en=("Wearing a slate-blue militia watcher hood over a quilted liner vest, muted grey poncho "
        "folded on the PackBack, soft-soled scout boots, matte binoculars hanging on the chest, watch "
        "rotation chalk marks on the sleeve"),
    wardrobe_pt=("Vestindo capuz milícia azul-ardósia sobre colete acolchoado de forro, poncho cinza "
        "apagado dobrado na PackBack, bota de batedora de sola macia, binóculo fosco no peito e marcas "
        "de giz da escala de vigília na manga"),
    weapon_en=("Holding a suppressed bolt rifle (WPN_Sniper_MK3) resting on the parapet, disciplined slow "
        "breathing between observation sweeps"),
    weapon_pt=("Segurando rifle ferrolhado com supressor (WPN_Sniper_MK3) apoiado no parapeito, "
        "respiração lenta e disciplinada entre varreduras de observação"),
    accents=["#334155", "#1E293B", "#94A3B8", "Azul-Laje Noturna + Sombra + Prata-Lua"],
    bio=dict(h=162, m=58, sprint=7.1, slide=0.72, recoil=2.8, vault=118),
    svg=dict(bg="#334155", motif="lua"),
)

# ══ GANGUES URBANAS (8: 4 M + 4 F) ═══════════════════════════════════════════
add(
    id="OP_GNG_MALE_SPRAY", faction="GNG", tag="GNG-01",
    ueAssetId="CHR_Khael_Male_Spray", codename="SPRAY",
    fullName="Dudu 'Spray' Cavalcanti · Grafiteiro de Viaduto GNG-01",
    gender="MASCULINO", rank="ZHEERS", spec="INFANTARIA", world="Barburhen",
    rarity="COMUM", role="Marcação Territorial & CQB de Viaduto",
    ethnicity="Pardo Nordestino / Recife",
    heritage=(
        "Marca território da facção com grafite visível só sob luz negra — mapa codificado que a "
        "polícia fotografa e não entende. Dentro do viaduto, ele conhece cada pilar de cor e cada "
        "rota de fuga pintada à mão."),
    skin="#8d5524", skin2="#6d3f1a",
    hairStyle="afro", hair="#151515", eye="#a3e635",
    face="Manchas de tinta spray nas costas da mão e sorriso rápido",
    headgear="respirador", headgearColor="#22C55E",
    beard="stubble",
    grad=["#22C55E", "#6D28D9"],
    appearance_en=("Energetic mixed-heritage northeast-Brazilian male gang graffiti tagger (23 years old), "
        "short afro with a shaved line design, spray-paint freckles on the hands, quick grin, "
        "green respirator mask hanging on the neck, lime-green accents"),
    appearance_pt=("Grafiteiro de gangue pardo nordestino inquieto (23 anos), afro curto com desenho "
        "navalhado, sardas de tinta spray nas mãos, sorriso rápido, respirador verde pendurado no "
        "pescoço e acentos verde-lima"),
    wardrobe_en=("Wearing an indigo hooded gang jacket with paint-bleached patches, cargo pants stiff with "
        "layered overspray, duct-wrapped sneakers, lime-green spray can holsters on the belt, stencil "
        "tag patch sewn on the chest"),
    wardrobe_pt=("Vestindo jaqueta de gangue índigo com capuz e remendos clareados por tinta, calça cargo "
        "endurecida de tinta em camadas, tênis enrolados de fita, porta-latas verde-lima no cinto e "
        "remendo de tag estencil costurado no peito"),
    weapon_en=("Holding a sawed-off improvisation shotgun (WPN_Shotgun_Breach) one-handed at low ready "
        "inside tight viaduct pillars, disciplined trigger despite street swagger"),
    weapon_pt=("Segurando escopeta serrada improvisada (WPN_Shotgun_Breach) com uma mão em guarda baixa "
        "entre os pilares do viaduto, disciplina de gatilho apesar da pose de rua"),
    accents=["#22C55E", "#6D28D9", "#A3E635", "Verde-Spray + Índigo + Lima-Neon"],
    bio=dict(h=176, m=70, sprint=7.5, slide=0.64, recoil=3.0, vault=125),
    svg=dict(bg="#22C55E", motif="spray"),
)

add(
    id="OP_GNG_MALE_VENTANIA", faction="GNG", tag="GNG-02",
    ueAssetId="CHR_Venex_Male_Ventania", codename="VENTANIA",
    fullName="Leleco 'Ventania' Souza · Corredor de Galho GNG-02",
    gender="MASCULINO", rank="ZHEERS", spec="RASTREADORES", world="CIGKV",
    rarity="COMUM", role="Fuga de Alta Velocidade & Linhas de Borrão",
    ethnicity="Afro-Brasileiro / Pelourinho, Salvador",
    heritage=(
        "Corredor de galho da facção do CIGKV: atravessa laje, muro e varal sem derrubar uma prega de "
        "roupa. Corre porque é o único do bairro que consegue — e volta com o lanche de todos."),
    skin="#4a2c17", skin2="#331d0f",
    hairStyle="dreads_up", hair="#101010", eye="#fdba74",
    face="Sorriso largo de quem respira fácil e cicatriz de varal no ombro",
    headgear="headband", headgearColor="#F97316",
    beard="none",
    grad=["#F97316", "#1F2937"],
    appearance_en=("Bouncy Afro-Brazilian male gang runner (20 years old), tall dreads tied up in a high "
        "knot, wide easy grin, rooftop-run callouses, orange sweatband, lean sprinter build caught "
        "mid-stride"),
    appearance_pt=("Corredor de gangue afro-brasileiro solto (20 anos), dreads altos amarrados em nó, "
        "sorriso largo e fácil, calos de corrida de laje, faixa de suor laranja e biotipo de velocista "
        "em passada"),
    wardrobe_en=("Wearing a charcoal sleeveless gang hoodie tied at the waist, taped fingerless running "
        "gloves, lightweight parkour trousers with knee scuffs, worn flat-soled running shoes, orange "
        "flag-line wound around the forearm"),
    wardrobe_pt=("Vestindo moletom de gangue sem mangas amarrado na cintura, luvas de corrida sem dedos "
        "enroladas de fita, calça de parkour leve com roções no joelho, tênis de sola lisa gasto e "
        "corda de bandeirinha laranja enrolada no antebraço"),
    weapon_en=("Holding a compact SMG (WPN_SMG_MK2) pressed against the chest on a one-point sling so it "
        "does not bounce while sprinting, trigger discipline absolute"),
    weapon_pt=("Segurando submetralhadora compacta (WPN_SMG_MK2) colada no peito em sling de um ponto "
        "para não balançar na corrida, disciplina de gatilho absoluta"),
    accents=["#F97316", "#1F2937", "#FDBA74", "Laranja-Ventania + Carvão + Pêssego"],
    bio=dict(h=175, m=62, sprint=7.9, slide=0.6, recoil=3.5, vault=128),
    svg=dict(bg="#F97316", motif="vento"),
)

add(
    id="OP_GNG_MALE_CORTA", faction="GNG", tag="GNG-03",
    ueAssetId="CHR_Onith_Male_Corta", codename="CORTA",
    fullName="Goran 'Corta' Vukas · Soldado de Facção GNG-03",
    gender="MASCULINO", rank="ONITH", spec="INFANTARIA", world="Barburhen",
    rarity="RARO", role="Combate de Facção & Pressão de Rua",
    ethnicity="Balcânico Bósnio / Imigrante Brasileiro",
    heritage=(
        "Soldado de primeira linha da facção de Barburhen, veterano de duas guerras que não têm nome "
        "nos mapas. Ensina os mais novos a contar cartuchos antes de contar vítimas — a facção dele "
        "atira para terminar discussão, não para abri-la."),
    skin="#e0ac69", skin2="#bd8a4c",
    hairStyle="buzz_lines", hair="#6b4423", eye="#57534e",
    face="Quebrado no nariz duas vezes e olhar que fecha assunto",
    headgear="bandana_bal", headgearColor="#EF4444",
    beard="stubble",
    grad=["#EF4444", "#171717"],
    appearance_en=("Stoic Bosnian-Brazilian male gang enforcer (34 years old), buzz cut with shaved "
        "ruled lines, twice-broken nose, ash-grey eyes that end conversations, red ballistic bandana, "
        "quiet heavy stance"),
    appearance_pt=("Capanga de facção bósnio-brasileiro estoico (34 anos), cabeça raspada com linhas "
        "navalhadas, nariz quebrado duas vezes, olhos cinza-fuligem que fecham conversa, bandana "
        "balística vermelha e postura pesada silenciosa"),
    wardrobe_en=("Wearing a black gang field jacket with torn insignia, chest rig of mismatched pouches, "
        "ribbed knuckle gloves, steel-toe boots with red laces, faction stencil sprayed on the "
        "shoulder plate"),
    wardrobe_pt=("Vestindo jaqueta de campo de gangue preta com insígnia rasgada, colete de peitoral de "
        "porta-cartuchos desparejos, luvas de malha com proteção de nódos, coturno com cadarço vermelho "
        "e stencil da facção sprayado na placa do ombro"),
    weapon_en=("Holding a full-size faction assault rifle (WPN_AssaultRifle_MK1) with red-lace sling, "
        "unshaking C-clamp grip and a carry that says the argument is over"),
    weapon_pt=("Segurando fuzil de facção completo (WPN_AssaultRifle_MK1) com sling de cadarço vermelho, "
        "empunhadura C-clamp imóvel e porte que encerra a discussão"),
    accents=["#EF4444", "#171717", "#F87171", "Vermelho-Facção + Preto-Asfalto + Brasa"],
    bio=dict(h=186, m=92, sprint=6.8, slide=0.76, recoil=1.8, vault=106),
    svg=dict(bg="#EF4444", motif="risco"),
)

add(
    id="OP_GNG_MALE_BAILE", faction="GNG", tag="GNG-04",
    ueAssetId="CHR_Khael_Male_Baile", codename="BAILE",
    fullName="Ras 'Baile' Thompson · DJ do Comando GNG-04",
    gender="MASCULINO", rank="ZHEERS", spec="COMUNICACOES_HACKER", world="CIGKV",
    rarity="COMUM", role="Sonorização de Zona & Comando de Baile",
    ethnicity="Afro-Caribenho / Jamaicano-Paulistano",
    heritage=("É o DJ que avisa por som qual rua está livre no CIGKV: o baile começa quando o "
        "perímetro está limpo e acaba em scratch se algo dá errado. A pista dele é o radar — quem "
        "dança, está seguro; quem sai, avisa os outros."),
    skin="#4a2f1a", skin2="#33200f",
    hairStyle="rasta_beanie", hair="#1c1917", eye="#22d3ee",
    face="Fones DJ no pescoço e olhos que leem pista e porta ao mesmo tempo",
    headgear="dj", headgearColor="#EC4899",
    beard="goatee",
    grad=["#EC4899", "#18181B"],
    appearance_en=("Magnetic Afro-Caribbean male gang block-party DJ (28 years old), rasta strands under "
        "a dark beanie, trimmed goatee, DJ headphones around the neck, cyan LED glint in the eyes, "
        "relaxed crowd-reading stance"),
    appearance_pt=("DJ de baile de gangue afro-caribenho magnético (28 anos), fios de rasta sob gorro "
        "escuro, cavanhaque aparado, fones de DJ no pescoço, brilho de LED ciano nos olhos e postura "
        "relaxada de quem lê a pista e a porta"),
    wardrobe_en=("Wearing a magenta-accented gang bomber over a black tank top, gold chain over the "
        "collarbone, mix-desk calluses, cargo joggers with cable loops, limited-edition sneakers, "
        "cable-coiled belt"),
    wardrobe_pt=("Vestindo bomber de gangue com acentos magenta sobre regata preta, corrente de ouro "
        "sobre a clavícula, calos de mesa de mixagem, jogger cargo com laços de cabo, tênis de edição "
        "limitada e cinto enrolado de cabos"),
    weapon_en=("Holding a compact pistol (WPN_Pistol_MK1) tucked but ready on the booth edge, hand near "
        "but never on it while the set runs"),
    weapon_pt=("Segurando pistola compacta (WPN_Pistol_MK1) pousada na mesa, à mão mas nunca empunhada "
        "enquanto o set roda"),
    accents=["#EC4899", "#18181B", "#22D3EE", "Magenta-Baile + Carvão + Ciano-LED"],
    bio=dict(h=180, m=76, sprint=7.0, slide=0.68, recoil=2.7, vault=114),
    svg=dict(bg="#EC4899", motif="led"),
)

add(
    id="OP_GNG_FEMALE_ROTA", faction="GNG", tag="GNG-05",
    ueAssetId="CHR_Venex_Female_Rota", codename="ROTA",
    fullName="Mirta 'Rota' Benítez · Entregadora da Facção GNG-05",
    gender="FEMININO", rank="ZHEERS", spec="MOTORISTA_PESADOS", world="CIGKV",
    rarity="COMUM", role="Logística de Moto & Rota de Fuga",
    ethnicity="Paraguaia / Ciudad del Este",
    heritage=(
        "Leva e traz a logística da facção pelas ciclovias do CIGKV: nenhum checkpoint olha duas vezes "
        "para uma entregadora de app. Guarda o mapa das rotas na cabeça e a chave de contato no punho."),
    skin="#d29b6e", skin2="#b07c4f",
    hairStyle="ponytail", hair="#3b2314", eye="#84cc16",
    face="Cicatriz fina de capacete na testa e olhar de trajeto calculado",
    headgear="capacete", headgearColor="#F59E0B",
    beard="none",
    grad=["#F59E0B", "#3F3F46"],
    appearance_en=("Alert Paraguayan female gang moto-courier (26 years old), high ponytail escaping an "
        "amber open-face moto helmet, thin visor scar on the forehead, route-calculating eyes, "
        "delivery-bag strap crossing the chest"),
    appearance_pt=("Entregadora de gangue paraguaia atenta (26 anos), rabo de cavalo alto escapando do "
        "capacete âmbar de moto aberto, cicatriz fina de viseira na testa, olhos que calculam rota e "
        "alça de bag de entrega cruzada no peito"),
    wardrobe_en=("Wearing a scuffed amber moto jacket with gang patch taped over, thermal-lined gloves, "
        "knee-slide plates, waterproof delivery bag repainted with the faction mark, ankle holster"),
    wardrobe_pt=("Vestindo jaqueta moto âmbar riscada com remendo de facção por cima, luvas térmicas, "
        "placas de deslizamento no joelho, bag de entrega impermeável repintada com a marca da facção "
        "e coldre de canela"),
    weapon_en=("Holding a compact carbine (WPN_AssaultRifle_MK1) resting across the handlebars, quick-draw "
        "discipline of a courier who plans two exits per street"),
    weapon_pt=("Segurando carabina compacta (WPN_AssaultRifle_MK1) apoiada no guidão, disciplina de saque "
        "rápido de entregadora que planeja duas saídas por rua"),
    accents=["#F59E0B", "#3F3F46", "#FBBF24", "Amarelo-Rota + Zinco + Sinalização"],
    bio=dict(h=167, m=60, sprint=7.3, slide=0.66, recoil=2.9, vault=120),
    svg=dict(bg="#F59E0B", motif="seta"),
)

add(
    id="OP_GNG_FEMALE_COTOVELA", faction="GNG", tag="GNG-06",
    ueAssetId="CHR_Zheers_Female_Cotovela", codename="COTOVELA",
    fullName="Iara 'Cotovela' Teixeira · Lutadora de Galpão GNG-06",
    gender="FEMININO", rank="ONITH", spec="INFANTARIA", world="Barburhen",
    rarity="RARO", role="Luta Corporal & Demolição de Galpão",
    ethnicity="Nordestina Litorânea / Fortaleza",
    heritage=(
        "Campeã do galpão: luta por dinheiro e por respeito no anel improvisado de Barburhen. A facção "
        "a levou quando descobriu que ela abre portas blindadas com cotovelada e fecha discussões "
        "com uma só."),
    skin="#9c6644", skin2="#7a4c30",
    hairStyle="mohawk", hair="#ec4899", eye="#f43f5e",
    face="Sobrancelha partida e ombro tatuado com o escudo do galpão",
    headgear="earguard", headgearColor="#F43F5E",
    beard="none",
    grad=["#F43F5E", "#292524"],
    appearance_en=("Powerful coastal northeast-Brazilian female gang pit-fighter (30 years old), dyed "
        "pink mohawk with faded sides, split eyebrow, shoulder tattoo of the warehouse crest, taped "
        "knuckles, champion's calm before the bell"),
    appearance_pt=("Lutadora de galpão nordestina litorânea forte (30 anos), moicano rosa com laterais "
        "desbotadas, sobrancelha partida, tatuagem do escudo do galpão no ombro, nós dos dedos "
        "enrolados de fita e calma de campeã antes do sino"),
    wardrobe_en=("Wearing a rose-accented ring jacket with the sleeves cut off, taped forearms, fight "
        "shorts over compression leggings, wrestling ear protector, gold-champion belt buckle repurposed "
        "as the PackBack latch"),
    wardrobe_pt=("Vestindo jaqueta de ringue com acentos rosa e mangas cortadas, antebraços enfaixados, "
        "short de luta sobre legging de compressão, protetor auricular de luta e fivela de cinturão de "
        "campeã adaptada como fecho da PackBack"),
    weapon_en=("Holding a compact SMG (WPN_SMG_MK2) like an extension of the taped fist, short controlled "
        "bursts of the same economy as her punches"),
    weapon_pt=("Segurando submetralhadora compacta (WPN_SMG_MK2) como extensão do punho enfaixado, "
        "rajadas curtas com a mesma economia dos seus golpes"),
    accents=["#F43F5E", "#292524", "#FBBF24", "Rosa-Lona + Carvão + Ouro-Cinto"],
    bio=dict(h=172, m=72, sprint=7.1, slide=0.7, recoil=2.1, vault=118),
    svg=dict(bg="#F43F5E", motif="lona"),
)

add(
    id="OP_GNG_FEMALE_SOMBRA", faction="GNG", tag="GNG-07",
    ueAssetId="CHR_Huran_Female_Sombra", codename="SOMBRA",
    fullName="Bruna 'Sombra' Bellini · Batedora de Território GNG-07",
    gender="FEMININO", rank="ZHEERS", spec="RASTREADORES", world="CIGKV",
    rarity="COMUM", role="Infiltração Silenciosa & Recon de Território",
    ethnicity="Italo-Gaúcha / Serra Rio-Grandense",
    heritage=("Bate o território antes de qualquer movimento da facção: entra pelo telhado, "
        "conta camêras, cães e turnos, e sai sem som. Nunca foi vista duas vezes no mesmo ponto — "
        "os rivalês acham que Sombra são duas pessoas."),
    skin="#f0c8a0", skin2="#d3a67c",
    hairStyle="long_dark", hair="#0b0b0c", eye="#94a3b8",
    face="Rosto neutro impossível de lembrar e reflexo prateado nos olhos sob luz de lanterna",
    headgear="capuz_fino", headgearColor="#64748B",
    beard="none",
    grad=["#64748B", "#0F172A"],
    appearance_en=("Unremarkable-by-design Italian-Gaucho female gang scout (24 years old), straight black "
        "hair under a thin slate hood, forgettable neutral face with a silver glint under flashlight, "
        "silent flat-footed stance"),
    appearance_pt=("Batedora de gangue ítalo-gaúcha de rosto proposital esquecível (24 anos), cabelo preto "
        "liso sob capuz fino cinza, fisionomia neutra com reflexo prateado sob lanterna e passos "
        "silenciosos e planos"),
    wardrobe_en=("Wearing a slim slate-grey scout shell over a dark base layer, soft-shell gloves with "
        "grip pads, quiet-flex tactical trousers, reflective thread stripe on the PackBack for roof "
        "recognition, hood edges taped matte"),
    wardrobe_pt=("Vestindo casca fina de batedora cinza-ardósia sobre camada escura, luvas soft-shell com "
        "almofadas de grip, calça tática de movimento silencioso, fio refletivo na PackBack para "
        "reconhecimento de telhado e aba do capuz coberta de fosco"),
    weapon_en=("Holding a suppressed compact pistol (WPN_Pistol_MK1) angled down, weight shifted to keep "
        "floorboards silent"),
    weapon_pt=("Segurando pistola compacta com supressor (WPN_Pistol_MK1) apontada para baixo, peso "
        "deslocado para não ranger o assoalho"),
    accents=["#64748B", "#0F172A", "#CBD5E1", "Cinza-Sombra + Meia-noite + Prata"],
    bio=dict(h=168, m=59, sprint=7.4, slide=0.74, recoil=3.2, vault=122),
    svg=dict(bg="#64748B", motif="sombra"),
)

add(
    id="OP_GNG_FEMALE_PIXEL", faction="GNG", tag="GNG-08",
    ueAssetId="CHR_Skeetw_Female_Pixel", codename="PIXEL",
    fullName="Linh 'Pixel' Trần · Hacker de Lan House GNG-08",
    gender="FEMININO", rank="ZHEERS", spec="COMUNICACOES_HACKER", world="Ckesalth",
    rarity="RARO", role="Clonagem de Chip & Guerra Eletrônica de Rua",
    ethnicity="Vietnamita-Brasileira / Zona Leste de São Paulo",
    heritage=("Roda a lan house da facção num entreposto de Ckesalth: clona chip, quebra "
        "bloqueio de drone e vende sinal para quem precisa. Dizem que ela derruba o saldo do "
        "rival na hora do saque — e que o led ciano nunca apaga antes dela."),
    skin="#f5cba7", skin2="#d9ab80",
    hairStyle="bob_asym", hair="#22d3ee", eye="#a78bfa",
    face="Mecas ciano no bob assimétrico e olhos de quem lê código no ar",
    headgear="arvisor", headgearColor="#06B6D4",
    beard="none",
    grad=["#06B6D4", "#27272A"],
    appearance_en=("Focused Vietnamese-Brazilian female gang street-hacker (21 years old), asymmetric bob "
        "with cyan-dyed streaks, violet AR visor glasses with scrolling reflections, keyboard-typed "
        "callouses, coiled USB cable on the wrist"),
    appearance_pt=("Hacker de rua vietnamita-brasileira de gangue focada (21 anos), bob assimétrico com "
        "mecas tingidas de ciano, óculos AR violeta com reflexos de código rolando, calos de teclado e "
        "cabo USB enrolado no pulso"),
    wardrobe_en=("Wearing a cyan-accented oversized tech jacket with patched LAN-house logos, cargo joggers "
        "with drive pockets, fingerless typing gloves, clipped RFID cloner on the chest strap, cyan "
        "cable braided through the PackBack"),
    wardrobe_pt=("Vestindo jaqueta tech oversized com acentos ciano e logos de lan house remendados, "
        "jogger cargo com porta-drives, luvas de digitação sem dedos, clonador RFID preso no peitoral e "
        "cabo ciano trançado na PackBack"),
    weapon_en=("Holding a compact SMG (WPN_SMG_MK2) between the knees while both hands run the cloner, "
        "disciplined muzzle direction learned the hard way"),
    weapon_pt=("Segurando submetralhadora compacta (WPN_SMG_MK2) entre os joelhos enquanto as duas mãos "
        "rodam o clonador, direção de cano disciplinada aprendida do jeito difícil"),
    accents=["#06B6D4", "#27272A", "#A78BFA", "Ciano-Pixel + Carvão + Violeta-Circuito"],
    bio=dict(h=163, m=55, sprint=7.2, slide=0.64, recoil=3.3, vault=116),
    svg=dict(bg="#06B6D4", motif="pixel"),
)

# ═════════════════════════════════════════════════════════════════════════════
# VALIDAÇÃO INTERNA
# ═════════════════════════════════════════════════════════════════════════════
assert len(C) == 16, len(C)
ids = [c["id"] for c in C]
assert len(set(ids)) == 16
codenames = [c["codename"] for c in C]
assert len(set(codenames)) == 16
for c in C:
    pre = "OP_MIL_" if c["faction"] == "MIL" else "OP_GNG_"
    assert c["id"].startswith(pre), c["id"]
assert sum(c["gender"] == "MASCULINO" for c in C) == 8
assert sum(c["gender"] == "FEMININO" for c in C) == 8
assert sum(c["faction"] == "MIL" for c in C) == 8
assert sum(c["faction"] == "GNG" for c in C) == 8

SPECS_OK = {"INFANTARIA", "FUZILEIROS", "RASTREADORES", "COMUNICACOES_HACKER",
            "SNIPER", "ENGENHARIA_TATICA", "MOTORISTA_PESADOS", "MEDICO_COMBATE"}
WORLDS_OK = {"CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"}
RANKS_OK = {"ZHEERS", "ONITH", "SKEETW", "HURAN", "VENEX", "KHAEL", "MALAKOR", "OVERLORD"}
for c in C:
    assert c["spec"] in SPECS_OK and c["world"] in WORLDS_OK and c["rank"] in RANKS_OK
    b = c["bio"]
    assert 160 <= b["h"] <= 200 and 50 <= b["m"] <= 110 and 6.0 <= b["sprint"] <= 9.0

# ═════════════════════════════════════════════════════════════════════════════
# EMISSÃO DO BLOCO TS
# ═════════════════════════════════════════════════════════════════════════════
def q(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)

def emit_operative(c) -> str:
    b = c["bio"]
    skel = "SK_Manny" if c["gender"] == "MASCULINO" else "SK_Gwen"
    L = []
    L.append("  {")
    L.append(f'    id: {q(c["id"])},')
    L.append(f'    ueAssetId: {q(c["ueAssetId"])},')
    L.append(f'    codename: {q(c["codename"])},')
    L.append(f'    fullName: {q(c["fullName"])},')
    L.append(f'    gender: {q(c["gender"])},')
    L.append(f'    faction: {q(FACTIONS[c["faction"]])},')
    L.append(f'    rank: {q(c["rank"])},')
    L.append(f'    specializationId: {q(c["spec"])},')
    L.append(f'    defaultWorldId: {q(c["world"])},')
    L.append(f'    skinRarity: {q(c["rarity"])},')
    L.append(f'    roleTitle: {q(c["role"])},')
    L.append(f'    ethnicity: {q(c["ethnicity"])},')
    L.append("    heritageLore:")
    L.append(f'      {q(c["heritage"])},')
    L.append("    avatarVisual: {")
    L.append(f'      skinToneHex: {q(c["skin"].upper())},')
    L.append(f'      hairStyle: {q(c["hairLabel"])},')
    L.append(f'      hairColorHex: {q(c["hair"].upper())},')
    L.append(f'      eyeColorHex: {q(c["eye"].upper())},')
    L.append(f'      facialFeature: {q(c["face"])},')
    L.append(f'      headgearOrVisor: {q(c["headgearLabel"])},')
    L.append(f'      avatarThemeGradient: [{q(c["grad"][0].upper())}, {q(c["grad"][1].upper())}],')
    L.append("    },")
    L.append(f'    appearancePromptEn:')
    L.append(f'      {q(c["appearance_en"])},')
    L.append(f'    appearancePromptPt:')
    L.append(f'      {q(c["appearance_pt"])},')
    L.append("    wardrobePromptEn:")
    L.append(f'      {q(c["wardrobe_en"])},')
    L.append("    wardrobePromptPt:")
    L.append(f'      {q(c["wardrobe_pt"])},')
    L.append("    weaponHandlingEn:")
    L.append(f'      {q(c["weapon_en"])},')
    L.append("    weaponHandlingPt:")
    L.append(f'      {q(c["weapon_pt"])},')
    L.append("    accentColors: {")
    L.append(f'      primaryHex: {q(c["accents"][0].upper())},')
    L.append(f'      secondaryHex: {q(c["accents"][1].upper())},')
    L.append(f'      trimHex: {q(c["accents"][2].upper())},')
    L.append(f'      label: {q(c["accents"][3])},')
    L.append("    },")
    L.append("    biomechanics: {")
    L.append(f'      heightCm: {b["h"]},')
    L.append(f'      massKg: {b["m"]},')
    L.append(f'      sprintSpeedMps: {b["sprint"]},')
    L.append(f'      slideFrictionCoeff: {b["slide"]},')
    L.append(f'      recoilAbsorptionDeg: {b["recoil"]},')
    L.append(f'      vaultClearanceCm: {b["vault"]},')
    L.append(f'      skeleton: {q(skel)},')
    L.append('      lyraHeroBridge: "KhaaosLyraHeroComponent",')
    L.append('      targetPolycount: 80000,')
    L.append('      lodCount: 4,')
    L.append("    },")
    L.append("  },")
    return "\n".join(L)

FACTION_COMMENT = {
    "MIL": "  // ── Milícias urbanas: controle territorial, estrutura paramilitar informal ──",
    "GNG": "  // ── Gangues urbanas: facções de rua, velocidade, infiltração e comando de zona ──",
}

def emit_block() -> str:
    out = []
    out.append("/**")
    out.append(" * Lote 4 — Milícias e Gangues Urbanas (16 operantes não-militares).")
    out.append(" * Complementam os 16 militares canônicos: controle territorial informal")
    out.append(" * (milícias, MIL-01..08) e facções de rua (gangues, GNG-01..08).")
    out.append(" * Rig base por sexo (ADR-ESQUELETO-RIG-POR-SEXO); facção declarada em `faction`.")
    out.append(" */")
    out.append("export const KHAAOS_MILITIA_ARCHETYPES: OperativeArchetype[] = [")
    last_faction = None
    for c in C:
        if c["faction"] != last_faction:
            out.append("")
            out.append(FACTION_COMMENT[c["faction"]])
            last_faction = c["faction"]
        out.append(emit_operative(c))
    out.append("];")
    out.append("")
    out.append("/** Roster jogável completo: militares canônicos + lote de milícias/gangues. */")
    out.append("export const ALL_KHAAOS_OPERATIVE_ARCHETYPES: OperativeArchetype[] = [")
    out.append("  ...KHAAOS_OPERATIVE_ARCHETYPES,")
    out.append("  ...KHAAOS_MILITIA_ARCHETYPES,")
    out.append("];")
    out.append("")
    return "\n".join(out)

# ═════════════════════════════════════════════════════════════════════════════
# GERADOR DE SVG (retrato 512×512, escola do catálogo existente)
# ═════════════════════════════════════════════════════════════════════════════
def shade(hexcolor: str, factor: float) -> str:
    h = hexcolor.lstrip("#")
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    r = max(0, min(255, int(r * factor)))
    g = max(0, min(255, int(g * factor)))
    b = max(0, min(255, int(b * factor)))
    return f"#{r:02x}{g:02x}{b:02x}"

def hexa(hexcolor: str, alpha: float) -> str:
    h = hexcolor.lstrip("#")
    return f"#{h}{int(alpha*255):02x}"

MOTIFS = {
    "faixa": lambda a: f'<g opacity="0.5"><path d="M0 468 L96 512 M60 468 L156 512 M120 468 L216 512 M180 468 L276 512 M240 468 L336 512 M300 468 L396 512 M360 468 L456 512 M420 468 L512 508" stroke="{hexa(a,0.5)}" stroke-width="14"/></g>',
    "grade": lambda a: '<g stroke="%s" stroke-opacity="0.13" stroke-width="1"><path d="M0 128 H512 M0 256 H512 M0 384 H512 M128 0 V512 M256 0 V512 M384 0 V512"/></g>' % hexa(a, 1),
    "chispa": lambda a: f'<g stroke="{hexa(a,0.45)}" stroke-width="4" fill="none"><path d="M120 90 L150 130 M400 80 L372 120 M70 250 L110 240 M440 240 L402 232 M110 420 L146 398 M400 430 L368 404"/></g>',
    "rayo": lambda a: f'<g stroke="{hexa(a,0.4)}" stroke-width="6" fill="none" stroke-linecap="round"><path d="M30 190 Q85 162 135 192 M382 162 Q440 142 484 190 M80 420 Q160 390 220 430"/></g>',
    "linha": lambda a: '<g stroke="%s" stroke-opacity="0.35" stroke-width="3" fill="none"><path d="M40 470 H200 M240 480 H470 M60 60 H180 M320 40 H470"/></g>' % hexa(a, 1),
    "ondas": lambda a: f'<g stroke="{hexa(a,0.4)}" stroke-width="5" fill="none"><path d="M40 440 Q90 420 140 440 T240 440 T340 440 T440 440 T540 440"/><path d="M40 470 Q90 450 140 470 T240 470 T340 470 T440 470" opacity="0.6"/></g>',
    "cruz": lambda a: f'<path d="M440 40 h24 v24 h24 v24 h-24 v24 h-24 v-24 h-24 v-24 h24 z" fill="{hexa(a,0.5)}"/>',
    "lua": lambda a: f'<circle cx="432" cy="86" r="34" fill="{hexa(a,0.45)}"/><circle cx="448" cy="76" r="34" fill="#0b0f16" opacity="0.88"/>',
    "spray": lambda a: (f'<circle cx="90" cy="110" r="14" fill="{hexa(a,0.5)}"/><circle cx="416" cy="90" r="10" fill="{hexa(a,0.4)}"/>'
        f'<circle cx="450" cy="150" r="6" fill="{hexa(a,0.35)}"/><circle cx="62" cy="170" r="7" fill="{hexa(a,0.35)}"/>'
        f'<circle cx="130" cy="70" r="5" fill="{hexa(a,0.3)}"/><circle cx="392" cy="420" r="9" fill="{hexa(a,0.3)}"/>'),
    "vento": lambda a: f'<g stroke="{hexa(a,0.45)}" stroke-width="6" fill="none" stroke-linecap="round"><path d="M18 200 Q78 172 138 202 M28 246 Q92 220 152 248 M368 200 Q428 172 490 202 M362 246 Q426 220 486 248"/><path d="M60 430 Q140 400 210 440" opacity="0.5"/></g>',
    "risco": lambda a: '<g stroke="%s" stroke-opacity="0.4" stroke-width="8" stroke-linecap="round"><path d="M50 130 L170 100 M360 90 L470 130 M40 420 L150 450 M380 440 L480 410"/></g>' % hexa(a, 1),
    "led": lambda a: "".join(f'<circle cx="{60+i*56}" cy="{96 + (36 if i%2 else 0)}" r="4.5" fill="{hexa(a,0.55)}"/>' for i in range(8)),
    "seta": lambda a: f'<g stroke="{hexa(a,0.5)}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M60 420 L150 420 M150 420 L120 390 M150 420 L120 450"/></g>',
    "lona": lambda a: '<g stroke="%s" stroke-opacity="0.4" stroke-width="3" fill="none"><path d="M20 200 Q256 130 492 200 M20 240 Q256 170 492 240"/></g>' % hexa(a, 1),
    "sombra": lambda a: f'<g opacity="0.5"><rect x="80" y="60" width="60" height="60" fill="{hexa(a,0.35)}"/><rect x="380" y="420" width="70" height="46" fill="{hexa(a,0.3)}"/><rect x="420" y="70" width="40" height="90" fill="{hexa(a,0.22)}"/></g>',
    "pixel": lambda a: "".join(f'<rect x="{96+i*40}" y="{64 + (32 if (i*7)%3 else 0)}" width="14" height="14" fill="{hexa(a,0.5)}"/>' for i in range(8)),
}

def hair_back(c, uid, female):
    """Mechas e volumes que caem ATRÁS/ao redor do rosto (desenhadas antes da face)."""
    hs = c["hairStyle"]
    hg_ = f"url(#hairg-{uid})"
    B = []
    if hs == "dreads":
        for dx, dy, ln in [(-58, 30, 44), (-44, 44, 52), (-30, 52, 58), (30, 52, 58), (44, 44, 52), (58, 30, 44)]:
            B.append(f'  <rect x="{256+dx-7}" y="{140+dy}" width="14" height="{ln}" rx="7" fill="{hg_}" opacity="0.92"/>')
    elif hs == "braids":
        for dx in (-52, -26, 0, 26, 52):
            B.append(f'  <path d="M{256+dx-5} 138 Q{256+dx} 210 {256+dx*1.3} 248" stroke="{hg_}" stroke-width="11" fill="none" stroke-linecap="round"/>')
            B.append(f'  <circle cx="{256+dx*1.3}" cy="250" r="3.4" fill="#e5e7eb" opacity="0.9"/>')
    elif hs == "afro":
        B.append(f'  <circle cx="256" cy="158" r="88" fill="{hg_}"/>')
    elif hs == "bob":
        B.append(f'  <path d="M180 200 Q176 116 256 112 Q336 116 332 200 L332 258 Q322 268 310 258 L310 204 Q310 150 256 146 Q202 150 202 204 L202 258 Q190 268 180 258 Z" fill="{hg_}"/>')
    elif hs == "bob_asym":
        B.append(f'  <path d="M180 202 Q176 114 256 110 Q336 114 332 202 L340 282 Q328 292 316 282 L310 208 Q310 148 256 144 Q202 148 202 208 L200 246 Q188 252 180 242 Z" fill="{hg_}"/>')
    elif hs == "long":
        B.append(f'  <path d="M170 300 Q164 130 256 118 Q348 130 342 300 L318 300 Q322 210 300 176 Q256 148 212 176 Q190 210 194 300 Z" fill="{hg_}"/>')
    elif hs == "long_dark":
        B.append(f'  <path d="M168 312 Q160 128 256 116 Q352 128 344 312 L320 312 Q326 212 300 176 Q256 150 212 176 Q186 212 192 312 Z" fill="{hg_}"/>')
    elif hs == "ponytail":
        B.append(f'  <path d="M318 150 Q344 200 334 268 Q330 300 316 316 Q322 276 312 224 Q304 180 292 156 Z" fill="{hg_}"/>')
    elif hs == "mohawk":
        B.append(f'  <path d="M196 190 Q204 140 232 126 M316 190 Q308 140 280 126" stroke="#0b0b0f" stroke-opacity="0.5" stroke-width="5" fill="none"/>')
        B.append(f'  <path d="M196 190 Q204 140 232 126 Q224 150 222 182 Z" fill="{shade(c["hair"], 0.5)}" opacity="0.6"/>')
        B.append(f'  <path d="M316 190 Q308 140 280 126 Q288 150 290 182 Z" fill="{shade(c["hair"], 0.5)}" opacity="0.6"/>')
    elif hs == "rasta_beanie":
        for dx in (-56, -38, -19, 0, 19, 38, 56):
            B.append(f'  <path d="M{256+dx-6} 172 Q{256+dx} 240 {256+dx*1.15} 286" stroke="{hg_}" stroke-width="10" fill="none" stroke-linecap="round"/>')
    return B


def hair_front(c, uid, female):
    """Topetes/franjass sobre a testa (desenhadas depois da face)."""
    hs = c["hairStyle"]
    hg_ = f"url(#hairg-{uid})"
    F = []
    if hs == "buzz":
        F.append(f'  <path d="M190 186 Q192 128 256 122 Q320 128 322 186 Q322 150 296 140 Q256 130 216 140 Q190 150 190 186 Z" fill="{hg_}" opacity="0.85"/>')
    elif hs == "buzz_lines":
        F.append(f'  <path d="M190 186 Q192 128 256 122 Q320 128 322 186 Q322 150 296 140 Q256 130 216 140 Q190 150 190 186 Z" fill="{hg_}" opacity="0.85"/>')
        F.append('  <g stroke="#0b0b0f" stroke-opacity="0.55" stroke-width="3"><path d="M226 126 L226 146 M248 122 L248 144 M270 122 L270 144 M292 128 L292 150"/></g>')
    elif hs == "careca":
        F.append('  <path d="M214 150 Q256 132 298 150" stroke="#ffffff" stroke-opacity="0.16" stroke-width="8" fill="none" stroke-linecap="round"/>')
    elif hs == "dreads":
        F.append(f'  <path d="M186 190 Q186 124 256 120 Q326 124 326 190 Q326 146 298 136 Q256 126 214 136 Q186 146 186 190 Z" fill="{hg_}"/>')
    elif hs == "dreads_up":
        F.append(f'  <circle cx="256" cy="104" r="32" fill="{hg_}"/>')
        F.append(f'  <path d="M190 184 Q194 132 256 126 Q318 132 322 184 Q318 146 294 138 Q256 130 218 138 Q194 146 190 184 Z" fill="{hg_}"/>')
        for dx in (-12, 2, 16):
            F.append(f'  <rect x="{256+dx-5}" y="84" width="10" height="22" rx="5" fill="{shade(c["hair"], 1.4)}" opacity="0.55"/>')
    elif hs == "braids":
        F.append(f'  <path d="M184 192 Q184 122 256 118 Q328 122 328 192 Q324 142 294 132 Q256 124 218 132 Q188 142 184 192 Z" fill="{hg_}"/>')
    elif hs == "afro":
        F.append('  <path d="M192 168 Q256 128 320 168 Q318 140 292 130 Q256 120 220 130 Q194 140 192 168 Z" fill="url(#hairg-%s)"/>' % uid)
    elif hs == "bob":
        F.append(f'  <path d="M182 196 Q182 122 256 116 Q330 122 330 196 Q326 148 296 138 Q256 128 216 138 Q186 148 182 196 Z" fill="{hg_}"/>')
        F.append('  <path d="M202 170 Q256 140 310 170" stroke="#ffffff" stroke-opacity="0.12" stroke-width="6" fill="none"/>')
    elif hs == "bob_asym":
        F.append(f'  <path d="M182 198 Q182 118 256 112 Q330 118 330 198 Q326 150 296 140 Q256 130 216 140 Q186 150 182 198 Z" fill="{hg_}"/>')
        F.append('  <path d="M210 166 Q256 138 306 162" stroke="#ffffff" stroke-opacity="0.14" stroke-width="6" fill="none"/>')
        F.append(f'  <path d="M296 140 L312 120" stroke="{shade(c["eye"], 1.1)}" stroke-width="6" stroke-linecap="round"/>')
    elif hs == "long":
        F.append(f'  <path d="M190 190 Q190 124 256 118 Q322 124 322 190 Q318 146 294 137 Q256 128 218 137 Q194 146 190 190 Z" fill="{hg_}"/>')
        F.append('  <path d="M204 168 Q256 140 308 168" stroke="#ffffff" stroke-opacity="0.1" stroke-width="6" fill="none"/>')
    elif hs == "long_dark":
        F.append(f'  <path d="M190 190 Q190 122 256 116 Q322 122 322 190 Q318 146 294 137 Q256 128 218 137 Q194 146 190 190 Z" fill="{hg_}"/>')
        F.append('  <path d="M204 166 Q256 138 308 166" stroke="#ffffff" stroke-opacity="0.08" stroke-width="6" fill="none"/>')
    elif hs == "bun":
        F.append(f'  <circle cx="322" cy="252" r="24" fill="{hg_}"/>')
        F.append(f'  <path d="M190 186 Q194 128 256 122 Q318 128 322 186 Q318 148 294 140 Q256 132 218 140 Q194 148 190 186 Z" fill="{hg_}"/>')
        F.append('  <path d="M206 160 Q256 138 306 160" stroke="#ffffff" stroke-opacity="0.12" stroke-width="5" fill="none"/>')
    elif hs == "ponytail":
        F.append(f'  <path d="M190 184 Q194 126 256 120 Q318 126 322 184 Q318 146 294 138 Q256 130 218 138 Q194 146 190 184 Z" fill="{hg_}"/>')
        F.append(f'  <circle cx="314" cy="146" r="9" fill="{shade(c["grad"][0], 1.1)}"/>')
    elif hs == "undercut_bun":
        F.append(f'  <circle cx="256" cy="118" r="22" fill="{hg_}"/>')
        F.append(f'  <path d="M196 176 Q200 136 256 132 Q312 136 316 176 Q306 152 284 146 Q256 140 228 146 Q206 152 196 176 Z" fill="{hg_}"/>')
        F.append('  <path d="M204 172 H308" stroke="#0b0b0f" stroke-opacity="0.4" stroke-width="3"/>')
    elif hs == "mohawk":
        F.append(f'  <path d="M232 128 Q244 92 256 88 Q268 92 280 128 Q268 116 256 114 Q244 116 232 128 Z" fill="{hg_}"/>')
        F.append(f'  <path d="M228 150 Q256 104 284 150 Q272 128 256 126 Q240 128 228 150 Z" fill="{hg_}"/>')
    elif hs == "rasta_beanie":
        F.append('  <path d="M188 168 Q192 118 256 114 Q320 118 324 168 L324 178 Q256 156 188 178 Z" fill="#1c1917"/>')
        F.append(f'  <path d="M188 168 Q256 146 324 168" stroke="{shade(c["headgearColor"], 1.2)}" stroke-opacity="0.5" stroke-width="4" fill="none"/>')
    return F


def gen_svg(c) -> str:
    uid = c["id"]
    skin, skin2 = c["skin"], c["skin2"]
    hair, eye = c["hair"], c["eye"]
    prim, sec = c["grad"][0], c["grad"][1]
    hg = c["headgear"]; hgc = c["headgearColor"]
    female = c["gender"] == "FEMININO"
    beard = c.get("beard", "none")
    motif = MOTIFS[c["svg"]["motif"]](c["svg"]["bg"])
    codename = c["codename"]
    p = []
    A = p.append
    A('<?xml version="1.0" encoding="UTF-8"?>')
    A('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">')
    A('  <defs>')
    A(f'    <radialGradient id="bg-{uid}" cx="50%" cy="34%" r="68%">')
    A(f'      <stop offset="0%" stop-color="{hexa(prim, 0.42)}"/>')
    A(f'      <stop offset="58%" stop-color="#0a0a10" stop-opacity="0.96"/>')
    A(f'      <stop offset="100%" stop-color="#000000" stop-opacity="1"/>')
    A('    </radialGradient>')
    A(f'    <linearGradient id="skin-{uid}" x1="0" y1="0" x2="0" y2="1">')
    A(f'      <stop offset="0%" stop-color="{skin}"/>')
    A(f'      <stop offset="100%" stop-color="{skin2}"/>')
    A('    </linearGradient>')
    A(f'    <linearGradient id="cloth-{uid}" x1="0" y1="0" x2="0" y2="1">')
    A(f'      <stop offset="0%" stop-color="{shade(sec, 1.25)}"/>')
    A(f'      <stop offset="100%" stop-color="{shade(sec, 0.55)}"/>')
    A('    </linearGradient>')
    A(f'    <linearGradient id="accent-{uid}" x1="0" y1="0" x2="1" y2="0">')
    A(f'      <stop offset="0%" stop-color="{shade(prim, 1.2)}"/>')
    A(f'      <stop offset="55%" stop-color="{prim}"/>')
    A(f'      <stop offset="100%" stop-color="{shade(prim, 0.72)}"/>')
    A('    </linearGradient>')
    A(f'    <linearGradient id="hairg-{uid}" x1="0" y1="0" x2="0" y2="1">')
    A(f'      <stop offset="0%" stop-color="{shade(hair, 1.35)}"/>')
    A(f'      <stop offset="100%" stop-color="{shade(hair, 0.7)}"/>')
    A('    </linearGradient>')
    A('  </defs>')
    # fundo
    A(f'  <rect width="512" height="512" fill="url(#bg-{uid})"/>')
    A(f'  {motif}')
    # torso/casaco
    A('  <!-- tronco: jaqueta de facção -->')
    A(f'  <path d="M148 512 L160 366 Q166 326 206 312 L306 312 Q346 326 352 366 L364 512 Z" fill="url(#cloth-{uid})"/>')
    A(f'  <path d="M170 352 L342 352" stroke="{prim}" stroke-opacity="0.6" stroke-width="4"/>')
    A(f'  <path d="M176 386 L336 386" stroke="{prim}" stroke-opacity="0.32" stroke-width="3"/>')
    A(f'  <path d="M256 312 L256 470" stroke="{shade(sec, 0.4)}" stroke-width="5" stroke-opacity="0.8"/>')
    # gola
    A(f'  <path d="M212 318 L218 282 Q256 268 294 282 L300 318 Q256 336 212 318 Z" fill="{shade(sec, 0.7)}"/>')
    A(f'  <path d="M218 282 Q256 268 294 282" stroke="{prim}" stroke-opacity="0.5" stroke-width="3" fill="none"/>')
    # braçadeira milícia / corrente de gangue
    if c["faction"] == "MIL":
        A(f'  <rect x="158" y="392" width="30" height="58" rx="6" fill="{hgc}" opacity="0.92"/>')
        A(f'  <rect x="158" y="392" width="30" height="58" rx="6" fill="none" stroke="#00000066" stroke-width="2"/>')
        A(f'  <rect x="166" y="408" width="14" height="26" rx="3" fill="#0b0b0f" opacity="0.75"/>')
    else:
        A(f'  <circle cx="256" cy="352" r="13" fill="none" stroke="{hgc}" stroke-width="4" opacity="0.9"/>')
        A(f'  <circle cx="256" cy="384" r="13" fill="none" stroke="{hgc}" stroke-width="4" opacity="0.75"/>')
        A(f'  <rect x="238" y="404" width="36" height="20" rx="4" fill="{shade(sec, 0.5)}"/>')
        A(f'  <circle cx="256" cy="414" r="4" fill="{hgc}"/>')
    # pescoço
    A(f'  <path d="M232 268 L280 268 L280 314 Q256 326 232 314 Z" fill="url(#skin-{uid})"/>')
    A(f'  <path d="M232 268 L280 268 L280 288 Q256 298 232 288 Z" fill="#00000030"/>')
    # orelhas
    A(f'  <ellipse cx="176" cy="212" rx="10" ry="16" fill="url(#skin-{uid})"/>')
    A(f'  <ellipse cx="336" cy="212" rx="10" ry="16" fill="url(#skin-{uid})"/>')
    # cabelo — fase de trás (mechas ao redor do rosto)
    p.extend(hair_back(c, uid, female))
    # rosto (mandíbula por sexo)
    if female:
        A(f'  <path d="M188 190 Q188 128 256 122 Q324 128 324 190 Q324 238 298 268 Q278 290 256 290 Q234 290 214 268 Q188 238 188 190 Z" fill="url(#skin-{uid})"/>')
    else:
        A(f'  <path d="M186 190 Q186 128 256 122 Q326 128 326 190 Q326 242 300 272 Q276 294 256 294 Q232 294 212 272 Q186 242 186 190 Z" fill="url(#skin-{uid})"/>')
    A(f'  <path d="M196 168 Q256 148 316 168" stroke="#00000022" stroke-width="4" fill="none"/>')
    # sobrancelhas
    A(f'  <path d="M206 196 Q226 188 244 194" stroke="{shade(hair, 0.9)}" stroke-width="6" stroke-linecap="round" fill="none"/>')
    A(f'  <path d="M268 194 Q286 188 306 196" stroke="{shade(hair, 0.9)}" stroke-width="6" stroke-linecap="round" fill="none"/>')
    # olhos
    for cx in (225, 287):
        A(f'  <ellipse cx="{cx}" cy="212" rx="15" ry="9" fill="#f8fafc" opacity="0.94"/>')
        A(f'  <circle cx="{cx}" cy="212" r="6.4" fill="{eye}"/>')
        A(f'  <circle cx="{cx}" cy="212" r="2.6" fill="#0b0b0e"/>')
        A(f'  <circle cx="{cx-2}" cy="209.6" r="1.5" fill="#ffffff" opacity="0.9"/>')
    # nariz + boca
    A(f'  <path d="M256 220 Q252 238 250 244 Q254 248 258 244 Q256 238 256 220" stroke="#00000040" stroke-width="3" fill="none" stroke-linecap="round"/>')
    if female:
        A(f'  <path d="M238 264 Q256 272 274 264 Q256 280 238 264 Z" fill="{shade(prim, 0.85)}"/>')
        A(f'  <path d="M238 264 Q256 270 274 264" stroke="#00000040" stroke-width="2" fill="none"/>')
    else:
        A(f'  <path d="M238 262 Q256 270 274 262" stroke="#00000055" stroke-width="4" fill="none" stroke-linecap="round"/>')
    # barba
    if beard == "full":
        A(f'  <path d="M196 218 Q200 276 232 296 Q256 308 280 296 Q312 276 316 218 Q316 268 296 288 Q256 316 216 288 Q196 268 196 218 Z" fill="url(#hairg-{uid})" opacity="0.9"/>')
        A(f'  <path d="M238 262 Q256 272 274 262" stroke="#00000055" stroke-width="4" fill="none" stroke-linecap="round"/>')
    elif beard == "goatee":
        A(f'  <path d="M240 262 Q256 276 272 262 Q270 296 256 300 Q242 296 240 262 Z" fill="url(#hairg-{uid})" opacity="0.85"/>')
    elif beard == "stubble":
        A(f'  <path d="M200 224 Q210 280 256 288 Q302 280 312 224 Q308 262 292 278 Q256 296 220 278 Q204 262 200 224 Z" fill="{shade(hair, 1.1)}" opacity="0.22"/>')
    # cabelo — fase de frente (topete/aba sobre a testa)
    p.extend(hair_front(c, uid, female))
    A(f'  <path d="M192 170 Q256 138 320 170" stroke="#ffffff" stroke-opacity="0.08" stroke-width="5" fill="none"/>')
    # headgear
    if hg == "bandana":
        A(f'  <path d="M186 178 Q256 148 326 178 L326 162 Q256 132 186 162 Z" fill="{hgc}"/>')
        A(f'  <path d="M326 168 L352 158 L342 180 Z" fill="{hgc}"/>')
    elif hg == "bandana_bal":
        A(f'  <path d="M186 176 Q256 146 326 176 L326 158 Q256 128 186 158 Z" fill="{hgc}"/>')
        A(f'  <g stroke="#0b0b0f" stroke-opacity="0.35" stroke-width="3"><path d="M210 152 L210 172 M256 142 L256 164 M302 152 L302 172"/></g>')
    elif hg == "headset":
        A(f'  <path d="M186 190 Q186 130 256 124 Q326 130 326 190" stroke="#111827" stroke-width="14" fill="none"/>')
        A(f'  <rect x="172" y="196" width="26" height="40" rx="8" fill="{hgc}"/>')
        A(f'  <rect x="314" y="196" width="26" height="40" rx="8" fill="{hgc}"/>')
        A(f'  <path d="M186 232 Q196 262 226 266" stroke="#111827" stroke-width="5" fill="none"/>')
        A(f'  <circle cx="230" cy="266" r="5" fill="#111827"/>')
        A(f'  <path d="M322 176 L344 130" stroke="{hgc}" stroke-width="4"/><circle cx="346" cy="126" r="5" fill="{hgc}"/>')
    elif hg == "goggles":
        A(f'  <rect x="196" y="150" width="120" height="30" rx="14" fill="#0f172a" opacity="0.9"/>')
        A(f'  <rect x="200" y="155" width="50" height="20" rx="10" fill="{hgc}" opacity="0.85"/>')
        A(f'  <rect x="262" y="155" width="50" height="20" rx="10" fill="{hgc}" opacity="0.85"/>')
        A(f'  <path d="M186 164 L166 156 M326 164 L346 156" stroke="#0f172a" stroke-width="6"/>')
    elif hg == "bone":
        A(f'  <path d="M188 168 Q192 116 256 112 Q320 116 324 168 L324 176 Q256 152 188 176 Z" fill="{hgc}"/>')
        A(f'  <path d="M320 162 Q368 164 372 178 Q366 190 322 184 Z" fill="{shade(hgc, 0.8)}"/>')
        A(f'  <circle cx="256" cy="120" r="7" fill="{shade(hgc, 1.3)}"/>')
    elif hg == "neckband":
        A(f'  <path d="M226 300 Q256 316 286 300 L286 316 Q256 332 226 316 Z" fill="{hgc}"/>')
        A(f'  <path d="M284 308 L306 324 L296 328 Z" fill="{hgc}"/>')
        A(f'  <circle cx="322" cy="212" r="7" fill="none" stroke="#EAB308" stroke-width="3"/>')
    elif hg == "lenco":
        A(f'  <path d="M182 196 Q178 122 256 112 Q334 122 330 196 L330 176 Q322 142 296 134 Q256 124 216 134 Q190 142 182 176 Z" fill="{hgc}" opacity="0.95"/>')
        A(f'  <g fill="#ffffff" opacity="0.35"><circle cx="220" cy="152" r="5"/><circle cx="256" cy="140" r="5"/><circle cx="292" cy="152" r="5"/><circle cx="238" cy="164" r="4"/><circle cx="274" cy="164" r="4"/></g>')
        A(f'  <path d="M330 186 L354 196 L342 212 Z" fill="{hgc}"/>')
    elif hg == "touca":
        A(f'  <path d="M186 182 Q190 124 256 118 Q322 124 326 182 L326 170 Q318 136 294 128 Q256 118 218 128 Q194 136 186 170 Z" fill="{hgc}"/>')
        A(f'  <path d="M186 176 Q256 152 326 176" stroke="#0b0b0f" stroke-opacity="0.3" stroke-width="4" fill="none"/>')
        A(f'  <path d="M282 296 Q296 306 308 302" stroke="#f8fafc" stroke-opacity="0.8" stroke-width="8" fill="none" stroke-linecap="round"/>')
    elif hg in ("capuz", "capuz_fino"):
        thick = 16 if hg == "capuz" else 10
        A(f'  <path d="M170 250 Q150 150 216 106 Q256 88 296 106 Q362 150 342 250 L322 246 Q338 162 288 124 Q256 108 224 124 Q174 162 190 246 Z" fill="{shade(hgc, 0.9)}"/>')
        A(f'  <path d="M190 246 Q186 300 176 318 L216 330 Q226 300 226 262 Z" fill="{shade(hgc, 0.75)}"/>')
        A(f'  <path d="M322 246 Q326 300 336 318 L296 330 Q286 300 286 262 Z" fill="{shade(hgc, 0.75)}"/>')
    elif hg == "respirador":
        A(f'  <path d="M226 296 Q256 284 286 296 L286 320 Q256 332 226 320 Z" fill="{hgc}" opacity="0.95"/>')
        A(f'  <circle cx="234" cy="310" r="8" fill="#0f172a"/><circle cx="278" cy="310" r="8" fill="#0f172a"/>')
        A(f'  <path d="M226 298 Q256 286 286 298" stroke="#0f172a" stroke-width="4" fill="none"/>')
    elif hg == "headband":
        A(f'  <path d="M186 176 Q256 148 326 176 L326 164 Q256 136 186 164 Z" fill="{hgc}"/>')
        A(f'  <path d="M186 170 Q256 142 326 170" stroke="#ffffff" stroke-opacity="0.25" stroke-width="3" fill="none"/>')
    elif hg == "dj":
        A(f'  <path d="M184 188 Q184 124 256 118 Q328 124 328 188" stroke="#18181b" stroke-width="18" fill="none"/>')
        A(f'  <rect x="166" y="192" width="34" height="50" rx="10" fill="#18181b"/>')
        A(f'  <rect x="312" y="192" width="34" height="50" rx="10" fill="#18181b"/>')
        A(f'  <rect x="172" y="200" width="22" height="34" rx="8" fill="{hgc}" opacity="0.9"/>')
        A(f'  <rect x="318" y="200" width="22" height="34" rx="8" fill="{hgc}" opacity="0.9"/>')
    elif hg == "capacete":
        A(f'  <path d="M178 212 Q172 112 256 104 Q340 112 334 212 L334 224 Q322 236 306 228 L306 180 Q306 132 256 128 Q206 132 206 180 L206 228 Q190 236 178 224 Z" fill="{hgc}"/>')
        A(f'  <path d="M206 200 Q256 176 306 200" stroke="#0b0b0f" stroke-opacity="0.3" stroke-width="4" fill="none"/>')
        A(f'  <path d="M300 236 L318 250" stroke="#0f172a" stroke-width="5"/>')
    elif hg == "earguard":
        A(f'  <path d="M186 196 Q186 130 256 124 Q326 130 326 196" stroke="#292524" stroke-width="12" fill="none"/>')
        A(f'  <circle cx="176" cy="218" r="18" fill="{hgc}" opacity="0.9"/><circle cx="176" cy="218" r="9" fill="#292524"/>')
        A(f'  <circle cx="336" cy="218" r="18" fill="{hgc}" opacity="0.9"/><circle cx="336" cy="218" r="9" fill="#292524"/>')
    elif hg == "arvisor":
        A(f'  <rect x="196" y="198" width="120" height="30" rx="12" fill="#0b1220" opacity="0.92"/>')
        A(f'  <rect x="202" y="203" width="108" height="16" rx="8" fill="{hgc}" opacity="0.55"/>')
        A(f'  <g fill="{hgc}" opacity="0.8"><rect x="212" y="207" width="8" height="8"/><rect x="228" y="207" width="8" height="8"/><rect x="244" y="207" width="8" height="8"/></g>')
        A(f'  <path d="M196 208 L180 204 M316 208 L332 204" stroke="{hgc}" stroke-width="5"/>')
    # loop de varredura decorativo
    A(f'  <circle cx="256" cy="216" r="176" fill="none" stroke="{prim}" stroke-opacity="0.2" stroke-width="3" stroke-dasharray="14 10"/>')
    A(f'  <circle cx="256" cy="216" r="206" fill="none" stroke="{shade(sec, 1.4)}" stroke-opacity="0.14" stroke-width="2"/>')
    # marca d'água = codinome
    A(f'  <text x="256" y="500" text-anchor="middle" font-family="system-ui,sans-serif" font-size="26" font-weight="700" fill="#eaf6ff" opacity="0.85" letter-spacing="6">{codename}</text>')
    A('</svg>')
    return "\n".join(p) + "\n"

HAIR_LABELS = {
    "buzz": "Buzz-cut com degradê militar",
    "buzz_lines": "Buzz-cut com linhas navalhadas",
    "careca": "Cabeça raspada com brilho de suor",
    "dreads": "Dreadlocks curtos com argolas",
    "dreads_up": "Dreads altos amarrados em nó",
    "braids": "Tranças box com miçangas brancas",
    "afro": "Afro curto com desenho navalhado",
    "bob": "Bob liso com franja reta",
    "bob_asym": "Bob assimétrico com mechas ciano",
    "long": "Cabelo longo ondulado preso",
    "long_dark": "Cabelo preto liso em camadas",
    "bun": "Coque baixo compacto",
    "ponytail": "Rabo de cavalo alto de motoqueira",
    "undercut_bun": "Undercut com coque alto",
    "mohawk": "Moicano tingido com laterais desbotadas",
    "rasta_beanie": "Fios de rasta sob gorro escuro",
}
HEADGEAR_LABELS = {
    "bandana": "Bandana âmbar de perímetro com nó lateral",
    "bandana_bal": "Bandana balística vermelha com listras",
    "headset": "Headset de vigia com antena improvisada",
    "goggles": "Óculos de solda pousados na testa",
    "bone": "Boné verde-oliva virado com pin",
    "neckband": "Bandana vermelha no pescoço e argola dourada",
    "lenco": "Lenço roxo de flores amarrado à cabeça",
    "touca": "Touca cirúrgica verde com máscara no queixo",
    "capuz": "Capuz azul-ardósia de vigia noturna",
    "capuz_fino": "Capuz fino cinza fosco de batedora",
    "respirador": "Respirador verde de tinta no pescoço",
    "headband": "Faixa de suor laranja de corredor",
    "dj": "Fones DJ magenta com brilho de LED",
    "capacete": "Capacete de moto âmbar de viseira aberta",
    "earguard": "Protetor auricular rosa de ringue",
    "arvisor": "Óculos AR ciano com código refletido",
}
for c in C:
    c["hairLabel"] = HAIR_LABELS[c["hairStyle"]]
    c["headgearLabel"] = HEADGEAR_LABELS[c["headgear"]]

# ═════════════════════════════════════════════════════════════════════════════
# EMISSÃO DOS ARQUIVOS
# ═════════════════════════════════════════════════════════════════════════════
def write_svgs():
    for c in C:
        folder = "female" if c["gender"] == "FEMININO" else "male"
        fname = c["id"].lower() + ".svg"
        content = gen_svg(c)
        assert content.count('viewBox="0 0 512 512"') == 1
        assert c["codename"] in content
        assert len(content.encode()) > 1000, (fname, len(content.encode()))
        for base in ("client/public/avatars", "Content/Avatars"):
            path = REPO / base / folder / fname
            path.write_text(content, encoding="utf-8")
            print(f"svg  {path.relative_to(REPO)} ({len(content.encode())} bytes)")

CATALOG_KEYS = ["id", "codename", "fullName", "gender", "ethnicity", "rank",
                "specialization", "defaultWorld", "faction", "svgPathContent",
                "svgPathPublic", "colors", "lore"]

def catalog_entry(c):
    folder = "female" if c["gender"] == "FEMININO" else "male"
    fname = c["id"].lower() + ".svg"
    return {
        "id": c["id"],
        "codename": c["codename"],
        "fullName": c["fullName"],
        "gender": c["gender"],
        "ethnicity": c["ethnicity"],
        "rank": c["rank"],
        "specialization": c["spec"],
        "defaultWorld": c["world"],
        "faction": FACTIONS[c["faction"]],
        "svgPathContent": f"Content/Avatars/{folder}/{fname}",
        "svgPathPublic": f"/avatars/{folder}/{fname}",
        "colors": {
            "primary": c["accents"][0].upper(),
            "secondary": c["accents"][1].upper(),
            "trim": c["accents"][2].upper(),
            "skinTone": c["skin"],
            "eyes": c["eye"],
            "hair": c["hair"],
        },
        "lore": c["heritage"][:180].rsplit(" ", 1)[0] + "…",
    }

NEW_IDS = {c["id"] for c in C}
NEW_UE_IDS = {c["ueAssetId"] for c in C}

def update_catalogs():
    for base in ("Content/Avatars", "client/public/avatars"):
        path = REPO / base / "avatar_catalog.json"
        raw = path.read_text(encoding="utf-8")
        catalog = json.loads(raw)
        # anota facção nos existentes (o teste compara IDs; chave nova é aditiva)
        for e in catalog:
            e["faction"] = "MILITAR"
        catalog = [e for e in catalog if e["id"] not in NEW_IDS]  # idempotente
        for c in C:
            catalog.append(catalog_entry(c))
        out = json.dumps(catalog, ensure_ascii=False, indent=2)
        assert json.loads(out) == catalog
        path.write_text(out, encoding="utf-8")
        print(f"catalog {path.relative_to(REPO)}: {len(catalog)} entradas")

MANIFEST_COMPONENTS = ["SkeletalMesh*Mesh", "Material_Override", "AnimationBlueprint",
                       "KhaaosLyraHeroComponent", "KhaaosLyraWeaponBridge"]

def _inline(arr):
    return "[" + ", ".join(json.dumps(x, ensure_ascii=False) for x in arr) + "]"

def manifest_entry_text(c):
    """Renderiza a entrada no estilo do arquivo (arrays curtos inline)."""
    folder = "female" if c["gender"] == "FEMININO" else "male"
    name = f"{c['fullName'].split(' · ')[0]} ({c['ethnicity']} — {c['role'].split(' & ')[0]})"
    skel = "SK_Manny" if c["gender"] == "MASCULINO" else "SK_Gwen"
    L = []
    L.append("    {")
    L.append(f'      "id": {json.dumps(c["ueAssetId"])},')
    L.append(f'      "name": {json.dumps(name, ensure_ascii=False)},')
    L.append('      "type": "character",')
    L.append(f'      "gender": {json.dumps(c["gender"])},')
    L.append(f'      "faction": {json.dumps(FACTIONS[c["faction"]])},')
    L.append(f'      "ethnicity": {json.dumps(c["ethnicity"], ensure_ascii=False)},')
    L.append(f'      "skeleton": {json.dumps(skel)},')
    L.append('      "lod_count": 4,')
    L.append('      "target_polycount": 80000,')
    L.append(f'      "components": {_inline(MANIFEST_COMPONENTS)},')
    L.append('      "textures": [' + ", ".join(
        json.dumps(t) for t in (
            f"T_{c['ueAssetId']}_D", f"T_{c['ueAssetId']}_N",
            f"T_{c['ueAssetId']}_ORM", f"T_{c['ueAssetId']}_E")) + "],")
    L.append('      "avatar_svg": ' + json.dumps(f"Content/Avatars/{folder}/{c['id'].lower()}.svg") + ',')
    L.append(f'      "default_world": {json.dumps(c["world"])},')
    L.append('      "priority": "P1",')
    L.append('      "status": "avatar_generated"')
    L.append("    }")
    return "\n".join(L)

def update_manifest():
    path = REPO / "Content/Assets/asset_manifest.json"
    raw = path.read_text(encoding="utf-8")
    manifest = json.loads(raw)
    clash = NEW_UE_IDS & {ch["id"] for ch in manifest["characters"]}
    block = ",\n" + ",\n".join(manifest_entry_text(c) for c in C) + "\n  "
    if clash:
        assert block in raw, "entradas pré-existentes mas bloco renderizado não encontrado"
        raw = raw.replace(block, "")  # idempotente: remove bloco anterior
        manifest = json.loads(raw)
    # localiza o '[' do array characters e o ']' de fechamento correspondente
    marker = raw.index('"characters": [')
    j = raw.index("[", marker)
    depth = 0
    for k in range(j, len(raw)):
        if raw[k] == "[":
            depth += 1
        elif raw[k] == "]":
            depth -= 1
            if depth == 0:
                break
    assert depth == 0
    head = raw[:k].rstrip()
    assert head.endswith("}"), head[-20:]
    tail = raw[k:]
    insertion = ",\n" + ",\n".join(manifest_entry_text(c) for c in C) + "\n  "
    out = head + insertion + tail
    reparsed = json.loads(out)
    assert len(reparsed["characters"]) == len(manifest["characters"]) + 16
    path.write_text(out, encoding="utf-8")
    print(f"manifest {path.relative_to(REPO)}: {len(reparsed['characters'])} characters")

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--all"
    if mode in ("--all", "--ts-only"):
        OUT_TS.write_text(emit_block(), encoding="utf-8")
        print(f"ts    {OUT_TS.relative_to(REPO)}")
    if mode in ("--all", "--assets-only"):
        write_svgs()
        update_catalogs()
        update_manifest()
    print("OK")

if __name__ == "__main__":
    main()
