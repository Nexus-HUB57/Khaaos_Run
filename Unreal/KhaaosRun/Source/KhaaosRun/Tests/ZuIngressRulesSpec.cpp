// Khaaos Run — automation coverage for the additive Zu ingress catalog.
// Copyright Nexus-HUB57.

#if WITH_DEV_AUTOMATION_TESTS
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

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKhaaosZu_Ingress_ReadmeContract15Variants,
	"Khaaos.Zu.Contract.Readme15Variants",
	EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosZu_Ingress_ReadmeContract15Variants::RunTest(const FString& Parameters)
{
	using namespace KhaaosZuIngress;
	(void)Parameters;

	struct FExpectedVariant
	{
		const char* Popup;
		const char* Situation;
		const char* Place;
		EAction Action;
	};

	static const FExpectedVariant Expected[static_cast<int>(ERing::Count)][3] = {
		{
			{"Caminhão atropela bois - Apertar o cinto S/N", "Caminhão atropela bois", "Khaaos Ville", EAction::Seatbelt},
			{"Capota com rocha - Saltar S/N", "Capota com rocha", "Khaaos Ville", EAction::Egress},
			{"Cai da ponte - Usar máscara O₂ S/N", "Cai da ponte", "Khaaos Ville", EAction::Mask},
		},
		{
			{"Trem descarrila - Apertar o cinto S/N", "Trem descarrila", "Barburhen", EAction::Seatbelt},
			{"Colisão frontal - Saltar S/N", "Colisão frontal", "Barburhen", EAction::Egress},
			{"Incêndio elétrico - Usar máscara S/N", "Incêndio elétrico", "Barburhen", EAction::Mask},
		},
		{
			{"Fim de trilho - Apertar o cinto S/N", "Fim de trilho", "Priadus", EAction::Seatbelt},
			{"Homens-bomba - Saltar S/N", "Homens-bomba", "Priadus", EAction::Egress},
			{"Neblina tóxica - Usar máscara S/N", "Neblina tóxica", "Priadus", EAction::Mask},
		},
		{
			{"Tempestade de areia - Apertar o cinto S/N", "Tempestade de areia", "Ckesalth", EAction::Seatbelt},
			{"Explosão no túnel - Saltar S/N", "Explosão no túnel", "Ckesalth", EAction::Egress},
			{"Caminhão-tanque em chamas - Usar máscara S/N", "Caminhão-tanque em chamas", "Ckesalth", EAction::Mask},
		},
		{
			{"Trilho desmorona - Apertar o cinto S/N", "Trilho desmorona", "Arukheea", EAction::Seatbelt},
			{"Colisão com tanque - Saltar no mar S/N", "Colisão com tanque", "Arukheea", EAction::Egress},
			{"Bombas de gás por drones - Usar máscara S/N", "Bombas de gás por drones", "Arukheea", EAction::Mask},
		},
	};
	static_assert(static_cast<int>(ERing::Count) == 5, "Update the canonical Zu contract matrix when rings change");
	static const TCHAR* RingNames[] = {TEXT("CIGKV"), TEXT("Barburhen"), TEXT("Priadus"), TEXT("Ckesalth"), TEXT("Arukheea")};

	for (int RingIndex = 0; RingIndex < static_cast<int>(ERing::Count); ++RingIndex)
	{
		for (int Variant = 1; Variant <= 3; ++Variant)
		{
			const FExpectedVariant& Contract = Expected[RingIndex][Variant - 1];
			FSpec Spec;
			const FString Context = FString::Printf(TEXT("Ring %d / Zu %d"), RingIndex, Variant);
			const bool bFound = FindSpec(static_cast<ERing>(RingIndex), Variant, Spec);
			TestTrue(*FString::Printf(TEXT("%s existe"), *Context), bFound);
			if (!bFound)
			{
				continue;
			}

			TestEqual(*FString::Printf(TEXT("%s popup"), *Context), FString(UTF8_TO_TCHAR(Spec.Popup)), FString(UTF8_TO_TCHAR(Contract.Popup)));
			TestEqual(*FString::Printf(TEXT("%s evento"), *Context), FString(UTF8_TO_TCHAR(Spec.Situation)), FString(UTF8_TO_TCHAR(Contract.Situation)));
			TestEqual(*FString::Printf(TEXT("%s local"), *Context), FString(UTF8_TO_TCHAR(Spec.Place)), FString(UTF8_TO_TCHAR(Contract.Place)));
			TestTrue(*FString::Printf(TEXT("%s ação"), *Context), Spec.Action == Contract.Action);
			TestTrue(*FString::Printf(TEXT("%s teto de dano"), *Context), FMath::IsNearlyEqual(Spec.RefuseLoss, MaxRefuseLoss));

			const FOutcome Accepted = Resolve(Spec, EDecision::Accept, 1.0f, 0.0f);
			TestTrue(*FString::Printf(TEXT("%s decisão correta preserva vitalidade"), *Context), FMath::IsNearlyEqual(Accepted.VitalityRemaining, 1.0f));
			if (Contract.Action == EAction::Mask)
			{
				TestTrue(*FString::Printf(TEXT("%s máscara aplica efeito visual de 5–7 s"), *Context), Accepted.BlurSeconds >= 5.0f && Accepted.BlurSeconds <= 7.0f);
			}
			else
			{
				TestTrue(*FString::Printf(TEXT("%s cinto/salto aplica bloqueio de 5–7 s"), *Context), Accepted.ControlLockSeconds >= 5.0f && Accepted.ControlLockSeconds <= 7.0f);
			}

			const FOutcome Refused = Resolve(Spec, EDecision::Refuse, 1.0f, 1.0f);
			TestTrue(*FString::Printf(TEXT("%s decisão incorreta aplica o limite esperado de 30%%"), *Context),
				FMath::IsNearlyEqual(Refused.VitalityRemaining, 1.0f - MaxRefuseLoss, 0.001f));
			TestTrue(*FString::Printf(TEXT("%s decisão incorreta permite agir imediatamente"), *Context), Refused.bCanActImmediately);
			AddInfo(FString::Printf(TEXT("ZU_CASE|contract|%s|%d"), RingNames[RingIndex], Variant));
		}
	}

	return true;
}
#endif // WITH_DEV_AUTOMATION_TESTS
