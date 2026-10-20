// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "Game/Inventory/KhaaosInventoryComponent.h"
#include "KhaaosAnimBlueprintFunctionLibrary.generated.h"

// ─── Animation Blueprint Function Library ──────────────────────────────────────
// Shared animation utilities for Blueprint and C++ animation logic.
// Provides math helpers for directional blends, turn-in-place, aim offsets,
// and layer blend weight computation used by KhaaosPlayerAnimInstance
// and species-specific AnimLayer implementations.
// ═══════════════════════════════════════════════════════════════════════════════

UCLASS()
class UKhaaosAnimBlueprintFunctionLibrary : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()

public:

    /** Compute directional blend values from velocity components.
     *  Uses ATan2-based decomposition normalized to [0,1] range.
     *  Returns FVector where X=Forward, Y=Right, Z=Up blend weights.
     *  Used by locomotion BlendSpace to select the correct walk/run direction. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Animation")
    static FVector ComputeDirectionalBlendValues(
        float VelocityZ,
        float VelocityX,
        float VelocityY,
        float MaxSpeed
    );

    /** Compute turn-in-place angle from yaw delta.
     *  Wraps the delta yaw to [-180, 180] and scales by delta time
     *  for smooth rotation blending. Returns degrees per second. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Animation")
    static float ComputeTurnInPlaceAngle(
        float CurrentYaw,
        float PreviousYaw,
        float DeltaTime
    );

    /** Compute aim offset (pitch/yaw) as a 2D vector for aim-offset blending.
     *  Clamps pitch to bone rotation limits (e.g. [-90, 90] for spine).
     *  Returns FVector2D where X=PitchOffset, Y=YawOffset in normalized [-1,1]. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Animation")
    static FVector2D ComputeAimOffset(
        float Pitch,
        float Yaw,
        float ClampPitch
    );

    /** Determine whether a fire montage should play based on active inventory slot.
     *  Returns true for Primary and Secondary weapon slots.
     *  Returns false for Melee (uses a different montage via GetMeleeMontage). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Animation")
    static bool ShouldPlayFireMontage(
        EKhaaosInventorySlot ActiveSlot,
        bool bIsAiming
    );

    /** Compute the layer blend weight for upper-body / full-body blending.
     *  Returns 0.0 for full-body (normal locomotion),
     *  Returns 1.0 for upper-body only (ADS, firing, reloading).
     *  Intermediate values provide smooth transitions. */
    UFUNCTION(BlueprintPure, Category = "Khaaos|Animation")
    static float GetLayerBlendWeight(
        bool bIsADS,
        bool bIsFiring,
        bool bIsReloading
    );
};
