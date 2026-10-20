// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Game/UI/Widgets/KhaaosKillFeedWidget.generated.h"

// ─── Kill Feed Data ────────────────────────────────────────────────────────────

/**
 * EKhaaosKillCause
 * Elimination cause for kill feed display.
 */
UENUM(BlueprintType)
enum class EKhaaosKillCause : uint8
{
	PvP       UMETA(DisplayName = "PVP"),
	Zona      UMETA(DisplayName = "ZONA"),
	Queda     UMETA(DisplayName = "QUEDA"),
	Veiculo   UMETA(DisplayName = "VEICULO"),
	ReviveFail UMETA(DisplayName = "REVIVE_FAIL")
};

/**
 * FKhaaosKillFeedEntry
 * A single kill feed entry.
 */
USTRUCT(BlueprintType)
struct FKhaaosKillFeedEntry
{
	GENERATED_BODY()

	/** Killer name. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	FString KillerName;

	/** Killer species (for icon). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	FString KillerSpecies;

	/** Victim name. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	FString VictimName;

	/** Victim species (for icon). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	FString VictimSpecies;

	/** Weapon/item used. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	FString WeaponId;

	/** Kill cause. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	EKhaaosKillCause Cause = EKhaaosKillCause::PvP;

	/** Timestamp. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	float Timestamp = 0.0f;

	/** Is this the local player's kill? */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	uint8 bIsLocalPlayerKill : 1;

	/** Is this the local player's death? */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	uint8 bIsLocalPlayerDeath : 1;
};

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_OneParam(FOnKillFeedEntryAdded, const FKhaaosKillFeedEntry&, Entry);

/**
 * UKhaaosKillFeedWidget
 *
 * Animated kill feed widget showing recent eliminations.
 * Parity with Free Fire: top-right, scrolling, species icons, weapon icons.
 *
 * Layout:
 *   ┌───────────────────────────────────┐
 *   │ [Zheers] 🔫 → [Onith]  12:34     │
 *   │ [Huran]  💥 → [Skeetw] 12:33     │
 *   │          ☠ [Venex]  12:32 (ZONA) │
 *   └───────────────────────────────────┘
 *
 * Features:
 *   - Max 5 visible entries, scrolling
 *   - Fade-out after 8 seconds
 *   - Species icon before killer/victim name
 *   - Weapon icon between killer and victim
 *   - Special formatting for zone kills, falls, vehicle kills
 *   - Local player kills highlighted in gold
 *   - Local player deaths highlighted in red
 *   - Animation: slide in from right, fade out
 */
UCLASS(Abstract, BlueprintType)
class UKhaaosKillFeedWidget : public UUserWidget
{
	GENERATED_BODY()

public:

	virtual void NativeConstruct() override;

	// ─── Feed Management ────────────────────────────────────────────────────

	/** Add a kill feed entry. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|KillFeed")
	void AddEntry(const FKhaaosKillFeedEntry& Entry);

	/** Remove old entries past display time. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|KillFeed")
	void PruneOldEntries();

	/** Clear all entries. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|UI|KillFeed")
	void ClearFeed();

	/** Get all visible entries. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|UI|KillFeed")
	const TArray<FKhaaosKillFeedEntry>& GetEntries() const { return Entries; }

	// ─── Configuration ──────────────────────────────────────────────────────

	/** Maximum visible entries. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	int32 MaxVisibleEntries;

	/** Entry display duration (seconds). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	float EntryDisplayDuration;

	/** Fade-out duration (seconds). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|UI|KillFeed")
	float FadeOutDuration;

	// ─── Delegates ──────────────────────────────────────────────────────────

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|UI|KillFeed")
	FOnKillFeedEntryAdded OnKillFeedEntryAdded;

private:

	/** Internal entries array. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, meta = (AllowPrivateAccess = "true"), Category = "Khaaos|UI|KillFeed")
	TArray<FKhaaosKillFeedEntry> Entries;
};
