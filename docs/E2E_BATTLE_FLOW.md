# Khaaos Run — Fluxo End-to-End

## Caminho feliz (solo ranqueado)

1. **Login** (Replit Auth) → `initializeUser` cria `player_stats` + `bank_accounts`
2. **Dashboard** → BUSCAR PARTIDA → WS `queue` (ELO do player)
3. **Matchmaking** → janela de rating expandindo → `match_found`
4. **BattleFlowNavigator** redireciona → `/lobby`
5. Players **READY** (ou host força) → COUNTDOWN 10s
6. **IN_PROGRESS** → redirect → `/zona`
7. Zona autoritativa + PvP (lag-comp) + loot procedural + AOI
8. Último vivo → `applyMatchRankings` (ELO + XP + patente)
9. **MatchResultsModal** → classificação, Δ ELO, link `/ranking`
10. Ranking/histórico atualizados via invalidação React Query

## Caminhos alternativos

| Entrada | Fluxo |
|---------|--------|
| Lobby público/privado | `create_lobby` / `join_code` → same from step 5 |
| Solo zona legado | `/zona` ATIVAR ZONA (HTTP poll, sem ranking de sala) |
| Profile / Ranking | Leitura REST de ELO e histórico |

## Componentes-chave

| Camada | Módulo |
|--------|--------|
| WS único | `BattleRoomProvider` |
| Navegação | `BattleFlowNavigator` |
| Pós-partida | `MatchResultsModal` |
| Filas | `MatchmakingService` |
| Salas | `RoomManager` |
| Skill | `RankingService` + `LagCompensation` |

## Deploy checklist

```bash
npm run db:push    # colunas rating / match_results
npm run dev        # ou build + start
```

Abrir dois browsers (duas contas) → BUSCAR PARTIDA → lobby → zona → fim → ranking.
