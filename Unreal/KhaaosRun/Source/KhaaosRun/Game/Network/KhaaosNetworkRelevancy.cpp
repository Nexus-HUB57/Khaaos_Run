// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Network/KhaaosNetworkRelevancy.h"
#include "KhaaosRun.h"

#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerState.h"
#include "GameFramework/GameStateBase.h"
#include "GameFramework/Character.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

// ─── UKhaaosRelevancySubsystem ─────────────────────────────────────────────────

UKhaaosRelevancySubsystem::UKhaaosRelevancySubsystem()
{
        DefaultViewDistance = 10000.0f;
        RelevancyHysteresis = 500.0f;
        MinNetUpdateFrequency = 1.0f;
        MaxNetUpdateFrequency = 60.0f;
        RelevancyTickInterval = 0.5f;
        TimeSinceLastTick = 0.0f;
        bEnabled = true;
}

void UKhaaosRelevancySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRelevancySubsystem::Initialize - "
                "DefaultViewDist=%.0f, Hysteresis=%.0f, TickInterval=%.2f"),
                DefaultViewDistance, RelevancyHysteresis, RelevancyTickInterval);

        // ─── Initialize default relevancy profiles ────────────────────────────

        // PlayerState: high frequency, close range
        FRelevancyProfile PlayerProfile;
        PlayerProfile.ViewDistance = 8000.0f;
        PlayerProfile.UpdateFrequency = 30.0f;
        PlayerProfile.Priority = 1;
        PlayerProfile.bUseSpatialRelevancy = true;

        // GameState: always relevant (no distance check)
        FRelevancyProfile GameStateProfile;
        GameStateProfile.ViewDistance = 0.0f; // 0 = always relevant
        GameStateProfile.UpdateFrequency = 10.0f;
        GameStateProfile.Priority = 1;
        GameStateProfile.bUseSpatialRelevancy = false;

        // Projectile: low priority, short range
        FRelevancyProfile ProjectileProfile;
        ProjectileProfile.ViewDistance = 5000.0f;
        ProjectileProfile.UpdateFrequency = 60.0f;
        ProjectileProfile.Priority = 3;
        ProjectileProfile.bUseSpatialRelevancy = true;

        // AI: medium priority, medium range
        FRelevancyProfile AIProfile;
        AIProfile.ViewDistance = 6000.0f;
        AIProfile.UpdateFrequency = 15.0f;
        AIProfile.Priority = 2;
        AIProfile.bUseSpatialRelevancy = true;

        // Loot: low priority, close range
        FRelevancyProfile LootProfile;
        LootProfile.ViewDistance = 3000.0f;
        LootProfile.UpdateFrequency = 5.0f;
        LootProfile.Priority = 3;
        LootProfile.bUseSpatialRelevancy = true;
}

void UKhaaosRelevancySubsystem::Deinitialize()
{
        RegisteredActors.Empty();

        Super::Deinitialize();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosRelevancySubsystem::Deinitialize"));
}

void UKhaaosRelevancySubsystem::Tick(float DeltaTime)
{
        if (!bEnabled)
        {
                return;
        }

        TimeSinceLastTick += DeltaTime;
        if (TimeSinceLastTick < RelevancyTickInterval)
        {
                return;
        }
        TimeSinceLastTick = 0.0f;

        // ─── Update relevancy for all registered actors ───────────────────────

        UWorld* World = GetWorld();
        if (!World || !World->IsServer())
        {
                return;
        }

        // Get all player controllers as viewers
        TArray<APlayerController*> Viewers;
        for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
        {
                if (It->IsValid())
                {
                        Viewers.Add(It->Get());
                }
        }

        if (Viewers.Num() == 0)
        {
                return;
        }

        // ─── Throttle NetUpdateFrequency based on distance to nearest viewer ───

        for (AActor* Actor : RegisteredActors)
        {
                if (!Actor || !IsValid(Actor))
                {
                        continue;
                }

                // Find the relevancy profile
                const FRelevancyProfile* Profile = GetRelevancyProfile(Actor->GetClass());
                if (!Profile)
                {
                        continue;
                }

                // Always-relevant actors (ViewDistance == 0)
                if (Profile->ViewDistance <= 0.0f)
                {
                        Actor->NetUpdateFrequency = FMath::Clamp(Profile->UpdateFrequency, MinNetUpdateFrequency, MaxNetUpdateFrequency);
                        continue;
                }

                // Calculate distance to nearest viewer
                float MinDistanceSq = MAX_FLT;
                FVector ActorLocation = Actor->GetActorLocation();

                for (APlayerController* Viewer : Viewers)
                {
                        if (!Viewer || !Viewer->GetPawnOrSpectator())
                        {
                                continue;
                        }

                        float DistSq = FVector::DistSquared(ActorLocation, Viewer->GetPawnOrSpectator()->GetActorLocation());
                        MinDistanceSq = FMath::Min(MinDistanceSq, DistSq);
                }

                float MinDistance = FMath::Sqrt(MinDistanceSq);

                // ─── Distance-based frequency throttling ──────────────────────
                // Linear interpolation between full frequency (at 0 distance)
                // and minimum frequency (at ViewDistance + Hysteresis)

                float FullDistance = Profile->ViewDistance;
                float MaxDistance = FullDistance + RelevancyHysteresis;

                if (MinDistance >= MaxDistance)
                {
                        // Beyond relevancy range: minimum frequency
                        Actor->NetUpdateFrequency = MinNetUpdateFrequency;
                }
                else if (MinDistance <= FullDistance)
                {
                        // Within relevancy range: full frequency
                        Actor->NetUpdateFrequency = FMath::Clamp(Profile->UpdateFrequency, MinNetUpdateFrequency, MaxNetUpdateFrequency);
                }
                else
                {
                        // Hysteresis zone: interpolate between full and min
                        float Alpha = (MinDistance - FullDistance) / RelevancyHysteresis;
                        float TargetFrequency = FMath::Lerp(Profile->UpdateFrequency, MinNetUpdateFrequency, Alpha);
                        Actor->NetUpdateFrequency = FMath::Clamp(TargetFrequency, MinNetUpdateFrequency, MaxNetUpdateFrequency);
                }
        }
}

TStatId UKhaaosRelevancySubsystem::GetStatId() const
{
        RETURN_QUICK_DECLARE_CYCLE_STAT(KhaaosRelevancySubsystem, STATGROUP_Tickables);
}

void UKhaaosRelevancySubsystem::RegisterActorForRelevancy(AActor* Actor)
{
        if (!Actor)
        {
                return;
        }

        RegisteredActors.Add(Actor);

        // Apply relevancy profile to the actor
        const FRelevancyProfile* Profile = GetRelevancyProfile(Actor->GetClass());
        if (Profile)
        {
                Actor->NetPriority = Profile->Priority;
                Actor->NetUpdateFrequency = FMath::Clamp(Profile->UpdateFrequency, MinNetUpdateFrequency, MaxNetUpdateFrequency);
        }

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosRelevancySubsystem::RegisterActorForRelevancy - %s"), *Actor->GetName());
}

void UKhaaosRelevancySubsystem::UnregisterActor(AActor* Actor)
{
        if (!Actor)
        {
                return;
        }

        RegisteredActors.Remove(Actor);

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosRelevancySubsystem::UnregisterActor - %s"), *Actor->GetName());
}

bool UKhaaosRelevancySubsystem::IsActorRelevantForViewer(AActor* Actor, APlayerController* Viewer) const
{
        if (!Actor || !Viewer)
        {
                return false;
        }

        // Always-relevant actors (ViewDistance == 0)
        const FRelevancyProfile* Profile = GetRelevancyProfile(Actor->GetClass());
        if (!Profile || Profile->ViewDistance <= 0.0f)
        {
                return true;
        }

        // Distance check
        APawn* ViewerPawn = Viewer->GetPawnOrSpectator();
        if (!ViewerPawn)
        {
                return false;
        }

        float Distance = FVector::Dist(Actor->GetActorLocation(), ViewerPawn->GetActorLocation());

        // Include hysteresis: once relevant, stay relevant until ViewDistance + Hysteresis
        return Distance <= (Profile->ViewDistance + RelevancyHysteresis);
}

const FRelevancyProfile* UKhaaosRelevancySubsystem::GetRelevancyProfile(TSubclassOf<AActor> ActorClass) const
{
        if (!ActorClass)
        {
                return nullptr;
        }

        // Direct lookup
        const FRelevancyProfile* Profile = ActorRelevancyMap.Find(ActorClass);
        if (Profile)
        {
                return Profile;
        }

        // Walk up the class hierarchy for inherited profiles
        for (UClass* CurrentClass = ActorClass; CurrentClass; CurrentClass = CurrentClass->GetSuperClass())
        {
                Profile = ActorRelevancyMap.Find(CurrentClass);
                if (Profile)
                {
                        return Profile;
                }
        }

        return nullptr;
}
