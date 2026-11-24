# Benchmark de renderização — trem oficial do Zu

**Data:** 2026-11-16

**Base:** `origin/chore/ue58-replay-dry-run-audit` (`b280e65`)
**Otimizado:** `feat/zu-render-optimization` (`2d35567`)

## Método

O benchmark executa `TrainRide.update()` e `TrainRide.cameraPose()` em 250.000 frames determinísticos, após 20.000 frames de aquecimento, com `--expose-gc`. A comparação usa um worktree limpo da base e o arquivo otimizado da branch.

Comando reutilizável:

```bash
node --expose-gc game-runtime/scripts/bench-zu-render.mjs <caminho>/game-runtime/src/game3d/trainRide3d.js
```

Foram executadas cinco amostras por versão e usada a mediana:

| Versão | Mediana do lote de 250k frames | FPS equivalente do caminho CPU |
|---|---:|---:|
| Antes | 181,560 ms | 1.376.956,9 |
| Depois | 136,618 ms | 1.829.919,4 |

Resultado relativo: **24,8% menos tempo de CPU no caminho medido** e **32,9% mais FPS equivalente**. As amostras antes ficaram entre 179,172–188,339 ms; depois, entre 132,747–145,208 ms.

## Stress e regressão

- `npm --prefix game-runtime run test:stress`: **PASS**;
- stress online: 24 conexões autenticadas, três salas e snapshots recebidos;
- `worldmarks.test.js` + `mundos-fidelidade.test.js`: **24/24 PASS**;
- suíte Zu anterior: **34/34 PASS**.

## Limitação importante

Este é um benchmark headless do caminho JavaScript/Three.js. O sandbox não possui uma janela WebGL física nem o editor UE5.8; portanto os números são **FPS equivalente do render path CPU**, não FPS GPU final. O aceite de FPS real continua dependente de execução em browser/WebGL ou runner UE5.8 com GPU.
