// KhaaosFeatureFlags Implementation

#include "Game/Launch/KhaaosFeatureFlags.h"

void UKhaaosFeatureFlags::Initialize(FSubsystemCollectionInitializationContext& Context)
{
    Super::Initialize(Context);
    InitializeDefaultFlags();
}

void UKhaaosFeatureFlags::InitializeDefaultFlags()
{
    Flags.Empty();

    // ─── Gameplay Features ───────────────────────────────────────────────────

    Flags.Add({TEXT("CIGKV.ZuCinematic"), TEXT("Zu cinematic entry sequences"), EKhaaosFeatureCategory::Gameplay, true, false, 100});
    Flags.Add({TEXT("CIGKV.PulsoKhaaos"), TEXT("Pulso Khaaos legendary drops every 10min"), EKhaaosFeatureCategory::Gameplay, true, false, 100});
    Flags.Add({TEXT("CIGKV.DedoDuro"), TEXT("Inactivity punishment system"), EKhaaosFeatureCategory::Gameplay, true, false, 100});
    Flags.Add({TEXT("CIGKV.ContinuousEntry"), TEXT("Continuous player entry (vaga on exit)"), EKhaaosFeatureCategory::Gameplay, true, false, 100});
    Flags.Add({TEXT("CIGKV.ArsenalNoPatente"), TEXT("Arsenal without patente limits"), EKhaaosFeatureCategory::Gameplay, true, false, 100});
    Flags.Add({TEXT("Combat.SequelaSystem"), TEXT("Bleeding/stun/numb tick system"), EKhaaosFeatureCategory::Gameplay, true, false, 100});
    Flags.Add({TEXT("Combat.KravMagaN3"), TEXT("Krav Maga N3 advanced techniques"), EKhaaosFeatureCategory::Gameplay, false, false, 50});

    // ─── Economy Features ────────────────────────────────────────────────────

    Flags.Add({TEXT("Economy.KRC"), TEXT("KRC currency system"), EKhaaosFeatureCategory::Economy, true, false, 100});
    Flags.Add({TEXT("Economy.BankHaaos"), TEXT("BankHaaos deposits/withdrawals"), EKhaaosFeatureCategory::Economy, true, false, 100});
    Flags.Add({TEXT("Economy.FBM"), TEXT("Fundo de Batalha Militar"), EKhaaosFeatureCategory::Economy, true, false, 100});
    Flags.Add({TEXT("Economy.Cashback"), TEXT("100% cashback on first purchase"), EKhaaosFeatureCategory::Economy, true, false, 100});
    Flags.Add({TEXT("Economy.ForjaArmeiro"), TEXT("Forja do Armeiro marketplace"), EKhaaosFeatureCategory::Economy, true, false, 100});
    Flags.Add({TEXT("Economy.AtomicLedger"), TEXT("Atomic ledger for real value (REQUIRES COMPLIANCE)"), EKhaaosFeatureCategory::Economy, false, true, 0});
    Flags.Add({TEXT("Economy.RealValue"), TEXT("Real money integration (LOCKED until compliance)"), EKhaaosFeatureCategory::Economy, false, true, 0});

    // ─── Network Features ────────────────────────────────────────────────────

    Flags.Add({TEXT("Net.IrisReplication"), TEXT("Iris replication system"), EKhaaosFeatureCategory::Network, true, false, 100});
    Flags.Add({TEXT("Net.SpatialRelevancy"), TEXT("Distance-based relevancy"), EKhaaosFeatureCategory::Network, true, false, 100});
    Flags.Add({TEXT("Net.LagCompensation"), TEXT("Server-side lag compensation"), EKhaaosFeatureCategory::Network, true, false, 100});
    Flags.Add({TEXT("Net.CrossRegion"), TEXT("Cross-region play (higher ping)"), EKhaaosFeatureCategory::Network, false, false, 0});

    // ─── Security Features ───────────────────────────────────────────────────

    Flags.Add({TEXT("Security.AntiCheat"), TEXT("Anti-cheat validation (movement/shot/damage)"), EKhaaosFeatureCategory::Security, true, false, 100});
    Flags.Add({TEXT("Security.EAC"), TEXT("Easy Anti-Cheat integration"), EKhaaosFeatureCategory::Security, false, false, 0});
    Flags.Add({TEXT("Security.RateLimiter"), TEXT("Rate limiting (60/min + 10/s)"), EKhaaosFeatureCategory::Security, true, false, 100});
    Flags.Add({TEXT("Security.DDoSProtection"), TEXT("DDoS auto-blocking"), EKhaaosFeatureCategory::Security, true, false, 100});

    // ─── UI Features ─────────────────────────────────────────────────────────

    Flags.Add({TEXT("UI.HUD"), TEXT("CommonUI HUD (health/shield/cooldowns)"), EKhaaosFeatureCategory::UI, true, false, 100});
    Flags.Add({TEXT("UI.Scoreboard"), TEXT("KDA scoreboard"), EKhaaosFeatureCategory::UI, true, false, 100});
    Flags.Add({TEXT("UI.Minimap"), TEXT("Minimap with zone circle"), EKhaaosFeatureCategory::UI, true, false, 100});
    Flags.Add({TEXT("UI.KillFeed"), TEXT("Kill feed notifications"), EKhaaosFeatureCategory::UI, true, false, 100});

    // ─── Audio Features ──────────────────────────────────────────────────────

    Flags.Add({TEXT("Audio.MetaSound"), TEXT("MetaSound audio engine"), EKhaaosFeatureCategory::Audio, true, false, 100});
    Flags.Add({TEXT("Audio.AdaptiveMusic"), TEXT("Adaptive music (7 states)"), EKhaaosFeatureCategory::Audio, true, false, 100});
    Flags.Add({TEXT("Audio.ZoneAudio"), TEXT("Zone warning/damage audio"), EKhaaosFeatureCategory::Audio, true, false, 100});

    // ─── EOS Features ────────────────────────────────────────────────────────

    Flags.Add({TEXT("EOS.Auth"), TEXT("EOS Authentication"), EKhaaosFeatureCategory::EOS, true, false, 100});
    Flags.Add({TEXT("EOS.Lobby"), TEXT("EOS Lobby system"), EKhaaosFeatureCategory::EOS, true, false, 100});
    Flags.Add({TEXT("EOS.Matchmaking"), TEXT("EOS Matchmaking"), EKhaaosFeatureCategory::EOS, true, false, 100});
    Flags.Add({TEXT("EOS.Sessions"), TEXT("EOS Sessions (dedicated server)"), EKhaaosFeatureCategory::EOS, true, false, 100});
    Flags.Add({TEXT("EOS.CloudSave"), TEXT("EOS Cloud Save (auto-save 120s)"), EKhaaosFeatureCategory::EOS, true, false, 100});
    Flags.Add({TEXT("EOS.MultiRegion"), TEXT("Multi-region deployment (SA/NA/EU)"), EKhaaosFeatureCategory::EOS, false, false, 0});

    // ─── Debug Features ──────────────────────────────────────────────────────

    Flags.Add({TEXT("Debug.GameplayDebugger"), TEXT("Gameplay debugger overlay (tilde)"), EKhaaosFeatureCategory::Debug, true, false, 100});
    Flags.Add({TEXT("Debug.ConsoleCommands"), TEXT("khaaos.debug.* console commands"), EKhaaosFeatureCategory::Debug, true, false, 100});
    Flags.Add({TEXT("Debug.GodMode"), TEXT("God mode (cheat)"), EKhaaosFeatureCategory::Debug, false, false, 0});
    Flags.Add({TEXT("Debug.InfiniteAmmo"), TEXT("Infinite ammo (cheat)"), EKhaaosFeatureCategory::Debug, false, false, 0});
    Flags.Add({TEXT("Debug.LoadTestBots"), TEXT("Load test bot spawning"), EKhaaosFeatureCategory::Debug, true, false, 100});

    UE_LOG(LogTemp, Log, TEXT("[Features] Initialized %d flags for environment: %s"), Flags.Num(), *CurrentEnvironment);
}

bool UKhaaosFeatureFlags::IsEnabled(const FString& FlagName) const
{
    const FKhaaosFeatureFlag* Flag = FindFlag(FlagName);
    return Flag ? Flag->bEnabled : false;
}

bool UKhaaosFeatureFlags::IsEnabledForPlayer(const FString& FlagName, int64 PlayerId) const
{
    const FKhaaosFeatureFlag* Flag = FindFlag(FlagName);
    if (!Flag || !Flag->bEnabled) return false;
    if (Flag->RolloutPercentage >= 100) return true;
    return (PlayerId % 100) < Flag->RolloutPercentage;
}

bool UKhaaosFeatureFlags::EnableFlag(const FString& FlagName)
{
    FKhaaosFeatureFlag* Flag = FindFlag(FlagName);
    if (Flag && !Flag->bLocked) { Flag->bEnabled = true; return true; }
    return false;
}

bool UKhaaosFeatureFlags::DisableFlag(const FString& FlagName)
{
    FKhaaosFeatureFlag* Flag = FindFlag(FlagName);
    if (Flag && !Flag->bLocked) { Flag->bEnabled = false; return true; }
    return false;
}

void UKhaaosFeatureFlags::ApplyAlphaPreset()
{
    CurrentEnvironment = TEXT("Alpha");
    InitializeDefaultFlags();
    // Alpha: debug ON, new features ON, economy limited
    EnableFlag(TEXT("Debug.GameplayDebugger"));
    EnableFlag(TEXT("Debug.ConsoleCommands"));
    EnableFlag(TEXT("Debug.LoadTestBots"));
    DisableFlag(TEXT("Economy.AtomicLedger"));
    DisableFlag(TEXT("Economy.RealValue"));
    DisableFlag(TEXT("Security.EAC"));
    UE_LOG(LogTemp, Log, TEXT("[Features] Alpha preset applied"));
}

void UKhaaosFeatureFlags::ApplyBetaPreset()
{
    CurrentEnvironment = TEXT("Beta");
    InitializeDefaultFlags();
    // Beta: debug OFF, new features ON, economy enabled
    DisableFlag(TEXT("Debug.GodMode"));
    DisableFlag(TEXT("Debug.InfiniteAmmo"));
    DisableFlag(TEXT("Economy.AtomicLedger"));
    DisableFlag(TEXT("Economy.RealValue"));
    EnableFlag(TEXT("EOS.MultiRegion"));
    UE_LOG(LogTemp, Log, TEXT("[Features] Beta preset applied"));
}

void UKhaaosFeatureFlags::ApplyProductionPreset()
{
    CurrentEnvironment = TEXT("Production");
    InitializeDefaultFlags();
    // Production: debug OFF, only stable, economy locked
    DisableFlag(TEXT("Debug.GameplayDebugger"));
    DisableFlag(TEXT("Debug.ConsoleCommands"));
    DisableFlag(TEXT("Debug.GodMode"));
    DisableFlag(TEXT("Debug.InfiniteAmmo"));
    DisableFlag(TEXT("Debug.LoadTestBots"));
    DisableFlag(TEXT("Combat.KravMagaN3"));
    DisableFlag(TEXT("Net.CrossRegion"));
    // Lock critical flags
    if (FKhaaosFeatureFlag* F = FindFlag(TEXT("Economy.RealValue"))) F->bLocked = true;
    if (FKhaaosFeatureFlag* F = FindFlag(TEXT("Economy.AtomicLedger"))) F->bLocked = true;
    UE_LOG(LogTemp, Log, TEXT("[Features] Production preset applied — critical flags LOCKED"));
}

void UKhaaosFeatureFlags::KhaaosFeatureSet(const FString& FlagName, bool bValue)
{
    if (bValue) EnableFlag(FlagName); else DisableFlag(FlagName);
    UE_LOG(LogTemp, Log, TEXT("[Features] Console: %s = %s"), *FlagName, bValue ? TEXT("ON") : TEXT("OFF"));
}

FKhaaosFeatureFlag* UKhaaosFeatureFlags::FindFlag(const FString& FlagName)
{
    for (FKhaaosFeatureFlag& Flag : Flags)
    {
        if (Flag.Name == FlagName) return &Flag;
    }
    return nullptr;
}

const FKhaaosFeatureFlag* UKhaaosFeatureFlags::FindFlag(const FString& FlagName) const
{
    for (const FKhaaosFeatureFlag& Flag : Flags)
    {
        if (Flag.Name == FlagName) return &Flag;
    }
    return nullptr;
}
