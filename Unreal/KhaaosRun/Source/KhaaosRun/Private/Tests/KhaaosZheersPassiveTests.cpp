// Khaaos Run - UE5.8 Gameplay Ability System Automation Tests
#include "KhaaosSafeZoneGameplayCueTestTypes.h"

#include "AbilitySystemComponent.h"
#include "Game/AbilitySystem/KhaaosAbility_SpeciesPassives.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "Game/WorldGen/KhaaosEnvironmentalDamagePolicy.h"
#include "Engine/World.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosZheersEnvironmentalMitigationTest,
	"Khaaos.GAS.Species.Zheers.EnvironmentMitigation",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKhaaosZheersEnvironmentalMitigationTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	UWorld* TestWorld = UWorld::CreateWorld(EWorldType::Game, false, TEXT("ZheersEnvironmentalMitigationWorld"));
	if (!TestWorld)
	{
		AddError(TEXT("Failed to create transient test world"));
		return false;
	}

	TestWorld->InitializeNewWorld(UWorld::InitializationValues()
		.AllowAudioPlayback(false)
		.CreatePhysicsScene(false)
		.CreateNavigation(false)
		.CreateAISystem(false)
		.ShouldSimulatePhysics(false)
		.SetTransactional(false));

	AKhaaosSafeZoneGameplayCueTestTarget* Target = TestWorld->SpawnActor<AKhaaosSafeZoneGameplayCueTestTarget>(
		FVector::ZeroVector, FRotator::ZeroRotator);
	if (!Target || !Target->AbilitySystemComponent || !Target->AttributeSet)
	{
		AddError(TEXT("Failed to spawn the GAS test target"));
		TestWorld->DestroyWorld(false);
		return false;
	}

	UAbilitySystemComponent* ASC = Target->AbilitySystemComponent;
	UKhaaosAttributeSet* Attributes = Target->AttributeSet;
	ASC->InitAbilityActorInfo(Target, Target);
	Attributes->SetMaxHealth(100.0f);
	Attributes->SetHealth(100.0f);
	Attributes->SetMaxShield(100.0f);
	Attributes->SetShield(0.0f);
	Attributes->SetDefenseRating(0.0f);

	const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();
	TestTrue(TEXT("Environment damage tag is registered"), Tags.Effect_Damage_Environment.IsValid());
	TestTrue(TEXT("Active-world ID comparison is case-insensitive"),
		KhaaosEnvironmentalDamagePolicy::WorldIdsMatch(FName(TEXT("Barburhen")), FName(TEXT("barburhen"))));
	TestFalse(TEXT("A different world cannot reuse the source ID"),
		KhaaosEnvironmentalDamagePolicy::WorldIdsMatch(FName(TEXT("CIGKV")), FName(TEXT("Barburhen"))));
	TestFalse(TEXT("Missing IDs fail closed"),
		KhaaosEnvironmentalDamagePolicy::WorldIdsMatch(NAME_None, FName(TEXT("Barburhen"))));

	const FGameplayAbilitySpecHandle Handle = ASC->GiveAbility(
		FGameplayAbilitySpec(UKhaaosAbility_ZheersPassive::StaticClass(), 1));
	TestTrue(TEXT("Zheers passive spec is granted"), Handle.IsValid());
	const bool bActivated = Handle.IsValid() && ASC->TryActivateAbility(Handle);
	TestTrue(TEXT("Zheers passive activates on the authoritative ASC"), bActivated);
	TestTrue(TEXT("Zheers passive remains active"),
		ASC->FindAbilitySpecFromHandle(Handle) && ASC->FindAbilitySpecFromHandle(Handle)->IsActive());
	TestTrue(TEXT("The infinite GameplayEffect grants exactly 10% environmental resistance"),
		FMath::IsNearlyEqual(Attributes->GetZheersEnvironmentalDamageReduction(), 0.10f, 0.001f));

	const float EnvironmentalDamage = UKhaaosAttributeSet::CalculateSpeciesMitigatedDamage(
		100.0f, Tags.Effect_Damage_Environment, 0.0f, 0.0f,
		Attributes->GetZheersEnvironmentalDamageReduction());
	TestTrue(TEXT("100 environmental damage is mitigated to 90"),
		FMath::IsNearlyEqual(EnvironmentalDamage, 90.0f, 0.001f));

	const FGameplayTag ExcludedTypes[] = {
		Tags.Effect_Damage_Bullet,
		Tags.Effect_Damage_Explosion,
		Tags.Effect_Damage_Fire,
		Tags.Effect_Damage_Melee,
		Tags.Effect_Damage_Zone,
		Tags.Effect_Damage_Pulso,
		Tags.Effect_Damage_Fall,
		FGameplayTag()
	};
	for (const FGameplayTag& ExcludedType : ExcludedTypes)
	{
		const float Unmitigated = UKhaaosAttributeSet::CalculateSpeciesMitigatedDamage(
			100.0f, ExcludedType, 0.0f, 0.0f,
			Attributes->GetZheersEnvironmentalDamageReduction());
		TestTrue(FString::Printf(TEXT("Excluded damage type %s remains unmitigated"),
			*ExcludedType.ToString()), FMath::IsNearlyEqual(Unmitigated, 100.0f, 0.001f));
	}

	const float AppliedEnvironmentDamage = Attributes->ApplyDamageOfType(
		100.0f, Target, Tags.Effect_Damage_Environment);
	TestTrue(TEXT("The typed AttributeSet path applies 90 environmental damage"),
		FMath::IsNearlyEqual(AppliedEnvironmentDamage, 90.0f, 0.001f));
	TestTrue(TEXT("Health reflects the mitigated environmental damage"),
		FMath::IsNearlyEqual(Attributes->GetHealth(), 10.0f, 0.001f));

	ASC->CancelAbilityHandle(Handle);
	TestFalse(TEXT("Cancellation ends the passive ability"),
		ASC->FindAbilitySpecFromHandle(Handle) && ASC->FindAbilitySpecFromHandle(Handle)->IsActive());
	TestTrue(TEXT("Cancellation removes the infinite GameplayEffect"),
		FMath::IsNearlyEqual(Attributes->GetZheersEnvironmentalDamageReduction(), 0.0f, 0.001f));
	ASC->ClearAbility(Handle);

	TestWorld->DestroyWorld(false);
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
