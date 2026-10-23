// Khaaos Run — automation coverage for the additive Zu ingress catalog.
// Copyright Nexus-HUB57.

#include "CoreMinimal.h"
#include "AutomationTest.h"
#include "Game/World/Zu/ZuIngressRules.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosZu_Ingress_AllRingsResolve,
	"Khaaos.Zu.Ingress.AllRingsResolve",
	EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosZu_Ingress_AllRingsResolve::RunTest(const FString& Parameters)
{
	using namespace KhaaosZuIngress;
	(void)Parameters;

	for (int RingIndex = 0; RingIndex < static_cast<int>(ERing::Count); ++RingIndex)
	{
		for (int Variant = 1; Variant <= 3; ++Variant)
		{
			FSpec Spec;
			TestTrue(TEXT("Cada ring tem Zu 1, 2 e 3"), FindSpec(static_cast<ERing>(RingIndex), Variant, Spec));
			TestTrue(TEXT("Zu tem solo hostil"), HazardCount(Spec.Ring, Spec.Variant) >= 2);

			const FOutcome Accept = Resolve(Spec, EDecision::Accept, 1.0f, 0.0f);
			TestTrue(TEXT("Aceitar nao tira vitalidade"), FMath::IsNearlyEqual(Accept.VitalityRemaining, 1.0f));
			if (Spec.Action == EAction::Mask)
			{
				TestTrue(TEXT("Mascara embaca e nao trava o corpo"), Accept.BlurSeconds >= 5.0f && Accept.ControlLockSeconds == 0.0f);
			}
			else
			{
				TestTrue(TEXT("Cinto ou salto trava de 5 a 7s"), Accept.ControlLockSeconds >= 5.0f && Accept.ControlLockSeconds <= 7.0f);
				TestTrue(TEXT("Cinto ou salto nao embaca"), Accept.BlurSeconds == 0.0f);
			}

			const FOutcome Refuse = Resolve(Spec, EDecision::Refuse, 1.0f, 1.0f);
			TestTrue(TEXT("Recusar tira no maximo 30%"), FMath::IsNearlyEqual(Refuse.VitalityRemaining, 0.70f, 0.001f));
			TestTrue(TEXT("Recusar age na hora"), Refuse.bCanActImmediately);
			TestTrue(TEXT("So o cinto lanca para fora"), Refuse.bThrownFromVehicle == (Spec.Action == EAction::Seatbelt));

			int Stock[LootSlots] = {};
			TestTrue(TEXT("Cada Zu tem manifesto"), LootStock(Spec.Ring, Spec.Variant, Stock));
		}
	}

	FSpec Missing;
	TestFalse(TEXT("Variante invalida nao existe"), FindSpec(ERing::CIGKV, 4, Missing));

	int CigkvZu1[LootSlots] = {};
	TestTrue(TEXT("Estoque CIGKV"), LootStock(ERing::CIGKV, 1, CigkvZu1));
	TestEqual(TEXT("Zu1 CIGKV tem 20 facas"), CigkvZu1[0], 20);

	FHazard Fog;
	TestTrue(TEXT("Priadus Zu3 tem neblina"), HazardAt(ERing::Priadus, 3, 0, Fog));
	TestTrue(TEXT("Neblina inverte o comando"), Fog.Kind == EHazardKind::Invert);
	TestTrue(TEXT("Mascara segura a neblina"), Fog.bMaskedSafe);

	FHazard Sand;
	TestTrue(TEXT("Ckesalth Zu3 tem areia"), HazardAt(ERing::Ckesalth, 3, 1, Sand));
	TestTrue(TEXT("Areia movedica"), Sand.Kind == EHazardKind::Sink);

	FHazard Shark;
	TestTrue(TEXT("Arukheea Zu2 tem agua"), HazardAt(ERing::Arukheea, 2, 1, Shark));
	TestTrue(TEXT("Tubarao"), Shark.Kind == EHazardKind::Chomp);

	FSpec MaskSpec;
	TestTrue(TEXT("Zu3"), FindSpec(ERing::CIGKV, 3, MaskSpec));
	const FOutcome Half = Resolve(MaskSpec, EDecision::Refuse, 0.5f, 0.0f);
	TestTrue(TEXT("Exposicao parcial corta pela metade"), FMath::IsNearlyEqual(Half.VitalityRemaining, 0.85f, 0.001f));
	return true;
}
