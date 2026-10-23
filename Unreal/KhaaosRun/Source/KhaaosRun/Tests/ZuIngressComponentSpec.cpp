// Khaaos Run — the vitality order derived from a Zu decision.
// Copyright Nexus-HUB57.

#include "CoreMinimal.h"
#include "AutomationTest.h"
#include "Game/World/Zu/KhaaosZuIngressComponent.h"

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
