# Khaaos Run — Beta Aberto → Go Live Plan (Fase 5)

> **Khaaos Run — Devs Ph.D | UE5.8 | Copyright Nexus-HUB57**
>
> Fase 5: Beta Aberto → Go Live
> Este documento cobre toda a estratégia de transição do Beta Aberto para o Lançamento.

---

## Índice

1. [Beta Phases e Timeline](#1-beta-phases-e-timeline)
2. [Estratégia de Inscrição](#2-estratégia-de-inscrição)
3. [Regional Rollout Plan](#3-regional-rollout-plan)
4. [CDN Architecture](#4-cdn-architecture)
5. [Streaming Integration Design](#5-streaming-integration-design)
6. [Stress Test Methodology](#6-stress-test-methodology)
7. [EXCO Milestone Tracking](#7-exco-milestone-tracking)
8. [Launch Day Operations](#8-launch-day-operations)
9. [Post-Launch Monitoring](#9-post-launch-monitoring)
10. [Incident Response Plan](#10-incident-response-plan)
11. [Rollback Procedures](#11-rollback-procedures)

---

## 1. Beta Phases e Timeline

### Fases do Campaign

| Fase | Nome | Duração | NDA | Acesso | Descrição |
|------|------|---------|-----|--------|-----------|
| 0 | **Interno** | 2 semanas | ✅ Ativo | Dev team only | Teste interno, validação de todos os sistemas |
| 1 | **Anúncio** | 1 semana | ✅ Ativo | Nenhum | Anúncio público, página de inscrição |
| 2 | **Inscrição** | 3 semanas | ✅ Ativo | Registration only | Coleta de inscrições, invite codes |
| 3 | **Acesso Antecipado** | 4 semanas | ✅ Ativo | Invite-only | Alpha testers + press + streamers |
| 4 | **Beta Aberto** | 6 semanas | ❌ Levantado | All enrolled | Todos os inscritos jogam |
| 5 | **Lançamento** | — | ❌ N/A | Público | Go Live! |

### Timeline Detalhado

```
Semana 1-2:  Interno         → Validar todos os 14 checks do alpha
Semana 3:    Anúncio         → Trailer, site, Discord announcement
Semana 4-6:  Inscrição       → 500K+ inscrições target
Semana 7-10: Acesso Antecipado → 10K players, NDA enforcement
Semana 11-16: Beta Aberto     → 100K+ players, stream program
Semana 17:   LANÇAMENTO      → 1M+ inscrições (EXCO milestone)
```

### Critérios de Transição entre Fases

| Transição | Critério |
|-----------|----------|
| Interno → Anúncio | 14/14 checks pass, stress test 100 players OK |
| Anúncio → Inscrição | Landing page live, Discord + social ready |
| Inscrição → Early Access | 50K+ inscrições, invite codes generated |
| Early Access → Open Beta | Stress test 500 players OK, 0 crashes, NDA compliance > 99% |
| Open Beta → Launch | Stress test 1000 players OK, EXCO milestone progress > 50%, 3 regions healthy |

---

## 2. Estratégia de Inscrição

### Sistema de Invite Codes

Formato: `KR-XXXX-XXXX-XXXX` (alfanumérico, sem caracteres ambíguos I/O/0/1)

| Tipo | Quantidade | Fase | Prioridade | Distribuição |
|------|-----------|------|-----------|-------------|
| Alpha Tester | 1,000 | Early Access | Alta | Direct email |
| Press/Media | 500 | Early Access | Alta | Press kit |
| Streamer Program | 200 | Early Access | Alta | Partner outreach |
| Community | 5,000 | Early Access | Média | Discord giveaway |
| Open Enrollment | ∞ | Open Beta | Baixa | Site registration |

### NDA Management

- **NDA Ativo**: Fases Interno e Early Access
- **NDA Levantado**: Fase Open Beta em diante
- **Enforcement**: Auto-kick após 3 violações detectadas
- **Exceções**: Streamers verificados com NDA exemption (5K+ viewers)
- **Monitoring**: Hash-based screenshot detection (DMD - Digital Media Detection)

### Referral System

- Cada jogador pode referir até **10 amigos**
- Bonus: **500 KRC** por referral bem-sucedido (referee se inscreve e joga)
- Referral codes únicos por jogador
- Anti-abuse: 1 referral por IP, verificação de conta ativa

---

## 3. Regional Rollout Plan

### Regiões de Produção

| Região | Código | Data Center | Lat/Lon | Lobby Size | Players/Server |
|--------|--------|-------------|---------|------------|----------------|
| South America | sa1 | São Paulo, BR | -23.55, -46.63 | 100 | 50 |
| North America | na1 | Virginia, US | 37.43, -78.66 | 100 | 50 |
| Europe | eu1 | Frankfurt, DE | 50.11, 8.68 | 100 | 50 |

### Deployment Strategy

#### Rolling Deploy (Recommended)

```
1. Build Docker images (once)
2. Deploy sa1 → verify health → wait 30s
3. Deploy na1 → verify health → wait 30s
4. Deploy eu1 → verify health → wait 30s
5. Configure DNS latency-based routing
6. Verify all regions healthy
```

#### Simultaneous Deploy

```
1. Build Docker images (once)
2. Deploy sa1 + na1 + eu1 in parallel
3. Wait for all regions to become healthy
4. Configure DNS
5. Verify
```

### DNS Configuration

- **Routing**: Latency-based (AWS Route53 / Cloudflare)
- **Domain**: `game.khaaos.run` → closest healthy region
- **TTL**: 60s (fast failover)
- **Health Checks**: HTTP `/health` every 10s
- **Failover**: Automatic, primary → secondary, threshold 500ms RTT

### Failover Matrix

| Primary | Secondary | Trigger | Auto-Failback |
|---------|-----------|---------|---------------|
| sa1 | na1 | RTT > 500ms ou unhealthy | Após 5min healthy |
| na1 | eu1 | RTT > 500ms ou unhealthy | Após 5min healthy |
| eu1 | na1 | RTT > 500ms ou unhealthy | Após 5min healthy |

---

## 4. CDN Architecture

### Topologia

```
                    ┌──────────────┐
                    │   CloudFlare │ ← DDoS + WAF + Cache
                    │   (Front)    │
                    └──────┬───────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────┴──────┐ ┌────┴──────┐ ┌─────┴──────┐
     │  Origin SA  │ │ Origin NA │ │ Origin EU  │
     │  sa-east-1  │ │ us-east-1 │ │ eu-central │
     └─────────────┘ └───────────┘ └────────────┘
```

### Cache Rules

| Asset Type | Path | TTL | Immutable | Compression |
|------------|------|-----|-----------|-------------|
| Game Client | `/client/*.exe` | 30 days | ✅ | gzip/brotli |
| Patches | `/patches/*.patch` | 30 days | ✅ | gzip/brotli |
| Versioned Assets | `/assets/v/*` | 1 year | ✅ | gzip/brotli |
| UI Images | `/assets/ui/images/*` | 1 day | ❌ | gzip/brotli |
| Fonts | `/assets/ui/fonts/*` | 1 year | ✅ | gzip/brotli |
| Audio | `/assets/audio/*` | 30 days | ✅ | — (already compressed) |
| VFX | `/assets/vfx/*` | 30 days | ✅ | gzip |
| Maps | `/assets/maps/*` | 30 days | ✅ | gzip/brotli |
| API | `/api/*` | 0 (no-cache) | ❌ | gzip/brotli |
| Leaderboard | `/api/leaderboard/*` | 60s | ❌ | gzip/brotli |

### DDoS Protection (CDN Level)

- **Rate Limit**: 50 req/s per IP, 1000 req/s global
- **WAF**: SQL injection, XSS, path traversal → block
- **Bot Protection**: JS challenge for unknown bots, allowlist for Epic/Khaaos clients
- **Under-Attack Mode**: Manual activation, 30s challenge TTL

### Total CDN Storage Estimate: ~35GB

---

## 5. Streaming Integration Design

### Arquitetura

```
┌─────────────────────┐     WebSocket      ┌──────────────┐
│  Khaaos Run Server  │ ─────────────────→ │ OBS Studio   │
│  (Game Instance)    │                    │ (Browser Src)│
└─────────┬───────────┘                    └──────────────┘
          │                                       │
          │ BroadcastGameState()                   │ Overlay Display
          │ (1Hz update)                          │
          ▼                                       ▼
┌─────────────────────┐              ┌──────────────────────┐
│  KhaaosStreamingInt. │              │  Kill Feed / HUD    │
│  Subsystem           │              │  (HTML/CSS/JS)      │
└─────────────────────┘              └──────────────────────┘
```

### Feature Flags (Streaming)

| Flag | Default | Description |
|------|---------|-------------|
| `Streaming.SpectatorMode` | Beta: ON | Spectator camera modes |
| `Streaming.OBSIntegration` | Beta: ON | OBS WebSocket broadcast |
| `Streaming.KillFeedOverlay` | Beta: ON | Kill feed for streams |
| `Streaming.TournamentBrackets` | Beta: OFF | Tournament display |
| `Streaming.StreamDelay` | Beta: ON | Competitive delay |
| `Streaming.StreamerHUD` | Beta: ON | Clean stream overlay |
| `Streaming.AutoHighlight` | Beta: ON | Auto-clip on multi-kill |

### Stream Delay (Anti-Stream-Sniping)

- **Casual**: 0s delay (real-time)
- **Competitive**: 30s minimum delay (enforced)
- **Tournament**: 60s delay (configurable)
- Notificação automática para espectadores sobre o delay

### Auto-Highlight Triggers

| Event | Trigger | Clip Duration |
|-------|---------|---------------|
| Multi-Kill (4+) | 4+ kills in 5s window | 15s (5s pre + 10s post) |
| Clutch Play | Last player wins round | 20s (5s pre + 15s post) |
| Zone Escape | Escape zone at <5s remaining | 12s (5s pre + 7s post) |

---

## 6. Stress Test Methodology

### Test Profiles

| Profile | Bots | Duration | Ramp-Up | Network | Auto-Stop |
|---------|------|----------|---------|---------|-----------|
| 100 | 100 | 3min | Linear, 10s | Clean | crash>0, rtt95>100ms, mem>80% |
| 500 | 500 | 5min | Linear, 30s | 1% loss, 50ms lat | crash>0, rtt95>150ms, mem>85% |
| 1000 | 1000 | 10min | Exponential, 60s | 2% loss, 100ms lat | crash>0, rtt95>200ms, mem>90% |
| 2000 | 2000 | 10min | Exponential, 120s | 5% loss, 200ms lat | crash>1, rtt95>300ms, mem>95% |

### Go Live Requirements

O teste **1000 Players** é o gate obrigatório para Go Live:

- ✅ **0 crashes** durante o teste completo
- ✅ **RTT p95 < 200ms** (target: < 100ms)
- ✅ **Memory < 90%** do servidor
- ✅ **Server FPS > 15** durante todo o teste
- ✅ **0 desyncs** client-server
- ✅ **0 disconnects** por timeout

### Metrics Collection

- **RTT**: p50, p95, p99, min, max (amostrado a cada 1s)
- **CPU**: estimado via FPS gap (60 FPS target)
- **Memory**: platform memory stats, % used
- **Stability**: crash count, desync count, disconnect count, timeout count
- **Gameplay**: eliminations, replicated actors, net bandwidth

### Prometheus Integration

Todas as métricas são empurradas para o Prometheus Push Gateway:

```
khaaos_stress_test_active_bots
khaaos_stress_test_rtt_p50_ms
khaaos_stress_test_rtt_p95_ms
khaaos_stress_test_rtt_p99_ms
khaaos_stress_test_cpu_percent
khaaos_stress_test_memory_percent
khaaos_stress_test_server_fps
khaaos_stress_test_crash_count
khaaos_stress_test_desync_count
```

### CI/CD Integration

O teste de stress roda automaticamente no pipeline:

```yaml
# .github/workflows/stress-test.yml
stress_test_1000:
  runs-on: self-hosted
  steps:
    - name: Run 1000-player stress test
      run: |
        # Start dedicated server
        # Run stress test via console command
        # Parse JSON report
        # Fail pipeline if result != PASS
```

---

## 7. EXCO Milestone Tracking

### Target: 1,000,000 Inscrições

O milestone EXCO (Executive Committee) é o KPI principal do Go Live.

| Milestone | Inscrições | Ação |
|-----------|-----------|------|
| Bronze | 100,000 | Desbloquear Open Beta expansion |
| Silver | 500,000 | Ativar streamer program completo |
| Gold | 750,000 | Preparar launch marketing push |
| **EXCO** | **1,000,000** | **GO LIVE autorizado** |

### Tracking Dashboard

- **Total inscrições**: global e por região (sa1, na1, eu1)
- **Daily rate**: inscrições nas últimas 24h
- **Conversion rate**: inscrição → jogo ativo (%)
- **Retention**: Day-1, Day-7, Day-30
- **Churn rate**: % de jogadores que pararam
- **Referral metrics**: signups, conversion, KRC distribuído

### Regional Distribution (Expected)

| Região | % Esperado | Target |
|--------|-----------|--------|
| sa1 (South America) | 40% | 400,000 |
| na1 (North America) | 35% | 350,000 |
| eu1 (Europe) | 25% | 250,000 |

---

## 8. Launch Day Operations

### Pre-Launch Checklist (T-24h)

- [ ] Stress test 1000 players: PASS
- [ ] All 3 regions healthy
- [ ] CDN assets cached
- [ ] EOS production IDs configured
- [ ] EAC running on all servers
- [ ] Feature flags: Production preset applied
- [ ] Monitoring dashboards operational
- [ ] Alerts configured and tested
- [ ] Rollback procedure tested
- [ ] Launch communication ready
- [ ] Run `scripts/fase5/golive_checklist.sh` → GO

### Launch Day Runbook (T-0)

| Hora | Ação | Responsável |
|------|------|-------------|
| T-2h | Final health check all regions | DevOps |
| T-1h | DNS TTL reduction to 30s | DevOps |
| T-30m | Monitoring dashboards max refresh | DevOps |
| T-15m | Slack/Discord war room open | Team Lead |
| T-0 | Campaign phase → Launch | Product |
| T+0 | Auto-announce on social + Discord | Marketing |
| T+5m | First player wave monitoring | DevOps |
| T+15m | CDN cache warming verification | DevOps |
| T+30m | Scale assessment, adjust capacity | DevOps |
| T+1h | First metrics report | SRE |
| T+2h | Stability confirmation | SRE |
| T+4h | "All systems nominal" announcement | Team Lead |

### Scale-Up Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| Players online | > 80% capacity | +1 server per region |
| RTT p95 | > 150ms | +1 server in affected region |
| CPU | > 85% | +1 server per region |
| Queue time | > 30s | +2 servers globally |

---

## 9. Post-Launch Monitoring

### Key Metrics (Grafana Dashboards)

| Dashboard | Key Panels |
|-----------|-----------|
| **Players** | Online per region, peak concurrent, daily active |
| **Performance** | RTT p50/p95/p99, server FPS, CPU, memory |
| **Stability** | Crash rate, desync rate, disconnect rate |
| **EOS** | Auth success rate, matchmaking time, lobby fill rate |
| **Economy** | Transaction rate, ledger integrity, KRC flow |
| **Anti-Cheat** | EAC violations, kick rate, suspicion score distribution |
| **CDN** | Cache hit rate, bandwidth, origin requests |
| **Streaming** | Spectator count, OBS connections, clips generated |

### Alert Escalation

| Severity | Response Time | Channel | Example |
|----------|--------------|---------|---------|
| P0 - Critical | 5 min | PagerDuty + Slack #war-room | Server crash, auth outage |
| P1 - High | 15 min | Slack #war-room | RTT p95 > 200ms, EAC breach |
| P2 - Medium | 1 hour | Slack #ops | Memory > 85%, queue > 30s |
| P3 - Low | 4 hours | Slack #monitoring | Cache hit < 80%, minor errors |

### SLA Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Uptime | 99.95% | 30-day rolling |
| RTT p95 | < 100ms | 5-minute window |
| Match start time | < 120s | Per matchmaking session |
| Crash rate | < 0.01% | Per session |
| Cloud save latency | < 5s | Round-trip |

---

## 10. Incident Response Plan

### Incident Severity Matrix

| Severity | Impact | Duration | Communication |
|----------|--------|----------|---------------|
| **SEV1** | All regions down / data loss | Any | Immediate: all channels |
| **SEV2** | Single region down / auth failure | > 5min | War room + status page |
| **SEV3** | Degraded performance | > 15min | Slack #ops |
| **SEV4** | Minor issue / cosmetic | > 1hr | Ticket |

### SEV1/SEV2 Response Flow

```
1. DETECT    → Alert fires (Prometheus → AlertManager → PagerDuty)
2. TRIAGE    → On-call acknowledges within 5min
3. ASSESS    → Determine severity + blast radius
4. COMM      → Post to #war-room + status page update
5. MITIGATE  → Apply fix OR failover OR rollback
6. RESOLVE   → Verify fix, clear alerts
7. POST-MORTEM → Within 48h, blameless review
```

### Common Incident Playbooks

#### Region Down
1. Confirm region unhealthy (health check fails)
2. DNS failover to secondary region
3. Scale up secondary region
4. Investigate root cause
5. Fix + redeploy OR rollback
6. Failback when healthy (after 5min stable)

#### Auth Outage
1. Check EOS status page
2. If EOS-side: wait + communicate
3. If our side: check auth service, restart if needed
4. Fallback: allow reconnection with cached tokens (5min grace)

#### Economy Ledger Desync
1. Freeze all transactions
2. Run integrity check on ledger
3. Identify affected accounts
4. Reconcile from backup
5. Resume transactions

#### DDoS Attack
1. Enable CDN under-attack mode
2. Analyze attack pattern
3. Apply rate limit rules
4. If sustained: engage DDoS mitigation provider
5. Monitor until attack subsides
6. Disable under-attack mode

---

## 11. Rollback Procedures

### Rollback Levels

| Level | Scope | Time | Data Loss Risk |
|-------|-------|------|----------------|
| L1 - Hot Fix | Single config change | < 1min | None |
| L2 - Service Rollback | Single service version | < 5min | None |
| L3 - Region Rollback | All services in 1 region | < 10min | None |
| L4 - Global Rollback | All regions | < 30min | None |
| L5 - Data Rollback | Database restore | < 1hr | Possible |

### L1 - Hot Fix (Feature Flag Toggle)

```bash
# Disable a broken feature at runtime
# Via console command on dedicated server:
khaaos.feature.Streaming.AutoHighlight 0
# Or via Feature Flags API:
curl -X POST http://localhost:7777/api/features/Streaming.AutoHighlight/disable
```

### L2 - Service Rollback (Docker)

```bash
# Rollback single service to previous image
docker compose -f docker-compose.yml down ue5-server
docker compose -f docker-compose.yml up -d --no-build ue5-server
```

### L3 - Region Rollback

```bash
# Rollback all services in a specific region
./scripts/fase5/deploy_multiregion.sh --rollback --rolling
# Or target specific region:
docker compose -f docker-compose.yml --profile sa1 down
docker compose -f docker-compose.yml --profile sa1 up -d --no-build
```

### L4 - Global Rollback

```bash
# Full global rollback (emergency only)
./scripts/fase5/deploy_multiregion.sh --rollback
# This rolls back all 3 regions simultaneously
```

### L5 - Data Rollback (Database)

```bash
# Restore from backup (LAST RESORT)
./scripts/alpha/restore_system.sh /path/to/backup

# Verify restoration
./scripts/alpha/verify_alpha_readiness.sh
```

### Rollback Triggers

| Trigger | Level | Approval |
|---------|-------|----------|
| Feature bug | L1 | Auto (feature flag) |
| Service crash | L2 | On-call SRE |
| Region outage | L3 | On-call SRE + Team Lead |
| Global outage | L4 | Team Lead + VP Eng |
| Data corruption | L5 | VP Eng + CTO |

---

## Apêndice A: File Reference

| File | Description |
|------|-------------|
| `Game/LoadTest/KhaaosStressTestConfig.h/.cpp` | 1000-player stress test framework |
| `Game/Launch/KhaaosBetaCampaign.h/.cpp` | Beta campaign management subsystem |
| `Game/Launch/KhaaosStreamingIntegration.h/.cpp` | Streaming/OBS integration |
| `scripts/fase5/deploy_multiregion.sh` | Multi-region deployment script |
| `scripts/fase5/golive_checklist.sh` | 25-point Go Live checklist |
| `infra/deploy/cdn-config.yml` | CDN configuration for all regions |
| `infra/deploy/dns-latency-routing.json` | DNS routing configuration |

## Apêndice B: Key Classes

| Class | Type | Description |
|-------|------|-------------|
| `UKhaaosStressTestConfig` | `UPrimaryDataAsset` | Stress test profiles + metrics + auto-stop |
| `UKhaaosBetaCampaign` | `UGameInstanceSubsystem` | Campaign phases + enrollment + EXCO |
| `UKhaaosStreamingIntegration` | `UGameInstanceSubsystem` | Spectator + OBS + kill feed + clips |

## Apêndice C: Game Concepts (Português Brasileiro)

| Termo | Descrição |
|-------|-----------|
| **War'I** | O Battle Royale ring do Khaaos Run |
| **Corredor** | Jogador (runner) do War'I |
| **Mundos** | Os 5 mapas: CIGKV, Barburhen, Priadus, Arukheea, Ckesalth |
| **Zona** | Safe zone / ring que fecha progressivamente |
| **KRC** | Khaaos Run Coin (moeda do jogo) |
| **Ring** | O círculo/borda que fecha no War'I |
| **Acesso Antecipado** | Early Access (NDA, invite-only) |
| **Beta Aberto** | Open Beta (NDA lifted, all enrolled) |

---

> **Status**: Fase 5 implementada — Beta Aberto → Go Live
>
> **Próximo passo**: Executar `scripts/fase5/golive_checklist.sh` e obter **GO** ✅
