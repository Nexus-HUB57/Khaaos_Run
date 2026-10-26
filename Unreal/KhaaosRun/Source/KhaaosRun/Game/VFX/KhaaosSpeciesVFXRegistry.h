// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "NiagaraSystem.h"
#include "NiagaraComponent.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosSpeciesVFXRegistry.generated.h"

// ─── Structs ──────────────────────────────────────────────────────────────────

/** A single species VFX entry mapping a VFX name to its Niagara system. */
USTRUCT(BlueprintType)
struct FKhaaosSpeciesVFXEntry
{
	GENERATED_BODY()

	/** Human-readable name of this VFX (e.g. "RegenGlow", "CryoShield"). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|VFX")
	FName VFXName;

	/** Soft reference to the Niagara system asset. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|VFX")
	TSoftObjectPtr<UNiagaraSystem> NiagaraSystem;

	/** Whether this VFX auto-destroys after playback. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|VFX")
	bool bAutoDestroy = true;

	/** Whether to use Niagara pooling. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|VFX")
	bool bUsePooling = true;
};

/** Collection of VFX entries for a single species. */
USTRUCT(BlueprintType)
struct FKhaaosSpeciesVFXSet
{
	GENERATED_BODY()

	/** The species this VFX set belongs to. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|VFX")
	EKhaaosSpecies Species = EKhaaosSpecies::NONE;

	/** All VFX entries for this species. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Species|VFX")
	TArray<FKhaaosSpeciesVFXEntry> VFXEntries;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when a species VFX is spawned. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_FourParams(FOnSpeciesVFXSpawned, EKhaaosSpecies, Species, FName, VFXName, UNiagaraComponent*, NiagaraComp, AActor*, Owner);

/**
 * UKhaaosSpeciesVFXRegistry
 *
 * Singleton GameInstanceSubsystem that maps species → their unique visual effects.
 * Provides centralized lookup and spawning for all species-specific VFX:
 *
 *   HURAN:  RegenGlow, WaterDash, AmphibianEyes
 *   KHAEL:  CryoShield, FrostBreath, EnergyResonance
 *   VENEX:  CyberneticGlow, ShieldPulse, SpeedTrail
 *   ONITH:  ToxicAura, ScaleShimmer, HissVFX
 *   ZHEERS: RadGlow, MutationPulse, RadResistAura
 *   SKEETW: Bioluminescence, FogStealthVFX, AvianTrail
 *
 * Usage:
 *   GetSpeciesVFX(SpeciesID, "RegenGlow") → UNiagaraSystem*
 *   SpawnSpeciesVFX(SpeciesID, "RegenGlow", AttachComp, "SpineSocket") → UNiagaraComponent*
 */
UCLASS(Config = Game, DefaultConfig, BlueprintType, Blueprintable)
class UKhaaosSpeciesVFXRegistry : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	// ─── Subsystem Lifecycle ──────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Species VFX Lookup ───────────────────────────────────────────────

	/**
	 * Get the NiagaraSystem for a species VFX by name.
	 * Loads the soft reference synchronously if needed.
	 * Returns nullptr if species or VFX name is not found.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|VFX")
	UNiagaraSystem* GetSpeciesVFX(EKhaaosSpecies SpeciesID, FName VFXName) const;

	/**
	 * Spawn a species VFX attached to a component at a socket.
	 * Returns the spawned UNiagaraComponent, or nullptr on failure.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|VFX")
	UNiagaraComponent* SpawnSpeciesVFX(
		EKhaaosSpecies SpeciesID,
		FName VFXName,
		USceneComponent* AttachComponent,
		FName SocketName = NAME_None
	);

	/**
	 * Spawn a species VFX at a world location.
	 * Returns the spawned UNiagaraComponent, or nullptr on failure.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|VFX")
	UNiagaraComponent* SpawnSpeciesVFXAtLocation(
		EKhaaosSpecies SpeciesID,
		FName VFXName,
		const FVector& WorldLocation,
		const FRotator& WorldRotation = FRotator::ZeroRotator
	);

	// ─── Registry Management ──────────────────────────────────────────────

	/** Register a VFX entry for a species. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|VFX")
	void RegisterSpeciesVFX(EKhaaosSpecies SpeciesID, const FKhaaosSpeciesVFXEntry& Entry);

	/** Remove a VFX entry by name for a species. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|VFX")
	void UnregisterSpeciesVFX(EKhaaosSpecies SpeciesID, FName VFXName);

	/** Check if a VFX name exists for a species. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|VFX")
	bool HasSpeciesVFX(EKhaaosSpecies SpeciesID, FName VFXName) const;

	/** Get all VFX names for a species. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|VFX")
	TArray<FName> GetSpeciesVFXNames(EKhaaosSpecies SpeciesID) const;

	// ─── Active VFX Tracking ──────────────────────────────────────────────

	/** Stop all active VFX for a specific species on a given owner. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|VFX")
	void StopAllVFXForSpecies(EKhaaosSpecies SpeciesID, AActor* Owner);

	/** Stop all active VFX for all species on a given owner. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|VFX")
	void StopAllVFXForOwner(AActor* Owner);

	// ─── Delegate ─────────────────────────────────────────────────────────

	/** Broadcast when a species VFX is spawned. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Species|VFX")
	FOnSpeciesVFXSpawned OnSpeciesVFXSpawned;

private:

	// ─── Registry Data ────────────────────────────────────────────────────

	/** Map of species → their VFX entries. */
	UPROPERTY(Config, EditAnywhere, Category = "Khaaos|Species|VFX|Registry")
	TMap<EKhaaosSpecies, FKhaaosSpeciesVFXSet> SpeciesVFXMap;

	// ─── Active VFX Tracking ──────────────────────────────────────────────

	/** Multi-map of (Species, VFXName) → active Niagara components (weak refs). */
	TMultiMap<TPair<EKhaaosSpecies, FName>, TWeakObjectPtr<UNiagaraComponent>> ActiveVFXComponents;

	/** Multi-map of Owner → active Niagara components for cleanup. */
	TMultiMap<TWeakObjectPtr<AActor>, TWeakObjectPtr<UNiagaraComponent>> OwnerVFXMap;

	// ─── Internal Methods ─────────────────────────────────────────────────

	/** Register the default VFX entries for all species. */
	void RegisterDefaultSpeciesVFX();

	/** Find the VFX entry for a species by name. Returns nullptr if not found. */
	const FKhaaosSpeciesVFXEntry* FindVFXEntry(EKhaaosSpecies SpeciesID, FName VFXName) const;

	/** Resolve a soft object ptr to a Niagara system (loads if needed). */
	UNiagaraSystem* ResolveNiagaraSystem(TSoftObjectPtr<UNiagaraSystem> SoftRef) const;

	/** Track a spawned VFX component for lifecycle management. */
	void TrackSpawnedVFX(EKhaaosSpecies SpeciesID, FName VFXName, UNiagaraComponent* NiagaraComp, AActor* Owner);
};
