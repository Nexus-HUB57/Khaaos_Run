# Barburhen — otimização dos marcos industriais

## Escopo

Barburhen é o próximo mundo canônico após CIGKV/Zu no roadmap: W1, “O Mundo da Destruição”. A mudança atua somente nos marcos visuais fora da área jogável; não altera chuva ácida, anel, setores, loot, colisão ou regras de partida.

## Mudança

As duas torres de resfriamento e as três chaminés mantêm as mesmas geometrias, materiais, escalas, alturas, posições determinísticas e emissores de fumaça. A representação passou de meshes individuais para `InstancedMesh`:

- 6 segmentos de torres → 3 lotes instanciados, dois exemplares por lote;
- 3 corpos de chaminé → 1 lote instanciado;
- 3 faixas de chaminé → 1 lote instanciado;
- ponte de dutos e três pilares continuam meshes individuais por terem transformações/semântica própria.

## Medição estrutural

Para a seed `4242`, a cena dos marcos de Barburhen passou de:

| Estado | Objetos mesh | InstancedMesh | Meshes não instanciados |
|---|---:|---:|---:|
| Antes | 15 | 0 | 15 |
| Depois | 8 | 5 | 3 |

Isso representa **46,7% menos objetos mesh no grafo da cena** e mantém os mesmos contadores canônicos: 2 torres, 3 chaminés e 1 ponte de dutos.

## Aceite

- `worldmarks.test.js` valida contagens, determinismo e limites de 190 m;
- o gate de bounds agora valida também cada matriz de instância;
- `mundos-fidelidade.test.js` permanece verde;
- stress online do runtime permanece verde.
