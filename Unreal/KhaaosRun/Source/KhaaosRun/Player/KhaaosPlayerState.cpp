// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"

#include "Net/UnrealNetwork.h"

// ─── Static XP Thresholds (DETERMINISTIC — sorted array, not TMap) ──────────────
// TMap iteration is non-deterministic in UE5 (hash map).
// Using a sorted array ensures RankFromXp always returns the correct rank.

struct FRankXpEntry
{
        EPatenteRank Rank;
        int32 XpThreshold;
};

static const FRankXpEntry RankXpTable[] = {
        { EPatenteRank::Zheers,   0     },
        { EPatenteRank::Onith,   100    },
        { EPatenteRank::Skeetw,  300    },
        { EPatenteRank::Huran,   700    },
        { EPatenteRank::Venex,  1500    },
        { EPatenteRank::Khael,  3000    },
        { EPatenteRank::Malakor,6000    },
        { EPatenteRank::Overlord,10000   }
};
static constexpr int32 RankXpTableSize = sizeof(RankXpTable) / sizeof(RankXpTable[0]);

// Keep the TMap for backward compatibility but RankFromXp no longer uses it
const TMap<EPatenteRank, int32> AKhaaosPlayerState::RankXpThresholds = {
        { EPatenteRank::Zheers,   0     },
        { EPatenteRank::Onith,   100    },
        { EPatenteRank::Skeetw,  300    },
        { EPatenteRank::Huran,   700    },
        { EPatenteRank::Venex,  1500    },
        { EPatenteRank::Khael,  3000    },
        { EPatenteRank::Malakor,6000    },
        { EPatenteRank::Overlord,10000   }
};

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosPlayerState::AKhaaosPlayerState()
{
        // ── Core attributes (from TS AttributeSet / playerStats) ──
        Health    = 100.0f;
        MaxHealth = 100.0f;
        Credits   = 0;
        Speed     = 1.0f;
        Energy    = 100.0f;
        MaxEnergy = 100.0f;

        // ── Player status ──
        PlayerStatus = EPlayerStatus::Vivo;
        Patente      = EPatenteRank::Zheers;
        XP           = 0;
        Rating       = 1000;

        // ── Combat stats ──
        Kills           = 0;
        DamageDealt     = 0.0f;
        SurvivedTime    = 0.0f;
        EliminationCause = EEliminationCause::Queda;
        EliminatorId    = TEXT("");

        // ── Map position ──
        MapPosition = FVector2D::ZeroVector;

        // ── Lobby state ──
        bIsReady     = false;
        bIsHost      = false;
        bIsConnected = false;

        // ── Persistent stats ──
        MatchesPlayed = 0;
        Wins          = 0;
        Top5          = 0;
        SeasonKills   = 0;
        Deaths        = 0;
}

// ─── RepNotify Callbacks ────────────────────────────────────────────────────────

void AKhaaosPlayerState::OnRep_Health()
{
        // Client-side health bar UI update
        OnHealthChanged.Broadcast(Health, 0.0f);
}

void AKhaaosPlayerState::OnRep_Credits()
{
        // Client-side credits UI update
        OnCreditsChanged.Broadcast(Credits, 0);
}

void AKhaaosPlayerState::OnRep_PlayerStatus()
{
        // FIXED: Previously broadcast (PlayerStatus, PlayerStatus) — both params same
        // Server-side SetPlayerStatus already broadcasts correct old→new.
        // This client RepNotify provides secondary notification for client UI.
        OnPlayerStatusChanged.Broadcast(PlayerStatus, PlayerStatus);
}

// ─── Server Authority Methods ───────────────────────────────────────────────────

float AKhaaosPlayerState::ApplyDamage(float DamageAmount, APlayerState* Instigator)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return 0.0f;
        }

        if (PlayerStatus != EPlayerStatus::Vivo || DamageAmount <= 0.0f)
        {
                return 0.0f;
        }

        float OldHealth = Health;
        Health = FMath::Clamp(Health - DamageAmount, 0.0f, MaxHealth);
        float ActualDamage = OldHealth - Health;

        DamageDealt += DamageAmount;

        if (Health <= 0.0f)
        {
                SetPlayerStatus(EPlayerStatus::Eliminado);
        }

        OnHealthChanged.Broadcast(Health, -ActualDamage);

        return ActualDamage;
}

float AKhaaosPlayerState::Heal(float HealAmount)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return 0.0f;
        }

        if (HealAmount <= 0.0f)
        {
                return 0.0f;
        }

        float OldHealth = Health;
        Health = FMath::Clamp(Health + HealAmount, 0.0f, MaxHealth);
        float ActualHeal = Health - OldHealth;

        OnHealthChanged.Broadcast(Health, ActualHeal);

        return ActualHeal;
}

void AKhaaosPlayerState::GrantCredits(int32 Amount)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        int32 OldCredits = Credits;
        Credits = FMath::Max(0, Credits + Amount);

        OnCreditsChanged.Broadcast(Credits, Credits - OldCredits);
}

void AKhaaosPlayerState::SetPlayerStatus(EPlayerStatus NewStatus)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        EPlayerStatus OldStatus = PlayerStatus;
        PlayerStatus = NewStatus;

        if (OldStatus != NewStatus)
        {
                // Track death count on elimination
                if (NewStatus == EPlayerStatus::Eliminado)
                {
                        Deaths++;
                }

                OnPlayerStatusChanged.Broadcast(OldStatus, NewStatus);
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerState: Status changed %d → %d for %s"),
                        static_cast<int32>(OldStatus), static_cast<int32>(NewStatus), *GetPlayerName());
        }
}

EPatenteRank AKhaaosPlayerState::RankFromXp(int32 Xp)
{
        // FIXED: Walk DETERMINISTIC sorted array from highest to lowest.
        // TMap iteration is non-deterministic in UE5 — could return wrong rank.
        EPatenteRank Result = EPatenteRank::Zheers;

        for (int32 i = RankXpTableSize - 1; i >= 0; --i)
        {
                if (Xp >= RankXpTable[i].XpThreshold)
                {
                        Result = RankXpTable[i].Rank;
                        break;
                }
        }

        return Result;
}

FString AKhaaosPlayerState::PatenteToString(EPatenteRank Rank)
{
        switch (Rank)
        {
        case EPatenteRank::Zheers:   return TEXT("ZHEERS");
        case EPatenteRank::Onith:    return TEXT("ONITH");
        case EPatenteRank::Skeetw:   return TEXT("SKEETW");
        case EPatenteRank::Huran:    return TEXT("HURAN");
        case EPatenteRank::Venex:    return TEXT("VENEX");
        case EPatenteRank::Khael:    return TEXT("KHAEL");
        case EPatenteRank::Malakor:  return TEXT("MALAKOR");
        case EPatenteRank::Overlord: return TEXT("OVERLORD");
        default:                     return TEXT("UNKNOWN");
        }
}

// ─── Replication ────────────────────────────────────────────────────────────────

void AKhaaosPlayerState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);

        // Core attributes
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosPlayerState, Health, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosPlayerState, MaxHealth);
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosPlayerState, Credits, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosPlayerState, Speed);
        DOREPLIFETIME(AKhaaosPlayerState, Energy);
        DOREPLIFETIME(AKhaaosPlayerState, MaxEnergy);

        // Player status
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosPlayerState, PlayerStatus, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosPlayerState, Patente);
        DOREPLIFETIME(AKhaaosPlayerState, XP);
        DOREPLIFETIME(AKhaaosPlayerState, Rating);

        // Combat stats
        DOREPLIFETIME(AKhaaosPlayerState, Kills);
        DOREPLIFETIME(AKhaaosPlayerState, DamageDealt);
        DOREPLIFETIME(AKhaaosPlayerState, SurvivedTime);
        DOREPLIFETIME(AKhaaosPlayerState, EliminationCause);
        DOREPLIFETIME(AKhaaosPlayerState, EliminatorId);

        // Position
        DOREPLIFETIME(AKhaaosPlayerState, MapPosition);

        // Lobby state
        DOREPLIFETIME(AKhaaosPlayerState, bIsReady);
        DOREPLIFETIME(AKhaaosPlayerState, bIsHost);
        DOREPLIFETIME(AKhaaosPlayerState, bIsConnected);

        // Persistent stats
        DOREPLIFETIME(AKhaaosPlayerState, MatchesPlayed);
        DOREPLIFETIME(AKhaaosPlayerState, Wins);
        DOREPLIFETIME(AKhaaosPlayerState, Top5);
        DOREPLIFETIME(AKhaaosPlayerState, SeasonKills);
        DOREPLIFETIME(AKhaaosPlayerState, Deaths);
}
