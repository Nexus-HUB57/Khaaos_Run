// Khaaos Run — the vitality order derived from a Zu decision.
// Copyright Nexus-HUB57.

#if WITH_DEV_AUTOMATION_TESTS
#include "CoreMinimal.h"
#include "AutomationTest.h"
#include "Game/World/Zu/KhaaosZuIngressComponent.h"
#include "Game/Player/KhaaosVitalityComponent.h"
#include "Engine/World.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosZu_Ingress_VitalityOrder,
	"Khaaos.Zu.Ingress.VitalityOrder",
	EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosZu_Ingress_VitalityOrder::RunTest(const FString& Parameters)
{
	using namespace KhaaosZuIngress;
	(void)Parameters;

	FSpec Seatbelt;
	TestTrue(TEXT("Zu1"), FindSpec(ERing::CIGKV, 1, Seatbelt));
	const FKhaaosZuPlainOrder Locked = KhaaosZu_OrderFromOutcome(Resolve(Seatbelt, EDecision::Accept, 1.0f, 0.0f));
	TestTrue(TEXT("Cinto nao tira vida"), Locked.PercentageDamage == 0.0f);
	TestTrue(TEXT("Cinto vira stun de 5s"), FMath::IsNearlyEqual(Locked.StunSeconds, 5.0f));
	TestTrue(TEXT("Cinto nao embaça"), Locked.BlurSeconds == 0.0f);
	TestFalse(TEXT("Aceitar nao lanca"), Locked.bThrownFromVehicle);

	const FKhaaosZuPlainOrder Thrown = KhaaosZu_OrderFromOutcome(Resolve(Seatbelt, EDecision::Refuse, 1.0f, 1.0f));
	TestTrue(TEXT("Recusar pede 30%"), FMath::IsNearlyEqual(Thrown.PercentageDamage, 0.30f, 0.001f));
	TestTrue(TEXT("Recusar nao stuna"), Thrown.StunSeconds == 0.0f);
	TestTrue(TEXT("Recusar o cinto lanca"), Thrown.bThrownFromVehicle);

	FSpec Mask;
	TestTrue(TEXT("Zu3"), FindSpec(ERing::Arukheea, 3, Mask));
	const FKhaaosZuPlainOrder Blur = KhaaosZu_OrderFromOutcome(Resolve(Mask, EDecision::Accept, 1.0f, 1.0f));
	TestTrue(TEXT("Mascara embaça 7s"), FMath::IsNearlyEqual(Blur.BlurSeconds, 7.0f));
	TestTrue(TEXT("Mascara nao stuna"), Blur.StunSeconds == 0.0f);
	TestTrue(TEXT("Mascara nao tira vida"), Blur.PercentageDamage == 0.0f);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosZu_Ingress_ServerAuthorityOnly,
	"Khaaos.Zu.Authority.ServerOnlyAppliesEffects",
	EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosZu_Ingress_ServerAuthorityOnly::RunTest(const FString& Parameters)
{
	(void)Parameters;

	UWorld* TestWorld = UWorld::CreateWorld(EWorldType::Game, false, FName(TEXT("ZuAuthorityAutomationWorld")));
	if (!TestWorld)
	{
		AddError(TEXT("Could not create transient world for Zu authority test"));
		return false;
	}
	TestWorld->InitializeNewWorld(UWorld::InitializationValues()
		.AllowAudioPlayback(false)
		.CreatePhysicsScene(false)
		.CreateNavigation(false)
		.CreateAISystem(false)
		.ShouldSimulatePhysics(false)
		.SetTransactional(false));

	AActor* ServerOwner = TestWorld->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (!ServerOwner)
	{
		AddError(TEXT("Could not spawn server-authority Zu owner"));
		TestWorld->DestroyWorld(false);
		return false;
	}

	UKhaaosVitalityComponent* ServerVitality = NewObject<UKhaaosVitalityComponent>(ServerOwner);
	ServerOwner->AddInstanceComponent(ServerVitality);
	ServerVitality->RegisterComponent();
	UKhaaosZuIngressComponent* ServerZu = NewObject<UKhaaosZuIngressComponent>(ServerOwner);
	ServerOwner->AddInstanceComponent(ServerZu);
	ServerZu->RegisterComponent();

	static const EKhaaosZuRingId RingIds[] = {
		EKhaaosZuRingId::CIGKV,
		EKhaaosZuRingId::Barburhen,
		EKhaaosZuRingId::Priadus,
		EKhaaosZuRingId::Ckesalth,
		EKhaaosZuRingId::Arukheea,
	};
	static const TCHAR* RingNames[] = {TEXT("CIGKV"), TEXT("Barburhen"), TEXT("Priadus"), TEXT("Ckesalth"), TEXT("Arukheea")};
	static const TCHAR* ExpectedSituation[5][3] = {
		{TEXT("Caminhão atropela bois"), TEXT("Capota com rocha"), TEXT("Cai da ponte")},
		{TEXT("Trem descarrila"), TEXT("Colisão frontal"), TEXT("Incêndio elétrico")},
		{TEXT("Fim de trilho"), TEXT("Homens-bomba"), TEXT("Neblina tóxica")},
		{TEXT("Tempestade de areia"), TEXT("Explosão no túnel"), TEXT("Caminhão-tanque em chamas")},
		{TEXT("Trilho desmorona"), TEXT("Colisão com tanque"), TEXT("Bombas de gás por drones")},
	};
	static_assert(UE_ARRAY_COUNT(RingIds) == 5, "Update the Zu authority matrix when the ring catalog changes");
	static_assert(static_cast<int32>(KhaaosZuIngress::ERing::Count) == static_cast<int32>(UE_ARRAY_COUNT(RingIds)), "Every rules ring must have an authority fixture");
	static_assert(UE_ARRAY_COUNT(RingNames) == UE_ARRAY_COUNT(RingIds), "Every ring needs a readable test label");
	static_assert(UE_ARRAY_COUNT(ExpectedSituation[0]) == 3, "Each ring must cover Zu 1, Zu 2, and Zu 3");
	const FGameplayTag StunTag = FGameplayTag::RequestGameplayTag(FName(TEXT("Debuff.Stun")), false);
	const FGameplayTag VisionBlurTag = FGameplayTag::RequestGameplayTag(FName(TEXT("Debuff.VisionBlur")), false);

	TestTrue(TEXT("Locally spawned server fixture has authority"), ServerOwner->HasAuthority());
	for (int32 RingIndex = 0; RingIndex < 5; ++RingIndex)
	{
		for (int32 Variant = 1; Variant <= 3; ++Variant)
		{
			const FString Context = FString::Printf(TEXT("%s Zu %d"), RingNames[RingIndex], Variant);
			ServerVitality->CurrentVitality = ServerVitality->MaxVitality;
			const bool bBegan = ServerZu->BeginIngress(RingIds[RingIndex], Variant);
			TestTrue(*FString::Printf(TEXT("Server begins %s"), *Context), bBegan);
			if (!bBegan)
			{
				continue;
			}

			TestEqual(*FString::Printf(TEXT("%s maps to the correct event"), *Context),
				ServerZu->GetSituationText(), FString(ExpectedSituation[RingIndex][Variant - 1]));
			TestTrue(*FString::Printf(TEXT("%s exposes a popup"), *Context), !ServerZu->GetPopupText().IsEmpty());
			TestTrue(*FString::Printf(TEXT("%s exposes hazards"), *Context), ServerZu->GetHazardCount() > 0);
			TArray<int32> ServerLoot;
			TestTrue(*FString::Printf(TEXT("%s exposes its loot manifest"), *Context), ServerZu->GetLootStock(ServerLoot));
			TestEqual(*FString::Printf(TEXT("%s has all loot slots"), *Context), ServerLoot.Num(), KhaaosZuIngress::LootSlots);

			TestTrue(*FString::Printf(TEXT("Server resolves %s refusal"), *Context), ServerZu->SubmitDecision(false, 1.0f, 1.0f));
			TestTrue(*FString::Printf(TEXT("Server applies %s on authority"), *Context), ServerZu->WasAppliedOnAuthority());
			TestTrue(*FString::Printf(TEXT("%s refusal applies exactly the 30%% cap"), *Context),
				FMath::IsNearlyEqual(ServerVitality->GetVitalityPercent(), 0.70f, 0.001f));

			ServerVitality->RemoveDebuff(StunTag);
			ServerVitality->RemoveDebuff(VisionBlurTag);
			ServerOwner->Tags.Remove(FName(TEXT("State.Stunned")));
			ServerVitality->CurrentVitality = ServerVitality->MaxVitality;
			TestTrue(*FString::Printf(TEXT("Server restarts %s for the protective choice"), *Context),
				ServerZu->BeginIngress(RingIds[RingIndex], Variant));
			TestTrue(*FString::Printf(TEXT("Server resolves the protective choice for %s"), *Context),
				ServerZu->SubmitDecision(true, 1.0f, 0.0f));
			TestTrue(*FString::Printf(TEXT("Server applies the protective outcome for %s"), *Context), ServerZu->WasAppliedOnAuthority());
			TestTrue(*FString::Printf(TEXT("Protective choice for %s keeps vitality"), *Context),
				FMath::IsNearlyEqual(ServerVitality->GetVitalityPercent(), 1.0f, 0.001f));
			if (Variant == 3)
			{
				TestTrue(*FString::Printf(TEXT("Protective mask for %s applies blur"), *Context), ServerVitality->HasDebuff(VisionBlurTag));
			}
			else
			{
				TestTrue(*FString::Printf(TEXT("Protective choice for %s applies stun"), *Context),
					ServerOwner->Tags.Contains(FName(TEXT("State.Stunned"))));
			}
			AddInfo(FString::Printf(TEXT("ZU_CASE|authority|%s|%d|server"), RingNames[RingIndex], Variant));
		}
	}

	AActor* ClientOwner = TestWorld->SpawnActor<AActor>(FVector(100.0f, 0.0f, 0.0f), FRotator::ZeroRotator);
	if (!ClientOwner)
	{
		AddError(TEXT("Could not spawn simulated-client Zu owner"));
		TestWorld->DestroyWorld(false);
		return false;
	}
	ClientOwner->SetReplicates(true);
	// Exercise the same non-authority role a replicated client proxy receives.
	ClientOwner->SetRole(ROLE_SimulatedProxy);
	TestFalse(TEXT("Simulated client proxy has no authority"), ClientOwner->HasAuthority());
	TestTrue(TEXT("Client fixture uses the expected simulated-proxy role"), ClientOwner->GetLocalRole() == ROLE_SimulatedProxy);

	UKhaaosVitalityComponent* ClientVitality = NewObject<UKhaaosVitalityComponent>(ClientOwner);
	ClientOwner->AddInstanceComponent(ClientVitality);
	ClientVitality->RegisterComponent();
	UKhaaosZuIngressComponent* ClientZu = NewObject<UKhaaosZuIngressComponent>(ClientOwner);
	ClientOwner->AddInstanceComponent(ClientZu);
	ClientZu->RegisterComponent();

	for (int32 RingIndex = 0; RingIndex < 5; ++RingIndex)
	{
		for (int32 Variant = 1; Variant <= 3; ++Variant)
		{
			const FString Context = FString::Printf(TEXT("%s Zu %d"), RingNames[RingIndex], Variant);
			ClientVitality->CurrentVitality = ClientVitality->MaxVitality;
			const bool bBegan = ClientZu->BeginIngress(RingIds[RingIndex], Variant);
			TestTrue(*FString::Printf(TEXT("Client reads %s"), *Context), bBegan);
			if (!bBegan)
			{
				continue;
			}

			TestEqual(*FString::Printf(TEXT("Client %s event matches"), *Context),
				ClientZu->GetSituationText(), FString(ExpectedSituation[RingIndex][Variant - 1]));
			TestTrue(*FString::Printf(TEXT("Client resolves %s for local presentation"), *Context), ClientZu->SubmitDecision(false, 1.0f, 1.0f));
			TestFalse(*FString::Printf(TEXT("Client cannot apply %s as authority"), *Context), ClientZu->WasAppliedOnAuthority());
			TestTrue(*FString::Printf(TEXT("Client %s submission leaves vitality unchanged"), *Context),
				FMath::IsNearlyEqual(ClientVitality->GetVitalityPercent(), 1.0f, 0.001f));

			TestTrue(*FString::Printf(TEXT("Client restarts %s for its protective presentation"), *Context),
				ClientZu->BeginIngress(RingIds[RingIndex], Variant));
			TestTrue(*FString::Printf(TEXT("Client resolves the protective presentation for %s"), *Context),
				ClientZu->SubmitDecision(true, 1.0f, 0.0f));
			TestFalse(*FString::Printf(TEXT("Client protective presentation for %s remains non-authoritative"), *Context),
				ClientZu->WasAppliedOnAuthority());
			TestFalse(*FString::Printf(TEXT("Client protective choice for %s does not stun locally"), *Context),
				ClientOwner->Tags.Contains(FName(TEXT("State.Stunned"))));
			TestFalse(*FString::Printf(TEXT("Client protective choice for %s does not apply blur locally"), *Context),
				ClientVitality->HasDebuff(VisionBlurTag));
			TestTrue(*FString::Printf(TEXT("Client protective choice for %s leaves vitality unchanged"), *Context),
				FMath::IsNearlyEqual(ClientVitality->GetVitalityPercent(), 1.0f, 0.001f));
			AddInfo(FString::Printf(TEXT("ZU_CASE|authority|%s|%d|client"), RingNames[RingIndex], Variant));
		}
	}

	TestWorld->DestroyWorld(false);
	return true;
}
#endif // WITH_DEV_AUTOMATION_TESTS
