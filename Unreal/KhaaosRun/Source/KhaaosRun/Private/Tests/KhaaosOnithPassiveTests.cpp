// Khaaos Run - Gameplay Ability System Automation Tests

#include "KhaaosSafeZoneGameplayCueTestTypes.h"

#include "AbilitySystemComponent.h"
#include "Game/AbilitySystem/KhaaosAbility_SpeciesPassives.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "Game/Combat/KhaaosDamageManager.h"
#include "Engine/World.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosOnithPeleEscamosaAbilityTest,
	"Khaaos.GAS.Species.Onith.PeleEscamosa",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKhaaosOnithPeleEscamosaAbilityTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FKhaaosGameplayTags::InitializeTags();
	const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();
	TestTrue(TEXT("Bullet damage tag is registered"), Tags.Effect_Damage_Bullet.IsValid());
	TestTrue(TEXT("Explosion damage tag is registered"), Tags.Effect_Damage_Explosion.IsValid());
	TestTrue(TEXT("Fire damage tag is registered"), Tags.Effect_Damage_Fire.IsValid());
	TestTrue(TEXT("Combat enum maps Bullet to its canonical tag"),
		UKhaaosDamageManagerComponent::GetGameplayTagForDamageType(EKhaaosDamageType::Bullet) == Tags.Effect_Damage_Bullet);
	TestTrue(TEXT("Combat enum maps Explosion to its canonical tag"),
		UKhaaosDamageManagerComponent::GetGameplayTagForDamageType(EKhaaosDamageType::Explosion) == Tags.Effect_Damage_Explosion);

	UWorld* TestWorld = UWorld::CreateWorld(EWorldType::Game, false, FName(TEXT("OnithPassiveAutomationWorld")));
	if (!TestWorld)
	{
		AddError(TEXT("Failed to create transient world for Onith passive test"));
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
		FVector::ZeroVector,
		FRotator::ZeroRotator);
	if (!Target || !Target->AbilitySystemComponent || !Target->AttributeSet)
	{
		AddError(TEXT("Failed to spawn the ASC test target for Onith passive"));
		TestWorld->DestroyWorld(false);
		return false;
	}

	UAbilitySystemComponent* ASC = Target->AbilitySystemComponent;
	UKhaaosAttributeSet* Attributes = Target->AttributeSet;
	ASC->InitAbilityActorInfo(Target, Target);

	const FGameplayAbilitySpecHandle AbilityHandle = ASC->GiveAbility(
		FGameplayAbilitySpec(UKhaaosAbility_OnithPassive::StaticClass(), 1));
	TestTrue(TEXT("Onith passive ability spec is granted"), AbilityHandle.IsValid());
	if (!AbilityHandle.IsValid() || !ASC->TryActivateAbility(AbilityHandle))
	{
		AddError(TEXT("Onith passive ability did not activate on authoritative ASC"));
		TestWorld->DestroyWorld(false);
		return false;
	}

	TestTrue(TEXT("Ability grants 15% projectile reduction through a GameplayEffect"),
		FMath::IsNearlyEqual(Attributes->GetOnithProjectileDamageReduction(), 0.15f, 0.001f));
	TestTrue(TEXT("Ability grants 15% explosion reduction through a GameplayEffect"),
		FMath::IsNearlyEqual(Attributes->GetOnithExplosionDamageReduction(), 0.15f, 0.001f));

	Attributes->SetHealth(100.0f);
	Attributes->ApplyDamageOfType(100.0f, Target, Tags.Effect_Damage_Bullet);
	TestTrue(TEXT("100 bullet damage leaves 15 health"), FMath::IsNearlyEqual(Attributes->GetHealth(), 15.0f, 0.01f));

	Attributes->SetHealth(100.0f);
	Attributes->ApplyDamageOfType(100.0f, Target, Tags.Effect_Damage_Explosion);
	TestTrue(TEXT("100 explosion damage leaves 15 health"), FMath::IsNearlyEqual(Attributes->GetHealth(), 15.0f, 0.01f));

	Attributes->SetHealth(100.0f);
	Attributes->ApplyDamageOfType(100.0f, Target, Tags.Effect_Damage_Fire);
	TestTrue(TEXT("Fire damage is not reduced by Pele Escamosa"), FMath::IsNearlyEqual(Attributes->GetHealth(), 0.0f, 0.01f));

	ASC->CancelAbilityHandle(AbilityHandle);
	TestTrue(TEXT("Cancelling the passive removes projectile modifier"),
		FMath::IsNearlyZero(Attributes->GetOnithProjectileDamageReduction(), 0.001f));
	TestTrue(TEXT("Cancelling the passive removes explosion modifier"),
		FMath::IsNearlyZero(Attributes->GetOnithExplosionDamageReduction(), 0.001f));

	TestWorld->DestroyWorld(false);
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
