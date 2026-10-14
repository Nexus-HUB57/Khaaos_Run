// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerState.h"
#include "AbilitySystemInterface.h"
#include "GameplayCueInterface.h"
#include "KhaaosPlayerState.generated.h"

class UAbilitySystemComponent;
class UKhaaosAttributeSet;

// ─── Enums ported from schema.ts ──────────────────────────────────────────────

/** Player status (from schema.ts PlayerStatus: VIVO/ELIMINADO/ESPECTADOR). */
UENUM(BlueprintType)
enum class EPlayerStatus : uint8
{
	Vivo        UMETA(DisplayName = "VIVO"),
	Eliminado   UMETA(DisplayName = "ELIMINADO"),
	Espectador  UMETA(DisplayName = "ESPECTADOR")
};

/** Patente rank tiers (from schema.ts PatenteKR). */
UENUM(BlueprintType)
enum class EPatenteRank : uint8
{
	Zheers    UMETA(DisplayName = "ZHEERS"),
	Onith     UMETA(DisplayName = "ONITH"),
	Skeetw    UMETA(DisplayName = "SKEETW"),
	Huran     UMETA(DisplayName = "HURAN"),
	Venex     UMETA(DisplayName = "VENEX"),
	Khael     UMETA(DisplayName = "KHAEL"),
	Malakor   UMETA(DisplayName = "MALAKOR"),
	Overlord  UMETA(DisplayName = "OVERLORD")
};

/** Elimination cause (from schema.ts eliminations table: ZONA|PVP|QUEDA). */
UENUM(BlueprintType)
enum class EEliminationCause : uint8
{
	Zona  UMETA(DisplayName = "ZONA"),
	PvP   UMETA(DisplayName = "PVP"),
	Queda UMETA(DisplayName = "QUEDA")
};

/**
 * AKhaaosPlayerState
 *
 * Replicated player state ported from TS RoomPlayer + playerStats schema.
 *
 * Attributes (Health, MaxHealth, Credits) follow the AttributeSet pattern
 * from ActionRoguelike. Combat stats and ELO rating are replicated for
 * scoreboard and matchmaking.
 */
UCLASS(Abstract)
class AKhaaosPlayerState : public APlayerState, public IAbilitySystemInterface, public IGameplayCueInterface
{
	GENERATED_BODY()

public:
	AKhaaosPlayerState();
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	virtual UAbilitySystemComponent* GetAbilitySystemComponent() const override;
	virtual void HandleGameplayCue(AActor* Self, FGameplayTag GameplayCueTag, EGameplayCueEvent::Type EventType, const FGameplayCueParameters& Parameters) override;

	/** GAS owner for persistent player attributes/effects. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Abilities")
	TObjectPtr<UAbilitySystemComponent> AbilitySystemComponent;

	/** GAS AttributeSet; Health/MaxHealth are the authoritative values. */
	UPROPERTY()
	TObjectPtr<UKhaaosAttributeSet> KhaaosAttributeSet;

	// ─── Core Attributes (from TS AttributeSet / playerStats) ──────────────

	/** Compatibility mirror of the replicated GAS Health attribute. */
	UPROPERTY(Transient, BlueprintReadOnly, Category = "Khaaos|Attributes")
	float Health;

	/** Compatibility mirror of the replicated GAS MaxHealth attribute. */
	UPROPERTY(Transient, BlueprintReadOnly, Category = "Khaaos|Attributes")
	float MaxHealth;

	/** Currency credits (KRC). */
	UPROPERTY(ReplicatedUsing = OnRep_Credits, BlueprintReadOnly, Category = "Khaaos|Attributes")
	int32 Credits;

	/** Movement speed multiplier. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Attributes")
	float Speed;

	/** Current energy (for abilities). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Attributes")
	float Energy;

	/** Maximum energy. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Attributes")
	float MaxEnergy;

	// ─── Player Status ─────────────────────────────────────────────────────

	/** Alive / Eliminated / Spectator. */
	UPROPERTY(ReplicatedUsing = OnRep_PlayerStatus, BlueprintReadOnly, Category = "Khaaos|Status")
	EPlayerStatus PlayerStatus;

	/** Patente rank (from schema.ts PatenteKR). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Rank")
	EPatenteRank Patente;

	/** XP accumulated. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Rank")
	int32 XP;

	/** ELO-like competitive rating (default 1000). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Rank")
	int32 Rating;

	// ─── Combat Stats (from TS RoomPlayer + matchResults) ──────────────────

	/** Kill count this match. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Combat")
	int32 Kills;

	/** Total damage dealt this match. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Combat")
	float DamageDealt;

	/** Time survived in match (seconds). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Combat")
	float SurvivedTime;

	/** Cause of elimination (if eliminated). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Combat")
	EEliminationCause EliminationCause;

	/** ID of the player who eliminated this player (empty if zone/queda). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Combat")
	FString EliminatorId;

	/** Position on the normalized map (0-100 range, from TS RoomPlayer). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Position")
	FVector2D MapPosition;

	// ─── Lobby State ───────────────────────────────────────────────────────

	/** Player is ready for countdown. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Lobby")
	uint8 bIsReady : 1;

	/** Player is the host of the lobby. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Lobby")
	uint8 bIsHost : 1;

	/** Player is currently connected. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Lobby")
	uint8 bIsConnected : 1;

	// ─── Persistent Stats (from playerStats table) ────────────────────────

	/** Total matches played (lifetime). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Persistent")
	int32 MatchesPlayed;

	/** Total wins (lifetime). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Persistent")
	int32 Wins;

	/** Total top-5 finishes. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Persistent")
	int32 Top5;

	/** Season kills. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Persistent")
	int32 SeasonKills;

	/** Total deaths (lifetime). */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Khaaos|Persistent")
	int32 Deaths;

	// ─── RepNotify Callbacks ────────────────────────────────────────────────

	UFUNCTION()
	void OnRep_Credits();

	UFUNCTION()
	void OnRep_PlayerStatus();

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when health changes (for UI health bar). */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnHealthChanged, float, NewHealth, float, Delta);
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Attributes")
	FOnHealthChanged OnHealthChanged;

	/** Broadcast when credits change. */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnCreditsChanged, int32, NewCredits, int32, Delta);
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Attributes")
	FOnCreditsChanged OnCreditsChanged;

	/** Broadcast when player status changes (elimination, spectating). */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnPlayerStatusChanged, EPlayerStatus, OldStatus, EPlayerStatus, NewStatus);
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Status")
	FOnPlayerStatusChanged OnPlayerStatusChanged;

	// ─── Server Authority Methods ───────────────────────────────────────────

	/** Apply damage (server only). Returns actual damage applied. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	float ApplyDamage(float DamageAmount, APlayerState* Instigator);

	/** Apply one instant SafeZone hit and preserve SafeZone as EffectCauser. */
	float ApplyZoneDamage(float DamageAmount, AActor* EffectCauser);

	/** Heal (server only). Returns actual healing applied. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	float Heal(float HealAmount);

	/** Grant credits (server only). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Attributes")
	void GrantCredits(int32 Amount);

	/** Set player status (server only). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Status")
	void SetPlayerStatus(EPlayerStatus NewStatus);

	/** Compute patente rank from XP (port of schema.ts rankFromXp). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Rank")
	static EPatenteRank RankFromXp(int32 Xp);

	/** Get patente rank name as string. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Rank")
	static FString PatenteToString(EPatenteRank Rank);

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

private:
	UFUNCTION()
	void HandleAttributeChanged(UKhaaosAttributeSet* AttributeSet, const FString& AttributeName, float NewValue);

	void HandleOutOfHealth(AActor* OwnerActor, AActor* AvatarActor, AActor* EffectCauser);

	FDelegateHandle OutOfHealthDelegateHandle;

	// ─── XP Thresholds (from schema.ts RANK_XP_THRESHOLDS) ─────────────────

	static const TMap<EPatenteRank, int32> RankXpThresholds;
};
