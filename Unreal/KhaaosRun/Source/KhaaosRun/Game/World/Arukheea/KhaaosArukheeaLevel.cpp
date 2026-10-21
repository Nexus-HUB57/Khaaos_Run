// ============================================================================
// Khaaos Run — W4/C4 Arukheea Level Script Actor Implementation (Fase 4)
// ============================================================================

#include "Game/World/Arukheea/KhaaosArukheeaLevel.h"
#include "Game/KhaaosGameMode.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/Loot/KhaaosLootPickup.h"
#include "Game/World/Arukheea/KhaaosArukheeaMapData.h"
#include "Net/UnrealNetwork.h"
#include "Kismet/GameplayStatics.h"

AKhaaosArukheeaLevel::AKhaaosArukheeaLevel()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = true;
    MaxPlayers = 80;
    RingDuration = 6000.0f;        // ~1h40m
    EntryBlockTime = 200.0f;
    PulsoKhaaosInterval = 500.0f;
    InactivityThreshold = 100.0f;
    InactivityDamagePerSecond = 2.5f;
    MinW3MatchesForEntry = 5;
    KRCEarnMultiplier = 3.0f;
    BaseHeatDamagePerSecond = 1.5f;
    SandstormInterval = 900.0f;
    OasisHealRadius = 500.0f;
}

void AKhaaosArukheeaLevel::BeginPlay()
{
    Super::BeginPlay();
    InitializeMapData();
    TArray<AActor*> SafeZones;
    UGameplayStatics::GetAllActorsOfClass(GetWorld(), AKhaaosSafeZone::StaticClass(), SafeZones);
    if (SafeZones.Num() > 0) SafeZone = Cast<AKhaaosSafeZone>(SafeZones[0]);
    if (HasAuthority()) StartZoneSequence();
    UE_LOG(LogTemp, Log, TEXT("[Arukheea] Level started — MaxPlayers=%d, Duration=%.0fs"), MaxPlayers, RingDuration);
}

void AKhaaosArukheeaLevel::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!HasAuthority()) return;
    ElapsedTime += DeltaSeconds;
    if (ElapsedTime >= RingDuration) { UE_LOG(LogTemp, Log, TEXT("[Arukheea] Ring complete.")); return; }

    TimeSinceLastPulso += DeltaSeconds;
    if (TimeSinceLastPulso >= PulsoKhaaosInterval)
    {
        TimeSinceLastPulso = 0.0f;
        SpawnPulsoKhaaosDrop();
    }

    // Desert mechanics
    ProcessHeatDamage(DeltaSeconds);
    ProcessOasisHealing(DeltaSeconds);

    // Sandstorm system
    TimeSinceLastSandstorm += DeltaSeconds;
    if (TimeSinceLastSandstorm >= SandstormInterval)
    {
        TimeSinceLastSandstorm = 0.0f;
        if (FMath::FRand() < 0.6f) TriggerSandstorm();
    }
    UpdateSandstorms(DeltaSeconds);

    UpdateZEXActivation();
    ProcessInactivityPunishment(DeltaSeconds);
}

void AKhaaosArukheeaLevel::StartZoneSequence()
{
    if (ZonePhases.Num() == 0) { UE_LOG(LogTemp, Warning, TEXT("[Arukheea] No zone phases!")); return; }
    CurrentZonePhase = 0;
    if (ZonePhases.Num() > 1)
        GetWorldTimerManager().SetTimer(ZonePhaseTimer, this, &AKhaaosArukheeaLevel::AdvanceZonePhase, ZonePhases[1].PhaseStartTime, false);
}

void AKhaaosArukheeaLevel::AdvanceZonePhase()
{
    CurrentZonePhase++;
    if (CurrentZonePhase >= ZonePhases.Num()) return;
    const FArukheeaZonePhase& Phase = ZonePhases[CurrentZonePhase];
    UE_LOG(LogTemp, Log, TEXT("[Arukheea] Zone phase %d — Center=(%s), Radius=%.0f, Heat=%.2f, Oasis=%s"),
        Phase.PhaseIndex, *Phase.ZoneCenter.ToString(), Phase.ZoneRadius,
        Phase.HeatIntensity, Phase.bIsOasisZone ? TEXT("Yes") : TEXT("No"));
    if (SafeZone) { SafeZone->SetZoneCenter(Phase.ZoneCenter); SafeZone->SetZoneRadius(Phase.ZoneRadius); SafeZone->SetZoneDamage(Phase.ZoneDamagePerSecond); }
    SpawnPhaseLoot();
    if (CurrentZonePhase + 1 < ZonePhases.Num())
    {
        float T = ZonePhases[CurrentZonePhase+1].PhaseStartTime - ElapsedTime;
        if (T > 0) GetWorldTimerManager().SetTimer(ZonePhaseTimer, this, &AKhaaosArukheeaLevel::AdvanceZonePhase, T, false);
    }
}

void AKhaaosArukheeaLevel::ProcessHeatDamage(float DeltaSeconds)
{
    if (CurrentZonePhase >= ZonePhases.Num()) return;
    float Heat = ZonePhases[CurrentZonePhase].HeatIntensity;
    if (Heat <= 0.0f) return;

    for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (APawn* Pawn = PC->GetPawn())
            {
                FVector Loc = Pawn->GetActorLocation();
                // Check if player is near an oasis (no heat damage)
                bool bNearOasis = false;
                for (const FVector& Oasis : OasisPositions)
                {
                    if (FVector::Dist2D(Loc, Oasis) < OasisHealRadius) { bNearOasis = true; break; }
                }
                if (!bNearOasis)
                {
                    float Damage = BaseHeatDamagePerSecond * Heat * DeltaSeconds;
                    // Apply heat damage via GAS
                }
            }
        }
    }
}

void AKhaaosArukheeaLevel::ProcessOasisHealing(float DeltaSeconds)
{
    if (CurrentZonePhase >= ZonePhases.Num()) return;
    const FArukheeaZonePhase& Phase = ZonePhases[CurrentZonePhase];

    for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (APawn* Pawn = PC->GetPawn())
            {
                for (const FVector& Oasis : OasisPositions)
                {
                    if (FVector::Dist2D(Pawn->GetActorLocation(), Oasis) < OasisHealRadius)
                    {
                        float Heal = Phase.OasisHealPerSecond * DeltaSeconds;
                        // Apply healing via GAS
                    }
                }
            }
        }
    }
}

void AKhaaosArukheeaLevel::TriggerSandstorm()
{
    FArukheeaSandstorm Storm;
    Storm.Center = FVector(FMath::RandRange(-4000.0f,4000.0f), FMath::RandRange(-4000.0f,4000.0f), 0.0f);
    Storm.Radius = FMath::RandRange(1500.0f, 3000.0f);
    Storm.MoveSpeed = FMath::RandRange(50.0f, 200.0f);
    float Angle = FMath::RandRange(0.0f, 2.0f * PI);
    Storm.MoveDirection = FVector(FMath::Cos(Angle), FMath::Sin(Angle), 0.0f);
    Storm.VisibilityReduction = FMath::RandRange(0.6f, 0.9f);
    Storm.DamagePerSecond = FMath::RandRange(1.0f, 3.0f);
    Storm.bIsActive = true;
    Storm.Duration = FMath::RandRange(60.0f, 180.0f);
    Storm.Elapsed = 0.0f;
    ActiveSandstorms.Add(Storm);
    UE_LOG(LogTemp, Log, TEXT("[Arukheea] Sandstorm triggered at (%s), radius=%.0f, duration=%.0fs"),
        *Storm.Center.ToString(), Storm.Radius, Storm.Duration);
}

void AKhaaosArukheeaLevel::UpdateSandstorms(float DeltaSeconds)
{
    for (int32 i = ActiveSandstorms.Num() - 1; i >= 0; i--)
    {
        FArukheeaSandstorm& Storm = ActiveSandstorms[i];
        Storm.Elapsed += DeltaSeconds;
        Storm.Center += Storm.MoveDirection * Storm.MoveSpeed * DeltaSeconds;

        if (Storm.Elapsed >= Storm.Duration)
        {
            ActiveSandstorms.RemoveAt(i);
            UE_LOG(LogTemp, Log, TEXT("[Arukheea] Sandstorm ended"));
            continue;
        }

        // Apply sandstorm effects to players inside
        for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
        {
            if (APlayerController* PC = It->Get())
            {
                if (APawn* Pawn = PC->GetPawn())
                {
                    if (FVector::Dist(Pawn->GetActorLocation(), Storm.Center) <= Storm.Radius)
                    {
                        float Damage = Storm.DamagePerSecond * DeltaSeconds;
                        // Apply sand damage + visibility reduction via GAS
                    }
                }
            }
        }
    }
}

void AKhaaosArukheeaLevel::SpawnPhaseLoot()
{
    if (CurrentZonePhase >= ZonePhases.Num() || !MapData) return;
    const FArukheeaZonePhase& Phase = ZonePhases[CurrentZonePhase];
    TArray<FVector> Points = MapData->GetRandomLootSpawnPoints(Phase.LootDropCount, Phase.ZoneCenter, Phase.ZoneRadius);
    for (const FVector& P : Points) { if (AKhaaosLootPickup* L = SpawnLootAt(P, FRotator::ZeroRotator)) ActiveLootPickups.Add(L); }
}

void AKhaaosArukheeaLevel::SpawnPulsoKhaaosDrop()
{
    if (!MapData || CurrentZonePhase >= ZonePhases.Num()) return;
    FVector Drop = MapData->GetRandomPointInZone(ZonePhases[CurrentZonePhase].ZoneCenter, ZonePhases[CurrentZonePhase].ZoneRadius);
    if (AKhaaosLootPickup* L = SpawnLootAt(Drop, FRotator::ZeroRotator)) { L->SetRarity(EItemRarity::Legendary); ActiveLootPickups.Add(L); }
}

AKhaaosLootPickup* AKhaaosArukheeaLevel::SpawnLootAt(const FVector& Location, const FRotator& Rotation)
{
    FActorSpawnParameters SP; SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
    return GetWorld()->SpawnActor<AKhaaosLootPickup>(AKhaaosLootPickup::StaticClass(), Location, Rotation, SP);
}

void AKhaaosArukheeaLevel::UpdateZEXActivation()
{
    if (CurrentZonePhase >= ZonePhases.Num()) return;
    const FArukheeaZonePhase& Phase = ZonePhases[CurrentZonePhase];
    for (FArukheeaZEX& Z : ZEXPoints) Z.bIsActive = (FVector::Dist(Z.Location, Phase.ZoneCenter) <= Phase.ZoneRadius);
}

bool AKhaaosArukheeaLevel::PlayerExtractAtZEX(APlayerState* PS, const FGuid& Id)
{
    for (FArukheeaZEX& Z : ZEXPoints)
    {
        if (Z.ZEXId == Id && Z.bIsActive)
        {
            float Bonus = Z.XPBonus * (Z.bIsOasis ? 1.5f : 1.0f);
            UE_LOG(LogTemp, Log, TEXT("[Arukheea] Extract at ZEX (oasis=%s, bonus=%.1fx)"), Z.bIsOasis?TEXT("Y"):TEXT("N"), Bonus);
            return true;
        }
    }
    return false;
}

void AKhaaosArukheeaLevel::StartZuEntry(APlayerController* PC)
{
    if (!PC || ZuVariants.Num() == 0) return;
    const FArukheeaZuEntry& Zu = ZuVariants[FMath::RandRange(0, ZuVariants.Num()-1)];
    if (APawn* P = PC->GetPawn()) { P->SetActorLocation(Zu.SpawnPoint); P->SetActorRotation(Zu.SpawnRotation); }
    if (Zu.Variant == EArukheeaZuVariant::Zu3_Areia) UE_LOG(LogTemp, Log, TEXT("[Arukheea] Zu3 Areia: Sand entry — visibility reduced, must find shelter"));
}

void AKhaaosArukheeaLevel::ResolveZuDecision(APlayerController* PC, bool bCorrect)
{
    if (!PC) return;
    UE_LOG(LogTemp, Log, TEXT("[Arukheea] Zu: %s decision"), bCorrect ? TEXT("Correct") : TEXT("Wrong"));
}

bool AKhaaosArukheeaLevel::CanPlayerEnter() const { return (RingDuration - ElapsedTime) > EntryBlockTime && GetAlivePlayerCount() < MaxPlayers; }
bool AKhaaosArukheeaLevel::MeetsEntryRequirements(int32 W3) const { return W3 >= MinW3MatchesForEntry; }
int32 AKhaaosArukheeaLevel::GetAlivePlayerCount() const { if (auto* GM = GetWorld()->GetAuthGameMode<AKhaaosGameMode>()) return GM->NumPlayers; return 0; }
void AKhaaosArukheeaLevel::ProcessInactivityPunishment(float DeltaSeconds) { /* Heat + inactivity = dehydration */ }

void AKhaaosArukheeaLevel::InitializeMapData()
{
    if (!MapData) MapData = NewObject<UKhaaosArukheeaMapData>(this);

    if (ZonePhases.Num() == 0)
    {
        FArukheeaZonePhase P0; P0.PhaseIndex=0; P0.PhaseStartTime=0; P0.ZoneCenter=FVector(0,0,0); P0.ZoneRadius=5000;
        P0.ZoneDamagePerSecond=2; P0.LootDropCount=12; P0.ClimateEffect=TEXT("Hot"); P0.HeatIntensity=0.6f;
        ZonePhases.Add(P0);

        FArukheeaZonePhase P1; P1.PhaseIndex=1; P1.PhaseStartTime=1500; P1.ZoneCenter=FVector(500,0,0); P1.ZoneRadius=3500;
        P1.ZoneDamagePerSecond=5; P1.LootDropCount=10; P1.ClimateEffect=TEXT("Sandstorm"); P1.HeatIntensity=0.8f;
        ZonePhases.Add(P1);

        FArukheeaZonePhase P2; P2.PhaseIndex=2; P2.PhaseStartTime=3500; P2.ZoneCenter=FVector(1000,500,0); P2.ZoneRadius=2000;
        P2.ZoneDamagePerSecond=8; P2.LootDropCount=7; P2.ClimateEffect=TEXT("Oasis"); P2.HeatIntensity=0.3f;
        P2.bIsOasisZone=true; P2.OasisHealPerSecond=5.0f;
        ZonePhases.Add(P2);

        FArukheeaZonePhase P3; P3.PhaseIndex=3; P3.PhaseStartTime=5000; P3.ZoneCenter=FVector(800,400,0); P3.ZoneRadius=800;
        P3.ZoneDamagePerSecond=12; P3.LootDropCount=4; P3.ClimateEffect=TEXT("HeatWave"); P3.HeatIntensity=1.0f;
        ZonePhases.Add(P3);
    }

    if (ZEXPoints.Num() == 0)
    {
        // 8 oasis ZEX
        for (int32 i=0;i<8;i++) { FArukheeaZEX Z; Z.ZEXId=FGuid::NewGuid(); Z.Location=FVector(FMath::RandRange(-3000,3000),FMath::RandRange(-3000,3000),0); Z.bIsOasis=true; Z.XPBonus=1.5f; ZEXPoints.Add(Z); }
        // 14 canyon ZEX
        for (int32 i=0;i<14;i++) { FArukheeaZEX Z; Z.ZEXId=FGuid::NewGuid(); Z.Location=FVector(FMath::RandRange(-4000,4000),FMath::RandRange(-4000,4000),FMath::RandRange(-200,100)); Z.bIsOasis=false; Z.XPBonus=1.0f; ZEXPoints.Add(Z); }
    }

    if (ZuVariants.Num() == 0)
    {
        FArukheeaZuEntry Z1; Z1.Variant=EArukheeaZuVariant::Zu1_Cinto; Z1.SpawnPoint=FVector(-4500,0,100); Z1.CinematicDuration=8.0f; ZuVariants.Add(Z1);
        FArukheeaZuEntry Z2; Z2.Variant=EArukheeaZuVariant::Zu2_Saltar; Z2.SpawnPoint=FVector(0,-4500,100); Z2.CinematicDuration=6.0f; ZuVariants.Add(Z2);
        FArukheeaZuEntry Z3; Z3.Variant=EArukheeaZuVariant::Zu3_Areia; Z3.SpawnPoint=FVector(4500,4500,200); Z3.CinematicDuration=9.0f; Z3.WrongDecisionDamage=0.35f; ZuVariants.Add(Z3);
    }

    if (OasisPositions.Num() == 0)
    {
        OasisPositions = { FVector(1000,500,0), FVector(-1500,2000,0), FVector(2000,-1000,0), FVector(-500,-2500,0), FVector(3000,1500,0) };
    }

    UE_LOG(LogTemp, Log, TEXT("[Arukheea] Map data initialized — %d phases, %d ZEX, %d Zu, %d oases"),
        ZonePhases.Num(), ZEXPoints.Num(), ZuVariants.Num(), OasisPositions.Num());
}

void AKhaaosArukheeaLevel::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AKhaaosArukheeaLevel, CurrentZonePhase);
    DOREPLIFETIME(AKhaaosArukheeaLevel, ElapsedTime);
}
