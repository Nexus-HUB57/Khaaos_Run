// Khaaos Run — CIGKV Zu Cinematic Component
// Fase 1 polish — audiovisual layer for the CIGKV Zu entry sequence.
//
// Wraps the camera, Niagara FX, MetaSound cue, and Marshal voice line that
// were declared as hooks in KhaaosPlayerController::PlayZuEntryCinematic
// (BlueprintImplementableEvent). Provides a C++ default that any
// BP_KhaaosPlayerController can opt out of by re-implementing the event.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosZuCinematicComponent.generated.h"

class APlayerController;
class UCameraComponent;
class UNiagaraSystem;
class UNiagaraComponent;
class USoundBase;
class UAudioComponent;
class UForceFeedbackEffect;

/** Mirrors ECIGKVZuVariant so the component stays decoupled from Level headers. */
UENUM(BlueprintType)
enum class EKhaaosZuCinematicVariant : uint8
{
    Zu1_Cinto    UMETA(DisplayName = "Zu1 — Caminhão / Cinto"),
    Zu2_Saltar   UMETA(DisplayName = "Zu2 — Capotamento / Saltar"),
    Zu3_Mascara  UMETA(DisplayName = "Zu3 — Ponte / Máscara O2")
};

/**
 * UKhaaosZuCinematicComponent
 *
 * Drives the client-side cinematic for a CIGKV Zu entry. The owning controller
 * calls BeginCinematic() from the replicated ClientBeginZuEntry handler; the
 * component then:
 *   1. Spawns a local-only Niagara FX emitter at the impact point.
 *   2. Detaches the player camera and lerps it to a near-impact viewpoint.
 *   3. Plays a 3D MetaSound cue (metal/rock/water impact).
 *   4. Plays the Marshal voice line via 2D audio (one-shot, fade out on stop).
 *   5. Restores the original view target and clears FX on EndCinematic().
 *
 * Pure-C++ default so the project compiles without a Blueprint override.
 */
UCLASS(ClassGroup = (Khaaos, CIGKV), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosZuCinematicComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosZuCinematicComponent();

    /** Drive the cinematic locally; safe to call multiple times (cancels prior). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|Zu|Cinematic")
    void BeginCinematic(APlayerController* OwningController, EKhaaosZuCinematicVariant Variant, float Duration);

    /** Restore the original view target and stop all spawned FX. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|CIGKV|Zu|Cinematic")
    void EndCinematic();

    /** Variant lookup (exposed for tests and BP inspectors). */
    UFUNCTION(BlueprintPure, Category = "Khaaos|CIGKV|Zu|Cinematic")
    static EKhaaosZuCinematicVariant VariantFromByte(uint8 VariantIndex);

    // ─── Content bindings (assigned in the BP_PlayerController defaults) ───

    /** Niagara system spawned for the impact (smoke + debris + dust). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Khaaos|CIGKV|Zu|Cinematic|FX")
    TArray<TObjectPtr<UNiagaraSystem>> VariantImpactFX;

    /** 3D MetaSound cue (one per variant: metal / debris / water). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Khaaos|CIGKV|Zu|Cinematic|Audio")
    TArray<TObjectPtr<USoundBase>> VariantImpactSounds;

    /** 2D voice line per variant (Marshal distorted — short, ~3-5s). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Khaaos|CIGKV|Zu|Cinematic|Audio")
    TArray<TObjectPtr<USoundBase>> VariantVoiceLines;

    /** Optional controller rumble while the cinematic plays. */
    UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Khaaos|CIGKV|Zu|Cinematic|Haptics")
    TObjectPtr<UForceFeedbackEffect> CinematicRumble;

    /** Camera shake intensity (0 disables). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Khaaos|CIGKV|Zu|Cinematic|Camera", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float CameraShakeScale = 0.65f;

    /** Camera offset from the impact point (variant-aware in subclasses). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Khaaos|CIGKV|Zu|Cinematic|Camera")
    FVector CameraOffsetFromImpact = FVector(-220.0f, 0.0f, 90.0f);

    /** World offset applied to the impact location (where FX spawns). */
    UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Khaaos|CIGKV|Zu|Cinematic|FX")
    FVector ImpactWorldOffset = FVector(0.0f, 0.0f, 50.0f);

protected:
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
    /** Plays a MetaSound 2D voice line and stores the handle for cleanup. */
    void PlayVoiceLine(USoundBase* Voice, float Duration);

    /** Stops + nulls any audio or FX currently owned by this component. */
    void ClearTransientEffects();

    UPROPERTY(Transient)
    TWeakObjectPtr<APlayerController> ActiveController;

    UPROPERTY(Transient)
    TObjectPtr<UNiagaraComponent> ActiveImpactFX = nullptr;

    UPROPERTY(Transient)
    TObjectPtr<UAudioComponent> ActiveVoiceAudio = nullptr;

    UPROPERTY(Transient)
    TObjectPtr<AActor> PreviousViewTarget = nullptr;

    FTimerHandle EndTimerHandle;
    bool bCinematicActive = false;
};
