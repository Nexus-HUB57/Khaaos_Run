// ============================================================================
// Khaaos Run — CIGKV Level Script Actor Implementation (Fase 1)
// ============================================================================

#include "Game/Level/KhaaosCIGKVLevel.h"
#include "Game/KhaaosGameMode.h"
#include "Game/KhaaosGameState.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/CIGKV/KhaaosCIGKVMapData.h"
#include "AbilitySystemComponent.h"
#include "Net/UnrealNetwork.h"
#include "Engine/DataTable.h"
#include "Kismet/GameplayStatics.h"

// ─── Constructor ──────────────────────────────────────────────────────────────

AKhaaosCIGKVLevel::AKhaaosCIGKVLevel()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = true;

    // Default CIGKV parameters (3-hour Ring, 50 players)
    MaxPlayers = 50;
    RingDuration = 10800.0f;      // 3 hours
    EntryBlockTime = 300.0f;      // Block entry in last 5 minutes
    PulsoKhaaosInterval = 600.0f; // 10 minutes between pulsos
    InactivityThreshold = 120.0f; // 2 minutes of inactivity
    InactivityDamagePerSecond = 2.0f;
    bArsenalNoPatenteLimits = true;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

void AKhaaosCIGKVLevel::BeginPlay()
{
    Super::BeginPlay();

    // Initialize map data from DataTable
    InitializeMapData();

    // Find or spawn the SafeZone actor
    TArray<AActor*> SafeZones;
    UGameplayStatics::GetAllActorsOfClass(GetWorld(), AKhaaosSafeZone::StaticClass(), SafeZones);
    if (SafeZones.Num() > 0)
    {
        SafeZone = Cast<AKhaaosSafeZone>(SafeZones[0]);
    }

    // Start the zone sequence
    if (HasAuthority())
    {
        StartZoneSequence();
    }

    UE_LOG(LogTemp, Log, TEXT("[CIGKV] Level started — MaxPlayers=%d, Duration=%.0fs, PulsoInterval=%.0fs"),
        MaxPlayers, RingDuration, PulsoKhaaosInterval);
}

void AKhaaosCIGKVLevel::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    if (!HasAuthority()) return;

    // Track elapsed time
    ElapsedTime += DeltaSeconds;

    // Check if Ring has ended
    if (ElapsedTime >= RingDuration)
    {
        UE_LOG(LogTemp, Log, TEXT("[CIGKV] Ring duration reached (%.0fs). Ring complete."), ElapsedTime);
        // GameMode handles end-of-ring logic
        return;
    }

    // Pulso Khaaos — every 10 minutes
    TimeSinceLastPulso += DeltaSeconds;
    if (TimeSinceLastPulso >= PulsoKhaaosInterval)
    {
        TimeSinceLastPulso = 0.0f;
        SpawnPulsoKhaaosDrop();

        // Alternate: climate change OR legendary drop
        if (FMath::RandBool())
        {
            UE_LOG(LogTemp, Log, TEXT("[CIGKV] Pulso Khaaos: Climate change triggered"));
            // Climate change handled by VFX manager
        }
    }

    // Update ZEX activation based on current zone
    UpdateZEXActivation();

    // Process inactivity punishment
    ProcessInactivityPunishment(DeltaSeconds);
}

// ─── Zone Management ─────────────────────────────────────────────────────────

void AKhaaosCIGKVLevel::StartZoneSequence()
{
    if (ZonePhases.Num() == 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("[CIGKV] No zone phases configured!"));
        return;
    }

    CurrentZonePhase = 0;
    UE_LOG(LogTemp, Log, TEXT("[CIGKV] Zone sequence started — %d phases"), ZonePhases.Num());

    // Set timer for first phase advancement
    if (ZonePhases.Num() > 1)
    {
        float NextPhaseTime = ZonePhases[1].PhaseStartTime;
        GetWorldTimerManager().SetTimer(ZonePhaseTimer, this,
            &AKhaaosCIGKVLevel::AdvanceZonePhase,
            NextPhaseTime, false);
    }
}

void AKhaaosCIGKVLevel::AdvanceZonePhase()
{
    CurrentZonePhase++;

    if (CurrentZonePhase >= ZonePhases.Num())
    {
        UE_LOG(LogTemp, Log, TEXT("[CIGKV] Final zone phase reached"));
        return;
    }

    const FCIGKVZonePhase& Phase = ZonePhases[CurrentZonePhase];
    UE_LOG(LogTemp, Log, TEXT("[CIGKV] Zone phase %d — Center=(%s), Radius=%.0f, Damage=%.1f/s"),
        Phase.PhaseIndex, *Phase.ZoneCenter.ToString(), Phase.ZoneRadius, Phase.ZoneDamagePerSecond);

    // Update SafeZone if available
    if (SafeZone)
    {
        SafeZone->SetZoneCenter(Phase.ZoneCenter);
        SafeZone->SetZoneRadius(Phase.ZoneRadius);
        SafeZone->SetZoneDamage(Phase.ZoneDamagePerSecond);
    }

    // Spawn loot for this phase
    SpawnPhaseLoot();

    // Set timer for next phase
    if (CurrentZonePhase + 1 < ZonePhases.Num())
    {
        float TimeToNext = ZonePhases[CurrentZonePhase + 1].PhaseStartTime - ElapsedTime;
        if (TimeToNext > 0.0f)
        {
            GetWorldTimerManager().SetTimer(ZonePhaseTimer, this,
                &AKhaaosCIGKVLevel::AdvanceZonePhase,
                TimeToNext, false);
        }
    }
}

// ─── Loot Spawning ───────────────────────────────────────────────────────────

void AKhaaosCIGKVLevel::SpawnPhaseLoot()
{
    if (CurrentZonePhase >= ZonePhases.Num()) return;

    const FCIGKVZonePhase& Phase = ZonePhases[CurrentZonePhase];
    if (!MapData) return;

    // Get random loot spawn points from map data
    TArray<FVector> SpawnPoints = MapData->GetRandomLootSpawnPoints(Phase.LootDropCount, Phase.ZoneCenter, Phase.ZoneRadius);

    for (const FVector& Point : SpawnPoints)
    {
        AKhaaosLootPickup* Loot = SpawnLootAt(Point, FRotator::ZeroRotator);
        if (Loot)
        {
            ActiveLootPickups.Add(Loot);
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[CIGKV] Spawned %d loot items for phase %d"), SpawnPoints.Num(), Phase.PhaseIndex);
}

void AKhaaosCIGKVLevel::SpawnPulsoKhaaosDrop()
{
    if (!MapData) return;

    // Pulso drops a legendary item at a random position within the current zone
    FVector DropLocation = MapData->GetRandomPointInZone(
        ZonePhases[CurrentZonePhase].ZoneCenter,
        ZonePhases[CurrentZonePhase].ZoneRadius);

    AKhaaosLootPickup* Loot = SpawnLootAt(DropLocation, FRotator::ZeroRotator);
    if (Loot)
    {
        // Override rarity to Legendary for Pulso drops
        Loot->SetRarity(EItemRarity::Legendary);
        ActiveLootPickups.Add(Loot);
        UE_LOG(LogTemp, Log, TEXT("[CIGKV] Pulso Khaaos: Legendary drop at (%s)"), *DropLocation.ToString());
    }
}

AKhaaosLootPickup* AKhaaosCIGKVLevel::SpawnLootAt(const FVector& Location, const FRotator& Rotation)
{
    FActorSpawnParameters SpawnParams;
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

    AKhaaosLootPickup* Loot = GetWorld()->SpawnActor<AKhaaosLootPickup>(
        AKhaaosLootPickup::StaticClass(), Location, Rotation, SpawnParams);

    return Loot;
}

// ─── ZEX Management ──────────────────────────────────────────────────────────

void AKhaaosCIGKVLevel::UpdateZEXActivation()
{
    if (CurrentZonePhase >= ZonePhases.Num()) return;

    const FCIGKVZonePhase& Phase = ZonePhases[CurrentZonePhase];

    for (FCIGKVZEX& ZEX : ZEXPoints)
    {
        // ZEX is active only if it's inside the current safe zone
        float DistToCenter = FVector::Dist(ZEX.Location, Phase.ZoneCenter);
        ZEX.bIsActive = (DistToCenter <= Phase.ZoneRadius);
    }
}

bool AKhaaosCIGKVLevel::PlayerExtractAtZEX(APlayerState* PlayerState, const FGuid& ZEXId)
{
    // Find the ZEX
    FCIGKVZEX* TargetZEX = nullptr;
    for (FCIGKVZEX& ZEX : ZEXPoints)
    {
        if (ZEX.ZEXId == ZEXId)
        {
            TargetZEX = &ZEX;
            break;
        }
    }

    if (!TargetZEX || !TargetZEX->bIsActive)
    {
        UE_LOG(LogTemp, Warning, TEXT("[CIGKV] ZEX %s not found or inactive"), *ZEXId.ToString());
        return false;
    }

    // Apply XP bonus via GAS
    // The AbilitySystemComponent handles the actual XP application
    UE_LOG(LogTemp, Log, TEXT("[CIGKV] Player extracted at ZEX %s (bonus: %.1fx)"),
        *ZEXId.ToString(), TargetZEX->XPBonus);

    return true;
}

// ─── Zu Entry Protocol ───────────────────────────────────────────────────────

void AKhaaosCIGKVLevel::StartZuEntry(APlayerController* PlayerController)
{
    if (!PlayerController || ZuVariants.Num() == 0) return;

    // Select random Zu variant
    int32 VariantIndex = FMath::RandRange(0, ZuVariants.Num() - 1);
    const FCIGKVZuEntry& Zu = ZuVariants[VariantIndex];

    UE_LOG(LogTemp, Log, TEXT("[CIGKV] Zu entry: Variant=%d, Spawn=(%s), Duration=%.1fs"),
        static_cast<int32>(Zu.Variant), *Zu.SpawnPoint.ToString(), Zu.CinematicDuration);

    // Move player to spawn point (cinematic entry)
    if (APawn* Pawn = PlayerController->GetPawn())
    {
        Pawn->SetActorLocation(Zu.SpawnPoint);
        Pawn->SetActorRotation(Zu.SpawnRotation);
    }

    // Cinematic sequence: handled by Blueprint/HUD
    // Player gets a decision pop-up after cinematic
}

void AKhaaosCIGKVLevel::ResolveZuDecision(APlayerController* PlayerController, bool bCorrectDecision)
{
    if (!PlayerController) return;

    if (bCorrectDecision)
    {
        // Correct decision: 0 damage, possible stun/blurred vision (5-7s)
        UE_LOG(LogTemp, Log, TEXT("[CIGKV] Zu: Correct decision — 0 damage, brief stun"));
        // Apply stun effect via GAS
    }
    else
    {
        // Wrong decision: up to -30% health
        UE_LOG(LogTemp, Warning, TEXT("[CIGKV] Zu: Wrong decision — -30%% health penalty"));
        // Apply damage via GAS (30% of max health)
        if (APawn* Pawn = PlayerController->GetPawn())
        {
            if (UAbilitySystemComponent* ASC = Pawn->FindComponentByClass<UAbilitySystemComponent>())
            {
                // Apply damage GameplayEffect (30% of max health)
                // KhaaosEffectApplier handles this
            }
        }
    }
}

// ─── Player Flow ─────────────────────────────────────────────────────────────

bool AKhaaosCIGKVLevel::CanPlayerEnter() const
{
    // Block entry in last 5 minutes of the Ring
    if ((RingDuration - ElapsedTime) <= EntryBlockTime)
    {
        return false;
    }

    // Check capacity
    if (GetAlivePlayerCount() >= MaxPlayers)
    {
        return false;
    }

    return true;
}

int32 AKhaaosCIGKVLevel::GetAlivePlayerCount() const
{
    if (AKhaaosGameMode* GM = GetWorld()->GetAuthGameMode<AKhaaosGameMode>())
    {
        return GM->NumPlayers;
    }
    return 0;
}

// ─── Inactivity System ("dedo-duro") ─────────────────────────────────────────

void AKhaaosCIGKVLevel::ProcessInactivityPunishment(float DeltaSeconds)
{
    // Iterate through all player states and check for inactivity
    // "Dedo-duro" system: rats, mosquitoes, locusts, seagulls
    // punish players who avoid combat

    if (AKhaaosGameMode* GM = GetWorld()->GetAuthGameMode<AKhaaosGameMode>())
    {
        for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
        {
            if (APlayerController* PC = It->Get())
            {
                if (APawn* Pawn = PC->GetPawn())
                {
                    // Check if player has been inactive (not moving, not attacking)
                    // This requires tracking last combat time per player
                    // For now, the structure is here — actual tracking is in KhaaosPlayerState

                    // Apply inactivity damage
                    // DamagePerSecond * DeltaSeconds
                }
            }
        }
    }
}

// ─── Map Data Initialization ─────────────────────────────────────────────────

void AKhaaosCIGKVLevel::InitializeMapData()
{
    // Load map data from DataTable or create defaults
    if (!MapData)
    {
        MapData = NewObject<UKhaaosCIGKVMapData>(this);
    }

    // If ZonePhases not configured, create default CIGKV phases
    if (ZonePhases.Num() == 0)
    {
        // Phase 0: Full map (3h start)
        FCIGKVZonePhase Phase0;
        Phase0.PhaseIndex = 0;
        Phase0.PhaseStartTime = 0.0f;
        Phase0.ZoneCenter = FVector(0.0f, 0.0f, 0.0f);
        Phase0.ZoneRadius = 5000.0f;
        Phase0.ZoneDamagePerSecond = 1.0f;
        Phase0.LootDropCount = 20;
        Phase0.ClimateEffect = TEXT("Clear");
        ZonePhases.Add(Phase0);

        // Phase 1: Proving Grounds focus (1h)
        FCIGKVZonePhase Phase1;
        Phase1.PhaseIndex = 1;
        Phase1.PhaseStartTime = 3600.0f;
        Phase1.ZoneCenter = FVector(1000.0f, 0.0f, 0.0f);
        Phase1.ZoneRadius = 3500.0f;
        Phase1.ZoneDamagePerSecond = 3.0f;
        Phase1.LootDropCount = 15;
        Phase1.ClimateEffect = TEXT("Rain");
        ZonePhases.Add(Phase1);

        // Phase 2: Park center (2h)
        FCIGKVZonePhase Phase2;
        Phase2.PhaseIndex = 2;
        Phase2.PhaseStartTime = 7200.0f;
        Phase2.ZoneCenter = FVector(500.0f, 500.0f, 0.0f);
        Phase2.ZoneRadius = 2000.0f;
        Phase2.ZoneDamagePerSecond = 5.0f;
        Phase2.LootDropCount = 10;
        Phase2.ClimateEffect = TEXT("Fog");
        ZonePhases.Add(Phase2);

        // Phase 3: Endgame — small circle (2h45)
        FCIGKVZonePhase Phase3;
        Phase3.PhaseIndex = 3;
        Phase3.PhaseStartTime = 9900.0f;
        Phase3.ZoneCenter = FVector(300.0f, 300.0f, 0.0f);
        Phase3.ZoneRadius = 800.0f;
        Phase3.ZoneDamagePerSecond = 10.0f;
        Phase3.LootDropCount = 5;
        Phase3.ClimateEffect = TEXT("Storm");
        ZonePhases.Add(Phase3);
    }

    // If ZEX points not configured, create defaults (15 ZEX)
    if (ZEXPoints.Num() == 0)
    {
        // 5 ZEX in Armory Hub (1/8 of map)
        for (int32 i = 0; i < 5; i++)
        {
            FCIGKVZEX ZEX;
            ZEX.ZEXId = FGuid::NewGuid();
            ZEX.Location = FVector(-2000.0f + i * 200.0f, -3000.0f, 0.0f);
            ZEX.InteractionRadius = 200.0f;
            ZEX.bIsActive = true;
            ZEX.XPBonus = 1.0f;
            ZEX.SectorName = TEXT("ArmoryHub");
            ZEXPoints.Add(ZEX);
        }

        // 5 ZEX in Proving Grounds (3/8)
        for (int32 i = 0; i < 5; i++)
        {
            FCIGKVZEX ZEX;
            ZEX.ZEXId = FGuid::NewGuid();
            ZEX.Location = FVector(0.0f + i * 300.0f, 0.0f, 0.0f);
            ZEX.InteractionRadius = 200.0f;
            ZEX.bIsActive = true;
            ZEX.XPBonus = 1.2f;
            ZEX.SectorName = TEXT("ProvingGrounds");
            ZEXPoints.Add(ZEX);
        }

        // 5 ZEX in Park (4/8)
        for (int32 i = 0; i < 5; i++)
        {
            FCIGKVZEX ZEX;
            ZEX.ZEXId = FGuid::NewGuid();
            ZEX.Location = FVector(2000.0f + i * 300.0f, 2000.0f, 0.0f);
            ZEX.InteractionRadius = 200.0f;
            ZEX.bIsActive = true;
            ZEX.XPBonus = 1.5f;
            ZEX.SectorName = TEXT("Park");
            ZEXPoints.Add(ZEX);
        }
    }

    // If Zu variants not configured, create defaults (3 variants)
    if (ZuVariants.Num() == 0)
    {
        FCIGKVZuEntry Zu1;
        Zu1.Variant = ECIGKVZuVariant::Zu1_Cinto;
        Zu1.SpawnPoint = FVector(-4000.0f, 0.0f, 100.0f);
        Zu1.SpawnRotation = FRotator(0.0f, 90.0f, 0.0f);
        Zu1.WrongDecisionDamage = 0.3f;
        Zu1.CinematicDuration = 8.0f;
        ZuVariants.Add(Zu1);

        FCIGKVZuEntry Zu2;
        Zu2.Variant = ECIGKVZuVariant::Zu2_Saltar;
        Zu2.SpawnPoint = FVector(0.0f, -4000.0f, 100.0f);
        Zu2.SpawnRotation = FRotator(0.0f, 0.0f, 0.0f);
        Zu2.WrongDecisionDamage = 0.25f;
        Zu2.CinematicDuration = 6.0f;
        ZuVariants.Add(Zu2);

        FCIGKVZuEntry Zu3;
        Zu3.Variant = ECIGKVZuVariant::Zu3_Mascara;
        Zu3.SpawnPoint = FVector(4000.0f, 4000.0f, 500.0f);
        Zu3.SpawnRotation = FRotator(0.0f, -135.0f, 0.0f);
        Zu3.WrongDecisionDamage = 0.3f;
        Zu3.CinematicDuration = 7.0f;
        ZuVariants.Add(Zu3);
    }

    UE_LOG(LogTemp, Log, TEXT("[CIGKV] Map data initialized — %d phases, %d ZEX, %d Zu variants"),
        ZonePhases.Num(), ZEXPoints.Num(), ZuVariants.Num());
}

// ─── Replication ──────────────────────────────────────────────────────────────

void AKhaaosCIGKVLevel::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME(AKhaaosCIGKVLevel, CurrentZonePhase);
    DOREPLIFETIME(AKhaaosCIGKVLevel, ElapsedTime);
}
