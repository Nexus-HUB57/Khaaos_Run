// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Animation/KhaaosAnimBlueprintFunctionLibrary.h"
#include "KhaaosRun.h"

// ─── ComputeDirectionalBlendValues ─────────────────────────────────────────────
// ATan2-based directional decomposition normalized to [0,1].
// Forward = cosine of direction angle, Right = sine of direction angle.
// Up blend from vertical velocity (jump/fall).

FVector UKhaaosAnimBlueprintFunctionLibrary::ComputeDirectionalBlendValues(
    float VelocityZ,
    float VelocityX,
    float VelocityY,
    float MaxSpeed
)
{
    // Guard against zero speed
    const float SafeMaxSpeed = FMath::Max(MaxSpeed, KINDA_SMALL_NUMBER);

    // Horizontal speed in the X-Y plane
    const float HorizontalSpeed = FMath::Sqrt(VelocityX * VelocityX + VelocityY * VelocityY);

    // Direction angle from forward axis (atan2 of Right/Forward)
    const float DirectionAngle = FMath::Atan2(VelocityY, VelocityX);

    // Forward blend: cos(angle) mapped to [0,1]
    const float ForwardBlend = FMath::GetMappedRangeValueClamped(
        TRange<float>(-1.0f, 1.0f),
        TRange<float>(0.0f, 1.0f),
        FMath::Cos(DirectionAngle)
    );

    // Right blend: sin(angle) mapped to [0,1]
    const float RightBlend = FMath::GetMappedRangeValueClamped(
        TRange<float>(-1.0f, 1.0f),
        TRange<float>(0.0f, 1.0f),
        FMath::Sin(DirectionAngle)
    );

    // Up blend: vertical velocity normalized (0=grounded, 1=max jump/fall)
    const float UpBlend = FMath::Clamp(FMath::Abs(VelocityZ) / SafeMaxSpeed, 0.0f, 1.0f);

    return FVector(ForwardBlend, RightBlend, UpBlend);
}

// ─── ComputeTurnInPlaceAngle ──────────────────────────────────────────────────
// Delta yaw with wrapping to [-180, 180], scaled by delta time.
// Returns degrees per second for turn-in-place animation triggering.

float UKhaaosAnimBlueprintFunctionLibrary::ComputeTurnInPlaceAngle(
    float CurrentYaw,
    float PreviousYaw,
    float DeltaTime
)
{
    if (DeltaTime <= 0.0f) return 0.0f;

    // Compute raw delta yaw
    float DeltaYaw = CurrentYaw - PreviousYaw;

    // Wrap to [-180, 180] to handle rotation wrapping at 360/0 boundary
    if (DeltaYaw > 180.0f)
    {
        DeltaYaw -= 360.0f;
    }
    else if (DeltaYaw < -180.0f)
    {
        DeltaYaw += 360.0f;
    }

    // Scale by delta time to get degrees per second
    const float TurnRate = DeltaYaw / DeltaTime;

    return TurnRate;
}

// ─── ComputeAimOffset ─────────────────────────────────────────────────────────
// Pitch/Yaw to normalized 2D offset, clamped for bone rotation limits.
// Returns FVector2D where X=PitchOffset [-1,1], Y=YawOffset [-1,1].

FVector2D UKhaaosAnimBlueprintFunctionLibrary::ComputeAimOffset(
    float Pitch,
    float Yaw,
    float ClampPitch
)
{
    // Clamp pitch to bone limits (e.g. 90 degrees for spine/head)
    const float SafeClampPitch = FMath::Max(ClampPitch, 1.0f);
    const float ClampedPitch = FMath::Clamp(Pitch, -SafeClampPitch, SafeClampPitch);

    // Normalize to [-1, 1] range
    const float PitchOffset = ClampedPitch / SafeClampPitch;
    const float YawOffset = FMath::Clamp(Yaw / 180.0f, -1.0f, 1.0f);

    return FVector2D(PitchOffset, YawOffset);
}

// ─── ShouldPlayFireMontage ────────────────────────────────────────────────────
// True for Primary/Secondary weapon slots (gun fire montage).
// False for Melee slot (uses different montage via GetMeleeMontage).

bool UKhaaosAnimBlueprintFunctionLibrary::ShouldPlayFireMontage(
    EKhaaosInventorySlot ActiveSlot,
    bool bIsAiming
)
{
    switch (ActiveSlot)
    {
    case EKhaaosInventorySlot::Primary:
    case EKhaaosInventorySlot::Secondary:
        return true;

    case EKhaaosInventorySlot::Melee:
        return false; // Melee uses GetMeleeMontage() instead

    default:
        return false;
    }
}

// ─── GetLayerBlendWeight ──────────────────────────────────────────────────────
// 0.0 = full body (locomotion only)
// 1.0 = upper body only (ADS/firing/reloading override)
// Priority: Reloading > Firing > ADS for smooth transitions.

float UKhaaosAnimBlueprintFunctionLibrary::GetLayerBlendWeight(
    bool bIsADS,
    bool bIsFiring,
    bool bIsReloading
)
{
    // Reloading takes highest priority — full upper body override
    if (bIsReloading)
    {
        return 1.0f;
    }

    // Firing — full upper body for fire/recoil animations
    if (bIsFiring)
    {
        return 1.0f;
    }

    // ADS — upper body only for aim overlay blending
    if (bIsADS)
    {
        return 1.0f;
    }

    // Default: full body (locomotion, jumps, etc.)
    return 0.0f;
}
