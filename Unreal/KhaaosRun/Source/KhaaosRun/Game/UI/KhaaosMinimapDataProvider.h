// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosMinimapDataProvider.generated.h"

UENUM(BlueprintType)
enum class EKhaaosMinimapIconType : uint8
{
    Player       UMETA(DisplayName = "PLAYER"),
    Zone         UMETA(DisplayName = "ZONE"),
    Loot         UMETA(DisplayName = "LOOT"),
    Pulso        UMETA(DisplayName = "PULSO"),
    Vehicle      UMETA(DisplayName = "VEHICLE"),
    ReviveStation UMETA(DisplayName = "REVIVE_STATION"),
    SafeZone     UMETA(DisplayName = "SAFE_ZONE")
};

USTRUCT(BlueprintType)
struct FKhaaosMinimapIcon
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
    FVector2D WorldPosition2D = FVector2D::ZeroVector;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
    EKhaaosMinimapIconType IconType = EKhaaosMinimapIconType::Player;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
    int32 TeamIndex = 0;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
    uint8 bIsLocalPlayer : 1;
};

UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosMinimapDataProvider : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosMinimapDataProvider();

    UFUNCTION(BlueprintCallable, Category = "Khaaos|Minimap")
    TArray<FKhaaosMinimapIcon> GatherMinimapData();

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Minimap")
    float NearbyPlayerRadius = 5000.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Minimap")
    float NearbyLootRadius = 3000.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Minimap")
    float UpdateInterval = 0.5f;

protected:

    float TimeSinceLastUpdate = 0.0f;
    TArray<FKhaaosMinimapIcon> CachedIcons;
};
