// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Character LOD System - Distance-based LOD management with animation budgets

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KhaaosCharacterLODSystem.generated.h"

/**
 * Character LOD levels for distance-based detail management.
 * Controls skeleton complexity, VFX, cloth physics, animation, and texture resolution.
 */
UENUM(BlueprintType)
enum class EKhaaosCharacterLOD : uint8
{
	/** 0-30m — full skeleton, all VFX, cloth physics, full anim, 2048px textures */
	HIGH UMETA(DisplayName = "High"),
	/** 30-60m — reduced skeleton, key VFX only, no cloth, reduced anim, 1024px textures */
	MEDIUM UMETA(DisplayName = "Medium"),
	/** 60-100m — billboard or minimal skeleton, no VFX, no cloth, idle anim only, 256px textures */
	LOW UMETA(DisplayName = "Low"),
	/** 100m+ — invisible, tick disabled */
	CULLED UMETA(DisplayName = "Culled")
};

/** Distance thresholds for LOD transitions (in meters). */
USTRUCT(BlueprintType)
struct FKhaaosLODThresholds
{
	GENERATED_BODY()

	/** Distance at which HIGH transitions to MEDIUM (meters). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, meta = (ClampMin = "0.0"))
	float HighToMedium = 30.0f;

	/** Distance at which MEDIUM transitions to LOW (meters). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, meta = (ClampMin = "0.0"))
	float MediumToLow = 60.0f;

	/** Distance at which LOW transitions to CULLED (meters). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, meta = (ClampMin = "0.0"))
	float LowToCulled = 100.0f;
};

/** Animation budget constraints for performance scaling. */
USTRUCT(BlueprintType)
struct FKhaaosAnimationBudget
{
	GENERATED_BODY()

	/** Maximum total animation time per frame across ALL characters (ms). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, meta = (ClampMin = "0.0"))
	float MaxTotalAnimTime = 2.0f;

	/** Animation cost per character at HIGH LOD (ms). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, meta = (ClampMin = "0.0"))
	float HighLODAnimCost = 0.2f;

	/** Animation cost per character at MEDIUM LOD (ms). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, meta = (ClampMin = "0.0"))
	float MediumLODAnimCost = 0.05f;

	/** Animation cost per character at LOW LOD (ms). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, meta = (ClampMin = "0.0"))
	float LowLODAnimCost = 0.01f;

	/** Maximum number of characters allowed at HIGH LOD simultaneously. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, meta = (ClampMin = "0"))
	int32 MaxHighLODCharacters = 10;
};

/** Per-character LOD tracking entry. */
USTRUCT(BlueprintType)
struct FKhaaosLODCharacterEntry
{
	GENERATED_BODY()

	/** The tracked character actor. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
	TWeakObjectPtr<AActor> CharacterActor;

	/** Current LOD level assigned to this character. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
	EKhaaosCharacterLOD CurrentLOD = EKhaaosCharacterLOD::MEDIUM;

	/** Distance from the local player (meters). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
	float DistanceToPlayer = 0.0f;

	/** Animation cost contributed by this character this frame (ms). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
	float AnimCostThisFrame = 0.0f;

	/** If true, this character is forced to HIGH LOD regardless of distance (e.g. kill cam target, local player). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	bool bForceHighLOD = false;
};

/**
 * Character LOD System — manages 3 levels of detail for operative characters
 * with animation budgets and distance-based culling.
 * Essential for FreeFire-level performance on mobile and console.
 */
UCLASS(Abstract, BlueprintType, Config = Game, defaultconfig)
class UKhaaosCharacterLODSystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	// --- UTickableWorldSubsystem Interface ---

	virtual void Initialize(FSubsystemCollectionInitialization& InitializationOptions) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	// --- Registration ---

	/** Add a character to LOD tracking. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LOD")
	void RegisterCharacter(AActor* Character);

	/** Remove a character from LOD tracking. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LOD")
	void UnregisterCharacter(AActor* Character);

	/** Force a character to HIGH LOD (for kill cam, local player, etc.). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LOD")
	void ForceHighLOD(AActor* Character, bool bForce);

	// --- Configuration ---

	/** Set distance thresholds for LOD transitions. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LOD")
	void SetLODThresholds(const FKhaaosLODThresholds& InThresholds);

	/** Get current distance thresholds. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LOD")
	FKhaaosLODThresholds GetLODThresholds() const;

	/** Set animation budget constraints. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|LOD")
	void SetAnimationBudget(const FKhaaosAnimationBudget& InBudget);

	/** Get current animation budget constraints. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LOD")
	FKhaaosAnimationBudget GetAnimationBudget() const;

	// --- Query ---

	/** Get the current LOD level for a specific character. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LOD")
	EKhaaosCharacterLOD GetCharacterLOD(AActor* Character) const;

	/** Get the number of characters currently at the specified LOD level. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LOD")
	int32 GetCharactersAtLOD(EKhaaosCharacterLOD LOD) const;

	/** Get the total animation cost this frame across all characters (ms). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LOD")
	float GetTotalAnimationCost() const;

	/** Check if the total animation cost exceeds the budget. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LOD")
	bool IsOverBudget() const;

	// --- Debug ---

	/** Get a formatted string with LOD distribution statistics. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|LOD|Debug")
	FString GetDebugInfo() const;

private:
	/** All registered characters with their LOD state. */
	UPROPERTY()
	TArray<FKhaaosLODCharacterEntry> RegisteredCharacters;

	/** Distance thresholds for LOD transitions. */
	UPROPERTY(Config)
	FKhaaosLODThresholds LODThresholds;

	/** Animation budget constraints. */
	UPROPERTY(Config)
	FKhaaosAnimationBudget AnimBudget;

	/** Cached local player actor for distance calculations. */
	TWeakObjectPtr<AActor> LocalPlayer;

	/** Total animation cost accumulated this frame (ms). */
	float TotalAnimCost = 0.0f;

	/** Recalculate LOD for all registered characters based on distance and budget. */
	void UpdateLODForAllCharacters();

	/** Calculate the desired LOD based on distance and force flag. */
	EKhaaosCharacterLOD CalculateDesiredLOD(float Distance, bool bForceHigh) const;

	/** Apply visual and simulation changes when a character's LOD changes. */
	void ApplyLODToCharacter(FKhaaosLODCharacterEntry& Entry, EKhaaosCharacterLOD NewLOD);

	/** Cache the local player reference for distance calculations. */
	void UpdateLocalPlayer();

	/** Sort registered characters by priority: forced HIGH first, then by distance ascending. */
	void SortCharactersByPriority();
};
