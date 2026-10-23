// Khaaos Run — Zu ingress catalog. New file only.
// Copyright Nexus-HUB57.

#include "Game/World/Zu/ZuIngressRules.h"

#include <algorithm>
#include <cmath>

namespace KhaaosZuIngress
{
namespace
{

struct FCopy
{
	const char* Popup;
	const char* Situation;
	const char* Place;
};

const FCopy& CopyFor(ERing Ring, int Variant)
{
	static const FCopy Table[5][3] = {
		{
			{"Risco de Colisao - Apertar os Cintos S/N", "O caminhao perde o controle depois de atropelar uma manada de bois.", "Khaaos Ville"},
			{"Area com Alto Risco de Desmoronamento - Saltar do Caminhao S/N", "Uma rocha gigante atinge o caminhao e o faz capotar.", "Khaaos Ville"},
			{"Ponte Antiga / Risco de Queda - Usar Mascara de Oxigenio S/N", "O trilho da ponte quebra. O caminhao cai e submerge.", "Khaaos Ville"},
		},
		{
			{"Risco de Descarrilamento - Apertar os Cintos S/N", "O trem descarrila numa curva fechada de Barburhen.", "Barburhen"},
			{"Colisao Frontal - Saltar do Trem S/N", "O trem colide de frente com outro trem.", "Barburhen"},
			{"Incendio no Vagao - Usar Mascara de Oxigenio S/N", "Pane eletrica. O incendio enche os vagoes de fumaca.", "Barburhen"},
		},
		{
			{"Fim de Trilho - Apertar os Cintos S/N", "O trem muda de trilho, o trilho acaba e bate numa armacao de ferro.", "Priadus"},
			{"Homens-Bomba - Saltar do Trem S/N", "Terroristas homens-bomba invadem os vagoes.", "Priadus"},
			{"Neblina Toxica - Usar Mascara de Oxigenio S/N", "Neblina toxica toma os vagoes depois que o motorista freia.", "Priadus"},
		},
		{
			{"Tempestade de Areia - Apertar os Cintos S/N", "A tempestade de areia empilha no trilho e o trem para bruto.", "Ckesalth"},
			{"Explosao no Tunel - Saltar e Correr S/N", "No meio do tunel, o trem ao lado explode em chamas.", "Ckesalth"},
			{"Fumaca Negra - Usar Mascara de Oxigenio S/N", "Um caminhao-tanque em chamas cai nos trilhos. A fumaca negra entra.", "Ckesalth"},
		},
		{
			{"Trilho Desmorona - Apertar os Cintos S/N", "O trilho desmorona. O trem cai no bosque de palmeiras.", "Arukheea"},
			{"Trem-Tanque - Saltar no Mar S/N", "Um trem-tanque vem na direcao contraria. A colisao explode.", "Arukheea"},
			{"Gas de Drone - Usar Mascara de Oxigenio S/N", "Drones lancam gas nos vagoes. O ar fica irrespiravel.", "Arukheea"},
		},
	};
	return Table[static_cast<int>(Ring)][Variant - 1];
}

EAction ActionFor(int Variant)
{
	if (Variant == 1)
	{
		return EAction::Seatbelt;
	}
	if (Variant == 2)
	{
		return EAction::Egress;
	}
	return EAction::Mask;
}

float Clamp01(float Value)
{
	if (!std::isfinite(Value) || Value < 0.0f)
	{
		return 0.0f;
	}
	return std::min(Value, 1.0f);
}

FHazard H(EHazardKind Kind, const char* Label, float Right, float Forward, float Radius, float Rate, bool bMaskedSafe)
{
	return FHazard{Kind, Label, Right, Forward, Radius, Rate, bMaskedSafe};
}

int FillHazards(ERing Ring, int Variant, FHazard* Out, int Capacity)
{
	FHazard Local[MaxHazardsPerZu] = {};
	int Count = 0;
	const auto Push = [&](FHazard Hazard)
	{
		if (Count < MaxHazardsPerZu)
		{
			Local[Count++] = Hazard;
		}
	};

	switch (static_cast<int>(Ring) * 10 + Variant)
	{
	case 1:
		Push(H(EHazardKind::Slow, "Carcaca no asfalto", -2.4f, 8.0f, 2.6f, 4.5f, false));
		Push(H(EHazardKind::Slow, "Manada caida", 2.2f, 14.0f, 3.4f, 6.0f, false));
		Push(H(EHazardKind::Slow, "Bois no vao", -1.0f, 20.0f, 2.4f, 4.0f, false));
		break;
	case 2:
		Push(H(EHazardKind::Slow, "Rocha no capo", 0.4f, 9.0f, 3.6f, 9.0f, false));
		Push(H(EHazardKind::Slow, "Destroco de concreto", -3.5f, 16.0f, 2.8f, 6.0f, false));
		break;
	case 3:
		Push(H(EHazardKind::Bleed, "Agua funda", 0.0f, 8.0f, 5.2f, 0.055f, true));
		Push(H(EHazardKind::Bleed, "Fundo do canal", -3.0f, 16.0f, 3.6f, 0.07f, true));
		break;
	case 11:
		Push(H(EHazardKind::Slow, "Trilho torto", -1.5f, 10.0f, 3.0f, 5.0f, false));
		Push(H(EHazardKind::Slow, "Vagao partido", 3.0f, 17.0f, 2.8f, 6.5f, false));
		break;
	case 12:
		Push(H(EHazardKind::Bleed, "Chama da colisao", 0.0f, 7.0f, 4.2f, 0.06f, false));
		Push(H(EHazardKind::Bleed, "Ferragem em brasa", 3.2f, 15.0f, 2.6f, 0.045f, false));
		break;
	case 13:
		Push(H(EHazardKind::Bleed, "Fumaca do vagao", -2.0f, 9.0f, 4.4f, 0.05f, true));
		Push(H(EHazardKind::Bleed, "Curto queimando", 2.4f, 16.0f, 3.0f, 0.04f, true));
		break;
	case 21:
		Push(H(EHazardKind::Slow, "Armacao de ferro", 0.0f, 9.0f, 3.2f, 7.0f, false));
		Push(H(EHazardKind::Slow, "Tronco caido", -3.0f, 16.0f, 2.6f, 5.0f, false));
		break;
	case 22:
		Push(H(EHazardKind::Bleed, "Cratera da bomba", 1.0f, 8.0f, 4.0f, 0.065f, false));
		Push(H(EHazardKind::Slow, "Ferragem do vagao", -2.5f, 15.0f, 2.8f, 5.0f, false));
		break;
	case 23:
		Push(H(EHazardKind::Invert, "Neblina que inverte", 0.0f, 10.0f, 5.5f, 1.0f, true));
		Push(H(EHazardKind::Bleed, "Esporos no pulmao", 3.0f, 18.0f, 3.2f, 0.04f, true));
		break;
	case 31:
		Push(H(EHazardKind::Slow, "Duna no trilho", -1.0f, 9.0f, 3.8f, 5.5f, false));
		Push(H(EHazardKind::Slow, "Areia solta", 2.5f, 16.0f, 3.0f, 4.5f, false));
		break;
	case 32:
		Push(H(EHazardKind::Bleed, "Tunel em chamas", 0.0f, 8.0f, 4.6f, 0.07f, false));
		Push(H(EHazardKind::Bleed, "Calor residual", -3.0f, 16.0f, 2.8f, 0.04f, false));
		break;
	case 33:
		Push(H(EHazardKind::Bleed, "Fumaca negra", 2.0f, 8.0f, 4.0f, 0.05f, true));
		Push(H(EHazardKind::Sink, "Areia movedica", -1.5f, 16.0f, 3.2f, 0.16f, false));
		break;
	case 41:
		Push(H(EHazardKind::Slow, "Palmeiras partidas", -2.0f, 9.0f, 3.0f, 5.0f, false));
		Push(H(EHazardKind::Slow, "Areia da praia", 2.0f, 16.0f, 3.4f, 4.0f, false));
		break;
	case 42:
		Push(H(EHazardKind::Bleed, "Explosao do tanque", 0.0f, 7.0f, 3.6f, 0.055f, false));
		Push(H(EHazardKind::Chomp, "Agua com tubarao", 2.5f, 15.0f, 4.4f, 0.12f, false));
		break;
	case 43:
		Push(H(EHazardKind::Bleed, "Gas dos drones", -1.0f, 9.0f, 4.8f, 0.06f, true));
		Push(H(EHazardKind::Chomp, "Mare na costa", 3.0f, 17.0f, 3.4f, 0.10f, false));
		break;
	default:
		break;
	}

	if (Out == nullptr || Capacity <= 0)
	{
		return Count;
	}
	const int Written = std::min(Count, Capacity);
	for (int Index = 0; Index < Written; ++Index)
	{
		Out[Index] = Local[Index];
	}
	return Count;
}

} // namespace

bool IsRing(ERing Ring) noexcept
{
	return static_cast<int>(Ring) >= 0 && Ring < ERing::Count;
}

bool IsVariant(int Variant) noexcept
{
	return Variant >= 1 && Variant <= 3;
}

bool FindSpec(ERing Ring, int Variant, FSpec& Out) noexcept
{
	if (!IsRing(Ring) || !IsVariant(Variant))
	{
		return false;
	}
	const FCopy& Copy = CopyFor(Ring, Variant);
	const EAction Action = ActionFor(Variant);
	Out.Ring = Ring;
	Out.Variant = Variant;
	Out.Action = Action;
	Out.RefuseLoss = MaxRefuseLoss;
	Out.LockMin = 5.0f;
	Out.LockMax = 7.0f;
	Out.bAcceptLocks = Action != EAction::Mask;
	Out.bAcceptBlurs = Action == EAction::Mask;
	Out.Popup = Copy.Popup;
	Out.Situation = Copy.Situation;
	Out.Place = Copy.Place;
	return true;
}

FOutcome Resolve(const FSpec& Spec, EDecision Decision, float Exposure01, float LockRoll01) noexcept
{
	const float Roll = Clamp01(LockRoll01);
	const float Window = Spec.LockMin + (Spec.LockMax - Spec.LockMin) * Roll;
	FOutcome Outcome;
	if (Decision == EDecision::Accept)
	{
		Outcome.VitalityRemaining = 1.0f;
		Outcome.ControlLockSeconds = Spec.bAcceptLocks ? Window : 0.0f;
		Outcome.BlurSeconds = Spec.bAcceptBlurs ? Window : 0.0f;
		Outcome.bThrownFromVehicle = false;
		Outcome.bCanActImmediately = Outcome.ControlLockSeconds <= 0.0f;
		return Outcome;
	}

	const float Exposure = Clamp01(Exposure01);
	const float Loss = std::min(std::max(Spec.RefuseLoss, 0.0f), MaxRefuseLoss);
	Outcome.VitalityRemaining = 1.0f - Loss * Exposure;
	Outcome.ControlLockSeconds = 0.0f;
	Outcome.BlurSeconds = 0.0f;
	Outcome.bThrownFromVehicle = Spec.Action == EAction::Seatbelt;
	Outcome.bCanActImmediately = true;
	return Outcome;
}

int HazardCount(ERing Ring, int Variant) noexcept
{
	if (!IsRing(Ring) || !IsVariant(Variant))
	{
		return 0;
	}
	return FillHazards(Ring, Variant, nullptr, 0);
}

bool HazardAt(ERing Ring, int Variant, int Index, FHazard& Out) noexcept
{
	FHazard Buffer[MaxHazardsPerZu] = {};
	const int Count = FillHazards(Ring, Variant, Buffer, MaxHazardsPerZu);
	if (Index < 0 || Index >= Count)
	{
		return false;
	}
	Out = Buffer[Index];
	return true;
}

bool LootStock(ERing Ring, int Variant, int OutStock[LootSlots]) noexcept
{
	if (!IsRing(Ring) || !IsVariant(Variant) || OutStock == nullptr)
	{
		return false;
	}
	const int Cigkv[3][LootSlots] = {
		{20, 10, 20, 20, 5, 20, 0},
		{10, 20, 20, 20, 5, 20, 0},
		{10, 10, 20, 20, 5, 20, 10},
	};
	const int BarburhenA[LootSlots] = {12, 6, 10, 12, 1, 4, 6};
	const int BarburhenB[LootSlots] = {8, 8, 12, 10, 2, 6, 4};
	const int Priadus[LootSlots] = {14, 4, 8, 10, 0, 0, 12};
	const int Ckesalth[LootSlots] = {8, 10, 12, 8, 2, 4, 6};
	const int Arukheea[LootSlots] = {10, 6, 8, 10, 1, 2, 8};
	const int* Source = Cigkv[0];
	switch (Ring)
	{
	case ERing::CIGKV:
		Source = Cigkv[Variant - 1];
		break;
	case ERing::Barburhen:
		Source = Variant == 2 ? BarburhenB : BarburhenA;
		break;
	case ERing::Priadus:
		Source = Priadus;
		break;
	case ERing::Ckesalth:
		Source = Ckesalth;
		break;
	case ERing::Arukheea:
		Source = Arukheea;
		break;
	default:
		return false;
	}
	for (int Slot = 0; Slot < LootSlots; ++Slot)
	{
		OutStock[Slot] = Source[Slot];
	}
	return true;
}

} // namespace KhaaosZuIngress
