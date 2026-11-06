# Khaaos Run — Protocolo de Validação Gráfica/UX em Navegador Real

> **Objetivo**: padronizar como validar a experiência gráfica e de UI do
> runtime web (`game-runtime`) em navegador real, com evidências reproduzíveis
> — e delimitar o que só pode ser validado no **host licenciado UE5.8**
> (engine real). Criado pela re-auditoria de 2026-11-05 (ver
> `docs/EOS_PORTAL_CHECKLIST.md` §0); a versão anterior deste arquivo
> nunca foi commitada no main.

## Três níveis de validação

| Nível | Onde | O que valida | Sinal de sucesso |
|---|---|---|---|
| 1 — smoke canônico | sandbox/CI | página `/console` real: login, estado do protocolo, Banco da Corte com caso pendente, julgamento com efeito KRC | `F12_BROWSER_OK` |
| 2 — sessão manual agente-browser | sandbox/host | DOM da UI: seções, controles, estado textual, screenshots | artefatos PNG + JSON do DOM |
| 3 — gráficos de engine | host licenciado UE5.8 | grama (impostor outdoor no horizonte), catálogo mítico (Shotgun/LMG), HUD por aura/estação | checklist §Nível 3 |

## Nível 1 — smoke canônico (executado em 2026-11-05: PASS)

```bash
bash game-runtime/scripts/fase12-browser-check.sh
```

O script sobe servidor + cenário ao vivo (porta 8820, partida `IN_PROGRESS`,
caso remetido à Corte), abre `/console` no navegador via `agent-browser`,
assume o comando (`kr_admin`), lê o chip do marechal (`#meChip`), julga o
caso pendente no Banco da Corte e confere o efeito econômico
(`court:<id>:<veredicto>` → grant 200 KRC).

- **Evidência registrada**: `artifacts/p0-steps-6-9/browser-check-evidence.txt`
  (`F12_BROWSER_OK`, exit 0) e `artifacts/p0-steps-6-9/fase12-live-scenario.log`.
- Falha comum: `agent-browser` ausente → `npm install -g agent-browser &&
  agent-browser install`; porta 8820 ocupada → `pkill -f fase12-live-scenario`.

## Nível 2 — sessão manual com evidência (executado em 2026-11-05: PASS)

```bash
node game-runtime/scripts/fase12-live-scenario.mjs &   # aguarda /healthz
agent-browser open http://127.0.0.1:8820/console
agent-browser snapshot -i -c                            # refs interativas
agent-browser find text "Assumir o comando" click       # login (se necessário)
agent-browser eval "JSON.stringify({titulo: document.title,
  secoes: [...document.querySelectorAll('h2')].map(h=>h.textContent.trim()),
  botoes: [...document.querySelectorAll('button')].length})"
agent-browser screenshot <caminho-absoluto>/console-poj.png
agent-browser screenshot --full <caminho-absoluto>/console-poj-full.png
```

- **Evidência registrada (2026-11-05)**:
  - DOM: título `Khaaos Run — Console do Marechal // POJ`; seções `Acesso do
    Marechal`, `Estado do Protocolo`, `Comandos do Marechal`, `Ata do
    protocolo`, `Banco da Corte Marcial — 1 caso(s) pendente(s)`,
    `Histórico de julgamentos — 1 caso(s)`; 12 botões de comando.
  - Screenshot: caso `cm-2 kr_player (Sargento) — Covardia mundial`
    renderizado com métricas (Evasões/Incursões/Kills/XP/Patente/Vida) e os
    4 veredictos (Afastamento −250 KRC, Redução −100 KRC, Honras +200 KRC,
    Absolvição +100 KRC); histórico `cm-1 → honras_de_guerra +200 KRC ·
    juiz kr_admin`.
  - Arquivos: `artifacts/p0-steps-6-9/console-poj.png` e `console-poj-full.png`.

### Nível 2-b — jogo 3D in-game, rota `/` do vite (executado em 2026-11-05: PASS)

O bundle multi-page (`vite.config.js`: `/` → 3D, `/classic.html` → 2D)
permite validar o HUD/jogo em navegador real sem o console do Marechal:

```bash
npx vite build                                     # 2,6 s (aviso de chunk >500 kB é esperado)
npx vite preview --port 8830 --strictPort &        # escuta [::1] — usar localhost
agent-browser open http://localhost:8830/
# Protocolo de Inserção → escolher teatro/operativo → "SALTAR NO CAOS"
agent-browser eval "JSON.stringify({canvas: !!document.querySelector('canvas'),
  seasonal: document.querySelectorAll('.seasonal').length,
  minimapa: !!document.querySelector('[class*=minimap],[class*=radar]'),
  crosshair: !!document.querySelector('[class*=cross],[id*=cross]')})"
agent-browser screenshot <abs>/game3d-ingame-hud.png
```

- **Evidência registrada (2026-11-05)**: in-game `CIGKV-3D-01` — ring em
  operação `09:59`, `13 vivos`, pulso `00`, radar com **tint sazonal ativo**
  (`.seasonal` ×1, F39/F40), ordem `DOMINE O RING`, `Pistola 9MM 15/45`,
  itens consumíveis, feed `ZU`/`Marechal`, canvas WebGL vivo.
  - Arquivos: `artifacts/p0-steps-6-9/game3d-cigkv-hud.png`,
    `game3d-cigkv-full.png` (Protocolo de Inserção) e
    `game3d-ingame-hud.png` (in-game).
- No UE5.8 host-side (Nível 3), os equivalentes web já integrados no main
  são: `grassChunkTier` full/sparse/impostor/hidden + fade (F34/F37),
  arsenal sem soquetes SG-12/MG-6 (F36) e HUD sazonal por aura
  (`aura3d.js`, F36–F40) — o Nível 3 repete a verificação com engine real.

## Nível 3 — gráficos de engine (host licenciado UE5.8)

Itens da frente gráfica/UX que o navegador web não cobre — validar em PIE no
host com runner/engine instalados (ver
`scripts/build/bootstrap_ue58_runner.sh` e `docs/NATURAL_LOCOMOTION.md` §7.3):

1. **Grama — impostor outdoor**: no horizonte (> ~60 m) a grama vira
   billboard de custo zero; troca de tier invisível a distância de jogo;
   `stat gpu` sem pico na transição. Critério: nenhum pop visível em
   walkthrough de 5 min; custo de vértices da grama estável no horizonte.
2. **Catálogo mítico — armas sem soquetes (Shotgun/LMG)**: attach por
   fallback (socket ausente → anexar à mão/root do mesh), sem offset
   flutuante; inspecionar no PIE as duas armas equipadas por espécie.
3. **HUD por aura/estação**: camada sazonal reage à aura do jogador
   (troca de estação via console var), sem fuga de layout em resoluções
   1080p/1440p/ultrawide.
4. **Locomoção natural** (regressão do PR #215): blend spaces em
   `SmoothedSpeed`, layer aditiva em `LeanRoll/Pitch`, 6 checks do §7.3.

## Critérios de aceite do protocolo

- Nível 1 verde (`F12_BROWSER_OK`) **antes** de qualquer merge que toque
  `game-runtime/server/**`, `/console` ou HUD web.
- Nível 2 com screenshot anexado ao PR quando a mudança for visual.
- Nível 3 registrado no PR de aceite do M4 quando o runner UE5.8 estiver
  ativo (`docs/EOS_PORTAL_CHECKLIST.md` passo 5).
