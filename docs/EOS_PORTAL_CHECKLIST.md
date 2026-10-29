# Khaaos Run — Checklist do Portal EOS para o Aceite Integral do M4

> **Objetivo**: desbloquear o aceite integral do M4 — *"Configurar EOS
> Dev/Staging com credenciais reais protegidas e validar login, sessões/
> matchmaking, reconnect e encerramento; manter mock apenas como teste
> unitário"* (docs/ROADMAP.md). O lado do repositório já está pronto e
> credential-gated (PR #171): `game-runtime/server/eos.js` rejeita operações
> com `EOS_UNCONFIGURED` enquanto as credenciais não chegarem — nunca finge
> sucesso. Este checklist cobre exatamente o que falta **fora** do repositório:
> o portal da Epic, os segredos do CI e a validação ponta a ponta.
>
> Regra de ouro (PB-07 em docs/SRE_PLAYBOOKS.md, mesma doutrina do
> docs/TOKEN_ROTATION_RUNBOOK.md): **credencial que passou por chat está
> comprometida** — todas as credenciais abaixo devem ser criadas, armazenadas
> e distribuídas apenas via Dev Portal + GitHub Secrets.

## 0. Estado atual (verificado em 2026-10-29)

| Item | Estado | Evidência |
|---|---|---|
| Ponte server-side nativa | ✅ pronta | `game-runtime/server/eos.js` (PR #171), unit tests em `game-runtime/test/eos-bridge.test.js` |
| RBAC `eos:operate` + papel `service` | ✅ pronta | endpoints `/eos/sessions*` (docs/M4_UE5_EOS_NATIVES.md §2) |
| `DefaultEOS.ini` | ⏳ placeholders | `KHAOS_PRODUCT_ID…KHAOS_CLIENT_SECRET` em `Unreal/KhaaosRun/Config/DefaultEOS.ini` |
| Secrets `EOS_*` no GitHub | ❌ ausentes | inventário atual só tem Render/Discord/UE5_INSTALL_DIR |
| `/eos/status` | ⏳ honesto | `mode:'unconfigured'` + `missing[]` até a Fase B deste checklist |

## Fase A — Epic Developer Portal (dev.epicgames.com)

Tudo nesta fase é manual, como dono da organização de produto. Criar o
produto em modo **Dev/Staging** (não Production) — o roadmap do M4 exige
Dev/Staging primeiro. Ao final de cada passo, anote o valor **direto no
gerenciador de senhas da equipe**; nunca em chat, arquivo local ou commit.

| # | Passo no portal | Onde / como | Valor anotado |
|---|---|---|---|
| A1 | Criar conta/org de produto e aceitar os termos do **Epic Online Services** (EULA de EOS) | `dev.epicgames.com` → Organization | — |
| A2 | Criar o produto **Khaaos Run** | Product Settings → Create Product | — |
| A3 | Copiar **Product Id** | Product Settings → Product Details | `PRODUCT_ID` |
| A4 | Copiar **Sandbox Id** (ambiente Dev/Staging) | Product Settings → Sandboxes → `Dev` | `SANDBOX_ID` |
| A5 | Criar **Deployment** para staging | Sandboxes → Dev → Deployments → Create | `DEPLOYMENT_ID` |
| A6 | Criar **Client Credentials** do tipo *Trusted Server* (dedicated server usa credenciais de serviço, não de usuário) | Product Settings → Clients → New Client → *Trusted Server* | `CLIENT_ID` + `CLIENT_SECRET` (o segredo só é exibido **uma vez**) |
| A7 | Habilitar permissões do client: **Auth**, **Ecom** (identidade), **Sessions**, **Lobbies**, **Matchmaking (v2)**, **Stats** | mesma tela do client, seção Permissions | — |
| A8 | Criar o **matchmaking pool** `KhaaosBR` (o `DefaultEOS.ini` já aponta para ele: `MatchmakingPool=KhaaosBR`) | Product Settings → Matchmaking → Pools → Create (regras BR: ~50 jogadores, região `sa1`) | — |
| A9 | Habilitar as **regiões** `sa1`, `na1`, `eu1` no deployment (o CI valida `EOS_REGIONS: 'sa1,na1,eu1'` e `DefaultEOS.ini` usa `DefaultRegion=sa1`) | Deployment → Regions | — |
| A10 | (Opcional, se voice/chat overlay entrar no aceite) Habilitar **Voice** no deployment | Deployment → Voice | — |

Notas de A6: o dedicated server autentica via **client_credentials** (conta de
serviço), exatamente o fluxo `EOS_Auth_Login` com `ClientCredentials` que o
`KhaaosEOSManager` assume; um client do tipo *Public* (jogador) pode ser
criado depois para o lado cliente UE5, mas **não bloqueia** o aceite do M4
server-side. O `CLIENT_SECRET` do tipo Trusted Server vale como segredo de
infraestrutura: mesmo tratamento do PAT (rotação imediata se vazar).

## Fase B — Segredos no GitHub (máquina administrativa com `gh` autenticado)

O runtime lê exatamente estes nomes (mapa em `game-runtime/server/eos.js`):

```bash
REPO=Nexus-HUB57/Khaaos_Run

gh secret set EOS_PRODUCT_ID     --repo $REPO   # ← PRODUCT_ID (A3)
gh secret set EOS_SANDBOX_ID     --repo $REPO   # ← SANDBOX_ID (A4)
gh secret set EOS_DEPLOYMENT_ID  --repo $REPO   # ← DEPLOYMENT_ID (A5)
gh secret set EOS_CLIENT_ID      --repo $REPO   # ← CLIENT_ID (A6)
gh secret set EOS_CLIENT_SECRET  --repo $REPO   # ← CLIENT_SECRET (A6, exibido 1x)
gh secret set EOS_ENCRYPTION_KEY --repo $REPO   # ← 64 hex gerados: openssl rand -hex 32
gh secret set EOS_REGION         --repo $REPO   # ← sa1 (padrão do DefaultEOS.ini)
```

Regras desta fase: valores colados **somente** no prompt cifrado do `gh
secret set` (nunca em linha de comando registrada em shell history com o
valor visível, nunca em arquivo); nenhum destes nomes deve aparecer no
inventário de secrets como texto; conferir depois com
`gh secret list --repo $REPO` (lista nomes, nunca valores). Se qualquer
valor for colado em chat/anexo por engano: rotação no portal (Client →
Reset Secret) + re-executar esta fase, seguindo o runbook de rotação.

## Fase C — Injeção nos builds UE5 (gate anti-placeholder)

Com os secrets da Fase B presentes, o CI injeta as credenciais no
`DefaultEOS.ini` em tempo de build — os placeholders `KHAOS_*` **nunca**
chegam a um artefato final:

```bash
# build/empacotamento local (mesmo contrato do CI — env → ini):
EOS_PRODUCT_ID=… EOS_SANDBOX_ID=… EOS_DEPLOYMENT_ID=… \
EOS_CLIENT_ID=… EOS_CLIENT_SECRET=… \
bash scripts/eos/inject_eos_credentials.sh

# gate de verificação (usado em CI; exit 1 se placeholder sobrar):
bash scripts/eos/inject_eos_credentials.sh --check
```

Critérios de saída da fase: `inject_eos_credentials.sh --check` retorna 0
(sem `KHAOS_*` no ini); o ini gerado não é commitado (gitignore de
`*Local*.ini` já cobre); o workflow `eos-integration.yml` passa a enxergar
`secrets.EOS_CLIENT_ID/EOS_CLIENT_SECRET` e executa o ramo de validação
real em vez do aviso de ausência.

## Fase D — Validação ponta a ponta (aceite do M4)

Rodar na ordem; cada passo depende do anterior e produz evidência
salvável (log/artefato) — o aceite do M4 pede *"execução EOS sem
placeholders, logs verificáveis"*:

1. **Smoke de credenciais reais** (valida portal + rede + assinatura):
   `node scripts/eos/eos-live-smoke.mjs --strict` → esperado
   `EOS_LIVE_SMOKE_OK`. Para incluir tokenExchange contra o deployment:
   `… --full` (exige `EOS_DEPLOYMENT_ID` no ambiente).
2. **Runtime honesto configurado**: subir o runtime com os envs `EOS_*` e
   confirmar `GET /eos/status` saindo de `mode:'unconfigured'` para
   `configured` sem vazar segredos (só presença de config).
3. **Handshake do dedicated server** (docs/M4_UE5_EOS_NATIVES.md §3): no
   runner UE5.8 licenciado (scripts/build/bootstrap_ue58_runner.sh),
   `KhaaosEOSManager` → `EOS_Auth_Login` (client_credentials) →
   `KhaaosEOSSession::HostDedicatedServerSession` → `POST /eos/sessions`
   recebe **201** (sessão ancorada à sala possuída por esta réplica).
4. **Ciclo completo de sessão**: heartbeat ≤ 90 s → **200**; shutdown
   limpo → `POST /eos/sessions/:id/end` → **200**; heartbeat pós-end →
   **404**. Caminhos negativos: sala não possuída → **409
   `EOS_ROOM_NOT_OWNED`**; player tentando operar → **403** (RBAC
   `eos:operate` só a `service`/`admin`).
5. **Dois clientes, ponta a ponta** (critério literal do roadmap):
   dois clientes UE5 completam **login → sessão/matchmaking (pool
   `KhaaosBR`) → ação in-game → reconnect** (via
   `KhaaosEOSSessionRecovery`) → encerramento. Registrar o traçado dos
   logs EOS dos dois clientes como evidência do aceite.
6. **Regressão honesta**: confirmar que os unit tests do bridge
   (`game-runtime/test/eos-bridge.test.js`) continuam verdes com o mock
   confinado — o mock deve seguir existindo **só** em teste unitário.

## Tabela de rastreabilidade do aceite

| Critério do aceite M4 | Fase | Evidência esperada |
|---|---|---|
| Credenciais reais protegidas | A + B | `gh secret list` contém `EOS_*`; valores nunca em chat/commit |
| Sem placeholders em artefato | C | `inject_eos_credentials.sh --check` exit 0 |
| Login real (server) | D-1, D-3 | `EOS_LIVE_SMOKE_OK`; `EOS_Auth_Login` OK nos logs |
| Sessões/matchmaking | D-3, D-5 | `POST /eos/sessions` 201; pool `KhaaosBR` com 2 clientes |
| Reconnect | D-5 | `KhaaosEOSSessionRecovery` restaurando sessão nos logs |
| Encerramento sem sessão fantasma | D-4 | `end` 200 → heartbeat 404; TTL/heartbeat limpam em ≤ 90 s |
| Mock só em teste unitário | D-6 | unit tests verdes; runtime sem caminho de mock |
| Logs verificáveis | D-1…D-6 | stdout/artefatos anexados ao PR de aceite |
