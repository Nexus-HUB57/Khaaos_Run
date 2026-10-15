// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Network/KhaaosReplicationBudget.h"
#include "KhaaosRun.h"

#include "Net/UnrealNetwork.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosReplicationBudgetComponent::UKhaaosReplicationBudgetComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.bStartWithTickEnabled = true;

    // Budget allocation defaults: Combat=40%, Movement=25%, Inventory=10%, UI=15%, Other=10%
    BudgetAllocation.CombatPct    = 40.0f;
    BudgetAllocation.MovementPct  = 25.0f;
    BudgetAllocation.InventoryPct = 10.0f;
    BudgetAllocation.UIPct        = 15.0f;
    BudgetAllocation.OtherPct     = 10.0f;

    // Tick rate defaults per connection quality
    TickRateConfig.LANTickRate      = 30.0f;
    TickRateConfig.GoodTickRate     = 20.0f;
    TickRateConfig.ModerateTickRate = 14.0f;
    TickRateConfig.PoorTickRate     = 8.0f;

    // Total bandwidth: 600 KB/s (dedicated server uplink budget)
    TotalBandwidthBudgetBytesPerSec = 614400.0f;

    // RTT thresholds
    RTTThresholdLAN      = 10.0f;
    RTTThresholdGood     = 80.0f;
    RTTThresholdModerate = 200.0f;

    // Adaptive replication multipliers
    ModerateReplicationMultiplier = 0.7f;
    PoorReplicationMultiplier     = 0.4f;

    // Quality re-evaluation interval
    QualityReevaluateInterval = 2.0f;

    // State
    CurrentNetCondition     = EKhaaosNetCondition::Good;
    CurrentEffectiveTickRate = TickRateConfig.GoodTickRate;
    PreviousNetCondition    = EKhaaosNetCondition::Good;
    QualityReevaluateTimer  = 0.0f;

    SetIsReplicatedByDefault(true);
}

// ─── Budget Query ──────────────────────────────────────────────────────────────

float UKhaaosReplicationBudgetComponent::GetBudgetForSystem(EKhaaosBudgetSystem System) const
{
    float Pct = 0.0f;
    switch (System)
    {
    case EKhaaosBudgetSystem::Combat:    Pct = BudgetAllocation.CombatPct;    break;
    case EKhaaosBudgetSystem::Movement:  Pct = BudgetAllocation.MovementPct;  break;
    case EKhaaosBudgetSystem::Inventory: Pct = BudgetAllocation.InventoryPct; break;
    case EKhaaosBudgetSystem::UI:        Pct = BudgetAllocation.UIPct;        break;
    case EKhaaosBudgetSystem::Other:     Pct = BudgetAllocation.OtherPct;     break;
    default:                             Pct = BudgetAllocation.OtherPct;     break;
    }

    return (Pct / 100.0f) * TotalBandwidthBudgetBytesPerSec;
}

float UKhaaosReplicationBudgetComponent::GetSystemUsage(int32 ConnectionId, EKhaaosBudgetSystem System) const
{
    const FKhaaosConnectionBandwidth* Conn = ConnectionBandwidths.Find(ConnectionId);
    if (!Conn) return 0.0f;

    const float* Usage = Conn->SystemUsageBytesPerSec.Find(System);
    return Usage ? *Usage : 0.0f;
}

bool UKhaaosReplicationBudgetComponent::IsBudgetExceeded(int32 ConnectionId, EKhaaosBudgetSystem System) const
{
    const float Budget = GetBudgetForSystem(System);
    const float Usage  = GetSystemUsage(ConnectionId, System);
    return Usage > Budget;
}

// ─── Tick Rate Query ───────────────────────────────────────────────────────────

float UKhaaosReplicationBudgetComponent::GetTickRateForCondition(EKhaaosNetCondition Condition) const
{
    switch (Condition)
    {
    case EKhaaosNetCondition::LAN:      return TickRateConfig.LANTickRate;
    case EKhaaosNetCondition::Good:     return TickRateConfig.GoodTickRate;
    case EKhaaosNetCondition::Moderate: return TickRateConfig.ModerateTickRate;
    case EKhaaosNetCondition::Poor:     return TickRateConfig.PoorTickRate;
    default:                            return TickRateConfig.GoodTickRate;
    }
}

// ─── Connection Quality Detection ──────────────────────────────────────────────

EKhaaosNetCondition UKhaaosReplicationBudgetComponent::DetectNetConditionFromRTT(float AvgRTTMs) const
{
    if (AvgRTTMs <= RTTThresholdLAN)
    {
        return EKhaaosNetCondition::LAN;
    }
    else if (AvgRTTMs <= RTTThresholdGood)
    {
        return EKhaaosNetCondition::Good;
    }
    else if (AvgRTTMs <= RTTThresholdModerate)
    {
        return EKhaaosNetCondition::Moderate;
    }
    else
    {
        return EKhaaosNetCondition::Poor;
    }
}

void UKhaaosReplicationBudgetComponent::UpdateConnectionBandwidth(
    int32 ConnectionId, float AvgRTTMs, float OutBytesPerSec, float InBytesPerSec)
{
    FKhaaosConnectionBandwidth& Conn = ConnectionBandwidths.FindOrAdd(ConnectionId);
    Conn.ConnectionId  = ConnectionId;
    Conn.AvgRTTMs      = AvgRTTMs;
    Conn.OutBytesPerSec = OutBytesPerSec;
    Conn.InBytesPerSec  = InBytesPerSec;
    Conn.NetCondition   = DetectNetConditionFromRTT(AvgRTTMs);
    Conn.LastUpdateTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;

    UE_LOG(LogKhaaosRun, VeryVerbose,
        TEXT("ReplicationBudget::UpdateConnection - Conn=%d RTT=%.1fms Out=%.0fB/s In=%.0fB/s Condition=%s"),
        ConnectionId, AvgRTTMs, OutBytesPerSec, InBytesPerSec,
        *UEnum::GetDisplayValueAsText(Conn.NetCondition).ToString());
}

void UKhaaosReplicationBudgetComponent::RemoveConnection(int32 ConnectionId)
{
    if (ConnectionBandwidths.Remove(ConnectionId) > 0)
    {
        UE_LOG(LogKhaaosRun, Log,
            TEXT("ReplicationBudget::RemoveConnection - Removed tracking for Conn=%d"), ConnectionId);
    }
}

// ─── Adaptive Replication ──────────────────────────────────────────────────────

float UKhaaosReplicationBudgetComponent::GetReplicationRateMultiplier(EKhaaosBudgetSystem System) const
{
    // Combat and Movement are always critical — always full rate
    if (System == EKhaaosBudgetSystem::Combat || System == EKhaaosBudgetSystem::Movement)
    {
        return 1.0f;
    }

    // Non-critical systems: reduce rate based on connection quality
    switch (CurrentNetCondition)
    {
    case EKhaaosNetCondition::LAN:
    case EKhaaosNetCondition::Good:
        return 1.0f;

    case EKhaaosNetCondition::Moderate:
        return ModerateReplicationMultiplier;

    case EKhaaosNetCondition::Poor:
        return PoorReplicationMultiplier;

    default:
        return 1.0f;
    }
}

// ─── Tick Component ────────────────────────────────────────────────────────────

void UKhaaosReplicationBudgetComponent::TickComponent(
    float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (GetOwnerRole() != ROLE_Authority) return;

    // Re-evaluate connection quality periodically
    QualityReevaluateTimer += DeltaTime;
    if (QualityReevaluateTimer >= QualityReevaluateInterval)
    {
        QualityReevaluateTimer = 0.0f;
        EvaluateConnectionQuality();
    }

    // Check bandwidth budgets
    CheckBudgetExceeded();
}

// ─── Replication ───────────────────────────────────────────────────────────────

void UKhaaosReplicationBudgetComponent::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosReplicationBudgetComponent, CurrentNetCondition, COND_None, REPNOTIFY_Always);
    DOREPLIFETIME_CONDITION_NOTIFY(UKhaaosReplicationBudgetComponent, CurrentEffectiveTickRate, COND_None, REPNOTIFY_Always);
}

// ─── Internal: Evaluate Connection Quality ─────────────────────────────────────

void UKhaaosReplicationBudgetComponent::EvaluateConnectionQuality()
{
    if (ConnectionBandwidths.Num() == 0) return;

    // Determine worst connection quality across all clients
    EKhaaosNetCondition WorstCondition = ComputeWorstNetCondition();

    if (WorstCondition != CurrentNetCondition)
    {
        PreviousNetCondition = CurrentNetCondition;
        CurrentNetCondition = WorstCondition;

        UpdateEffectiveTickRate();

        OnTickRateChanged.Broadcast(PreviousNetCondition, CurrentNetCondition);

        UE_LOG(LogKhaaosRun, Log,
            TEXT("ReplicationBudget::QualityChanged - %s → %s, TickRate=%.1fHz"),
            *UEnum::GetDisplayValueAsText(PreviousNetCondition).ToString(),
            *UEnum::GetDisplayValueAsText(CurrentNetCondition).ToString(),
            CurrentEffectiveTickRate);
    }
}

EKhaaosNetCondition UKhaaosReplicationBudgetComponent::ComputeWorstNetCondition() const
{
    EKhaaosNetCondition Worst = EKhaaosNetCondition::LAN;

    for (const auto& Pair : ConnectionBandwidths)
    {
        const EKhaaosNetCondition ConnCondition = Pair.Value.NetCondition;

        // Higher enum value = worse condition
        if (static_cast<uint8>(ConnCondition) > static_cast<uint8>(Worst))
        {
            Worst = ConnCondition;
        }
    }

    return Worst;
}

void UKhaaosReplicationBudgetComponent::UpdateEffectiveTickRate()
{
    CurrentEffectiveTickRate = GetTickRateForCondition(CurrentNetCondition);
}

// ─── Internal: Check Budget Exceeded ───────────────────────────────────────────

void UKhaaosReplicationBudgetComponent::CheckBudgetExceeded()
{
    static const TArray<EKhaaosBudgetSystem> AllSystems = {
        EKhaaosBudgetSystem::Combat,
        EKhaaosBudgetSystem::Movement,
        EKhaaosBudgetSystem::Inventory,
        EKhaaosBudgetSystem::UI,
        EKhaaosBudgetSystem::Other
    };

    for (const auto& ConnPair : ConnectionBandwidths)
    {
        for (EKhaaosBudgetSystem System : AllSystems)
        {
            const float Budget = GetBudgetForSystem(System);
            const float Usage  = GetSystemUsage(ConnPair.Key, System);

            if (Usage > Budget)
            {
                OnBandwidthExceeded.Broadcast(System, Usage, Budget);

                UE_LOG(LogKhaaosRun, Warning,
                    TEXT("ReplicationBudget::BudgetExceeded - Conn=%d System=%s Usage=%.0fB/s Budget=%.0fB/s"),
                    ConnPair.Key,
                    *UEnum::GetDisplayValueAsText(System).ToString(),
                    Usage, Budget);
            }
        }
    }
}
