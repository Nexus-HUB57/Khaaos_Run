// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include "SignificanceManager.h"
#include "KhaaosVFXManager.generated.h"

/**
 * FKhaaosVFXSpawnParams — Parameters for spawning a Niagara VFX instance.
 * Controls auto-destroy, pooling, and attachment behavior.
 */
USTRUCT(BlueprintType)
struct FKhaaosVFXSpawnParams
{
	GENERATED_BODY()

	/** The Niagara system asset to spawn. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX")
	TSoftObjectPtr<UNiagaraSystem> NiagaraSystem;

	/** Whether the component auto-destroys after completion. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX")
	bool bAutoDestroy = true;

	/** Whether to use Niagara pooling for this instance. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX")
	bool bUsePooling = true;

	/** Whether the VFX should replicate. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX")
	bool bReplicate = false;

	/** Whether to activate on spawn. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX")
	bool bAutoActivate = true;

	/** Duration override (0 = use system default). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX")
	float DurationOverride = 0.0f;

	/** Pool ID for significance-based culling. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX")
	FName PoolId;

	/** Significance handler rank for distance-based culling (lower = more important). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX")
	int32 SignificanceRank = 0;
};

/**
 * FKhaaosVFXPoolConfig — Configuration for Niagara component pooling.
 */
USTRUCT(BlueprintType)
struct FKhaaosVFXPoolConfig
{
	GENERATED_BODY()

	/** Maximum number of pooled components per VFX type. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX|Pool")
	int32 MaxPoolSize = 32;

	/** Time threshold (seconds) after which an inactive pooled component is auto-released. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX|Pool")
	float AutoReleaseThreshold = 5.0f;

	/** Whether pooling is globally enabled. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "VFX|Pool")
	bool bPoolingEnabled = true;
};

/**
 * UKhaaosVFXManager — Singleton world subsystem managing all Niagara VFX in Khaaos Run.
 * Integrates with the SignificanceManager for distance-based culling and
 * provides centralized spawn/stop/parameter control for all VFX.
 */
UCLASS(Abstract, BlueprintType, Blueprintable, Config = Game, defaultconfig)
class UKhaaosVFXManager : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	// ─── Subsystem Lifecycle ──────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	// ─── VFX Registry ────────────────────────────────────────────────────

	/** Register a Niagara system asset by name for later spawning. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX")
	void RegisterVFX(FName VFXName, TSoftObjectPtr<UNiagaraSystem> NiagaraSystem);

	/** Unregister a VFX by name. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX")
	void UnregisterVFX(FName VFXName);

	/** Check if a VFX name is registered. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX")
	bool IsVFXRegistered(FName VFXName) const;

	// ─── VFX Spawning ────────────────────────────────────────────────────

	/** Spawn a VFX at a world location. Returns the spawned Niagara component. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX", meta = (AutoCreateRefTerm = "SpawnParams"))
	UNiagaraComponent* SpawnVFXAtLocation(
		FName VFXName,
		const FVector& WorldLocation,
		const FRotator& WorldRotation = FRotator::ZeroRotator,
		const FKhaaosVFXSpawnParams& SpawnParams = FKhaaosVFXSpawnParams()
	);

	/** Spawn a VFX attached to a component. Returns the spawned Niagara component. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX", meta = (AutoCreateRefTerm = "SpawnParams"))
	UNiagaraComponent* SpawnVFXAttached(
		FName VFXName,
		USceneComponent* AttachComponent,
		FName AttachPointName = NAME_None,
		const FVector& LocationOffset = FVector::ZeroVector,
		const FRotator& RotationOffset = FRotator::ZeroRotator,
		EAttachLocation::Type AttachLocationType = EAttachLocation::KeepRelativeOffset,
		const FKhaaosVFXSpawnParams& SpawnParams = FKhaaosVFXSpawnParams()
	);

	// ─── VFX Control ─────────────────────────────────────────────────────

	/** Stop a specific VFX component (optionally destroying it). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX")
	void StopVFX(UNiagaraComponent* NiagaraComp, bool bDestroy = true);

	/** Stop all active VFX instances of a given name. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX")
	void StopAllVFX(FName VFXName, bool bDestroy = true);

	/** Set a float parameter on a Niagara component. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX")
	void SetVFXParam(UNiagaraComponent* NiagaraComp, const FString& ParamName, float Value);

	/** Set a vector parameter on a Niagara component. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX")
	void SetVFXParamVector(UNiagaraComponent* NiagaraComp, const FString& ParamName, const FVector& Value);

	/** Set a color parameter on a Niagara component. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX")
	void SetVFXParamColor(UNiagaraComponent* NiagaraComp, const FString& ParamName, const FLinearColor& Value);

	// ─── Pool Configuration ──────────────────────────────────────────────

	/** Get the global pool configuration. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX")
	const FKhaaosVFXPoolConfig& GetPoolConfig() const { return PoolConfig; }

	/** Set the global pool configuration. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX")
	void SetPoolConfig(const FKhaaosVFXPoolConfig& InPoolConfig) { PoolConfig = InPoolConfig; }

	// ─── Significance Manager Integration ────────────────────────────────

	/** Significance handler for distance-based VFX culling. */
	static float CalculateVFXSignificance(USignificanceManager::FManagedObjectInfo* ObjectInfo, float& OutRank);

	/** Post-significance handler for culling decisions. */
	static void PostSignificanceSetup(USignificanceManager::FManagedObjectInfo* ObjectInfo, float CurrentSignificance);

	// ─── Stats & Debug ───────────────────────────────────────────────────

	/** Get count of currently active VFX components. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX")
	int32 GetActiveVFXCount() const;

	/** Get count of active VFX for a specific name. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX")
	int32 GetActiveVFXCountForName(FName VFXName) const;

private:
	/** Map of VFX names to their Niagara system assets (soft refs). */
	UPROPERTY(Config, EditAnywhere, Category = "Khaaos|VFX|Registry")
	TMap<FName, TSoftObjectPtr<UNiagaraSystem>> VFXRegistry;

	/** Active VFX components, keyed by registered name. */
	TMultiMap<FName, TWeakObjectPtr<UNiagaraComponent>> ActiveVFXComponents;

	/** Global pool configuration. */
	UPROPERTY(Config, EditAnywhere, Category = "Khaaos|VFX|Pool")
	FKhaaosVFXPoolConfig PoolConfig;

	/** Resolve a soft object ptr to a Niagara system (loads if needed). */
	UNiagaraSystem* ResolveNiagaraSystem(TSoftObjectPtr<UNiagaraSystem> SoftRef);

	/** Track an active VFX component. */
	void TrackActiveVFX(FName VFXName, UNiagaraComponent* NiagaraComp);

	/** Untrack an active VFX component. */
	void UntrackActiveVFX(UNiagaraComponent* NiagaraComp);

	/** Significance manager reference (cached on init). */
	TObjectPtr<USignificanceManager> SignificanceManager;

	/** Whether the subsystem has been initialized. */
	bool bInitialized = false;
};
