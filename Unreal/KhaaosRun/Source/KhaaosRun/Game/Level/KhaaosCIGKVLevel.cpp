// ============================================================================
// Khaaos Run — CIGKV Level Script Actor Implementation (Fase 1)
// ============================================================================

#include "Game/Level/KhaaosCIGKVLevel.h"
#include "Game/KhaaosGameMode.h"
#include "Game/KhaaosGameState.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/CIGKV/KhaaosCIGKVMapData.h"
#include "Game/World/CIGKV/CIGKVZuRules.h"
#include "Player/KhaaosPlayerController.h"
#include "Player/KhaaosPlayerState.h"
#include "Game/World/CIGKV/CIGKVLootRules.h"
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

    const FCIGKVZonePhase& InitialPhase = ZonePhases[CurrentZonePhase];
    if (SafeZone)
    {
        SafeZone->SetWorldZone(InitialPhase.ZoneCenter, InitialPhase.ZoneRadius, InitialPhase.ZoneDamagePerSecond);
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("[CIGKV] No AKhaaosSafeZone actor found; zone damage and visual are unavailable"));
    }

    // Phase 0 is the live opening state; do not wait until phase 1 to populate loot.
    SpawnPhaseLoot();

    // Set timer for first phase advancement
    if (ZonePhases.Num() > 1)
    {
        const float TimeUntilNextPhase = FMath::Max(0.0f, ZonePhases[1].PhaseStartTime - ElapsedTime);
        GetWorldTimerManager().SetTimer(ZonePhaseTimer, this,
            &AKhaaosCIGKVLevel::AdvanceZonePhase, TimeUntilNextPhase, false);
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

    // Update the server-authoritative world zone and animate to the next radius.
    if (SafeZone)
    {
        float TransitionSeconds = 0.0f;
        if (CurrentZonePhase + 1 < ZonePhases.Num())
        {
            TransitionSeconds = FMath::Max(0.0f,
                ZonePhases[CurrentZonePhase + 1].PhaseStartTime - Phase.PhaseStartTime);
        }
        else
        {
            TransitionSeconds = FMath::Max(0.0f, RingDuration - Phase.PhaseStartTime);
        }
        SafeZone->SetWorldZone(Phase.ZoneCenter, Phase.ZoneRadius, Phase.ZoneDamagePerSecond, TransitionSeconds);
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

    // Preserve each point's rarity weights and rotation through the spawn.
    const FVector LootZoneCenter = SafeZone && SafeZone->UsesWorldSpaceZone()
        ? SafeZone->WorldZoneCenter : Phase.ZoneCenter;
    const float LootZoneRadius = SafeZone && SafeZone->UsesWorldSpaceZone()
        ? SafeZone->WorldZoneRadius : Phase.ZoneRadius;
    const TArray<FCIGKVLootSpawnPoint> SpawnEntries = MapData->GetRandomLootSpawnEntries(
        Phase.LootDropCount, LootZoneCenter, LootZoneRadius, Phase.PhaseIndex);

    int32 SpawnedCount = 0;
    const int32 MaxRarityTiers = static_cast<int32>(ELootRarity::Mitico) + 1;
    for (const FCIGKVLootSpawnPoint& Entry : SpawnEntries)
    {
        const int32 WeightCount = FMath::Min(Entry.RarityWeights.Num(), MaxRarityTiers);
        const int32 RarityIndex = KhaaosCIGKVRules::SelectWeightedLootTier(
            Entry.RarityWeights.GetData(), static_cast<std::size_t>(WeightCount), FMath::FRand());
        const ELootRarity Rarity = RarityIndex >= 0 && RarityIndex < MaxRarityTiers
            ? static_cast<ELootRarity>(RarityIndex)
            : ELootRarity::Comum;

        AKhaaosLootPickup* Loot = SpawnLootAt(Entry.Location, Entry.Rotation, Rarity);
        if (Loot)
        {
            ActiveLootPickups.Add(Loot);
            ++SpawnedCount;
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[CIGKV] Spawned %d/%d loot items for phase %d"),
        SpawnedCount, SpawnEntries.Num(), Phase.PhaseIndex);
}

void AKhaaosCIGKVLevel::SpawnPulsoKhaaosDrop()
{
    if (!MapData || ZonePhases.Num() == 0 || CurrentZonePhase >= ZonePhases.Num()) return;

    // Pulso drops a legendary item at a random position within the current zone
    FVector DropLocation = MapData->GetRandomPointInZone(
        SafeZone && SafeZone->UsesWorldSpaceZone() ? SafeZone->WorldZoneCenter : ZonePhases[CurrentZonePhase].ZoneCenter,
        SafeZone && SafeZone->UsesWorldSpaceZone() ? SafeZone->WorldZoneRadius : ZonePhases[CurrentZonePhase].ZoneRadius);

    AKhaaosLootPickup* Loot = SpawnLootAt(DropLocation, FRotator::ZeroRotator, ELootRarity::Lendario);
    if (Loot)
    {
        ActiveLootPickups.Add(Loot);
        UE_LOG(LogTemp, Log, TEXT("[CIGKV] Pulso Khaaos: Legendary drop at (%s)"), *DropLocation.ToString());
    }
}

AKhaaosLootPickup* AKhaaosCIGKVLevel::SpawnLootAt(
    const FVector& Location, const FRotator& Rotation, ELootRarity Rarity)
{
    AKhaaosGameMode* GameMode = GetWorld() ? GetWorld()->GetAuthGameMode<AKhaaosGameMode>() : nullptr;
    if (!GameMode) return nullptr;

    EKhaaosRarity CatalogRarity = EKhaaosRarity::Comum;
    switch (Rarity)
    {
    case ELootRarity::Raro:     CatalogRarity = EKhaaosRarity::Raro; break;
    case ELootRarity::Epico:    CatalogRarity = EKhaaosRarity::Epico; break;
    case ELootRarity::Lendario: CatalogRarity = EKhaaosRarity::Lendario; break;
    case ELootRarity::Mitico:   CatalogRarity = EKhaaosRarity::Mitico; break;
    default:                   CatalogRarity = EKhaaosRarity::Comum; break;
    }

    return GameMode->SpawnCatalogLoot(
        GameMode->SelectLootByRarity(CatalogRarity), Location, Rotation, 1, LootPickupClass);
}

// ─── ZEX Management ──────────────────────────────────────────────────────────

void AKhaaosCIGKVLevel::UpdateZEXActivation()
{
    if (CurrentZonePhase >= ZonePhases.Num()) return;

    for (FCIGKVZEX& ZEX : ZEXPoints)
    {
        // ZEX is active only if it's inside the current safe zone
        if (SafeZone && SafeZone->UsesWorldSpaceZone())
        {
            ZEX.bIsActive = SafeZone->IsInsideWorldZone(ZEX.Location);
        }
        else
        {
            const FCIGKVZonePhase& Phase = ZonePhases[CurrentZonePhase];
            ZEX.bIsActive = FVector::DistSquared2D(ZEX.Location, Phase.ZoneCenter) <= FMath::Square(Phase.ZoneRadius);
        }
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

namespace
{
bool BuildZuPrompt(ECIGKVZuVariant Variant, FText& Prompt, FText& OptionA, FText& OptionB)
{
    switch (Variant)
    {
    case ECIGKVZuVariant::Zu1_Cinto:
        Prompt = NSLOCTEXT("KhaaosRun", "Zu1Prompt", "Risco de colisão: decida agora.");
        OptionA = NSLOCTEXT("KhaaosRun", "Zu1SafeOption", "Apertar o cinto");
        OptionB = NSLOCTEXT("KhaaosRun", "Zu1UnsafeOption", "Continuar sem cinto");
        return true;
    case ECIGKVZuVariant::Zu2_Saltar:
        Prompt = NSLOCTEXT("KhaaosRun", "Zu2Prompt", "Desmoronamento iminente: saia do caminhão.");
        OptionA = NSLOCTEXT("KhaaosRun", "Zu2SafeOption", "Saltar");
        OptionB = NSLOCTEXT("KhaaosRun", "Zu2UnsafeOption", "Permanecer");
        return true;
    case ECIGKVZuVariant::Zu3_Mascara:
        Prompt = NSLOCTEXT("KhaaosRun", "Zu3Prompt", "Queda na ponte: proteja sua respiração.");
        OptionA = NSLOCTEXT("KhaaosRun", "Zu3SafeOption", "Usar máscara de oxigênio");
        OptionB = NSLOCTEXT("KhaaosRun", "Zu3UnsafeOption", "Continuar sem máscara");
        return true;
    default:
        return false;
    }
}
}

void AKhaaosCIGKVLevel::StartZuEntry(APlayerController* PlayerController)
{
    if (!HasAuthority() || !IsValid(PlayerController) || ZuVariants.Num() == 0) return;

    const TWeakObjectPtr<APlayerController> PlayerKey(PlayerController);
    if (ActiveZuEntries.Contains(PlayerKey) || ResolvedZuEntries.Contains(PlayerKey)) return;

    AKhaaosPlayerState* PlayerState = Cast<AKhaaosPlayerState>(PlayerController->PlayerState);
    AKhaaosPlayerController* KhaaosController = Cast<AKhaaosPlayerController>(PlayerController);
    APawn* Pawn = PlayerController->GetPawn();
    if (!PlayerState || PlayerState->PlayerStatus != EPlayerStatus::Vivo || !KhaaosController || !Pawn)
    {
        UE_LOG(LogTemp, Warning, TEXT("[CIGKV] Zu entry skipped: player, pawn, or Khaaos controller is unavailable"));
        return;
    }

    const int32 VariantIndex = FMath::RandRange(0, ZuVariants.Num() - 1);
    const FCIGKVZuEntry Zu = ZuVariants[VariantIndex];
    const int32 VariantId = static_cast<int32>(Zu.Variant);
    FText Prompt;
    FText OptionA;
    FText OptionB;
    if (!KhaaosCIGKVRules::IsValidVariant(VariantId) ||
        !BuildZuPrompt(Zu.Variant, Prompt, OptionA, OptionB))
    {
        UE_LOG(LogTemp, Error, TEXT("[CIGKV] Zu entry has an unsupported variant (%d)"), VariantId);
        return;
    }

    Pawn->SetActorLocation(Zu.SpawnPoint, false, nullptr, ETeleportType::TeleportPhysics);
    Pawn->SetActorRotation(Zu.SpawnRotation);

    FActiveZuEntryState EntryState;
    EntryState.Variant = Zu.Variant;
    EntryState.WrongDecisionDamage = KhaaosCIGKVRules::ClampWrongDecisionDamageFraction(Zu.WrongDecisionDamage);
    ActiveZuEntries.Add(PlayerKey, EntryState);

    const float CinematicDuration = FMath::Max(0.0f, Zu.CinematicDuration);
    const float ResponseTimeout = FMath::Max(1.0f, ZuDecisionTimeout);
    FTimerDelegate TimeoutDelegate;
    TimeoutDelegate.BindUObject(this, &AKhaaosCIGKVLevel::ResolveZuDecisionTimeout, PlayerController);
    GetWorldTimerManager().SetTimer(
        ActiveZuEntries.FindChecked(PlayerKey).DecisionTimeoutHandle,
        TimeoutDelegate,
        CinematicDuration + ResponseTimeout,
        false);

    KhaaosController->ClientBeginZuEntry(
        static_cast<uint8>(VariantId), Prompt, OptionA, OptionB, CinematicDuration, ResponseTimeout);

    UE_LOG(LogTemp, Log, TEXT("[CIGKV] Zu entry started: Variant=%d, Duration=%.1fs, ResponseTimeout=%.1fs"),
        VariantId, CinematicDuration, ResponseTimeout);
}

void AKhaaosCIGKVLevel::CancelZuEntry(APlayerController* PlayerController)
{
    if (!HasAuthority() || !IsValid(PlayerController)) return;

    const TWeakObjectPtr<APlayerController> PlayerKey(PlayerController);
    if (FActiveZuEntryState* Entry = ActiveZuEntries.Find(PlayerKey))
    {
        GetWorldTimerManager().ClearTimer(Entry->DecisionTimeoutHandle);
        ActiveZuEntries.Remove(PlayerKey);
    }
    ResolvedZuEntries.Remove(PlayerKey);

    if (AKhaaosPlayerController* KhaaosController = Cast<AKhaaosPlayerController>(PlayerController))
    {
        KhaaosController->ClientEndZuEntry();
    }
}

bool AKhaaosCIGKVLevel::ResolveZuDecision(APlayerController* PlayerController, uint8 ChoiceIndex)
{
    if (!HasAuthority() || !IsValid(PlayerController) || !KhaaosCIGKVRules::IsValidChoice(ChoiceIndex))
    {
        return false;
    }

    const TWeakObjectPtr<APlayerController> PlayerKey(PlayerController);
    FActiveZuEntryState* PendingEntry = ActiveZuEntries.Find(PlayerKey);
    if (!PendingEntry)
    {
        UE_LOG(LogTemp, Warning, TEXT("[CIGKV] Ignored duplicate or stale Zu choice"));
        return false;
    }

    const FActiveZuEntryState Entry = *PendingEntry;
    GetWorldTimerManager().ClearTimer(Entry.DecisionTimeoutHandle);
    ActiveZuEntries.Remove(PlayerKey);
    ResolvedZuEntries.Add(PlayerKey);

    if (AKhaaosPlayerController* KhaaosController = Cast<AKhaaosPlayerController>(PlayerController))
    {
        KhaaosController->ClientEndZuEntry();
    }

    const int32 VariantId = static_cast<int32>(Entry.Variant);
    if (KhaaosCIGKVRules::IsCorrectChoice(VariantId, ChoiceIndex))
    {
        UE_LOG(LogTemp, Log, TEXT("[CIGKV] Zu: safe choice accepted — no entry damage"));
        return true;
    }

    if (AKhaaosPlayerState* PlayerState = Cast<AKhaaosPlayerState>(PlayerController->PlayerState))
    {
        const float MaxHealth = FMath::Max(0.0f, PlayerState->MaxHealth);
        const float Damage = MaxHealth * Entry.WrongDecisionDamage;
        const float ActualDamage = PlayerState->ApplyDamage(Damage, nullptr);
        UE_LOG(LogTemp, Warning, TEXT("[CIGKV] Zu: unsafe choice; damage %.1f/%.1f (%.0f%% configured)"),
            ActualDamage, Damage, Entry.WrongDecisionDamage * 100.0f);
    }
    else
    {
        UE_LOG(LogTemp, Error, TEXT("[CIGKV] Zu penalty could not be applied: AKhaaosPlayerState is missing"));
    }

    return true;
}

void AKhaaosCIGKVLevel::ResolveZuDecisionTimeout(APlayerController* PlayerController)
{
    UE_LOG(LogTemp, Warning, TEXT("[CIGKV] Zu response timed out; applying unsafe-choice outcome"));
    ResolveZuDecision(PlayerController, 1);
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
        MapData->InitializeDefaults();
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
