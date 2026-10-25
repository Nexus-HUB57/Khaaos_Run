// ============================================================================
// Khaaos Run — W1/C1 Barburhen Level Script Actor Implementation (Fase 4)
// ============================================================================

#include "Game/World/Barburhen/KhaaosBarburhenLevel.h"
#include "Game/KhaaosGameMode.h"
#include "Game/KhaaosGameState.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/Barburhen/KhaaosBarburhenMapData.h"
#include "Game/World/Barburhen/KhaaosBarburhenRules.h"
#include "AbilitySystemComponent.h"
#include "Net/UnrealNetwork.h"
#include "Engine/DataTable.h"
#include "Kismet/GameplayStatics.h"

// ─── Constructor ──────────────────────────────────────────────────────────────

AKhaaosBarburhenLevel::AKhaaosBarburhenLevel()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = true;

    // Barburhen — primeiro mundo competitivo (1.5h Ring, 100 players)
    MaxPlayers = 100;
    RingDuration = 5400.0f;       // 1.5 hours
    EntryBlockTime = 180.0f;      // Block entry in last 3 minutes
    PulsoKhaaosInterval = 480.0f; // 8 minutes between pulsos
    InactivityThreshold = 90.0f;  // 1.5 minutes of inactivity (harsher)
    InactivityDamagePerSecond = 3.0f;
    MinCIGKVMatchesForEntry = 10;
    KRCEarnMultiplier = 1.5f;
    bArsenalEnforcesPatente = true;

    // Season defaults (Verão starts)
    SeasonConfig.Season = EBarburhenSeason::Verao;
    SeasonConfig.SeasonDuration = 1800.0f; // 30 min per season
    SeasonConfig.InvernoDamageMultiplier = 1.5f;
    SeasonConfig.InvernoLootBonus = 0.15f;
    SeasonConfig.VeraoLootPenalty = -0.05f;
    SeasonConfig.SeasonElapsed = 0.0f;

    // Giants Challenge defaults
    GiantsChallenge.bIsActive = false;
    GiantsChallenge.QualifyingCount = 50;
    GiantsChallenge.PrizePoolKRC = 100000;
    GiantsChallenge.EventDuration = 600.0f;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

void AKhaaosBarburhenLevel::BeginPlay()
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

    // Start the zone sequence (authority only)
    if (HasAuthority())
    {
        StartZoneSequence();
    }

    UE_LOG(LogTemp, Log, TEXT("[Barburhen] Level started — MaxPlayers=%d, Duration=%.0fs, Season=%s, MinCIGKV=%d"),
        MaxPlayers, RingDuration,
        SeasonConfig.Season == EBarburhenSeason::Verao ? TEXT("Verão") : TEXT("Inverno"),
        MinCIGKVMatchesForEntry);
}

void AKhaaosBarburhenLevel::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    if (!HasAuthority()) return;

    // Track elapsed time
    ElapsedTime += DeltaSeconds;

    // Check if Ring has ended
    if (ElapsedTime >= RingDuration)
    {
        UE_LOG(LogTemp, Log, TEXT("[Barburhen] Ring duration reached (%.0fs). Triggering Giants Challenge."), ElapsedTime);
        TriggerGiantsChallenge();
        return;
    }

    // Pulso Khaaos — every 8 minutes
    TimeSinceLastPulso += DeltaSeconds;
    if (TimeSinceLastPulso >= PulsoKhaaosInterval)
    {
        TimeSinceLastPulso = 0.0f;
        SpawnPulsoKhaaosDrop();

        // Alternate: climate change OR legendary drop
        if (FMath::RandBool())
        {
            UE_LOG(LogTemp, Log, TEXT("[Barburhen] Pulso Khaaos: Climate change triggered (Season: %s)"),
                SeasonConfig.Season == EBarburhenSeason::Verao ? TEXT("Verão") : TEXT("Inverno"));
        }
    }

    // Update season timer
    UpdateSeasonTimer(DeltaSeconds);

    // Update ZEX activation based on current zone
    UpdateZEXActivation();

    // Process inactivity punishment
    ProcessInactivityPunishment(DeltaSeconds);
}

// ─── Zone Management ─────────────────────────────────────────────────────────

void AKhaaosBarburhenLevel::StartZoneSequence()
{
    if (ZonePhases.Num() == 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Barburhen] No zone phases configured!"));
        return;
    }

    CurrentZonePhase = 0;
    UE_LOG(LogTemp, Log, TEXT("[Barburhen] Zone sequence started — %d phases"), ZonePhases.Num());

    // Set timer for first phase advancement
    if (ZonePhases.Num() > 1)
    {
        float NextPhaseTime = ZonePhases[1].PhaseStartTime;
        GetWorldTimerManager().SetTimer(ZonePhaseTimer, this,
            &AKhaaosBarburhenLevel::AdvanceZonePhase,
            NextPhaseTime, false);
    }
}

void AKhaaosBarburhenLevel::AdvanceZonePhase()
{
    CurrentZonePhase++;

    if (CurrentZonePhase >= ZonePhases.Num())
    {
        UE_LOG(LogTemp, Log, TEXT("[Barburhen] Final zone phase reached"));
        return;
    }

    const FBarburhenZonePhase& Phase = ZonePhases[CurrentZonePhase];

    // Apply season damage modifier
    float EffectiveDamage = KhaaosBarburhenRules::EffectiveZoneDamage(
        Phase.ZoneDamagePerSecond, Phase.SeasonDamageModifier, GetSeasonDamageModifier());

    UE_LOG(LogTemp, Log, TEXT("[Barburhen] Zone phase %d — Center=(%s), Radius=%.0f, Damage=%.1f/s (season-modified)"),
        Phase.PhaseIndex, *Phase.ZoneCenter.ToString(), Phase.ZoneRadius, EffectiveDamage);

    // Update SafeZone if available
    if (SafeZone)
    {
        SafeZone->SetZoneCenter(Phase.ZoneCenter);
        SafeZone->SetZoneRadius(Phase.ZoneRadius);
        SafeZone->SetZoneDamage(EffectiveDamage);
    }

    // Spawn loot for this phase (season-aware)
    SpawnPhaseLoot();

    // Set timer for next phase
    if (CurrentZonePhase + 1 < ZonePhases.Num())
    {
        float TimeToNext = ZonePhases[CurrentZonePhase + 1].PhaseStartTime - ElapsedTime;
        if (TimeToNext > 0.0f)
        {
            GetWorldTimerManager().SetTimer(ZonePhaseTimer, this,
                &AKhaaosBarburhenLevel::AdvanceZonePhase,
                TimeToNext, false);
        }
    }
}

// ─── Loot Spawning ───────────────────────────────────────────────────────────

void AKhaaosBarburhenLevel::SpawnPhaseLoot()
{
    if (CurrentZonePhase >= ZonePhases.Num()) return;

    const FBarburhenZonePhase& Phase = ZonePhases[CurrentZonePhase];
    if (!MapData) return;

    // Season-aware loot count: Inverno has fewer but rarer drops
    int32 LootCount = Phase.LootDropCount;
    if (SeasonConfig.Season == EBarburhenSeason::Inverno)
    {
        LootCount = FMath::Max(1, FMath::RoundToInt(LootCount * 0.8f));
    }

    // Get random loot spawn points from map data
    TArray<FVector> SpawnPoints = MapData->GetRandomLootSpawnPoints(LootCount, Phase.ZoneCenter, Phase.ZoneRadius);

    for (const FVector& Point : SpawnPoints)
    {
        AKhaaosLootPickup* Loot = SpawnLootAt(Point, FRotator::ZeroRotator);
        if (Loot)
        {
            // Inverno: upgrade rarity (shift toward rare+)
            if (SeasonConfig.Season == EBarburhenSeason::Inverno && FMath::FRand() < SeasonConfig.InvernoLootBonus)
            {
                // Upgrade to at least Rare
                Loot->SetRarity(EItemRarity::Rare);
            }
            ActiveLootPickups.Add(Loot);
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Barburhen] Spawned %d loot items for phase %d (Season: %s)"),
        SpawnPoints.Num(), Phase.PhaseIndex,
        SeasonConfig.Season == EBarburhenSeason::Verao ? TEXT("Verão") : TEXT("Inverno"));
}

void AKhaaosBarburhenLevel::SpawnPulsoKhaaosDrop()
{
    if (!MapData) return;
    if (CurrentZonePhase >= ZonePhases.Num()) return;

    // Pulso drops a legendary item at a random position within the current zone
    FVector DropLocation = MapData->GetRandomPointInZone(
        ZonePhases[CurrentZonePhase].ZoneCenter,
        ZonePhases[CurrentZonePhase].ZoneRadius);

    AKhaaosLootPickup* Loot = SpawnLootAt(DropLocation, FRotator::ZeroRotator);
    if (Loot)
    {
        Loot->SetRarity(EItemRarity::Legendary);
        ActiveLootPickups.Add(Loot);
        UE_LOG(LogTemp, Log, TEXT("[Barburhen] Pulso Khaaos: Legendary drop at (%s)"), *DropLocation.ToString());
    }
}

AKhaaosLootPickup* AKhaaosBarburhenLevel::SpawnLootAt(const FVector& Location, const FRotator& Rotation)
{
    FActorSpawnParameters SpawnParams;
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

    AKhaaosLootPickup* Loot = GetWorld()->SpawnActor<AKhaaosLootPickup>(
        AKhaaosLootPickup::StaticClass(), Location, Rotation, SpawnParams);

    return Loot;
}

// ─── ZEX Management ──────────────────────────────────────────────────────────

void AKhaaosBarburhenLevel::UpdateZEXActivation()
{
    if (CurrentZonePhase >= ZonePhases.Num()) return;

    const FBarburhenZonePhase& Phase = ZonePhases[CurrentZonePhase];

    for (FBarburhenZEX& ZEX : ZEXPoints)
    {
        // ZEX is active only if it's inside the current safe zone
        ZEX.bIsActive = KhaaosBarburhenRules::IsInsideZone2D(
            ZEX.Location, Phase.ZoneCenter, Phase.ZoneRadius);
    }
}

bool AKhaaosBarburhenLevel::PlayerExtractAtZEX(APlayerState* PlayerState, const FGuid& ZEXId)
{
    FBarburhenZEX* TargetZEX = nullptr;
    for (FBarburhenZEX& ZEX : ZEXPoints)
    {
        if (ZEX.ZEXId == ZEXId)
        {
            TargetZEX = &ZEX;
            break;
        }
    }

    if (!TargetZEX || !TargetZEX->bIsActive)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Barburhen] ZEX %s not found or inactive"), *ZEXId.ToString());
        return false;
    }

    // Apply XP bonus via GAS (season-aware: Inverno gives 1.2x bonus)
    float Bonus = TargetZEX->XPBonus;
    if (SeasonConfig.Season == EBarburhenSeason::Inverno)
    {
        Bonus *= 1.2f;
    }

    UE_LOG(LogTemp, Log, TEXT("[Barburhen] Player extracted at ZEX %s (bonus: %.1fx, season: %s)"),
        *ZEXId.ToString(), Bonus,
        SeasonConfig.Season == EBarburhenSeason::Verao ? TEXT("Verão") : TEXT("Inverno"));

    return true;
}

// ─── Zu Entry Protocol ───────────────────────────────────────────────────────

void AKhaaosBarburhenLevel::StartZuEntry(APlayerController* PlayerController)
{
    if (!PlayerController || ZuVariants.Num() == 0) return;

    // Select random Zu variant (4 variants including gelo)
    int32 VariantIndex = FMath::RandRange(0, ZuVariants.Num() - 1);
    const FBarburhenZuEntry& Zu = ZuVariants[VariantIndex];

    UE_LOG(LogTemp, Log, TEXT("[Barburhen] Zu entry: Variant=%d, Spawn=(%s), Duration=%.1fs"),
        static_cast<int32>(Zu.Variant), *Zu.SpawnPoint.ToString(), Zu.CinematicDuration);

    // Move player to spawn point (cinematic entry)
    if (APawn* Pawn = PlayerController->GetPawn())
    {
        Pawn->SetActorLocation(Zu.SpawnPoint);
        Pawn->SetActorRotation(Zu.SpawnRotation);
    }

    // Zu4 Gelo: apply ice slip effect during cinematic
    if (Zu.Variant == EBarburhenZuVariant::Zu4_Gelo)
    {
        UE_LOG(LogTemp, Log, TEXT("[Barburhen] Zu4 Gelo: Ice slip cinematic — friction reduced"));
        // Apply ice physics via GAS (reduced friction, slide toward zone)
    }
}

void AKhaaosBarburhenLevel::ResolveZuDecision(APlayerController* PlayerController, bool bCorrectDecision)
{
    if (!PlayerController) return;

    if (bCorrectDecision)
    {
        UE_LOG(LogTemp, Log, TEXT("[Barburhen] Zu: Correct decision — 0 damage, brief stun"));
        // Apply stun effect via GAS (5-7s)
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("[Barburhen] Zu: Wrong decision — -30%% health penalty"));
        // Apply damage via GAS (30% of max health)
        if (APawn* Pawn = PlayerController->GetPawn())
        {
            if (UAbilitySystemComponent* ASC = Pawn->FindComponentByClass<UAbilitySystemComponent>())
            {
                // Apply damage GameplayEffect (30% of max health)
            }
        }
    }
}

// ─── Season System ───────────────────────────────────────────────────────────

void AKhaaosBarburhenLevel::CycleSeason()
{
    if (SeasonConfig.Season == EBarburhenSeason::Verao)
    {
        SeasonConfig.Season = EBarburhenSeason::Inverno;
        UE_LOG(LogTemp, Log, TEXT("[Barburhen] Season changed: Verão → Inverno (higher damage, rare loot)"));
    }
    else
    {
        SeasonConfig.Season = EBarburhenSeason::Verao;
        UE_LOG(LogTemp, Log, TEXT("[Barburhen] Season changed: Inverno → Verão (lower damage, common loot)"));
    }
    SeasonConfig.SeasonElapsed = 0.0f;
}

float AKhaaosBarburhenLevel::GetSeasonDamageModifier() const
{
    return (SeasonConfig.Season == EBarburhenSeason::Inverno)
        ? SeasonConfig.InvernoDamageMultiplier
        : 1.0f;
}

float AKhaaosBarburhenLevel::GetSeasonLootModifier() const
{
    return (SeasonConfig.Season == EBarburhenSeason::Inverno)
        ? SeasonConfig.InvernoLootBonus
        : SeasonConfig.VeraoLootPenalty;
}

void AKhaaosBarburhenLevel::UpdateSeasonTimer(float DeltaSeconds)
{
    SeasonConfig.SeasonElapsed += DeltaSeconds;
    if (SeasonConfig.SeasonElapsed >= SeasonConfig.SeasonDuration)
    {
        CycleSeason();
    }
}

// ─── Giants Challenge ────────────────────────────────────────────────────────

bool AKhaaosBarburhenLevel::DoesPlayerQualifyForGiants(const FString& PlayerId) const
{
    return GiantsChallenge.QualifiedPlayers.Contains(PlayerId);
}

void AKhaaosBarburhenLevel::TriggerGiantsChallenge()
{
    GiantsChallenge.bIsActive = true;
    GiantsChallenge.QualifiedPlayers.Empty();

    // Sort players by kills (top 50 qualify)
    // This would query from GameState in production
    if (AKhaaosGameMode* GM = GetWorld()->GetAuthGameMode<AKhaaosGameMode>())
    {
        // Collect top players by kills
        TArray<APlayerState*> PlayerStates;
        for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
        {
            if (APlayerController* PC = It->Get())
            {
                if (PC->PlayerState)
                {
                    PlayerStates.Add(PC->PlayerState);
                }
            }
        }

        // Sort by kills descending and take top N
        PlayerStates.Sort([](const APlayerState& A, const APlayerState& B)
        {
            return A.GetScore() > B.GetScore();
        });

        int32 QualifyCount = FMath::Min(GiantsChallenge.QualifyingCount, PlayerStates.Num());
        for (int32 i = 0; i < QualifyCount; i++)
        {
            GiantsChallenge.QualifiedPlayers.Add(PlayerStates[i]->GetUniqueId()->ToString());
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Barburhen] Giants Challenge triggered! %d players qualified. Prize: %lld KRC"),
        GiantsChallenge.QualifiedPlayers.Num(), GiantsChallenge.PrizePoolKRC);
}

// ─── Player Flow ─────────────────────────────────────────────────────────────

bool AKhaaosBarburhenLevel::CanPlayerEnter() const
{
    // Block entry in last 3 minutes of the Ring
    if (!KhaaosBarburhenRules::IsEntryOpen(ElapsedTime, RingDuration, EntryBlockTime)) return false;

    // Check capacity
    if (GetAlivePlayerCount() >= MaxPlayers)
    {
        return false;
    }

    return true;
}

bool AKhaaosBarburhenLevel::MeetsEntryRequirements(int32 CIGKVMatchesCompleted) const
{
    // Progression gate: must have completed at least 10 CIGKV matches
    return CIGKVMatchesCompleted >= MinCIGKVMatchesForEntry;
}

int32 AKhaaosBarburhenLevel::GetAlivePlayerCount() const
{
    if (AKhaaosGameMode* GM = GetWorld()->GetAuthGameMode<AKhaaosGameMode>())
    {
        return GM->NumPlayers;
    }
    return 0;
}

// ─── Inactivity System ("dedo-duro") ─────────────────────────────────────────

void AKhaaosBarburhenLevel::ProcessInactivityPunishment(float DeltaSeconds)
{
    // "Dedo-duro" system: harsher in Barburhen (90s threshold, 3 dmg/s)
    // Rats, mosquitoes, locusts, seagulls punish players who avoid combat

    if (AKhaaosGameMode* GM = GetWorld()->GetAuthGameMode<AKhaaosGameMode>())
    {
        for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
        {
            if (APlayerController* PC = It->Get())
            {
                if (APawn* Pawn = PC->GetPawn())
                {
                    // Check if player has been inactive (not moving, not attacking)
                    // Inactivity damage scales with time: InactivityDamagePerSecond * DeltaSeconds
                    // Season-aware: Inverno increases inactivity punishment
                    float Damage = InactivityDamagePerSecond * DeltaSeconds * GetSeasonDamageModifier();
                    // Apply via GAS
                }
            }
        }
    }
}

// ─── Map Data Initialization ─────────────────────────────────────────────────

void AKhaaosBarburhenLevel::InitializeMapData()
{
    // Load map data from DataTable or create defaults
    if (!MapData)
    {
        MapData = NewObject<UKhaaosBarburhenMapData>(this);
        MapData->InitializeDefaults();
    }

    // If ZonePhases not configured, create default Barburhen phases (4 phases, 1.5h)
    if (ZonePhases.Num() == 0)
    {
        // Phase 0: Full map (start)
        FBarburhenZonePhase Phase0;
        Phase0.PhaseIndex = 0;
        Phase0.PhaseStartTime = 0.0f;
        Phase0.ZoneCenter = FVector(0.0f, 0.0f, 0.0f);
        Phase0.ZoneRadius = 6000.0f;
        Phase0.ZoneDamagePerSecond = 3.0f;  // Higher base damage than CIGKV
        Phase0.LootDropCount = 12;
        Phase0.ClimateEffect = TEXT("Clear");
        Phase0.SeasonDamageModifier = 1.0f;
        ZonePhases.Add(Phase0);

        // Phase 1: Shrink to industrial+residential (20 min)
        FBarburhenZonePhase Phase1;
        Phase1.PhaseIndex = 1;
        Phase1.PhaseStartTime = 1200.0f;
        Phase1.ZoneCenter = FVector(500.0f, 500.0f, 0.0f);
        Phase1.ZoneRadius = 4500.0f;
        Phase1.ZoneDamagePerSecond = 6.0f;
        Phase1.LootDropCount = 10;
        Phase1.ClimateEffect = TEXT("Overcast");
        Phase1.SeasonDamageModifier = 1.2f;
        ZonePhases.Add(Phase1);

        // Phase 2: Tight — military+wasteland (40 min)
        FBarburhenZonePhase Phase2;
        Phase2.PhaseIndex = 2;
        Phase2.PhaseStartTime = 2400.0f;
        Phase2.ZoneCenter = FVector(1000.0f, 0.0f, 0.0f);
        Phase2.ZoneRadius = 2500.0f;
        Phase2.ZoneDamagePerSecond = 10.0f;
        Phase2.LootDropCount = 8;
        Phase2.ClimateEffect = TEXT("Storm");
        Phase2.SeasonDamageModifier = 1.5f;
        ZonePhases.Add(Phase2);

        // Phase 3: Endgame — small circle (1h10)
        FBarburhenZonePhase Phase3;
        Phase3.PhaseIndex = 3;
        Phase3.PhaseStartTime = 4200.0f;
        Phase3.ZoneCenter = FVector(500.0f, 500.0f, 0.0f);
        Phase3.ZoneRadius = 1000.0f;
        Phase3.ZoneDamagePerSecond = 15.0f;  // Very high damage
        Phase3.LootDropCount = 5;
        Phase3.ClimateEffect = TEXT("Blizzard");
        Phase3.SeasonDamageModifier = 2.0f;
        ZonePhases.Add(Phase3);
    }

    // If ZEX points not configured, create defaults (30 ZEX)
    if (ZEXPoints.Num() == 0)
    {
        // 6 ZEX in Industrial (2/10)
        for (int32 i = 0; i < 6; i++)
        {
            FBarburhenZEX ZEX;
            ZEX.ZEXId = FGuid::NewGuid();
            ZEX.Location = FVector(-4000.0f + i * 500.0f, -3000.0f, 0.0f);
            ZEX.InteractionRadius = 200.0f;
            ZEX.bIsActive = true;
            ZEX.XPBonus = 1.2f;
            ZEX.SectorName = TEXT("Industrial");
            ZEXPoints.Add(ZEX);
        }

        // 6 ZEX in Residential (2/10)
        for (int32 i = 0; i < 6; i++)
        {
            FBarburhenZEX ZEX;
            ZEX.ZEXId = FGuid::NewGuid();
            ZEX.Location = FVector(-4000.0f + i * 500.0f, 2000.0f, 0.0f);
            ZEX.InteractionRadius = 200.0f;
            ZEX.bIsActive = true;
            ZEX.XPBonus = 1.0f;
            ZEX.SectorName = TEXT("Residential");
            ZEXPoints.Add(ZEX);
        }

        // 9 ZEX in Military (3/10)
        for (int32 i = 0; i < 9; i++)
        {
            FBarburhenZEX ZEX;
            ZEX.ZEXId = FGuid::NewGuid();
            ZEX.Location = FVector(0.0f + i * 400.0f, 0.0f, 0.0f);
            ZEX.InteractionRadius = 200.0f;
            ZEX.bIsActive = true;
            ZEX.XPBonus = 1.5f;
            ZEX.SectorName = TEXT("Military");
            ZEXPoints.Add(ZEX);
        }

        // 6 ZEX in Wasteland (2/10)
        for (int32 i = 0; i < 6; i++)
        {
            FBarburhenZEX ZEX;
            ZEX.ZEXId = FGuid::NewGuid();
            ZEX.Location = FVector(2000.0f + i * 400.0f, -2000.0f, 0.0f);
            ZEX.InteractionRadius = 200.0f;
            ZEX.bIsActive = true;
            ZEX.XPBonus = 1.3f;
            ZEX.SectorName = TEXT("Wasteland");
            ZEXPoints.Add(ZEX);
        }

        // 3 ZEX in Port (1/10)
        for (int32 i = 0; i < 3; i++)
        {
            FBarburhenZEX ZEX;
            ZEX.ZEXId = FGuid::NewGuid();
            ZEX.Location = FVector(4000.0f + i * 300.0f, 4000.0f, 0.0f);
            ZEX.InteractionRadius = 200.0f;
            ZEX.bIsActive = true;
            ZEX.XPBonus = 1.8f;
            ZEX.SectorName = TEXT("Port");
            ZEXPoints.Add(ZEX);
        }
    }

    // If Zu variants not configured, create defaults (4 variants)
    if (ZuVariants.Num() == 0)
    {
        FBarburhenZuEntry Zu1;
        Zu1.Variant = EBarburhenZuVariant::Zu1_Cinto;
        Zu1.SpawnPoint = FVector(-5000.0f, 0.0f, 100.0f);
        Zu1.SpawnRotation = FRotator(0.0f, 90.0f, 0.0f);
        Zu1.WrongDecisionDamage = 0.3f;
        Zu1.CinematicDuration = 8.0f;
        ZuVariants.Add(Zu1);

        FBarburhenZuEntry Zu2;
        Zu2.Variant = EBarburhenZuVariant::Zu2_Saltar;
        Zu2.SpawnPoint = FVector(0.0f, -5000.0f, 100.0f);
        Zu2.SpawnRotation = FRotator(0.0f, 0.0f, 0.0f);
        Zu2.WrongDecisionDamage = 0.25f;
        Zu2.CinematicDuration = 6.0f;
        ZuVariants.Add(Zu2);

        FBarburhenZuEntry Zu3;
        Zu3.Variant = EBarburhenZuVariant::Zu3_Mascara;
        Zu3.SpawnPoint = FVector(5000.0f, 5000.0f, 500.0f);
        Zu3.SpawnRotation = FRotator(0.0f, -135.0f, 0.0f);
        Zu3.WrongDecisionDamage = 0.3f;
        Zu3.CinematicDuration = 7.0f;
        ZuVariants.Add(Zu3);

        // Zu4 Gelo — unique to Barburhen (ice slip entry)
        FBarburhenZuEntry Zu4;
        Zu4.Variant = EBarburhenZuVariant::Zu4_Gelo;
        Zu4.SpawnPoint = FVector(0.0f, 5000.0f, 200.0f);
        Zu4.SpawnRotation = FRotator(0.0f, -90.0f, 0.0f);
        Zu4.WrongDecisionDamage = 0.35f;
        Zu4.CinematicDuration = 9.0f;
        ZuVariants.Add(Zu4);
    }

    UE_LOG(LogTemp, Log, TEXT("[Barburhen] Map data initialized — %d phases, %d ZEX, %d Zu variants"),
        ZonePhases.Num(), ZEXPoints.Num(), ZuVariants.Num());
}

// ─── Replication ──────────────────────────────────────────────────────────────

void AKhaaosBarburhenLevel::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME(AKhaaosBarburhenLevel, CurrentZonePhase);
    DOREPLIFETIME(AKhaaosBarburhenLevel, ElapsedTime);
}
