# BARBURHEN — Mapa Completo com Detalhes

**W1/C1 · Mundo da Destruição · Guerra do Khaaos**

Arquivo visual: `Content/Barburhen/Barburhen_Map_Detailed.svg`  
Dados: `Content/Barburhen/DT_Barburhen_MapPoints.csv` + `DT_Barburhen_WorldConfig.csv`

---

## 1. Visão geral

| Parâmetro | Valor oficial |
|-----------|----------------|
| Identificador | W1/C1 Barburhen |
| Capacidade | 100 players |
| Duração-alvo ciclo | 7 dias (12 h/dia) |
| Ring por partida | ~11 min (60 s delay + 600 s close) |
| Origem do level | Centro do Parque `(0, 0, 0)` |
| Extensão útil | ±25 000 cm (raio do anel inicial) |
| Dinâmica | **Água da Morte** — anel fecha no Parque |
| Chuva ácida | −1 % Vitalidade / 10 s (sem colete) |

---

## 2. Setores detalhados

### 2.1 Setor Industrial (3/8) — DESEMBARQUE

**Função:** único setor de spawn. Galpões, silos, containers, guindastes, fumaça.

| Elemento | Detalhe |
|----------|---------|
| Spawns | 8 PlayerStarts (sul do mapa, Y ≈ −14 000 a −20 000) |
| Bunker | 1 (Bunker_Ind) — abrigo + loot médio |
| Tanques | Tank_01, Tank_02 |
| Snipers | S5 Silo (Z+1500), S6 Guindaste (Z+1000), S7 Caixa d’Água (Z+900) |
| ZEX | Z1 Desembarque, Z2 Galpão Leste, Z3 Galpão Oeste, Z4 Pátio |
| Delegacia | Police_03 |
| Arte | Galpões A/B/C, silos cilíndricos, containers empilhados, guindaste, caixa d’água, estrada principal E-O |
| Áudio | Metal, vento industrial, distante alarme |
| Perigo | Emboscadas em corredores de containers; ratos dedo-duro em galpões escuros |

**Rotas de fuga para o Parque:** estrada central Y↑ (eixo X=0) e flancos pelos galpões.

---

### 2.2 Área Urbana e Comercial (2/8)

**Função:** loot médio-alto, combate vertical, emboscadas em ruas.

| Elemento | Detalhe |
|----------|---------|
| Bunker | Bunker_Urban |
| Hospital | Hospital_01 (kits + cobertura) |
| Delegacias | Police_01, Police_02 |
| Snipers | S1–S4 (telhados Z+800 a Z+1200) |
| ZEX | Z5 Praça, Z6 Shopping, Z7 Rua Comercial, Z8 Telhado Acesso |
| Tanque | Tank_03 |
| Arte | Shopping saqueado, Torre A, prédios inacabados, farmácia, bloco habitacional, ruas rachadas, **corpos estáticos** |
| Áudio | Vento urbano, vidro, chuva ácida pingando em metal |
| Perigo | Linhas de tiro de telhado; desabamento scripted em prédios inacabados |

**Ruas principais (sugestão de eixos):**
- Avenida E-O em Y ≈ 5000–8000  
- Ruas N-S em X ≈ 7000, 10000, 13000  

---

### 2.3 Parque Abandonado (3/8) — CENTRO

**Função:** destino do anel; combate final de late-game.

| Elemento | Detalhe |
|----------|---------|
| Ring End | Park_Center `(0,0,0)` · raio final 40 m |
| Hospital | Hospital_02 |
| Sniper | S8 Mirante (Z+600) |
| ZEX | Z9–Z12 (leste, oeste, coreto, lago seco) |
| Tanque | Tank_04 |
| Arte | Coreto central, lago seco, caminhos em cruz, árvores mortas sem folhagem, bancos quebrados |
| Áudio | Vento uivante, chuva, silêncio relativo (paranoia) |
| Perigo | Área aberta sob snipers; chuva ácida full; late ring = alta densidade de players |

---

### 2.4 Estação Ferroviária — EXTRAÇÃO

**Função:** extração final / ZEX de alto valor no norte.

| Elemento | Detalhe |
|----------|---------|
| ZEX | Z13 **Extração Final**, Z14 Plataforma Oeste, Z15 Plataforma Leste |
| Snipers | S9 Torre de Controle, S10 Sinalização |
| Tanque | Tank_05 |
| Arte | Trilhos paralelos, bilheteria, torre de controle, depósito, plataformas |
| Áudio | Vento nos trilhos, metal, pingos de chuva |
| Perigo | Contestado no late game; rota N a partir do Parque sob fogo de S9/S10 |

---

## 3. Timeline da partida (Água da Morte)

```
t = 0s      Match start · spawns Industrial · chuva ácida ativa
t = 60s     Anel começa a fechar (StartDelay)
t = 0→660s  Raio 250m → 40m (lerp linear)
t = 660s    Anel no Parque · fase final
Fora do raio → OutsideDamagePerSecond (medo ↑)
Sob chuva sem colete → −1% / 10s
Extração → Estação (ZEX-13) ou sobreviver no Parque
```

---

## 4. Inventário de pontos (oficial)

| Tipo | Qtd | IDs |
|------|-----|-----|
| PlayerSpawn | 8 | Spawn_01 … Spawn_08 |
| Bunker | 2 | Bunker_Urban, Bunker_Ind |
| TankSpawn | 5 | Tank_01 … Tank_05 |
| SniperPoint | 10 | Sniper_01 … Sniper_10 |
| Hospital | 2 | Hospital_01, Hospital_02 |
| PoliceStation | 3 | Police_01 … Police_03 |
| ZEXTerminal | 15 | ZEX_01 … ZEX_15 |
| RingCenter | 1 | Park_Center |
| LootCache | 3+ | Loot_* |

Todas as coordenadas em **centímetros** no CSV.

---

## 5. Alturas recomendadas (Z)

| Tipo | Z (cm) |
|------|--------|
| Solo / estradas | 0–100 |
| Loot / ZEX / spawns | 50–100 |
| Telhados baixos | 600–900 |
| Telhados / silos / torres | 900–1500 |
| Guindaste / mirante | 1000–1500 |

---

## 6. Camadas de arte (ordem de build)

1. **Landscape** + materials (concreto, ferrugem, terra morta, trilhos)  
2. **Blockout** BSP/cubos por setor (já desenhado no SVG)  
3. **Modular buildings** urbanos + galpões industriais  
4. **Props:** containers, carros abandonados, corpos, decals de sangue/rachadura  
5. **Vegetação morta** no Parque  
6. **Niagara:** chuva ácida, fumaça industrial, faíscas  
7. **Áudio 3D** por setor  
8. **Post-process:** desaturação, verde-ácido, fog  

---

## 7. Integração de sistemas (já no código)

| Sistema | Uso em Barburhen |
|---------|------------------|
| `ABarburhenRingController` | Anel 10 min |
| `ABarburhenAcidRainVolume` | Dano + medo |
| `ABarburhenMapBuilder` | Lê DT e spawna ZEX/Ring/Rain |
| `ABarburhenSectorVolume` | 4 setores → UI/áudio |
| `AKhaaosZEXTerminal` | 15 terminais luz azul |
| `UKhaaosTransferSystem` | 20 % ao entrar (vindo do CIGKV) |
| `UKhaaosVitalityComponent` | Dano chuva/anel |
| `UKhaaosBankhaoosComponent` | KRC nos ZEX |

---

## 8. Checklist “mapa completo”

- [x] Layout 4 setores com frações oficiais  
- [x] 8 spawns só no Industrial  
- [x] 2 bunkers, 5 tanques, 10 snipers, 2 hospitais, 3 delegacias  
- [x] 15 ZEX posicionados  
- [x] Ring center no Parque  
- [x] Extração na Estação  
- [x] CSV importável + SVG detalhado  
- [x] Sistemas C++ de gameplay  
- [ ] Landscape + meshes no Editor (arte)  
- [ ] Save `.umap` no UE5  

---

**O mapa completo com detalhes está em:**  
`Barburhen_Map_Detailed.svg` + CSV + este documento + código Worlds/Barburhen.
