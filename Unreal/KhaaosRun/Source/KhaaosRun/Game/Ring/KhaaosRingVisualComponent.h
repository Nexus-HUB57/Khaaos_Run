// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Game/Ring/KhaaosRingManager.h"
#include "Ring/KhaaosRingVisualComponent.generated.h"

// ─── Structs ──────────────────────────────────────────────────────────────────

/** Visual configuration for a ring phase. */
USTRUCT(BlueprintType)
struct FKhaaosRingPhaseVisual
{
	GENERATED_BODY()

	/** Border color for this phase. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Ring|Visual")
	FLinearColor BorderColor = FLinearColor::Blue;

	/** Emissive intensity multiplier. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Ring|Visual")
	float EmissiveIntensity = 1.0f;

	/** Pulse speed (Hz). Higher = faster pulse. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Ring|Visual")
	float PulseSpeed = 1.0f;

	/** Particle spawn rate multiplier. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Ring|Visual")
	float ParticleRateMultiplier = 1.0f;

	/** Whether electrical storm is active. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Ring|Visual")
	bool bElectricalStorm = false;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when ring phase visual changes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnRingPhaseVisualChanged, int32, Phase, FLinearColor, BorderColor);

/** Broadcast when electrical storm activates. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnElectricalStormActivated);

/**
 * UKhaaosRingVisualComponent
 *
 * Full ring visual rendering component for the Khaaos Run battle royale ring.
 * Manages Niagara particles for the zone wall, dynamic materials for phase-based
 * border glow, minimap overlay, and electrical storm VFX for final phases.
 *
 * Phase-based visual design:
 *   Phase 0-1: Blue border, calm pulse
 *   Phase 2-3: Orange border, fast pulse
 *   Phase 4:   Red border, electrical storm
 *   Phase 5+:  Crimson, maximum intensity
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosRingVisualComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosRingVisualComponent();

	// ─── Visual Update ─────────────────────────────────────────────────────

	/**
	 * Update ring visual based on current and target radii, and current phase.
	 * Updates Niagara particle parameters and material instance properties.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring|Visual")
	void UpdateRingVisual(float CurrentRadius, float TargetRadius, int32 Phase);

	/**
	 * Draw the next ring outline (preview ring).
	 * Renders a transparent white circle on minimap and in-world.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring|Visual")
	void ShowNextRingPreview();

	/**
	 * Activate electrical storm VFX for final ring phase.
	 * Intense Niagara particles, screen shake, and audio cues.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring|Visual")
	void ActivateElectricalStorm();

	/**
	 * Apply phase-specific visual configuration to materials and particles.
	 * Sets border color, emissive intensity, and pulse speed.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring|Visual")
	void SetRingPhaseVisual(int32 Phase);

	// ─── Configuration ─────────────────────────────────────────────────────

	/** Niagara system for the ring border zone wall effect. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual|Assets")
	TSoftObjectPtr<UNiagaraSystem> RingBorderNiagaraSystem;

	/** Niagara system for the next ring preview outline. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual|Assets")
	TSoftObjectPtr<UNiagaraSystem> RingPreviewNiagaraSystem;

	/** Niagara system for the electrical storm effect. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual|Assets")
	TSoftObjectPtr<UNiagaraSystem> ElectricalStormNiagaraSystem;

	/** Base material for the ring border glow. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual|Assets")
	TSoftObjectPtr<UMaterialInterface> RingBorderMaterial;

	/** Material for the minimap ring overlay. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual|Assets")
	TSoftObjectPtr<UMaterialInterface> MinimapRingMaterial;

	// ─── Phase Visual Configs ──────────────────────────────────────────────

	/** Visual config for Phase 0-1 (Blue, calm). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual|Phase")
	FKhaaosRingPhaseVisual PhaseVisual_0_1;

	/** Visual config for Phase 2-3 (Orange, fast). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual|Phase")
	FKhaaosRingPhaseVisual PhaseVisual_2_3;

	/** Visual config for Phase 4 (Red, electrical storm). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual|Phase")
	FKhaaosRingPhaseVisual PhaseVisual_4;

	/** Visual config for Phase 5+ (Crimson, max intensity). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual|Phase")
	FKhaaosRingPhaseVisual PhaseVisual_5Plus;

	// ─── Runtime State (Read-Only) ─────────────────────────────────────────

	/** Current visual phase. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
	int32 CurrentVisualPhase = 0;

	/** Whether electrical storm is active. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
	bool bElectricalStormActive = false;

	/** Current border color (set by phase). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
	FLinearColor CurrentBorderColor = FLinearColor::Blue;

	/** Current pulse speed (set by phase). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
	float CurrentPulseSpeed = 1.0f;

	// ─── Delegates ─────────────────────────────────────────────────────────

	/** Broadcast when ring phase visual changes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ring|Visual")
	FOnRingPhaseVisualChanged OnRingPhaseVisualChanged;

	/** Broadcast when electrical storm activates. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Ring|Visual")
	FOnElectricalStormActivated OnElectricalStormActivated;

	// ─── Niagara Component Accessors ───────────────────────────────────────

	/** Get the ring border Niagara component. */
	UNiagaraComponent* GetRingBorderComponent() const { return RingBorderComponent; }

	/** Get the ring preview Niagara component. */
	UNiagaraComponent* GetRingPreviewComponent() const { return RingPreviewComponent; }

	/** Get the electrical storm Niagara component. */
	UNiagaraComponent* GetElectricalStormComponent() const { return ElectricalStormComponent; }

protected:

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:

	// ─── Niagara Components ────────────────────────────────────────────────

	/** Spawned Niagara component for ring border particles. */
	UPROPERTY()
	TObjectPtr<UNiagaraComponent> RingBorderComponent;

	/** Spawned Niagara component for next ring preview outline. */
	UPROPERTY()
	TObjectPtr<UNiagaraComponent> RingPreviewComponent;

	/** Spawned Niagara component for electrical storm VFX. */
	UPROPERTY()
	TObjectPtr<UNiagaraComponent> ElectricalStormComponent;

	// ─── Dynamic Materials ─────────────────────────────────────────────────

	/** Dynamic material instance for ring border glow. */
	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> RingBorderMID;

	/** Dynamic material instance for minimap ring overlay. */
	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> MinimapRingMID;

	// ─── Internal State ────────────────────────────────────────────────────

	/** Last known current radius. */
	UPROPERTY()
	float LastCurrentRadius = 0.0f;

	/** Last known target radius. */
	UPROPERTY()
	float LastTargetRadius = 0.0f;

	/** Next ring preview radius. */
	UPROPERTY()
	float NextRingPreviewRadius = 0.0f;

	/** Whether the next ring preview is visible. */
	UPROPERTY()
	bool bPreviewVisible = false;

	/** Accumulated pulse time. */
	UPROPERTY()
	float PulseTime = 0.0f;

	/** Whether Niagara assets have been loaded. */
	UPROPERTY()
	bool bAssetsLoaded = false;

	// ─── Internal Methods ──────────────────────────────────────────────────

	/** Load and spawn Niagara components. */
	void InitializeVisualAssets();

	/** Get the phase visual config for a given phase index. */
	const FKhaaosRingPhaseVisual& GetPhaseVisualConfig(int32 Phase) const;

	/** Apply a phase visual config to the dynamic materials. */
	void ApplyPhaseVisualToMaterials(const FKhaaosRingPhaseVisual& PhaseVisual);

	/** Update the pulse animation on materials. */
	void UpdatePulse(float DeltaTime);

	/** Update minimap overlay with current ring state. */
	void UpdateMinimapOverlay();

	/** Set Niagara user parameters on the ring border component. */
	void SetRingBorderNiagaraParams(float CurrentRadius, float TargetRadius);

	/** Deactivate and clean up electrical storm VFX. */
	void DeactivateElectricalStorm();
};
