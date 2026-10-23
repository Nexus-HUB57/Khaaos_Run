// Khaaos Run — applies the Zu catalog through the vitality API that already exists.
// Copyright Nexus-HUB57.

#include "Game/World/Zu/KhaaosZuIngressComponent.h"

#include "Game/Player/KhaaosVitalityComponent.h"

namespace
{

KhaaosZuIngress::ERing ToRulesRing(EKhaaosZuRingId Ring)
{
	switch (Ring)
	{
	case EKhaaosZuRingId::Barburhen: return KhaaosZuIngress::ERing::Barburhen;
	case EKhaaosZuRingId::Priadus: return KhaaosZuIngress::ERing::Priadus;
	case EKhaaosZuRingId::Ckesalth: return KhaaosZuIngress::ERing::Ckesalth;
	case EKhaaosZuRingId::Arukheea: return KhaaosZuIngress::ERing::Arukheea;
	default: return KhaaosZuIngress::ERing::CIGKV;
	}
}

EKhaaosZuHazardId ToViewKind(KhaaosZuIngress::EHazardKind Kind)
{
	switch (Kind)
	{
	case KhaaosZuIngress::EHazardKind::Bleed: return EKhaaosZuHazardId::Bleed;
	case KhaaosZuIngress::EHazardKind::Invert: return EKhaaosZuHazardId::Invert;
	case KhaaosZuIngress::EHazardKind::Sink: return EKhaaosZuHazardId::Sink;
	case KhaaosZuIngress::EHazardKind::Chomp: return EKhaaosZuHazardId::Chomp;
	default: return EKhaaosZuHazardId::Slow;
	}
}

} // namespace

FKhaaosZuPlainOrder KhaaosZu_OrderFromOutcome(const KhaaosZuIngress::FOutcome& Outcome)
{
	FKhaaosZuPlainOrder Order;
	Order.PercentageDamage = FMath::Clamp(1.0f - Outcome.VitalityRemaining, 0.0f, KhaaosZuIngress::MaxRefuseLoss);
	Order.StunSeconds = FMath::Max(0.0f, Outcome.ControlLockSeconds);
	Order.BlurSeconds = FMath::Max(0.0f, Outcome.BlurSeconds);
	Order.bThrownFromVehicle = Outcome.bThrownFromVehicle;
	return Order;
}

UKhaaosZuIngressComponent::UKhaaosZuIngressComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
	SetIsReplicatedByDefault(false);
}

bool UKhaaosZuIngressComponent::BeginIngress(EKhaaosZuRingId Ring, int32 Variant)
{
	bAppliedOnAuthority = false;
	LastOrder = FKhaaosZuPlainOrder();
	bIngressReady = KhaaosZuIngress::FindSpec(ToRulesRing(Ring), Variant, ActiveSpec);
	return bIngressReady;
}

FString UKhaaosZuIngressComponent::GetPopupText() const
{
	return bIngressReady ? FString(UTF8_TO_TCHAR(ActiveSpec.Popup)) : FString();
}

FString UKhaaosZuIngressComponent::GetSituationText() const
{
	return bIngressReady ? FString(UTF8_TO_TCHAR(ActiveSpec.Situation)) : FString();
}

bool UKhaaosZuIngressComponent::SubmitDecision(bool bAccept, float Exposure01, float LockRoll01)
{
	if (!bIngressReady)
	{
		return false;
	}

	const KhaaosZuIngress::EDecision Decision = bAccept
		? KhaaosZuIngress::EDecision::Accept
		: KhaaosZuIngress::EDecision::Refuse;
	const KhaaosZuIngress::FOutcome Outcome = KhaaosZuIngress::Resolve(ActiveSpec, Decision, Exposure01, LockRoll01);
	LastOrder = KhaaosZu_OrderFromOutcome(Outcome);
	bAppliedOnAuthority = false;

	AActor* Owner = GetOwner();
	if (IsValid(Owner) && Owner->HasAuthority())
	{
		if (UKhaaosVitalityComponent* Vitality = Owner->FindComponentByClass<UKhaaosVitalityComponent>())
		{
			if (LastOrder.PercentageDamage > 0.0f)
			{
				Vitality->ApplyPercentageDamage(LastOrder.PercentageDamage, Owner);
			}
			if (LastOrder.StunSeconds > 0.0f)
			{
				Vitality->ApplyStun(LastOrder.StunSeconds);
			}
			if (LastOrder.BlurSeconds > 0.0f)
			{
				Vitality->ApplyVisionBlur(LastOrder.BlurSeconds);
			}
			bAppliedOnAuthority = true;
		}
	}

	OnZuResolved.Broadcast(bAccept, LastOrder.PercentageDamage, LastOrder.StunSeconds, LastOrder.BlurSeconds);
	return true;
}

int32 UKhaaosZuIngressComponent::GetHazardCount() const
{
	if (!bIngressReady)
	{
		return 0;
	}
	return KhaaosZuIngress::HazardCount(ActiveSpec.Ring, ActiveSpec.Variant);
}

bool UKhaaosZuIngressComponent::GetHazard(int32 Index, FKhaaosZuHazardView& OutView) const
{
	if (!bIngressReady)
	{
		return false;
	}
	KhaaosZuIngress::FHazard Hazard;
	if (!KhaaosZuIngress::HazardAt(ActiveSpec.Ring, ActiveSpec.Variant, Index, Hazard))
	{
		return false;
	}
	OutView.Kind = ToViewKind(Hazard.Kind);
	OutView.Label = UTF8_TO_TCHAR(Hazard.Label);
	OutView.LocalRight = Hazard.LocalRight;
	OutView.LocalForward = Hazard.LocalForward;
	OutView.Radius = Hazard.Radius;
	OutView.Rate = Hazard.Rate;
	OutView.bMaskedSafe = Hazard.bMaskedSafe;
	return true;
}

bool UKhaaosZuIngressComponent::GetLootStock(TArray<int32>& OutStock) const
{
	OutStock.Reset();
	if (!bIngressReady)
	{
		return false;
	}
	int Stock[KhaaosZuIngress::LootSlots] = {};
	if (!KhaaosZuIngress::LootStock(ActiveSpec.Ring, ActiveSpec.Variant, Stock))
	{
		return false;
	}
	OutStock.Reserve(KhaaosZuIngress::LootSlots);
	for (int Slot = 0; Slot < KhaaosZuIngress::LootSlots; ++Slot)
	{
		OutStock.Add(Stock[Slot]);
	}
	return true;
}
