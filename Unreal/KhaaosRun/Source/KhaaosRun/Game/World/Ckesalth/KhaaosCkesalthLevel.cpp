// ============================================================================
// Khaaos Run — W3/C3 Ckesalth Level Script Actor Implementation (Fase 4)
// ============================================================================

#include "Game/World/Ckesalth/KhaaosCkesalthLevel.h"
#include "Game/KhaaosGameMode.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/Ckesalth/KhaaosCkesalthMapData.h"
#include "Net/UnrealNetwork.h"
#include "Kismet/GameplayStatics.h"

AKhaaosCkesalthLevel::AKhaaosCkesalthLevel()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = true;
    MaxPlayers = 60;
    RingDuration = 5400.0f;
    EntryBlockTime = 180.0f;
    PulsoKhaaosInterval = 480.0f;
    InactivityThreshold = 100.0f;
    InactivityDamagePerSecond = 2.5f;
    MinW2MatchesForEntry = 5;
    KRCEarnMultiplier = 2.5f;
    ThinAirThreshold = 1500.0f;
    ThinAirDamagePerSecond = 1.0f;
}

void AKhaaosCkesalthLevel::BeginPlay()
{
    Super::BeginPlay();
    InitializeMapData();
    TArray<AActor*> SafeZones;
    UGameplayStatics::GetAllActorsOfClass(GetWorld(), AKhaaosSafeZone::StaticClass(), SafeZones);
    if (SafeZones.Num() > 0) SafeZone = Cast<AKhaaosSafeZone>(SafeZones[0]);
    if (HasAuthority()) StartZoneSequence();
    UE_LOG(LogTemp, Log, TEXT("[Ckesalth] Level started — MaxPlayers=%d, Duration=%.0fs"), MaxPlayers, RingDuration);
}

void AKhaaosCkesalthLevel::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!HasAuthority()) return;
    ElapsedTime += DeltaSeconds;
    if (ElapsedTime >= RingDuration) { UE_LOG(LogTemp, Log, TEXT("[Ckesalth] Ring complete.")); return; }

    TimeSinceLastPulso += DeltaSeconds;
    if (TimeSinceLastPulso >= PulsoKhaaosInterval)
    {
        TimeSinceLastPulso = 0.0f;
        SpawnPulsoKhaaosDrop();
        if (FMath::RandBool()) UE_LOG(LogTemp, Log, TEXT("[Ckesalth] Pulso Khaaos: Avalanche triggered"));
    }

    ProcessAltitudeEffects(DeltaSeconds);
    UpdateZEXActivation();
    ProcessInactivityPunishment(DeltaSeconds);
}

void AKhaaosCkesalthLevel::StartZoneSequence()
{
    if (ZonePhases.Num() == 0) { UE_LOG(LogTemp, Warning, TEXT("[Ckesalth] No zone phases!")); return; }
    CurrentZonePhase = 0;
    if (ZonePhases.Num() > 1)
        GetWorldTimerManager().SetTimer(ZonePhaseTimer, this, &AKhaaosCkesalthLevel::AdvanceZonePhase, ZonePhases[1].PhaseStartTime, false);
}

void AKhaaosCkesalthLevel::AdvanceZonePhase()
{
    CurrentZonePhase++;
    if (CurrentZonePhase >= ZonePhases.Num()) return;
    const FCkesalthZonePhase& Phase = ZonePhases[CurrentZonePhase];
    UE_LOG(LogTemp, Log, TEXT("[Ckesalth] Zone phase %d — Alt=[%.0f,%.0f], Radius=%.0f, Damage=%.1f/s"),
        Phase.PhaseIndex, Phase.MinAltitude, Phase.MaxAltitude, Phase.ZoneRadius, Phase.ZoneDamagePerSecond);
    if (SafeZone) { SafeZone->SetZoneCenter(Phase.ZoneCenter); SafeZone->SetZoneRadius(Phase.ZoneRadius); SafeZone->SetZoneDamage(Phase.ZoneDamagePerSecond); }
    SpawnPhaseLoot();
    if (CurrentZonePhase + 1 < ZonePhases.Num())
    {
        float TimeToNext = ZonePhases[CurrentZonePhase + 1].PhaseStartTime - ElapsedTime;
        if (TimeToNext > 0.0f) GetWorldTimerManager().SetTimer(ZonePhaseTimer, this, &AKhaaosCkesalthLevel::AdvanceZonePhase, TimeToNext, false);
    }
}

void AKhaaosCkesalthLevel::ProcessAltitudeEffects(float DeltaSeconds)
{
    for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (APawn* Pawn = PC->GetPawn())
            {
                float Alt = Pawn->GetActorLocation().Z;
                // Thin air damage above threshold
                if (Alt > ThinAirThreshold)
                {
                    float Damage = ThinAirDamagePerSecond * ((Alt - ThinAirThreshold) / 500.0f) * DeltaSeconds;
                    // Apply via GAS — high altitude suffocation
                }
            }
        }
    }
}

void AKhaaosCkesalthLevel::SpawnPhaseLoot()
{
    if (CurrentZonePhase >= ZonePhases.Num() || !MapData) return;
    const FCkesalthZonePhase& Phase = ZonePhases[CurrentZonePhase];
    TArray<FVector> SpawnPoints = MapData->GetRandomLootSpawnPoints(Phase.LootDropCount, Phase.ZoneCenter, Phase.ZoneRadius);
    for (const FVector& P : SpawnPoints) { if (AKhaaosLootPickup* L = SpawnLootAt(P, FRotator::ZeroRotator)) ActiveLootPickups.Add(L); }
}

void AKhaaosCkesalthLevel::SpawnPulsoKhaaosDrop()
{
    if (!MapData || CurrentZonePhase >= ZonePhases.Num()) return;
    FVector DropLoc = MapData->GetRandomPointInZone(ZonePhases[CurrentZonePhase].ZoneCenter, ZonePhases[CurrentZonePhase].ZoneRadius);
    if (AKhaaosLootPickup* L = SpawnLootAt(DropLoc, FRotator::ZeroRotator)) { L->SetRarity(EItemRarity::Legendary); ActiveLootPickups.Add(L); }
}

AKhaaosLootPickup* AKhaaosCkesalthLevel::SpawnLootAt(const FVector& Location, const FRotator& Rotation)
{
    FActorSpawnParameters SP; SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
    return GetWorld()->SpawnActor<AKhaaosLootPickup>(AKhaaosLootPickup::StaticClass(), Location, Rotation, SP);
}

void AKhaaosCkesalthLevel::UpdateZEXActivation()
{
    if (CurrentZonePhase >= ZonePhases.Num()) return;
    const FCkesalthZonePhase& Phase = ZonePhases[CurrentZonePhase];
    for (FCkesalthZEX& Z : ZEXPoints) Z.bIsActive = (FVector::Dist(Z.Location, Phase.ZoneCenter) <= Phase.ZoneRadius);
}

bool AKhaaosCkesalthLevel::PlayerExtractAtZEX(APlayerState* PS, const FGuid& Id)
{
    for (FCkesalthZEX& Z : ZEXPoints) { if (Z.ZEXId == Id && Z.bIsActive) { UE_LOG(LogTemp, Log, TEXT("[Ckesalth] Extract at ZEX (alt=%.0f)"), Z.Altitude); return true; } }
    return false;
}

void AKhaaosCkesalthLevel::StartZuEntry(APlayerController* PC)
{
    if (!PC || ZuVariants.Num() == 0) return;
    const FCkesalthZuEntry& Zu = ZuVariants[FMath::RandRange(0, ZuVariants.Num() - 1)];
    if (APawn* P = PC->GetPawn()) { P->SetActorLocation(Zu.SpawnPoint); P->SetActorRotation(Zu.SpawnRotation); }
    if (Zu.Variant == ECkesalthZuVariant::Zu3_Escalando) UE_LOG(LogTemp, Log, TEXT("[Ckesalth] Zu3 Escalando: Climbing entry — grip check required"));
}

void AKhaaosCkesalthLevel::ResolveZuDecision(APlayerController* PC, bool bCorrect)
{
    if (!PC) return;
    UE_LOG(LogTemp, Log, TEXT("[Ckesalth] Zu: %s decision"), bCorrect ? TEXT("Correct") : TEXT("Wrong"));
}

bool AKhaaosCkesalthLevel::CanPlayerEnter() const { return (RingDuration - ElapsedTime) > EntryBlockTime && GetAlivePlayerCount() < MaxPlayers; }
bool AKhaaosCkesalthLevel::MeetsEntryRequirements(int32 W2) const { return W2 >= MinW2MatchesForEntry; }
int32 AKhaaosCkesalthLevel::GetAlivePlayerCount() const { if (auto* GM = GetWorld()->GetAuthGameMode<AKhaaosGameMode>()) return GM->NumPlayers; return 0; }

void AKhaaosCkesalthLevel::ProcessInactivityPunishment(float DeltaSeconds)
{
    // "Dedo-duro" on the mountain: rock slides target campers
}

void AKhaaosCkesalthLevel::InitializeMapData()
{
    if (!MapData) MapData = NewObject<UKhaaosCkesalthMapData>(this);

    if (ZonePhases.Num() == 0)
    {
        FCkesalthZonePhase P0; P0.PhaseIndex=0; P0.PhaseStartTime=0.0f; P0.ZoneCenter=FVector(0,0,500); P0.ZoneRadius=3000.0f;
        P0.ZoneDamagePerSecond=2.0f; P0.LootDropCount=10; P0.ClimateEffect=TEXT("Clear"); P0.MinAltitude=0; P0.MaxAltitude=2000; P0.AltitudeDamageModifier=1.0f;
        ZonePhases.Add(P0);

        FCkesalthZonePhase P1; P1.PhaseIndex=1; P1.PhaseStartTime=1350.0f; P1.ZoneCenter=FVector(200,100,800); P1.ZoneRadius=2200.0f;
        P1.ZoneDamagePerSecond=5.0f; P1.LootDropCount=8; P1.ClimateEffect=TEXT("Wind"); P1.MinAltitude=300; P1.MaxAltitude=2000; P1.AltitudeDamageModifier=1.2f;
        ZonePhases.Add(P1);

        FCkesalthZonePhase P2; P2.PhaseIndex=2; P2.PhaseStartTime=2700.0f; P2.ZoneCenter=FVector(100,50,1200); P2.ZoneRadius=1500.0f;
        P2.ZoneDamagePerSecond=8.0f; P2.LootDropCount=6; P2.ClimateEffect=TEXT("Snow"); P2.MinAltitude=800; P2.MaxAltitude=2000; P2.AltitudeDamageModifier=1.5f;
        ZonePhases.Add(P2);

        FCkesalthZonePhase P3; P3.PhaseIndex=3; P3.PhaseStartTime=4200.0f; P3.ZoneCenter=FVector(0,0,1600); P3.ZoneRadius=600.0f;
        P3.ZoneDamagePerSecond=12.0f; P3.LootDropCount=4; P3.ClimateEffect=TEXT("Blizzard"); P3.MinAltitude=1200; P3.MaxAltitude=2000; P3.AltitudeDamageModifier=2.0f;
        ZonePhases.Add(P3);
    }

    if (ZEXPoints.Num() == 0)
    {
        for (int32 i = 0; i < 25; i++)
        {
            FCkesalthZEX Z; Z.ZEXId = FGuid::NewGuid();
            Z.Location = FVector(FMath::RandRange(-2500.0f,2500.0f), FMath::RandRange(-2500.0f,2500.0f), FMath::RandRange(100.0f,1800.0f));
            Z.Altitude = Z.Location.Z; Z.XPBonus = 1.0f + (Z.Altitude / 2000.0f) * 0.5f;
            ZEXPoints.Add(Z);
        }
    }

    if (ZuVariants.Num() == 0)
    {
        FCkesalthZuEntry Z1; Z1.Variant=ECkesalthZuVariant::Zu1_Cinto; Z1.SpawnPoint=FVector(-2500,0,100); Z1.CinematicDuration=8.0f; ZuVariants.Add(Z1);
        FCkesalthZuEntry Z2; Z2.Variant=ECkesalthZuVariant::Zu2_Saltar; Z2.SpawnPoint=FVector(0,-2500,100); Z2.CinematicDuration=6.0f; ZuVariants.Add(Z2);
        FCkesalthZuEntry Z3; Z3.Variant=ECkesalthZuVariant::Zu3_Escalando; Z3.SpawnPoint=FVector(2500,2500,500); Z3.CinematicDuration=10.0f; Z3.WrongDecisionDamage=0.35f; ZuVariants.Add(Z3);
    }

    UE_LOG(LogTemp, Log, TEXT("[Ckesalth] Map data initialized — %d phases, %d ZEX, %d Zu"), ZonePhases.Num(), ZEXPoints.Num(), ZuVariants.Num());
}

void AKhaaosCkesalthLevel::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AKhaaosCkesalthLevel, CurrentZonePhase);
    DOREPLIFETIME(AKhaaosCkesalthLevel, ElapsedTime);
}
