// =============================================================================
// Khaaos Run — EP555 & Multi-World Game Hierarchy Subsystem (UE5.8 C++20)
// Devs Ph.D | UE5.8 | Copyright Nexus-HUB57. All Rights Reserved.
// =============================================================================
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Player/KhaaosPlayerState.h"
#include "Game/KhaaosGameMode.h"
#include "KhaaosHierarchySubsystem.generated.h"

/**
 * EKhaaosSpecialization
 * Mirrors the 12 canonical EP555 specializations from shared/schema.ts and shared/game-hierarchy.ts.
 */
UENUM(BlueprintType)
enum class EKhaaosSpecialization : uint8
{
	None                UMETA(DisplayName = "NENHUMA"),
	Infantaria          UMETA(DisplayName = "INFANTARIA (Uuivo)"),
	Fuzileiros          UMETA(DisplayName = "FUZILEIROS (Avalanche)"),
	Rastreadores        UMETA(DisplayName = "RASTREADORES (Ferro)"),
	ComunicacoesHacker  UMETA(DisplayName = "COMUNICACOES_HACKER (Abismo)"),
	PilotoAeronaves     UMETA(DisplayName = "PILOTO_AERONAVES (Asa)"),
	Sniper              UMETA(DisplayName = "SNIPER (Mira)"),
	EngenhariaTatica    UMETA(DisplayName = "ENGENHARIA_TATICA (Névoa)"),
	ComandosSelva       UMETA(DisplayName = "COMANDOS_SELVA (ComNoes)"),
	MotoristaPesados    UMETA(DisplayName = "MOTORISTA_PESADOS (Couraça)"),
	Paraquedistas       UMETA(DisplayName = "PARAQUEDISTAS (Raio)"),
	AntiBombas          UMETA(DisplayName = "ANTI_BOMBAS (Nulo)"),
	MedicoCombate       UMETA(DisplayName = "MEDICO_COMBATE (Égide)")
};

/**
 * EZuActionDecision
 * Canonical Zu 1 / Zu 2 / Zu 3 decision actions across all 5 rings.
 */
UENUM(BlueprintType)
enum class EZuActionDecision : uint8
{
	ApertarCinto     UMETA(DisplayName = "APERTAR_CINTO"),
	SaltarAgora      UMETA(DisplayName = "SALTAR_AGORA"),
	AtivarMascaraO2  UMETA(DisplayName = "ATIVAR_MASCARA_O2")
};

/**
 * FEp555SpecializationSpec
 * Authoritative UE5 struct for each EP555 combat certification.
 */
USTRUCT(BlueprintType)
struct KHAAOSRUN_API FEp555SpecializationSpec
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	EKhaaosSpecialization Specialization = EKhaaosSpecialization::None;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	FName CodeId = NAME_None;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	FString Callsign;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	EPatenteRank RequiredRank = EPatenteRank::Zheers;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	int32 RequiredMorth = 25;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	float MaxHealthBonus = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	float MaxEnergyBonus = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	float SpeedMultiplier = 1.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	float ZexExtractionBonusPct = 0.0f;
};

/**
 * FEp555MatchRewardResult
 * Result of computing an end-to-end EP555 Ring match evaluation on the UE5 server.
 */
USTRUCT(BlueprintType)
struct KHAAOSRUN_API FEp555MatchRewardResult
{
	GENERATED_BODY()

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	int32 AccurXpGained = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	int32 MorthGained = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	int32 ZexTransferableKrc = 0;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	float ZuInitialVitalityDamagePct = 0.0f;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	EPatenteRank RankBefore = EPatenteRank::Zheers;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	EPatenteRank RankAfter = EPatenteRank::Zheers;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	bool bPromoted = false;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Hierarchy")
	bool bVeteranTokenAwarded = false;
};

/**
 * UKhaaosHierarchySubsystem
 *
 * GameInstanceSubsystem implementing the 5-Axis Khaaos Run Game Hierarchy in UE5.8 C++20:
 *   1. EP555 Command Ladder (Zheers -> Overlord)
 *   2. 12 Combat Specializations (Morth + Rank gated)
 *   3. World & Ring Ontology DAG (CIGKV -> Barburhen -> Priadus -> Ckesalth -> Arukheea)
 *   4. Zu 1 / Zu 2 / Zu 3 Cinematic Ingress Validation
 *   5. ZEX 20% Selective Persistence & Veteran Token Evaluation
 */
UCLASS(Config = Game, defaultconfig, meta = (DisplayName = "Khaaos Hierarchy Subsystem"))
class KHAAOSRUN_API UKhaaosHierarchySubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Returns the XP threshold for a given EP555 rank. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Hierarchy")
	int32 GetRankXpThreshold(EPatenteRank Rank) const;

	/** Checks whether an operative with (CurrentXp, CurrentMorth) can unlock a specialization. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Hierarchy")
	bool CanUnlockSpecialization(EKhaaosSpecialization Specialization, int32 CurrentXp, int32 CurrentMorth) const;

	/** Returns the full specification of one of the 12 EP555 specializations. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Hierarchy")
	FEp555SpecializationSpec GetSpecializationSpec(EKhaaosSpecialization Specialization) const;

	/** Returns the canonical Accur XP multiplier for a given World in the DAG. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Hierarchy")
	float GetWorldAccurMultiplier(EWorldSequence World) const;

	/** Returns the canonical KRC reward multiplier for a given World in the DAG. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Hierarchy")
	float GetWorldKrcMultiplier(EWorldSequence World) const;

	/** Evaluates a Zu 1/2/3 decision and returns 0.0f on correct action or 0.30f (30% vitality damage) on failure. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Hierarchy")
	float EvaluateZuDecisionDamagePct(int32 ZuVariantIndex, EZuActionDecision ChosenAction) const;

	/** Computes end-to-end EP555 Accur XP, Morth, ZEX 20% KRC transfer, and rank promotion. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Hierarchy")
	FEp555MatchRewardResult ComputeEp555MatchReward(
		EWorldSequence World,
		int32 Placement,
		int32 TotalPlayers,
		int32 PvpKills,
		int32 ZexExtractions,
		int32 ZuVariantIndex,
		EZuActionDecision ZuChosenAction,
		int32 CurrentXp,
		int32 CurrentMorth,
		bool bGiantsChallengeTop50) const;

private:
	TArray<FEp555SpecializationSpec> SpecializationSpecs;
};
