// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Character LOD System - Implementation

#include "Game/Graphics/KhaaosCharacterLODSystem.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Character.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/ActorComponent.h"
#include "UObject/UObjectGlobals.h"

// --- UTickableWorldSubsystem Interface ---

void UKhaaosCharacterLODSystem::Initialize(FSubsystemCollectionInitialization& InitializationOptions)
{
	Super::Initialize(InitializationOptions);

	// Apply default config values
	LODThresholds = FKhaaosLODThresholds();
	AnimBudget = FKhaaosAnimationBudget();
	TotalAnimCost = 0.0f;
	LocalPlayer = nullptr;
	RegisteredCharacters.Empty();

	UE_LOG(LogTemp, Log, TEXT("[KhaaosCharacterLODSystem] Initialized — Thresholds: H->M=%.1fm M->L=%.1fm L->C=%.1fm | Budget: %.2fms total, %d max HIGH"),
		LODThresholds.HighToMedium, LODThresholds.MediumToLow, LODThresholds.LowToCulled,
		AnimBudget.MaxTotalAnimTime, AnimBudget.MaxHighLODCharacters);
}

void UKhaaosCharacterLODSystem::Deinitialize()
{
	RegisteredCharacters.Empty();
	LocalPlayer = nullptr;
	TotalAnimCost = 0.0f;

	UE_LOG(LogTemp, Log, TEXT("[KhaaosCharacterLODSystem] Deinitialized — All characters cleared."));

	Super::Deinitialize();
}

void UKhaaosCharacterLODSystem::Tick(float DeltaTime)
{
	// 1. Update the cached local player reference
	UpdateLocalPlayer();

	// 2. Calculate distance from local player for each registered character
	if (LocalPlayer.IsValid())
	{
		const FVector LocalPlayerLocation = LocalPlayer->GetActorLocation();
		for (FKhaaosLODCharacterEntry& Entry : RegisteredCharacters)
		{
			if (Entry.CharacterActor.IsValid())
			{
				const FVector CharacterLocation = Entry.CharacterActor->GetActorLocation();
				Entry.DistanceToPlayer = FVector::Dist(LocalPlayerLocation, CharacterLocation) / 100.0f; // cm -> meters
			}
			else
			{
				Entry.DistanceToPlayer = FLT_MAX;
			}
		}
	}
	else
	{
		// No local player — default all distances to 0 so they get HIGH LOD
		for (FKhaaosLODCharacterEntry& Entry : RegisteredCharacters)
		{
			Entry.DistanceToPlayer = 0.0f;
		}
	}

	// 3. Sort characters by priority (forced HIGH first, then closest)
	SortCharactersByPriority();

	// 4. Update LOD for all characters with budget enforcement
	UpdateLODForAllCharacters();

	// 5. Track total animation cost
	TotalAnimCost = 0.0f;
	for (const FKhaaosLODCharacterEntry& Entry : RegisteredCharacters)
	{
		TotalAnimCost += Entry.AnimCostThisFrame;
	}
}

TStatId UKhaaosCharacterLODSystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_STAT_ID(FStatTickables);
}

// --- Registration ---

void UKhaaosCharacterLODSystem::RegisterCharacter(AActor* Character)
{
	if (!IsValid(Character))
	{
		return;
	}

	// Check if already registered
	for (const FKhaaosLODCharacterEntry& Existing : RegisteredCharacters)
	{
		if (Existing.CharacterActor.Get() == Character)
		{
			return; // Already tracked
		}
	}

	FKhaaosLODCharacterEntry NewEntry;
	NewEntry.CharacterActor = Character;
	NewEntry.CurrentLOD = EKhaaosCharacterLOD::MEDIUM;
	NewEntry.bForceHighLOD = false;

	// Calculate initial distance
	if (LocalPlayer.IsValid())
	{
		const float DistCm = FVector::Dist(LocalPlayer->GetActorLocation(), Character->GetActorLocation());
		NewEntry.DistanceToPlayer = DistCm / 100.0f;
	}
	else
	{
		NewEntry.DistanceToPlayer = 0.0f;
	}

	// Set initial anim cost
	NewEntry.AnimCostThisFrame = AnimBudget.MediumLODAnimCost;

	RegisteredCharacters.Add(NewEntry);

	UE_LOG(LogTemp, Log, TEXT("[KhaaosCharacterLODSystem] Registered character '%s' at %.1fm — Total: %d"),
		*Character->GetName(), NewEntry.DistanceToPlayer, RegisteredCharacters.Num());
}

void UKhaaosCharacterLODSystem::UnregisterCharacter(AActor* Character)
{
	if (!IsValid(Character))
	{
		return;
	}

	const int32 Removed = RegisteredCharacters.RemoveAll([Character](const FKhaaosLODCharacterEntry& Entry)
	{
		return Entry.CharacterActor.Get() == Character;
	});

	if (Removed > 0)
	{
		UE_LOG(LogTemp, Log, TEXT("[KhaaosCharacterLODSystem] Unregistered character '%s' — Total: %d"),
			*Character->GetName(), RegisteredCharacters.Num());
	}
}

void UKhaaosCharacterLODSystem::ForceHighLOD(AActor* Character, bool bForce)
{
	if (!IsValid(Character))
	{
		return;
	}

	for (FKhaaosLODCharacterEntry& Entry : RegisteredCharacters)
	{
		if (Entry.CharacterActor.Get() == Character)
		{
			if (Entry.bForceHighLOD != bForce)
			{
				Entry.bForceHighLOD = bForce;
				UE_LOG(LogTemp, Log, TEXT("[KhaaosCharacterLODSystem] ForceHighLOD '%s' = %s"),
					*Character->GetName(), bForce ? TEXT("TRUE") : TEXT("FALSE"));
			}
			return;
		}
	}
}

// --- Configuration ---

void UKhaaosCharacterLODSystem::SetLODThresholds(const FKhaaosLODThresholds& InThresholds)
{
	LODThresholds = InThresholds;
	UE_LOG(LogTemp, Log, TEXT("[KhaaosCharacterLODSystem] Thresholds updated — H->M=%.1fm M->L=%.1fm L->C=%.1fm"),
		LODThresholds.HighToMedium, LODThresholds.MediumToLow, LODThresholds.LowToCulled);
}

FKhaaosLODThresholds UKhaaosCharacterLODSystem::GetLODThresholds() const
{
	return LODThresholds;
}

void UKhaaosCharacterLODSystem::SetAnimationBudget(const FKhaaosAnimationBudget& InBudget)
{
	AnimBudget = InBudget;
	UE_LOG(LogTemp, Log, TEXT("[KhaaosCharacterLODSystem] Animation budget updated — MaxTime=%.2fms MaxHIGH=%d"),
		AnimBudget.MaxTotalAnimTime, AnimBudget.MaxHighLODCharacters);
}

FKhaaosAnimationBudget UKhaaosCharacterLODSystem::GetAnimationBudget() const
{
	return AnimBudget;
}

// --- Query ---

EKhaaosCharacterLOD UKhaaosCharacterLODSystem::GetCharacterLOD(AActor* Character) const
{
	if (!IsValid(Character))
	{
		return EKhaaosCharacterLOD::CULLED;
	}

	for (const FKhaaosLODCharacterEntry& Entry : RegisteredCharacters)
	{
		if (Entry.CharacterActor.Get() == Character)
		{
			return Entry.CurrentLOD;
		}
	}

	return EKhaaosCharacterLOD::CULLED;
}

int32 UKhaaosCharacterLODSystem::GetCharactersAtLOD(EKhaaosCharacterLOD LOD) const
{
	int32 Count = 0;
	for (const FKhaaosLODCharacterEntry& Entry : RegisteredCharacters)
	{
		if (Entry.CurrentLOD == LOD)
		{
			++Count;
		}
	}
	return Count;
}

float UKhaaosCharacterLODSystem::GetTotalAnimationCost() const
{
	return TotalAnimCost;
}

bool UKhaaosCharacterLODSystem::IsOverBudget() const
{
	return TotalAnimCost > AnimBudget.MaxTotalAnimTime;
}

// --- Debug ---

FString UKhaaosCharacterLODSystem::GetDebugInfo() const
{
	const int32 HighCount = GetCharactersAtLOD(EKhaaosCharacterLOD::HIGH);
	const int32 MedCount = GetCharactersAtLOD(EKhaaosCharacterLOD::MEDIUM);
	const int32 LowCount = GetCharactersAtLOD(EKhaaosCharacterLOD::LOW);
	const int32 CulledCount = GetCharactersAtLOD(EKhaaosCharacterLOD::CULLED);
	const int32 Total = RegisteredCharacters.Num();

	return FString::Printf(
		TEXT("[CharacterLOD] Total: %d | HIGH: %d | MEDIUM: %d | LOW: %d | CULLED: %d | AnimCost: %.3fms / %.2fms %s"),
		Total, HighCount, MedCount, LowCount, CulledCount,
		TotalAnimCost, AnimBudget.MaxTotalAnimTime,
		IsOverBudget() ? TEXT("[OVER BUDGET]") : TEXT("[OK]"));
}

// --- Private ---

void UKhaaosCharacterLODSystem::UpdateLODForAllCharacters()
{
	int32 HighLODCount = 0;
	float RunningAnimCost = 0.0f;

	// Characters are already sorted by priority (forced HIGH first, then closest)
	for (FKhaaosLODCharacterEntry& Entry : RegisteredCharacters)
	{
		if (!Entry.CharacterActor.IsValid())
		{
			continue;
		}

		// Determine desired LOD based on distance and force flag
		EKhaaosCharacterLOD DesiredLOD = CalculateDesiredLOD(Entry.DistanceToPlayer, Entry.bForceHighLOD);

		// Budget enforcement: limit HIGH LOD count
		if (DesiredLOD == EKhaaosCharacterLOD::HIGH && !Entry.bForceHighLOD)
		{
			if (HighLODCount >= AnimBudget.MaxHighLODCharacters)
			{
				DesiredLOD = EKhaaosCharacterLOD::MEDIUM;
			}
		}

		// Calculate animation cost for the desired LOD
		float CandidateCost = 0.0f;
		switch (DesiredLOD)
		{
		case EKhaaosCharacterLOD::HIGH:   CandidateCost = AnimBudget.HighLODAnimCost; break;
		case EKhaaosCharacterLOD::MEDIUM: CandidateCost = AnimBudget.MediumLODAnimCost; break;
		case EKhaaosCharacterLOD::LOW:    CandidateCost = AnimBudget.LowLODAnimCost; break;
		case EKhaaosCharacterLOD::CULLED: CandidateCost = 0.0f; break;
		}

		// Budget enforcement: if adding this character's cost would exceed budget,
		// downgrade until it fits (forced HIGH characters are exempt from budget downgrade)
		if (!Entry.bForceHighLOD && (RunningAnimCost + CandidateCost) > AnimBudget.MaxTotalAnimTime)
		{
			if (DesiredLOD == EKhaaosCharacterLOD::HIGH)
			{
				DesiredLOD = EKhaaosCharacterLOD::MEDIUM;
				CandidateCost = AnimBudget.MediumLODAnimCost;
			}
			if ((RunningAnimCost + CandidateCost) > AnimBudget.MaxTotalAnimTime)
			{
				if (DesiredLOD == EKhaaosCharacterLOD::MEDIUM)
				{
					DesiredLOD = EKhaaosCharacterLOD::LOW;
					CandidateCost = AnimBudget.LowLODAnimCost;
				}
				if ((RunningAnimCost + CandidateCost) > AnimBudget.MaxTotalAnimTime)
				{
					if (DesiredLOD == EKhaaosCharacterLOD::LOW)
					{
						DesiredLOD = EKhaaosCharacterLOD::CULLED;
						CandidateCost = 0.0f;
					}
				}
			}
		}

		// Apply LOD change if needed
		if (Entry.CurrentLOD != DesiredLOD)
		{
			ApplyLODToCharacter(Entry, DesiredLOD);
		}

		// Track HIGH count and running cost
		if (Entry.CurrentLOD == EKhaaosCharacterLOD::HIGH)
		{
			++HighLODCount;
		}
		Entry.AnimCostThisFrame = CandidateCost;
		RunningAnimCost += CandidateCost;
	}
}

EKhaaosCharacterLOD UKhaaosCharacterLODSystem::CalculateDesiredLOD(float Distance, bool bForceHigh) const
{
	if (bForceHigh)
	{
		return EKhaaosCharacterLOD::HIGH;
	}

	if (Distance < LODThresholds.HighToMedium)
	{
		return EKhaaosCharacterLOD::HIGH;
	}
	else if (Distance < LODThresholds.MediumToLow)
	{
		return EKhaaosCharacterLOD::MEDIUM;
	}
	else if (Distance < LODThresholds.LowToCulled)
	{
		return EKhaaosCharacterLOD::LOW;
	}
	else
	{
		return EKhaaosCharacterLOD::CULLED;
	}
}

void UKhaaosCharacterLODSystem::ApplyLODToCharacter(FKhaaosLODCharacterEntry& Entry, EKhaaosCharacterLOD NewLOD)
{
	AActor* Character = Entry.CharacterActor.Get();
	if (!IsValid(Character))
	{
		return;
	}

	const EKhaaosCharacterLOD OldLOD = Entry.CurrentLOD;

	// When upgrading from CULLED, restore visibility and ticking first
	if (OldLOD == EKhaaosCharacterLOD::CULLED && NewLOD != EKhaaosCharacterLOD::CULLED)
	{
		Character->SetActorHiddenInGame(false);
		Character->SetActorTickEnabled(true);
	}

	// Find the skeletal mesh component for LOD and animation changes
	USkeletalMeshComponent* MeshComp = nullptr;
	if (const ACharacter* Char = Cast<ACharacter>(Character))
	{
		MeshComp = Char->GetMesh();
	}
	if (!MeshComp)
	{
		// Fallback: search for any skeletal mesh component
		MeshComp = Character->FindComponentByClass<USkeletalMeshComponent>();
	}

	switch (NewLOD)
	{
	case EKhaaosCharacterLOD::HIGH:
		// Full skeleton, all VFX, cloth physics, full animation, 2048px textures
		if (MeshComp)
		{
			MeshComp->SetLODLevel(0);
			MeshComp->SetUpdateRateInFrames(1);
			// Re-enable cloth simulation
			MeshComp->SetEnableClothSimulation(true);
		}
		// Enable all VFX components (particle systems, Niagara)
		for (UActorComponent* Comp : Character->GetComponentsByClass(UParticleComponent::StaticClass()))
		{
			Comp->SetComponentTickEnabled(true);
			Comp->SetVisibility(true);
		}
		break;

	case EKhaaosCharacterLOD::MEDIUM:
		// Reduced skeleton, key VFX only, no cloth, reduced animation, 1024px textures
		if (MeshComp)
		{
			MeshComp->SetLODLevel(1);
			MeshComp->SetUpdateRateInFrames(2); // ~0.5 update rate
			MeshComp->SetEnableClothSimulation(false);
		}
		// Disable non-essential VFX — keep first particle component, disable rest
		{
			TArray<UActorComponent*> VFXComponents = Character->GetComponentsByClass(UParticleComponent::StaticClass());
			for (int32 i = 0; i < VFXComponents.Num(); ++i)
			{
				// Keep first VFX active as "key" VFX
				VFXComponents[i]->SetComponentTickEnabled(i == 0);
				VFXComponents[i]->SetVisibility(i == 0);
			}
		}
		break;

	case EKhaaosCharacterLOD::LOW:
		// Billboard or minimal skeleton, no VFX, no cloth, idle anim only, 256px textures
		if (MeshComp)
		{
			MeshComp->SetLODLevel(2);
			MeshComp->SetUpdateRateInFrames(4); // ~0.25 update rate
			MeshComp->SetEnableClothSimulation(false);
		}
		// Disable all VFX
		for (UActorComponent* Comp : Character->GetComponentsByClass(UParticleComponent::StaticClass()))
		{
			Comp->SetComponentTickEnabled(false);
			Comp->SetVisibility(false);
		}
		break;

	case EKhaaosCharacterLOD::CULLED:
		// Invisible, tick disabled
		Character->SetActorHiddenInGame(true);
		Character->SetActorTickEnabled(false);
		break;
	}

	Entry.CurrentLOD = NewLOD;

	UE_LOG(LogTemp, Log, TEXT("[KhaaosCharacterLODSystem] '%s' LOD changed: %s -> %s (Dist: %.1fm)"),
		*Character->GetName(),
		StaticEnum<EKhaaosCharacterLOD>()->GetDisplayNameTextByValue(static_cast<int64>(OldLOD)).ToString(),
		StaticEnum<EKhaaosCharacterLOD>()->GetDisplayNameTextByValue(static_cast<int64>(NewLOD)).ToString(),
		Entry.DistanceToPlayer);
}

void UKhaaosCharacterLODSystem::UpdateLocalPlayer()
{
	if (LocalPlayer.IsValid())
	{
		return; // Still valid, no need to re-cache
	}

	// Cache the local player's pawn/actor
	UWorld* World = GetWorld();
	if (!World || !World->GetFirstLocalPlayerController())
	{
		LocalPlayer = nullptr;
		return;
	}

	if (APlayerController* PC = World->GetFirstLocalPlayerController())
	{
		LocalPlayer = PC->GetPawnOrSpectator();
	}
}

void UKhaaosCharacterLODSystem::SortCharactersByPriority()
{
	RegisteredCharacters.Sort([](const FKhaaosLODCharacterEntry& A, const FKhaaosLODCharacterEntry& B) -> bool
	{
		// Forced HIGH characters always come first
		if (A.bForceHighLOD != B.bForceHighLOD)
		{
			return A.bForceHighLOD > B.bForceHighLOD;
		}
		// Then sort by distance ascending (closer characters first)
		return A.DistanceToPlayer < B.DistanceToPlayer;
	});
}
