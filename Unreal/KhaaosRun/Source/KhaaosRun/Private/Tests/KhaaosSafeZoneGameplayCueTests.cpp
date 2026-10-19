// Khaaos Run - Gameplay Ability System Automation Tests
#include "KhaaosSafeZoneGameplayCueTestTypes.h"

#include "AbilitySystemComponent.h"
#include "Engine/World.h"
#include "Game/AbilitySystem/KhaaosGameplayEffects.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "Game/UI/Widgets/KhaaosHUDWidget.h"
#include "GameplayEffect.h"
#include "Misc/AutomationTest.h"

AKhaaosSafeZoneGameplayCueTestTarget::AKhaaosSafeZoneGameplayCueTestTarget()
{
	PrimaryActorTick.bCanEverTick = false;
	AbilitySystemComponent = CreateDefaultSubobject<UAbilitySystemComponent>(TEXT("TestAbilitySystemComponent"));
	AbilitySystemComponent->SetIsReplicated(false);
	AttributeSet = CreateDefaultSubobject<UKhaaosAttributeSet>(TEXT("TestAttributeSet"));
	AbilitySystemComponent->AddAttributeSetSubobject(AttributeSet);
}

UAbilitySystemComponent* AKhaaosSafeZoneGameplayCueTestTarget::GetAbilitySystemComponent() const
{
	return AbilitySystemComponent;
}

void AKhaaosSafeZoneGameplayCueTestTarget::HandleGameplayCue(
	AActor* Self,
	FGameplayTag GameplayCueTag,
	EGameplayCueEvent::Type EventType,
	const FGameplayCueParameters& Parameters)
{
	(void)Self;
	(void)Parameters;
	if (GameplayCueTag == FGameplayTag::RequestGameplayTag(FName(TEXT("GameplayCue.Damage.Zone")), false) &&
		EventType == EGameplayCueEvent::Executed)
	{
		++ZoneCueExecutionCount;
		LastCueTag = GameplayCueTag;
		LastCueEvent = EventType;
		LastEffectCauser = Parameters.EffectContext.GetEffectCauser();
	}
}

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSafeZoneGameplayCueDispatchTest,
	"Khaaos.GAS.SafeZone.GameplayCueDispatch",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSafeZoneGameplayCueDispatchTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FKhaaosGameplayTags::InitializeTags();
	const FGameplayTag ExpectedCueTag = FKhaaosGameplayTags::Get().GameplayCue_Damage_Zone;
	TestTrue(TEXT("SafeZone GameplayCue tag is registered"), ExpectedCueTag.IsValid());
	if (!ExpectedCueTag.IsValid())
	{
		return false;
	}

	UGameplayEffect* ZoneDamageEffect = UKhaaosGameplayEffects::CreateZoneDamageEffect(7.0f);
	TestNotNull(TEXT("SafeZone damage GameplayEffect is created"), ZoneDamageEffect);
	if (!ZoneDamageEffect)
	{
		return false;
	}

	TestEqual(TEXT("SafeZone effect declares one GameplayCue"), ZoneDamageEffect->GameplayCues.Num(), 1);
	if (ZoneDamageEffect->GameplayCues.Num() != 1 ||
		ZoneDamageEffect->GameplayCues[0].GameplayCueTag != ExpectedCueTag)
	{
		AddError(TEXT("CreateZoneDamageEffect does not reference GameplayCue.Damage.Zone"));
		return false;
	}

	UWorld* TestWorld = UWorld::CreateWorld(EWorldType::Game, false, FName(TEXT("SafeZoneCueAutomationWorld")));
	if (!TestWorld)
	{
		AddError(TEXT("Failed to create transient world for GameplayCue dispatch"));
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
		AddError(TEXT("Failed to spawn an ASC target for the SafeZone cue test"));
		TestWorld->DestroyWorld(false);
		return false;
	}

	Target->AbilitySystemComponent->InitAbilityActorInfo(Target, Target);
	const float InitialHealth = Target->AttributeSet->GetHealth();
	FGameplayEffectContextHandle Context = Target->AbilitySystemComponent->MakeEffectContext();
	Context.AddInstigator(Target, Target);
	const FGameplayEffectSpec ZoneDamageSpec(ZoneDamageEffect, Context, 1.0f);
	Target->AbilitySystemComponent->ApplyGameplayEffectSpecToSelf(ZoneDamageSpec);

	TestEqual(TEXT("The ASC target receives exactly one SafeZone cue"), Target->ZoneCueExecutionCount, 1);
	TestTrue(TEXT("The routed cue tag is the SafeZone damage cue"), Target->LastCueTag == ExpectedCueTag);
	TestTrue(TEXT("The cue event is Executed for the instant damage effect"),
		Target->LastCueEvent == EGameplayCueEvent::Executed);
	TestTrue(TEXT("The effect context causer reaches the cue callback"), Target->LastEffectCauser.Get() == Target);
	TestTrue(TEXT("The same effect applies its Health modifier"),
		FMath::IsNearlyEqual(Target->AttributeSet->GetHealth(), InitialHealth - 7.0f, 0.01f));

	TestWorld->DestroyWorld(false);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSafeZoneWarningCadenceTest,
	"Khaaos.GAS.SafeZone.WarningCadence",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSafeZoneWarningCadenceTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	const float FullHealthInterval = UKhaaosHUDWidget::GetZoneWarningBeepInterval(100.0f, 100.0f);
	const float HalfHealthInterval = UKhaaosHUDWidget::GetZoneWarningBeepInterval(50.0f, 100.0f);
	const float CriticalHealthInterval = UKhaaosHUDWidget::GetZoneWarningBeepInterval(1.0f, 100.0f);
	const float BelowZeroInterval = UKhaaosHUDWidget::GetZoneWarningBeepInterval(-25.0f, 100.0f);
	const float InvalidMaximumInterval = UKhaaosHUDWidget::GetZoneWarningBeepInterval(10.0f, 0.0f);

	TestTrue(TEXT("Beep cadence accelerates as health decreases"),
		FullHealthInterval > HalfHealthInterval && HalfHealthInterval > CriticalHealthInterval);
	TestTrue(TEXT("Critical health cadence is clamped to 0.18 seconds"),
		FMath::IsNearlyEqual(CriticalHealthInterval, 0.18f, 0.001f));
	TestTrue(TEXT("Negative health clamps to the fastest supported cadence"),
		FMath::IsNearlyEqual(BelowZeroInterval, CriticalHealthInterval, 0.001f));
	TestTrue(TEXT("Invalid MaxHealth uses the safe slow cadence"),
		FMath::IsNearlyEqual(InvalidMaximumInterval, FullHealthInterval, 0.001f));
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
