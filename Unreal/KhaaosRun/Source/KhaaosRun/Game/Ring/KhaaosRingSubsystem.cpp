// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Ring Subsystem — Global ring config provider, world pipeline tracker

#include "Game/Ring/KhaaosRingSubsystem.h"#include "Misc/ConfigCacheIni.h"

void UKhaaosRingSubsystem::Initialize(FSubsystemCollectionInitializeParams& DeinitParams)
{
    Super::Initialize(DeinitParams);

    // Initialize world pipeline order
    PipelineOrder.Empty();
    PipelineOrder.Add(EKhaaosWorld::CIGKV);
    PipelineOrder.Add(EKhaaosWorld::W1_BARBURHEN);
    PipelineOrder.Add(EKhaaosWorld::W2_PRIADUS);
    PipelineOrder.Add(EKhaaosWorld::W3_CKESALTH);
    PipelineOrder.Add(EKhaaosWorld::W4_ARUKHEEA);

    // Load ring configs for each world from JSON or INI
    LoadWorldConfigs();

    UE_LOG(LogTemp, Log, TEXT("RingSubsystem: Initialized with %d worlds in pipeline"), PipelineOrder.Num());
}

void UKhaaosRingSubsystem::Deinitialize()
{
    WorldConfigs.Empty();
    PipelineOrder.Empty();
    Super::Deinitialize();
}

void UKhaaosRingSubsystem::LoadWorldConfigs_Implementation()
{
    // ─── CIGKV Hub ─────────────────────────────────────────────────────────
    {
        FRingWorldConfig Config;
        Config.WorldId = EKhaaosWorld::CIGKV;
        Config.WorldName = TEXT("CIGKV Hub");
        Config.Capacity = 50;
        Config.RingPhases = 2;

        // Phase 1: R500->R200, 120s, 1 dmg
        FRingPhase P1;
        P1.PhaseIndex = 0; P1.RadiusStart = 500.f; P1.RadiusEnd = 200.f;
        P1.DurationSeconds = 120.f; P1.DamagePerTick = 1.f; P1.ShrinkSpeed = 0.5f;
        Config.Phases.Add(P1);

        // Phase 2: R200->R50, 90s, 3 dmg
        FRingPhase P2;
        P2.PhaseIndex = 1; P2.RadiusStart = 200.f; P2.RadiusEnd = 50.f;
        P2.DurationSeconds = 90.f; P2.DamagePerTick = 3.f; P2.ShrinkSpeed = 1.0f;
        Config.Phases.Add(P2);

        WorldConfigs.Add(EKhaaosWorld::CIGKV, Config);
    }

    // ─── W1 Barburhen ──────────────────────────────────────────────────────
    {
        FRingWorldConfig Config;
        Config.WorldId = EKhaaosWorld::W1_BARBURHEN;
        Config.WorldName = TEXT("Barburhen");
        Config.Capacity = 100;
        Config.RingPhases = 6;

        const float Starts[] = {800, 600, 400, 250, 120, 40};
        const float Ends[]   = {600, 400, 250, 120, 40, 0};
        const float Durs[]   = {180, 150, 120, 90, 60, 30};
        const float Dmg[]    = {1, 2, 3, 5, 8, 15};
        const float Spd[]    = {0.8f, 1.0f, 1.2f, 1.5f, 2.0f, 3.0f};

        for (int32 i = 0; i < 6; i++)
        {
            FRingPhase P;
            P.PhaseIndex = i; P.RadiusStart = Starts[i]; P.RadiusEnd = Ends[i];
            P.DurationSeconds = Durs[i]; P.DamagePerTick = Dmg[i]; P.ShrinkSpeed = Spd[i];
            Config.Phases.Add(P);
        }

        // Water zones
        FWaterZone River;
        River.Type = TEXT("river"); River.Center = FVector(200, 0, 400);
        River.Radius = 80.f; River.Depth = 3.f; River.DamageModifier = 0.5f;
        Config.WaterZones.Add(River);

        FWaterZone Lake;
        Lake.Type = TEXT("lake"); Lake.Center = FVector(500, 0, 100);
        Lake.Radius = 120.f; Lake.Depth = 5.f; Lake.DamageModifier = 0.3f;
        Config.WaterZones.Add(Lake);

        WorldConfigs.Add(EKhaaosWorld::W1_BARBURHEN, Config);
    }

    // ─── W2 Priadus ────────────────────────────────────────────────────────
    {
        FRingWorldConfig Config;
        Config.WorldId = EKhaaosWorld::W2_PRIADUS;
        Config.WorldName = TEXT("Priadus");
        Config.Capacity = 75;
        Config.RingPhases = 5;

        const float Starts[] = {700, 500, 300, 150, 50};
        const float Ends[]   = {500, 300, 150, 50, 0};
        const float Durs[]   = {160, 130, 100, 70, 40};
        const float Dmg[]    = {1, 2, 4, 7, 12};
        const float Spd[]    = {0.9f, 1.1f, 1.4f, 1.8f, 2.5f};

        for (int32 i = 0; i < 5; i++)
        {
            FRingPhase P;
            P.PhaseIndex = i; P.RadiusStart = Starts[i]; P.RadiusEnd = Ends[i];
            P.DurationSeconds = Durs[i]; P.DamagePerTick = Dmg[i]; P.ShrinkSpeed = Spd[i];
            Config.Phases.Add(P);
        }

        FWaterZone Flooded;
        Flooded.Type = TEXT("flooded"); Flooded.Center = FVector(300, 0, 300);
        Flooded.Radius = 200.f; Flooded.Depth = 1.5f; Flooded.DamageModifier = 0.7f;
        Config.WaterZones.Add(Flooded);

        WorldConfigs.Add(EKhaaosWorld::W2_PRIADUS, Config);
    }

    // ─── W3 Ckesalth ────────────────────────────────────────────────────────
    {
        FRingWorldConfig Config;
        Config.WorldId = EKhaaosWorld::W3_CKESALTH;
        Config.WorldName = TEXT("Ckesalth");
        Config.Capacity = 60;
        Config.RingPhases = 4;

        const float Starts[] = {600, 400, 200, 80};
        const float Ends[]   = {400, 200, 80, 0};
        const float Durs[]   = {140, 110, 80, 45};
        const float Dmg[]    = {2, 4, 7, 15};
        const float Spd[]    = {1.0f, 1.3f, 1.7f, 2.5f};

        for (int32 i = 0; i < 4; i++)
        {
            FRingPhase P;
            P.PhaseIndex = i; P.RadiusStart = Starts[i]; P.RadiusEnd = Ends[i];
            P.DurationSeconds = Durs[i]; P.DamagePerTick = Dmg[i]; P.ShrinkSpeed = Spd[i];
            Config.Phases.Add(P);
        }

        // No water zones in Ckesalth (desert nuclear)
        WorldConfigs.Add(EKhaaosWorld::W3_CKESALTH, Config);
    }

    // ─── W4 Arukheea ────────────────────────────────────────────────────────
    {
        FRingWorldConfig Config;
        Config.WorldId = EKhaaosWorld::W4_ARUKHEEA;
        Config.WorldName = TEXT("Arukheea");
        Config.Capacity = 80;
        Config.RingPhases = 5;

        const float Starts[] = {750, 550, 350, 180, 60};
        const float Ends[]   = {550, 350, 180, 60, 0};
        const float Durs[]   = {170, 140, 110, 75, 35};
        const float Dmg[]    = {1, 3, 5, 8, 15};
        const float Spd[]    = {0.85f, 1.1f, 1.4f, 1.9f, 3.0f};

        for (int32 i = 0; i < 5; i++)
        {
            FRingPhase P;
            P.PhaseIndex = i; P.RadiusStart = Starts[i]; P.RadiusEnd = Ends[i];
            P.DurationSeconds = Durs[i]; P.DamagePerTick = Dmg[i]; P.ShrinkSpeed = Spd[i];
            Config.Phases.Add(P);
        }

        FWaterZone Ocean;
        Ocean.Type = TEXT("ocean_shelf"); Ocean.Center = FVector(0, 0, 600);
        Ocean.Radius = 300.f; Ocean.Depth = 8.f; Ocean.DamageModifier = 0.4f;
        Config.WaterZones.Add(Ocean);

        FWaterZone Mangrove;
        Mangrove.Type = TEXT("mangrove"); Mangrove.Center = FVector(400, 0, 200);
        Mangrove.Radius = 100.f; Mangrove.Depth = 2.f; Mangrove.DamageModifier = 0.6f;
        Config.WaterZones.Add(Mangrove);

        WorldConfigs.Add(EKhaaosWorld::W4_ARUKHEEA, Config);
    }
}

FRingWorldConfig UKhaaosRingSubsystem::GetRingConfig(EKhaaosWorld WorldId) const
{
    if (const FRingWorldConfig* Config = WorldConfigs.Find(WorldId))
    {
        return *Config;
    }
    return FRingWorldConfig();
}

TArray<FRingPhase> UKhaaosRingSubsystem::GetPhasesForWorld(EKhaaosWorld WorldId) const
{
    if (const FRingWorldConfig* Config = WorldConfigs.Find(WorldId))
    {
        return Config->Phases;
    }
    return TArray<FRingPhase>();
}

EKhaaosWorld UKhaaosRingSubsystem::GetNextWorldInPipeline(EKhaaosWorld Current) const
{
    for (int32 i = 0; i < PipelineOrder.Num(); i++)
    {
        if (PipelineOrder[i] == Current && i + 1 < PipelineOrder.Num())
        {
            return PipelineOrder[i + 1];
        }
    }
    // At end of pipeline or not found — return first world (loop back)
    return PipelineOrder.Num() > 0 ? PipelineOrder[0] : EKhaaosWorld::CIGKV;
}

void UKhaaosRingSubsystem::OnWorldTransitionComplete(EKhaaosWorld FromWorld, EKhaaosWorld ToWorld)
{
    UE_LOG(LogTemp, Log,
        TEXT("RingSubsystem: World transition complete %s -> %s"),
        *UEnum::GetValueAsString(FromWorld), *UEnum::GetValueAsString(ToWorld));

    // Clean up old world ring state
    if (FRingWorldConfig* Config = WorldConfigs.Find(FromWorld))
    {
        // Mark world as VOID (closed)
        // Players who didn't transition are eliminated
    }
}
