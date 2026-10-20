// =============================================================================
// Khaaos Run — EP555 & Multi-World Game Hierarchy Subsystem (UE5.8 C++20)
// Devs Ph.D | UE5.8 | Copyright Nexus-HUB57. All Rights Reserved.
// =============================================================================

#include "Game/Hierarchy/KhaaosHierarchySubsystem.h"
#include "KhaaosRun.h"

void UKhaaosHierarchySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	SpecializationSpecs = {
		{ EKhaaosSpecialization::Infantaria,         FName("INFANTARIA"),          TEXT("Uuivo"),     EPatenteRank::Zheers,   25,  15.0f, 10.0f, 1.04f,  5.0f },
		{ EKhaaosSpecialization::Fuzileiros,         FName("FUZILEIROS"),          TEXT("Avalanche"), EPatenteRank::Zheers,   50,  10.0f, 15.0f, 1.02f,  5.0f },
		{ EKhaaosSpecialization::Rastreadores,       FName("RASTREADORES"),        TEXT("Ferro"),     EPatenteRank::Zheers,   50,   5.0f, 20.0f, 1.07f, 12.0f },
		{ EKhaaosSpecialization::ComunicacoesHacker, FName("COMUNICACOES_HACKER"), TEXT("Abismo"),    EPatenteRank::Zheers,   75,   0.0f, 30.0f, 1.03f, 28.0f },
		{ EKhaaosSpecialization::PilotoAeronaves,    FName("PILOTO_AERONAVES"),    TEXT("Asa"),       EPatenteRank::Onith,   100,  10.0f, 25.0f, 1.06f, 18.0f },
		{ EKhaaosSpecialization::Sniper,             FName("SNIPER"),              TEXT("Mira"),      EPatenteRank::Skeetw,  150,   5.0f, 20.0f, 1.04f, 10.0f },
		{ EKhaaosSpecialization::EngenhariaTatica,   FName("ENGENHARIA_TATICA"),   TEXT("Névoa"),     EPatenteRank::Huran,   200,  20.0f, 25.0f, 1.02f, 20.0f },
		{ EKhaaosSpecialization::ComandosSelva,      FName("COMANDOS_SELVA"),      TEXT("ComNoes"),   EPatenteRank::Venex,   250,  25.0f, 25.0f, 1.08f, 15.0f },
		{ EKhaaosSpecialization::MotoristaPesados,   FName("MOTORISTA_PESADOS"),   TEXT("Couraça"),   EPatenteRank::Venex,   300,  40.0f, 15.0f, 0.98f, 12.0f },
		{ EKhaaosSpecialization::Paraquedistas,      FName("PARAQUEDISTAS"),       TEXT("Raio"),      EPatenteRank::Khael,   500,  20.0f, 35.0f, 1.10f, 22.0f },
		{ EKhaaosSpecialization::AntiBombas,         FName("ANTI_BOMBAS"),         TEXT("Nulo"),      EPatenteRank::Malakor, 750,  50.0f, 25.0f, 1.00f, 18.0f },
		{ EKhaaosSpecialization::MedicoCombate,      FName("MEDICO_COMBATE"),      TEXT("Égide"),     EPatenteRank::Overlord,1000, 45.0f, 50.0f, 1.06f, 30.0f }
	};

	UE_LOG(LogKhaaosRun, Log, TEXT("UKhaaosHierarchySubsystem initialized with %d EP555 specializations."), SpecializationSpecs.Num());
}

void UKhaaosHierarchySubsystem::Deinitialize()
{
	SpecializationSpecs.Empty();
	Super::Deinitialize();
}

int32 UKhaaosHierarchySubsystem::GetRankXpThreshold(EPatenteRank Rank) const
{
	switch (Rank)
	{
	case EPatenteRank::Zheers:   return 0;
	case EPatenteRank::Onith:    return 15000;
	case EPatenteRank::Skeetw:   return 45000;
	case EPatenteRank::Huran:    return 100000;
	case EPatenteRank::Venex:    return 250000;
	case EPatenteRank::Khael:    return 500000;
	case EPatenteRank::Malakor:  return 1000000;
	case EPatenteRank::Overlord: return 5000000;
	default:                     return 0;
	}
}

FEp555SpecializationSpec UKhaaosHierarchySubsystem::GetSpecializationSpec(EKhaaosSpecialization Specialization) const
{
	for (const FEp555SpecializationSpec& Spec : SpecializationSpecs)
	{
		if (Spec.Specialization == Specialization)
		{
			return Spec;
		}
	}
	return FEp555SpecializationSpec();
}

bool UKhaaosHierarchySubsystem::CanUnlockSpecialization(
	EKhaaosSpecialization Specialization,
	int32 CurrentXp,
	int32 CurrentMorth) const
{
	if (Specialization == EKhaaosSpecialization::None)
	{
		return true;
	}

	const FEp555SpecializationSpec Spec = GetSpecializationSpec(Specialization);
	if (Spec.Specialization == EKhaaosSpecialization::None)
	{
		return false;
	}

	const EPatenteRank CurrentRank = AKhaaosPlayerState::RankFromXp(CurrentXp);
	const int32 CurrentRankIndex = static_cast<int32>(CurrentRank);
	const int32 RequiredRankIndex = static_cast<int32>(Spec.RequiredRank);

	return CurrentRankIndex >= RequiredRankIndex && CurrentMorth >= Spec.RequiredMorth;
}

float UKhaaosHierarchySubsystem::GetWorldAccurMultiplier(EWorldSequence World) const
{
	switch (World)
	{
	case EWorldSequence::CIGKV:     return 1.00f;
	case EWorldSequence::Barburhen: return 1.35f;
	case EWorldSequence::Priadus:   return 1.75f;
	case EWorldSequence::Ckesalth:  return 2.25f;
	case EWorldSequence::Arukheea:  return 3.00f;
	default:                        return 1.00f;
	}
}

float UKhaaosHierarchySubsystem::GetWorldKrcMultiplier(EWorldSequence World) const
{
	switch (World)
	{
	case EWorldSequence::CIGKV:     return 1.00f;
	case EWorldSequence::Barburhen: return 1.50f;
	case EWorldSequence::Priadus:   return 2.20f;
	case EWorldSequence::Ckesalth:  return 3.20f;
	case EWorldSequence::Arukheea:  return 5.00f;
	default:                        return 1.00f;
	}
}

float UKhaaosHierarchySubsystem::EvaluateZuDecisionDamagePct(
	int32 ZuVariantIndex,
	EZuActionDecision ChosenAction) const
{
	const int32 ClampedVariant = FMath::Clamp(ZuVariantIndex, 1, 3);
	const bool bCorrect =
		(ClampedVariant == 1 && ChosenAction == EZuActionDecision::ApertarCinto) ||
		(ClampedVariant == 2 && ChosenAction == EZuActionDecision::SaltarAgora) ||
		(ClampedVariant == 3 && ChosenAction == EZuActionDecision::AtivarMascaraO2);

	return bCorrect ? 0.0f : 0.30f;
}

FEp555MatchRewardResult UKhaaosHierarchySubsystem::ComputeEp555MatchReward(
	EWorldSequence World,
	int32 Placement,
	int32 TotalPlayers,
	int32 PvpKills,
	int32 ZexExtractions,
	int32 ZuVariantIndex,
	EZuActionDecision ZuChosenAction,
	int32 CurrentXp,
	int32 CurrentMorth,
	bool bGiantsChallengeTop50) const
{
	FEp555MatchRewardResult Result;

	const int32 SafeTotal = FMath::Clamp(TotalPlayers, 2, 100);
	const int32 SafePlacement = FMath::Clamp(Placement, 1, SafeTotal);
	const int32 SafeKills = FMath::Max(0, PvpKills);
	const int32 SafeZex = FMath::Max(0, ZexExtractions);

	Result.ZuInitialVitalityDamagePct = EvaluateZuDecisionDamagePct(ZuVariantIndex, ZuChosenAction);
	const int32 ZuBonusXp = FMath::IsNearlyZero(Result.ZuInitialVitalityDamagePct) ? 350 : 0;

	int32 PlacementBaseXp = 150;
	if (SafePlacement == 1)
	{
		PlacementBaseXp = 1200;
	}
	else if (SafePlacement <= 3)
	{
		PlacementBaseXp = 800;
	}
	else if (SafePlacement <= FMath::CeilToInt(SafeTotal * 0.3f))
	{
		PlacementBaseXp = 500;
	}
	else if (SafePlacement <= FMath::CeilToInt(SafeTotal * 0.5f))
	{
		PlacementBaseXp = 300;
	}

	const int32 KillsXp = SafeKills * 120;
	const int32 ZexXp = SafeZex * 450;
	const int32 GiantsXp = bGiantsChallengeTop50 ? 2500 : 0;
	const int32 RawXp = PlacementBaseXp + KillsXp + ZexXp + ZuBonusXp + GiantsXp;

	Result.AccurXpGained = FMath::RoundToInt(RawXp * GetWorldAccurMultiplier(World));
	Result.MorthGained = SafeKills;

	const float KrcMult = GetWorldKrcMultiplier(World);
	const int32 BasePlacementKrc = (SafePlacement == 1) ? 400 : (SafePlacement <= 5 ? 220 : 90);
	const int32 RawSessionKrc = FMath::RoundToInt(
		(BasePlacementKrc + SafeKills * 35 + SafeZex * 150) * KrcMult + (bGiantsChallengeTop50 ? 1000.0f : 0.0f));

	Result.RankBefore = AKhaaosPlayerState::RankFromXp(CurrentXp);
	Result.RankAfter = AKhaaosPlayerState::RankFromXp(CurrentXp + Result.AccurXpGained);
	Result.bPromoted = static_cast<int32>(Result.RankAfter) > static_cast<int32>(Result.RankBefore);
	Result.ZexTransferableKrc = (SafeZex > 0) ? FMath::RoundToInt(RawSessionKrc * 0.20f) : 0;
	Result.bVeteranTokenAwarded = bGiantsChallengeTop50 || (World == EWorldSequence::CIGKV && SafePlacement <= 50 && SafeZex > 0);

	return Result;
}
