// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Network/KhaaosIrisConfig.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosIrisConfigSubsystem::UKhaaosIrisConfigSubsystem()
{
    bEnableIris = true;
    bPriorityEscalationActive = false;
    EscalationPlayerThreshold = 20;
    CurrentPlayerCount = 100;
    ConfiguredWorld = EWorldSequence::CIGKV;

    // Default spatial grid
    DefaultSpatialGrid.CellSize           = 4000.0f;
    DefaultSpatialGrid.HysteresisDistance = 1000.0f;
    DefaultSpatialGrid.MaxRelevantActors  = 1024;
    CurrentSpatialGrid = DefaultSpatialGrid;
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

void UKhaaosIrisConfigSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    InitDefaultPriorityMappings();

    UE_LOG(LogKhaaosRun, Log,
        TEXT("IrisConfig::Initialize - Default priority mappings configured (%d object types), Iris=%s"),
        DefaultObjectConfigs.Num(),
        bEnableIris ? TEXT("ENABLED") : TEXT("DISABLED"));
}

void UKhaaosIrisConfigSubsystem::Deinitialize(FSubsystemCollectionBase& Collection)
{
    DefaultObjectConfigs.Empty();
    bPriorityEscalationActive = false;

    UE_LOG(LogKhaaosRun, Log, TEXT("IrisConfig::Deinitialize - Cleared all configurations"));
    Super::Deinitialize(Collection);
}

// ─── Configure For World ───────────────────────────────────────────────────────

void UKhaaosIrisConfigSubsystem::ConfigureForWorld(EWorldSequence World, int32 PlayerCount)
{
    ConfiguredWorld = World;
    CurrentPlayerCount = PlayerCount;

    // ── Adjust spatial grid cell size per world ──
    SetSpatialGridForWorld(World);

    // ── Adjust bandwidth per world based on player count ──
    // Barburhen: 100 players, needs more bandwidth
    // CIGKV: 50 players, needs less bandwidth
    // Ckesalth: dense map, smaller cells but moderate bandwidth
    float BandwidthMultiplier = 1.0f;
    switch (World)
    {
    case EWorldSequence::Barburhen:
        // 100 players — full bandwidth allocation
        BandwidthMultiplier = 1.0f;
        break;

    case EWorldSequence::CIGKV:
        // 50 players — reduced bandwidth, still smooth
        BandwidthMultiplier = FMath::Clamp(static_cast<float>(PlayerCount) / 100.0f, 0.5f, 1.0f);
        break;

    case EWorldSequence::Ckesalth:
        // Dense urban map — moderate bandwidth but tighter spatial clustering
        BandwidthMultiplier = FMath::Clamp(static_cast<float>(PlayerCount) / 80.0f, 0.6f, 1.0f);
        break;

    case EWorldSequence::Priadus:
    case EWorldSequence::Arukheea:
        // Standard worlds
        BandwidthMultiplier = FMath::Clamp(static_cast<float>(PlayerCount) / 100.0f, 0.5f, 1.0f);
        break;

    default:
        BandwidthMultiplier = 1.0f;
        break;
    }

    // Apply bandwidth multiplier to all object configs
    for (auto& Pair : DefaultObjectConfigs)
    {
        Pair.Value.MinBandwidthBytesPerSec *= BandwidthMultiplier;
    }

    // ── Check auto priority escalation ──
    CheckAutoEscalation(PlayerCount);

    OnIrisConfigChanged.Broadcast(World, PlayerCount);

    UE_LOG(LogKhaaosRun, Log,
        TEXT("IrisConfig::ConfigureForWorld - World=%s Players=%d CellSize=%.0f BW_Multiplier=%.2f Escalation=%s"),
        *UEnum::GetDisplayValueAsText(World).ToString(),
        PlayerCount,
        CurrentSpatialGrid.CellSize,
        BandwidthMultiplier,
        bPriorityEscalationActive ? TEXT("ACTIVE") : TEXT("OFF"));
}

// ─── Object Config Query ───────────────────────────────────────────────────────

FKhaaosIrisObjectConfig UKhaaosIrisConfigSubsystem::GetObjectConfig(FName ObjectType) const
{
    const FKhaaosIrisObjectConfig* Config = DefaultObjectConfigs.Find(ObjectType);
    if (Config)
    {
        return *Config;
    }

    // Default config for unknown object types
    return FKhaaosIrisObjectConfig(EKhaaosIrisPriority::Medium, 0.0f, 30.0f);
}

// ─── Priority Escalation ───────────────────────────────────────────────────────

void UKhaaosIrisConfigSubsystem::ActivatePriorityEscalation()
{
    if (bPriorityEscalationActive) return;

    bPriorityEscalationActive = true;
    OnPriorityEscalation.Broadcast(true);

    UE_LOG(LogKhaaosRun, Log,
        TEXT("IrisConfig::PriorityEscalation - ACTIVATED (all objects → Critical for final circle)"));
}

void UKhaaosIrisConfigSubsystem::DeactivatePriorityEscalation()
{
    if (!bPriorityEscalationActive) return;

    bPriorityEscalationActive = false;
    OnPriorityEscalation.Broadcast(false);

    UE_LOG(LogKhaaosRun, Log,
        TEXT("IrisConfig::PriorityEscalation - DEACTIVATED (restored normal priorities)"));
}

EKhaaosIrisPriority UKhaaosIrisConfigSubsystem::GetEffectivePriority(FName ObjectType) const
{
    // During priority escalation, all objects become Critical
    if (bPriorityEscalationActive)
    {
        return EKhaaosIrisPriority::Critical;
    }

    const FKhaaosIrisObjectConfig* Config = DefaultObjectConfigs.Find(ObjectType);
    if (Config)
    {
        return Config->Priority;
    }

    return EKhaaosIrisPriority::Medium;
}

// ─── Internal: Initialize Default Priority Mappings ────────────────────────────

void UKhaaosIrisConfigSubsystem::InitDefaultPriorityMappings()
{
    DefaultObjectConfigs.Empty(8);

    // PlayerState: Critical — must always be up-to-date for all clients
    DefaultObjectConfigs.Add(FName("PlayerState"),
        FKhaaosIrisObjectConfig(EKhaaosIrisPriority::Critical, 8192.0f, 30.0f));

    // GameState: Critical — match state, zone, phase must be accurate
    DefaultObjectConfigs.Add(FName("GameState"),
        FKhaaosIrisObjectConfig(EKhaaosIrisPriority::Critical, 4096.0f, 10.0f));

    // Weapon: High — ammo, reload state, fire mode important for gameplay
    DefaultObjectConfigs.Add(FName("Weapon"),
        FKhaaosIrisObjectConfig(EKhaaosIrisPriority::High, 4096.0f, 20.0f));

    // Vehicle: Medium — position/velocity important but lower update rate acceptable
    DefaultObjectConfigs.Add(FName("Vehicle"),
        FKhaaosIrisObjectConfig(EKhaaosIrisPriority::Medium, 2048.0f, 15.0f));

    // Loot: Medium — spawn/despawn events, not every frame
    DefaultObjectConfigs.Add(FName("Loot"),
        FKhaaosIrisObjectConfig(EKhaaosIrisPriority::Medium, 1024.0f, 5.0f));

    // KillFeed: Low — UI-only, can tolerate delay
    DefaultObjectConfigs.Add(FName("KillFeed"),
        FKhaaosIrisObjectConfig(EKhaaosIrisPriority::Low, 512.0f, 2.0f));

    // Projectile: High — needs accurate position for hit validation
    DefaultObjectConfigs.Add(FName("Projectile"),
        FKhaaosIrisObjectConfig(EKhaaosIrisPriority::High, 6144.0f, 60.0f));

    // AI: Medium — controlled actors, moderate update rate
    DefaultObjectConfigs.Add(FName("AI"),
        FKhaaosIrisObjectConfig(EKhaaosIrisPriority::Medium, 2048.0f, 15.0f));

    UE_LOG(LogKhaaosRun, Log,
        TEXT("IrisConfig::InitDefaultPriorityMappings - %d object types configured"),
        DefaultObjectConfigs.Num());
}

// ─── Internal: Set Spatial Grid For World ──────────────────────────────────────

void UKhaaosIrisConfigSubsystem::SetSpatialGridForWorld(EWorldSequence World)
{
    // Start from defaults
    CurrentSpatialGrid = DefaultSpatialGrid;

    switch (World)
    {
    case EWorldSequence::Barburhen:
        // Large map, 100 players — bigger cells for less overhead
        CurrentSpatialGrid.CellSize          = 5000.0f;
        CurrentSpatialGrid.HysteresisDistance = 1500.0f;
        CurrentSpatialGrid.MaxRelevantActors  = 1536;
        break;

    case EWorldSequence::CIGKV:
        // Moderate map, 50 players — default cell size
        CurrentSpatialGrid.CellSize          = 4000.0f;
        CurrentSpatialGrid.HysteresisDistance = 1000.0f;
        CurrentSpatialGrid.MaxRelevantActors  = 1024;
        break;

    case EWorldSequence::Ckesalth:
        // Dense urban map — smaller cells for tighter spatial clustering
        CurrentSpatialGrid.CellSize          = 3000.0f;
        CurrentSpatialGrid.HysteresisDistance = 800.0f;
        CurrentSpatialGrid.MaxRelevantActors  = 2048;
        break;

    case EWorldSequence::Priadus:
        // Mixed terrain — default settings
        CurrentSpatialGrid.CellSize          = 4000.0f;
        CurrentSpatialGrid.HysteresisDistance = 1000.0f;
        CurrentSpatialGrid.MaxRelevantActors  = 1024;
        break;

    case EWorldSequence::Arukheea:
        // Open map — slightly larger cells
        CurrentSpatialGrid.CellSize          = 4500.0f;
        CurrentSpatialGrid.HysteresisDistance = 1200.0f;
        CurrentSpatialGrid.MaxRelevantActors  = 1024;
        break;

    default:
        // Use defaults
        break;
    }

    UE_LOG(LogKhaaosRun, Log,
        TEXT("IrisConfig::SetSpatialGrid - World=%s CellSize=%.0f Hysteresis=%.0f MaxActors=%d"),
        *UEnum::GetDisplayValueAsText(World).ToString(),
        CurrentSpatialGrid.CellSize,
        CurrentSpatialGrid.HysteresisDistance,
        CurrentSpatialGrid.MaxRelevantActors);
}

// ─── Internal: Check Auto Escalation ───────────────────────────────────────────

void UKhaaosIrisConfigSubsystem::CheckAutoEscalation(int32 PlayerCount)
{
    // Auto-escalate when player count drops below threshold (final circle)
    if (PlayerCount > 0 && PlayerCount < EscalationPlayerThreshold)
    {
        if (!bPriorityEscalationActive)
        {
            ActivatePriorityEscalation();
            UE_LOG(LogKhaaosRun, Log,
                TEXT("IrisConfig::CheckAutoEscalation - Auto-escalated: %d players < %d threshold"),
                PlayerCount, EscalationPlayerThreshold);
        }
    }
    else
    {
        // De-escalate when player count is above threshold
        // (safety: normally escalation stays active once triggered,
        //  but this handles mid-match player rejoin scenarios)
        if (bPriorityEscalationActive && PlayerCount >= EscalationPlayerThreshold)
        {
            // Keep escalation active — once final circle starts, it stays
            // This branch is intentionally a no-op for game design consistency
        }
    }
}
