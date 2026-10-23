// Khaaos Run - Gameplay Ability System Automation Tests

#include "KhaaosSafeZoneGameplayCueTestTypes.h"

#include "AbilitySystemComponent.h"
#include "Game/AbilitySystem/KhaaosAbility_SpeciesPassives.h"
#include "Engine/World.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	template <typename TAutomationTest>
	bool RunPassiveActivationContract(
		TAutomationTest& Test,
		const TCHAR* WorldName,
		TSubclassOf<UGameplayAbility> AbilityClass)
	{
		UWorld* TestWorld = UWorld::CreateWorld(EWorldType::Game, false, FName(WorldName));
		if (!TestWorld)
		{
			Test.AddError(FString::Printf(TEXT("%s: failed to create transient test world"), WorldName));
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
		if (!Target || !Target->AbilitySystemComponent)
		{
			Test.AddError(FString::Printf(TEXT("%s: failed to spawn an ASC test target"), WorldName));
			TestWorld->DestroyWorld(false);
			return false;
		}

		UAbilitySystemComponent* ASC = Target->AbilitySystemComponent;
		ASC->InitAbilityActorInfo(Target, Target);
		const FGameplayAbilitySpecHandle Handle = ASC->GiveAbility(FGameplayAbilitySpec(AbilityClass, 1));
		bool bPassed = Test.TestTrue(
			FString::Printf(TEXT("%s: passive spec is granted"), WorldName), Handle.IsValid());

		if (Handle.IsValid())
		{
			const bool bActivated = ASC->TryActivateAbility(Handle);
			bPassed &= Test.TestTrue(
				FString::Printf(TEXT("%s: passive activates on authoritative ASC"), WorldName), bActivated);

			const FGameplayAbilitySpec* ActiveSpec = ASC->FindAbilitySpecFromHandle(Handle);
			bPassed &= Test.TestTrue(
				FString::Printf(TEXT("%s: passive remains active after activation"), WorldName),
				ActiveSpec && ActiveSpec->IsActive());

			ASC->CancelAbilityHandle(Handle);
			const FGameplayAbilitySpec* EndedSpec = ASC->FindAbilitySpecFromHandle(Handle);
			bPassed &= Test.TestFalse(
				FString::Printf(TEXT("%s: explicit cancellation ends the passive"), WorldName),
				EndedSpec && EndedSpec->IsActive());
			ASC->ClearAbility(Handle);
		}

		TestWorld->DestroyWorld(false);
		return bPassed;
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosZheersPassiveActivationTest,
	"Khaaos.GAS.Species.Zheers.ActivationContract",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKhaaosZheersPassiveActivationTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	const UKhaaosAbility_ZheersPassive* Defaults = GetDefault<UKhaaosAbility_ZheersPassive>();
	TestTrue(TEXT("Zheers environment resistance configuration is 10%"),
		FMath::IsNearlyEqual(Defaults->EnvironmentResistancePercent, 0.10f, 0.001f));
	return RunPassiveActivationContract(*this, TEXT("ZheersPassiveAutomationWorld"), UKhaaosAbility_ZheersPassive::StaticClass());
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosSkeetwPassiveActivationTest,
	"Khaaos.GAS.Species.Skeetw.ActivationContract",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKhaaosSkeetwPassiveActivationTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	const UKhaaosAbility_SkeetwPassive* Defaults = GetDefault<UKhaaosAbility_SkeetwPassive>();
	TestTrue(TEXT("Skeetw glide duration configuration is 3 seconds"),
		FMath::IsNearlyEqual(Defaults->GlideDuration, 3.0f, 0.001f));
	TestTrue(TEXT("Skeetw air speed bonus configuration is 20%"),
		FMath::IsNearlyEqual(Defaults->AirSpeedBonus, 0.20f, 0.001f));
	return RunPassiveActivationContract(*this, TEXT("SkeetwPassiveAutomationWorld"), UKhaaosAbility_SkeetwPassive::StaticClass());
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosHuranPassiveActivationTest,
	"Khaaos.GAS.Species.Huran.ActivationContract",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKhaaosHuranPassiveActivationTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	const UKhaaosAbility_HuranPassive* Defaults = GetDefault<UKhaaosAbility_HuranPassive>();
	TestTrue(TEXT("Huran water regeneration configuration is 2 HP/s"),
		FMath::IsNearlyEqual(Defaults->WaterRegenPerSecond, 2.0f, 0.001f));
	TestTrue(TEXT("Huran healing bonus configuration is 50%"),
		FMath::IsNearlyEqual(Defaults->HealBonusPercent, 0.50f, 0.001f));
	return RunPassiveActivationContract(*this, TEXT("HuranPassiveAutomationWorld"), UKhaaosAbility_HuranPassive::StaticClass());
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosVenexPassiveActivationTest,
	"Khaaos.GAS.Species.Venex.ActivationContract",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKhaaosVenexPassiveActivationTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	const UKhaaosAbility_VenexPassive* Defaults = GetDefault<UKhaaosAbility_VenexPassive>();
	TestTrue(TEXT("Venex fire-rate bonus configuration is 15%"),
		FMath::IsNearlyEqual(Defaults->OverclockFireRateBonus, 0.15f, 0.001f));
	TestTrue(TEXT("Venex overclock duration configuration is 5 seconds"),
		FMath::IsNearlyEqual(Defaults->OverclockDuration, 5.0f, 0.001f));
	return RunPassiveActivationContract(*this, TEXT("VenexPassiveAutomationWorld"), UKhaaosAbility_VenexPassive::StaticClass());
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosKhaelPassiveActivationTest,
	"Khaaos.GAS.Species.Khael.ActivationContract",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKhaaosKhaelPassiveActivationTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	const UKhaaosAbility_KhaelPassive* Defaults = GetDefault<UKhaaosAbility_KhaelPassive>();
	TestTrue(TEXT("Khael energy cost reduction configuration is 20%"),
		FMath::IsNearlyEqual(Defaults->EnergyCostReduction, 0.20f, 0.001f));
	TestTrue(TEXT("Khael cooldown reduction configuration is 15%"),
		FMath::IsNearlyEqual(Defaults->CooldownReduction, 0.15f, 0.001f));
	return RunPassiveActivationContract(*this, TEXT("KhaelPassiveAutomationWorld"), UKhaaosAbility_KhaelPassive::StaticClass());
}

#endif // WITH_DEV_AUTOMATION_TESTS
