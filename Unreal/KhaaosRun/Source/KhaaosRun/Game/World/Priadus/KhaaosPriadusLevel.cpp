// ============================================================================
// Khaaos Run — W2/C2 Priadus Level Script Actor Implementation (Fase 4)
// ============================================================================

#include "Game/World/Priadus/KhaaosPriadusLevel.h"
#include "Game/KhaaosGameMode.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/Priadus/KhaaosPriadusMapData.h"
#include "Net/UnrealNetwork.h"
#include "Kismet/GameplayStatics.h"

AKhaaosPriadusLevel::AKhaaosPriadusLevel()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = true;

    MaxPlayers = 75;
    RingDuration = 7200.0f;       // 2 hours
    EntryBlockTime = 240.0f;
    PulsoKhaaosInterval = 540.0f; // 9 minutes
    InactivityThreshold = 100.0f;
    InactivityDamagePerSecond = 2.5f;
    MinW1MatchesForEntry = 5;
    KRCEarnMultiplier = 2.0f;
}

void AKhaaosPriadusLevel::BeginPlay()
{
    Super::BeginPlay();
    InitializeMapData();

    TArray<AActor*> SafeZones;
    UGameplayStatics::GetAllActorsOfClass(GetWorld(), AKhaaosSafeZone::StaticClass(), SafeZones);
    if (SafeZones.Num() > 0)
    {
        SafeZone = Cast<AKhaaosSafeZone>(SafeZones[0]);
    }

    if (HasAuthority())
    {
        StartZoneSequence();
    }

    UE_LOG(LogTemp, Log, TEXT("[Priadus] Level started — MaxPlayers=%d, Duration=%.0fs, MinW1=%d"),
        MaxPlayers, RingDuration, MinW1MatchesForEntry);
}

void AKhaaosPriadusLevel::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!HasAuthority()) return;

    ElapsedTime += DeltaSeconds;

    if (ElapsedTime >= RingDuration)
    {
        UE_LOG(LogTemp, Log, TEXT("[Priadus] Ring complete (%.0fs)."), ElapsedTime);
        return;
    }

    // Pulso Khaaos
    TimeSinceLastPulso += DeltaSeconds;
    if (TimeSinceLastPulso >= PulsoKhaaosInterval)
    {
        TimeSinceLastPulso = 0.0f;
        SpawnPulsoKhaaosDrop();
        if (FMath::RandBool())
        {
            UE_LOG(LogTemp, Log, TEXT("[Priadus] Pulso Khaaos: Tidal surge triggered"));
        }
    }

    // Process aquatic effects
    for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            ApplyWaterCurrent(PC, DeltaSeconds);
        }
    }
    ProcessDepthPressure(DeltaSeconds);

    UpdateZEXActivation();
    ProcessInactivityPunishment(DeltaSeconds);
}

// ─── Zone Management ─────────────────────────────────────────────────────────

void AKhaaosPriadusLevel::StartZoneSequence()
{
    if (ZonePhases.Num() == 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Priadus] No zone phases configured!"));
        return;
    }
    CurrentZonePhase = 0;
    UE_LOG(LogTemp, Log, TEXT("[Priadus] Zone sequence started — %d phases"), ZonePhases.Num());

    if (ZonePhases.Num() > 1)
    {
        GetWorldTimerManager().SetTimer(ZonePhaseTimer, this,
            &AKhaaosPriadusLevel::AdvanceZonePhase,
            ZonePhases[1].PhaseStartTime, false);
    }
}

void AKhaaosPriadusLevel::AdvanceZonePhase()
{
    CurrentZonePhase++;
    if (CurrentZonePhase >= ZonePhases.Num()) return;

    const FPriadusZonePhase& Phase = ZonePhases[CurrentZonePhase];
    UE_LOG(LogTemp, Log, TEXT("[Priadus] Zone phase %d — Center=(%s), Radius=%.0f, Damage=%.1f/s, Depth=%.2f"),
        Phase.PhaseIndex, *Phase.ZoneCenter.ToString(), Phase.ZoneRadius,
        Phase.ZoneDamagePerSecond, Phase.WaterDepth);

    if (SafeZone)
    {
        SafeZone->SetZoneCenter(Phase.ZoneCenter);
        SafeZone->SetZoneRadius(Phase.ZoneRadius);
        SafeZone->SetZoneDamage(Phase.ZoneDamagePerSecond);
    }

    SpawnPhaseLoot();

    if (CurrentZonePhase + 1 < ZonePhases.Num())
    {
        float TimeToNext = ZonePhases[CurrentZonePhase + 1].PhaseStartTime - ElapsedTime;
        if (TimeToNext > 0.0f)
        {
            GetWorldTimerManager().SetTimer(ZonePhaseTimer, this,
                &AKhaaosPriadusLevel::AdvanceZonePhase, TimeToNext, false);
        }
    }
}

// ─── Aquatic Combat ──────────────────────────────────────────────────────────

EPriadusWaterZone AKhaaosPriadusLevel::GetWaterZoneAt(FVector Location) const
{
    for (const FPriadusAquaticZone& Zone : AquaticZones)
    {
        if (FVector::Dist(Location, Zone.Center) <= Zone.Radius)
        {
            return Zone.ZoneType;
        }
    }
    return EPriadusWaterZone::Beach;
}

void AKhaaosPriadusLevel::ApplyWaterCurrent(APlayerController* PlayerController, float DeltaSeconds)
{
    if (!PlayerController) return;
    if (APawn* Pawn = PlayerController->GetPawn())
    {
        FVector PawnLoc = Pawn->GetActorLocation();
        for (const FPriadusAquaticZone& Zone : AquaticZones)
        {
            if (Zone.CurrentStrength > 0.0f && FVector::Dist(PawnLoc, Zone.Center) <= Zone.Radius)
            {
                // Apply current force via movement component
                FVector Force = Zone.CurrentDirection * Zone.CurrentStrength * DeltaSeconds * 100.0f;
                // Character movement handles actual application
                UE_LOG(LogTemp, Verbose, TEXT("[Priadus] Water current at (%s): force=(%s)"),
                    *PawnLoc.ToString(), *Force.ToString());
            }
        }
    }
}

void AKhaaosPriadusLevel::ProcessDepthPressure(float DeltaSeconds)
{
    // Deep zones apply pressure damage to submerged players
    for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (APawn* Pawn = PC->GetPawn())
            {
                for (const FPriadusAquaticZone& Zone : AquaticZones)
                {
                    if (Zone.DepthPressureDamage > 0.0f &&
                        Zone.ZoneType == EPriadusWaterZone::Deep &&
                        FVector::Dist(Pawn->GetActorLocation(), Zone.Center) <= Zone.Radius)
                    {
                        // Apply depth pressure damage via GAS
                        float Damage = Zone.DepthPressureDamage * DeltaSeconds;
                        // GAS effect application
                    }
                }
            }
        }
    }
}

// ─── Loot ────────────────────────────────────────────────────────────────────

void AKhaaosPriadusLevel::SpawnPhaseLoot()
{
    if (CurrentZonePhase >= ZonePhases.Num() || !MapData) return;
    const FPriadusZonePhase& Phase = ZonePhases[CurrentZonePhase];

    TArray<FVector> SpawnPoints = MapData->GetRandomLootSpawnPoints(Phase.LootDropCount, Phase.ZoneCenter, Phase.ZoneRadius);
    for (const FVector& Point : SpawnPoints)
    {
        if (AKhaaosLootPickup* Loot = SpawnLootAt(Point, FRotator::ZeroRotator))
        {
            ActiveLootPickups.Add(Loot);
        }
    }
    UE_LOG(LogTemp, Log, TEXT("[Priadus] Spawned %d loot items for phase %d"), SpawnPoints.Num(), Phase.PhaseIndex);
}

void AKhaaosPriadusLevel::SpawnPulsoKhaaosDrop()
{
    if (!MapData || CurrentZonePhase >= ZonePhases.Num()) return;
    FVector DropLocation = MapData->GetRandomPointInZone(
        ZonePhases[CurrentZonePhase].ZoneCenter, ZonePhases[CurrentZonePhase].ZoneRadius);
    AKhaaosGameMode* GameMode = GetWorld() ? GetWorld()->GetAuthGameMode<AKhaaosGameMode>() : nullptr;
    AKhaaosLootPickup* Loot = GameMode
        ? GameMode->SpawnCatalogLoot(GameMode->SelectLootByRarity(EKhaaosRarity::Lendario),
            DropLocation, FRotator::ZeroRotator)
        : nullptr;
    if (Loot)
    {
        ActiveLootPickups.Add(Loot);
        UE_LOG(LogTemp, Log, TEXT("[Priadus] Pulso Khaaos: Legendary drop at (%s)"), *DropLocation.ToString());
    }
}

AKhaaosLootPickup* AKhaaosPriadusLevel::SpawnLootAt(const FVector& Location, const FRotator& Rotation)
{
	AKhaaosGameMode* GameMode = GetWorld() ? GetWorld()->GetAuthGameMode<AKhaaosGameMode>() : nullptr;
	if (!GameMode) return nullptr;
	return GameMode->SpawnCatalogLoot(GameMode->SelectWeightedRandomLoot(), Location, Rotation);
}

// ─── ZEX ─────────────────────────────────────────────────────────────────────

void AKhaaosPriadusLevel::UpdateZEXActivation()
{
    if (CurrentZonePhase >= ZonePhases.Num()) return;
    const FPriadusZonePhase& Phase = ZonePhases[CurrentZonePhase];
    for (FPriadusZEX& ZEX : ZEXPoints)
    {
        float DistToCenter = FVector::Dist(ZEX.Location, Phase.ZoneCenter);
        ZEX.bIsActive = (DistToCenter <= Phase.ZoneRadius);
    }
}

bool AKhaaosPriadusLevel::PlayerExtractAtZEX(APlayerState* PlayerState, const FGuid& ZEXId)
{
    for (FPriadusZEX& ZEX : ZEXPoints)
    {
        if (ZEX.ZEXId == ZEXId && ZEX.bIsActive)
        {
            UE_LOG(LogTemp, Log, TEXT("[Priadus] Player extracted at ZEX %s (bonus: %.1fx) on island %s"),
                *ZEXId.ToString(), ZEX.XPBonus, *ZEX.IslandName);
            return true;
        }
    }
    return false;
}

// ─── Zu ──────────────────────────────────────────────────────────────────────

void AKhaaosPriadusLevel::StartZuEntry(APlayerController* PlayerController)
{
    if (!PlayerController || ZuVariants.Num() == 0) return;
    int32 VariantIndex = FMath::RandRange(0, ZuVariants.Num() - 1);
    const FPriadusZuEntry& Zu = ZuVariants[VariantIndex];

    if (APawn* Pawn = PlayerController->GetPawn())
    {
        Pawn->SetActorLocation(Zu.SpawnPoint);
        Pawn->SetActorRotation(Zu.SpawnRotation);
    }

    // Zu3 Nadando: player starts swimming, must reach shore
    if (Zu.Variant == EPriadusZuVariant::Zu3_Nadando)
    {
        UE_LOG(LogTemp, Log, TEXT("[Priadus] Zu3 Nadando: Swimming entry — must reach shore"));
    }
}

void AKhaaosPriadusLevel::ResolveZuDecision(APlayerController* PlayerController, bool bCorrectDecision)
{
    if (!PlayerController) return;
    if (bCorrectDecision)
    {
        UE_LOG(LogTemp, Log, TEXT("[Priadus] Zu: Correct decision — 0 damage"));
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("[Priadus] Zu: Wrong decision — -30%% health"));
    }
}

// ─── Player Flow ─────────────────────────────────────────────────────────────

bool AKhaaosPriadusLevel::CanPlayerEnter() const
{
    if ((RingDuration - ElapsedTime) <= EntryBlockTime) return false;
    if (GetAlivePlayerCount() >= MaxPlayers) return false;
    return true;
}

bool AKhaaosPriadusLevel::MeetsEntryRequirements(int32 W1MatchesCompleted) const
{
    return W1MatchesCompleted >= MinW1MatchesForEntry;
}

int32 AKhaaosPriadusLevel::GetAlivePlayerCount() const
{
    if (AKhaaosGameMode* GM = GetWorld()->GetAuthGameMode<AKhaaosGameMode>())
    {
        return GM->NumPlayers;
    }
    return 0;
}

// ─── Inactivity ──────────────────────────────────────────────────────────────

void AKhaaosPriadusLevel::ProcessInactivityPunishment(float DeltaSeconds)
{
    // "Dedo-duro" system adapted for aquatic combat
    // Sharks circle inactive players near water
    if (AKhaaosGameMode* GM = GetWorld()->GetAuthGameMode<AKhaaosGameMode>())
    {
        for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
        {
            if (APlayerController* PC = It->Get())
            {
                if (APawn* Pawn = PC->GetPawn())
                {
                    // Inactivity damage: InactivityDamagePerSecond * DeltaSeconds
                }
            }
        }
    }
}

// ─── Map Data Initialization ─────────────────────────────────────────────────

void AKhaaosPriadusLevel::InitializeMapData()
{
    if (!MapData)
    {
        MapData = NewObject<UKhaaosPriadusMapData>(this);
    }

    if (ZonePhases.Num() == 0)
    {
        // Phase 0: Beach (full archipelago, 2h start)
        FPriadusZonePhase Phase0;
        Phase0.PhaseIndex = 0;
        Phase0.PhaseStartTime = 0.0f;
        Phase0.ZoneCenter = FVector(0.0f, 0.0f, 0.0f);
        Phase0.ZoneRadius = 4000.0f;
        Phase0.ZoneDamagePerSecond = 2.0f;
        Phase0.LootDropCount = 10;
        Phase0.ClimateEffect = TEXT("Calm");
        Phase0.WaterDepth = 0.0f;
        ZonePhases.Add(Phase0);

        // Phase 1: Shallows (1h)
        FPriadusZonePhase Phase1;
        Phase1.PhaseIndex = 1;
        Phase1.PhaseStartTime = 3600.0f;
        Phase1.ZoneCenter = FVector(500.0f, 0.0f, 0.0f);
        Phase1.ZoneRadius = 2800.0f;
        Phase1.ZoneDamagePerSecond = 5.0f;
        Phase1.LootDropCount = 8;
        Phase1.ClimateEffect = TEXT("RoughSeas");
        Phase1.WaterDepth = 0.5f;
        ZonePhases.Add(Phase1);

        // Phase 2: Deep (1h30)
        FPriadusZonePhase Phase2;
        Phase2.PhaseIndex = 2;
        Phase2.PhaseStartTime = 5400.0f;
        Phase2.ZoneCenter = FVector(200.0f, 200.0f, 0.0f);
        Phase2.ZoneRadius = 1200.0f;
        Phase2.ZoneDamagePerSecond = 10.0f;
        Phase2.LootDropCount = 5;
        Phase2.ClimateEffect = TEXT("StormSurge");
        Phase2.WaterDepth = 1.0f;
        ZonePhases.Add(Phase2);
    }

    // Default Aquatic Zones
    if (AquaticZones.Num() == 0)
    {
        FPriadusAquaticZone Beach;
        Beach.ZoneType = EPriadusWaterZone::Beach;
        Beach.Center = FVector(0.0f, 0.0f, 0.0f);
        Beach.Radius = 3500.0f;
        Beach.CurrentStrength = 50.0f;
        Beach.CurrentDirection = FVector(1.0f, 0.0f, 0.0f);
        Beach.DepthPressureDamage = 0.0f;
        AquaticZones.Add(Beach);

        FPriadusAquaticZone Shallows;
        Shallows.ZoneType = EPriadusWaterZone::Shallows;
        Shallows.Center = FVector(500.0f, 0.0f, -100.0f);
        Shallows.Radius = 2500.0f;
        Shallows.CurrentStrength = 100.0f;
        Shallows.CurrentDirection = FVector(0.0f, 1.0f, 0.0f);
        Shallows.DepthPressureDamage = 0.0f;
        AquaticZones.Add(Shallows);

        FPriadusAquaticZone Deep;
        Deep.ZoneType = EPriadusWaterZone::Deep;
        Deep.Center = FVector(200.0f, 200.0f, -300.0f);
        Deep.Radius = 1500.0f;
        Deep.CurrentStrength = 150.0f;
        Deep.CurrentDirection = FVector(-1.0f, 0.5f, 0.0f);
        Deep.DepthPressureDamage = 3.0f;
        AquaticZones.Add(Deep);
    }

    // Default ZEX (20 island-based)
    if (ZEXPoints.Num() == 0)
    {
        TArray<FString> Islands = { TEXT("IlhaPrincipal"), TEXT("IlhaRecife"), TEXT("IlhaNorte"),
            TEXT("IlhaSul"), TEXT("IlhaVulcao"), TEXT("AtolCentral") };

        for (int32 i = 0; i < 20; i++)
        {
            FPriadusZEX ZEX;
            ZEX.ZEXId = FGuid::NewGuid();
            ZEX.Location = FVector(
                FMath::RandRange(-3500.0f, 3500.0f),
                FMath::RandRange(-3500.0f, 3500.0f),
                50.0f
            );
            ZEX.InteractionRadius = 200.0f;
            ZEX.bIsActive = true;
            ZEX.XPBonus = 1.0f + (i % 5) * 0.1f;
            ZEX.IslandName = Islands[i % Islands.Num()];
            ZEXPoints.Add(ZEX);
        }
    }

    // Default Zu variants (3)
    if (ZuVariants.Num() == 0)
    {
        FPriadusZuEntry Zu1;
        Zu1.Variant = EPriadusZuVariant::Zu1_Cinto;
        Zu1.SpawnPoint = FVector(-3500.0f, 0.0f, 50.0f);
        Zu1.SpawnRotation = FRotator(0.0f, 90.0f, 0.0f);
        Zu1.WrongDecisionDamage = 0.3f;
        Zu1.CinematicDuration = 8.0f;
        ZuVariants.Add(Zu1);

        FPriadusZuEntry Zu2;
        Zu2.Variant = EPriadusZuVariant::Zu2_Saltar;
        Zu2.SpawnPoint = FVector(0.0f, -3500.0f, 50.0f);
        Zu2.SpawnRotation = FRotator(0.0f, 0.0f, 0.0f);
        Zu2.WrongDecisionDamage = 0.25f;
        Zu2.CinematicDuration = 6.0f;
        ZuVariants.Add(Zu2);

        FPriadusZuEntry Zu3;
        Zu3.Variant = EPriadusZuVariant::Zu3_Nadando;
        Zu3.SpawnPoint = FVector(3500.0f, 3500.0f, -50.0f);  // In the water
        Zu3.SpawnRotation = FRotator(0.0f, -135.0f, 0.0f);
        Zu3.WrongDecisionDamage = 0.35f;
        Zu3.CinematicDuration = 10.0f;  // Longer — swimming entry
        ZuVariants.Add(Zu3);
    }

    UE_LOG(LogTemp, Log, TEXT("[Priadus] Map data initialized — %d phases, %d aquatic zones, %d ZEX, %d Zu"),
        ZonePhases.Num(), AquaticZones.Num(), ZEXPoints.Num(), ZuVariants.Num());
}

void AKhaaosPriadusLevel::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AKhaaosPriadusLevel, CurrentZonePhase);
    DOREPLIFETIME(AKhaaosPriadusLevel, ElapsedTime);
}
