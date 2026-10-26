// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/KhaaosMinimapDataProvider.h"
#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"

#include "GameFramework/PlayerController.h"
#include "Engine/World.h"

UKhaaosMinimapDataProvider::UKhaaosMinimapDataProvider()
{
    PrimaryComponentTick.bCanEverTick = true;
    NearbyPlayerRadius = 5000.0f;
    NearbyLootRadius = 3000.0f;
    UpdateInterval = 0.5f;
    TimeSinceLastUpdate = 0.0f;
}

TArray<FKhaaosMinimapIcon> UKhaaosMinimapDataProvider::GatherMinimapData()
{
    TArray<FKhaaosMinimapIcon> Icons;

    UWorld* World = GetWorld();
    if (!World) return Icons;

    // Get local player position
    FVector2D LocalPos2D = FVector2D::ZeroVector;
    APlayerController* LocalPC = Cast<APlayerController>(GetOwner());
    if (LocalPC && LocalPC->GetPawn())
    {
        FVector Loc = LocalPC->GetPawn()->GetActorLocation();
        LocalPos2D = FVector2D(Loc.X, Loc.Y);
    }

    // Gather alive player positions
    for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
    {
        if (APlayerController* PC = It->Get())
        {
            if (AKhaaosPlayerState* KPS = Cast<AKhaaosPlayerState>(PC->PlayerState))
            {
                if (KPS->PlayerStatus != EPlayerStatus::Vivo) continue;
                if (!PC->GetPawn()) continue;

                FVector PawnLoc = PC->GetPawn()->GetActorLocation();
                FVector2D Pos2D(PawnLoc.X, PawnLoc.Y);

                // Only include nearby players (or self)
                float Dist = FVector2D::Distance(Pos2D, LocalPos2D);
                if (Dist > NearbyPlayerRadius && PC != LocalPC) continue;

                FKhaaosMinimapIcon Icon;
                Icon.WorldPosition2D = Pos2D;
                Icon.IconType = EKhaaosMinimapIconType::Player;
                Icon.TeamIndex = 0;
                Icon.bIsLocalPlayer = (PC == LocalPC) ? 1 : 0;
                Icons.Add(Icon);
            }
        }
    }

    // Zone icon (center of safe zone)
    FKhaaosMinimapIcon ZoneIcon;
    ZoneIcon.WorldPosition2D = FVector2D::ZeroVector; // Would read from GameState
    ZoneIcon.IconType = EKhaaosMinimapIconType::SafeZone;
    Icons.Add(ZoneIcon);

    return Icons;
}
