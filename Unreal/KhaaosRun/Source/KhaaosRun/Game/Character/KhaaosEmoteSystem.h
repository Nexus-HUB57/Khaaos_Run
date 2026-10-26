// Khaaos Run — Emote System
// ===========================
// 5-category emote system with montage playback, VFX, and audio hooks.
//
// Categories:
//   EXPRESSAO  — Expressions (wave, dance, taunt)
//   ACAO       — Actions (push-up, meditate, sit)
//   INTERACAO  — Interactions (high-five, handshake, fist bump)
//   ESPECIE   — Species-specific (Huran water splash, Khael ice crack, Skeetw fog spread)
//   LENDARIO   — Legendary ultimates (Khaaos Roar, Void Walk, Plasma Burst)

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosEmoteSystem.generated.h"

// ─── Enums ──────────────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosEmoteCategory : uint8
{
  EXPRESSAO   UMETA(DisplayName = "Expressão"),
  ACAO        UMETA(DisplayName = "Ação"),
  INTERACAO   UMETA(DisplayName = "Interação"),
  ESPECIE     UMETA(DisplayName = "Espécie"),
  LENDARIO    UMETA(DisplayName = "Lendário"),
};

UENUM(BlueprintType)
enum class EKhaaosEmoteRarity : uint8
{
  COMUM      UMETA(DisplayName = "Comum"),
  INCOMUM    UMETA(DisplayName = "Incomum"),
  RARO       UMETA(DisplayName = "Raro"),
  EPICO      UMETA(DisplayName = "Épico"),
  LENDARIO   UMETA(DisplayName = "Lendário"),
};

// ─── Emote Definition ───────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FKhaaosEmoteDef
{
  GENERATED_BODY()

  /** Unique emote ID */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  FName EmoteId;

  /** Display name */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  FText DisplayName;

  /** Category */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  EKhaaosEmoteCategory Category = EKhaaosEmoteCategory::EXPRESSAO;

  /** Rarity */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  EKhaaosEmoteRarity Rarity = EKhaaosEmoteRarity::COMUM;

  /** Animation montage to play */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  TSoftObjectPtr<UAnimMontage> Montage;

  /** Duration in seconds (0 = use montage length) */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  float Duration = 0.f;

  /** VFX to spawn during emote (EPICO+) */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  TSoftObjectPtr<UNiagaraSystem> VFX;

  /** Sound to play during emote */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  TSoftObjectPtr<USoundBase> Sound;

  /** Whether this emote can be interrupted by combat */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  bool bInterruptibleByCombat = true;

  /** Whether this emote is a loop (dance, sit, etc.) */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  bool bIsLooping = false;

  /** Whether this emote can be seen by other players (replicated) */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  bool bVisibleToOthers = true;

  /** KRC price in shop */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
  int32 PriceKRC = 0;

  /** Owned */
  UPROPERTY(BlueprintReadOnly)
  bool bOwned = false;
};

// ─── Emote System Component ─────────────────────────────────────────────────

UCLASS(ClassGroup=(Khaaos, Cosmetics), meta=(BlueprintSpawnableComponent))
class UKhaaosEmoteSystem : public UActorComponent
{
  GENERATED_BODY()

public:
  UKhaaosEmoteSystem();

  // ─── Emote Registry ─────────────────────────────────────────────────────

  /** Register an emote definition */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  void RegisterEmote(const FKhaaosEmoteDef& Def);

  /** Get all emotes in a category */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  TArray<FKhaaosEmoteDef> GetEmotesByCategory(EKhaaosEmoteCategory Category) const;

  /** Get emotes for emote wheel (8 slots: 2 per visible category) */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  TArray<FKhaaosEmoteDef> GetEmoteWheelEmotes() const;

  // ─── Playback ───────────────────────────────────────────────────────────

  /** Play an emote by ID */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  bool PlayEmote(FName EmoteId);

  /** Stop current emote */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  void StopEmote();

  /** Check if currently playing an emote */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  bool IsPlayingEmote() const { return bIsPlayingEmote; }

  /** Get current emote ID */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  FName GetCurrentEmoteId() const { return CurrentEmoteId; }

  /** Get elapsed time of current emote */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  float GetEmoteElapsedTime() const;

  // ─── Emote Wheel UI ─────────────────────────────────────────────────────

  /** Bind an emote to a wheel slot (0-7) */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  void BindEmoteToWheelSlot(int32 SlotIndex, FName EmoteId);

  /** Get emote bound to a wheel slot */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  FName GetWheelSlotEmote(int32 SlotIndex) const;

  /** Play emote from wheel slot */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  bool PlayWheelSlotEmote(int32 SlotIndex);

  // ─── Shop Integration ───────────────────────────────────────────────────

  /** Grant ownership of an emote */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  void GrantEmoteOwnership(FName EmoteId);

  /** Check if owned */
  UFUNCTION(BlueprintCallable, Category = "Khaaos|Emotes")
  bool IsEmoteOwned(FName EmoteId) const;

  // ─── Events ─────────────────────────────────────────────────────────────

  /** Broadcast when an emote starts */
  UPROPERTY(BlueprintAssignable, Category = "Khaaos|Emotes")
  FOnEmoteStarted OnEmoteStarted;

  /** Broadcast when an emote ends */
  UPROPERTY(BlueprintAssignable, Category = "Khaaos|Emotes")
  FOnEmoteEnded OnEmoteEnded;

private:
  /** All registered emotes */
  UPROPERTY()
  TMap<FName, FKhaaosEmoteDef> EmoteRegistry;

  /** Owned emote IDs */
  UPROPERTY()
  TSet<FName> OwnedEmotes;

  /** Emote wheel bindings (8 slots) */
  UPROPERTY()
  TArray<FName> WheelBindings;

  /** Currently playing emote */
  UPROPERTY()
  FName CurrentEmoteId = NAME_None;

  /** Whether an emote is currently playing */
  UPROPERTY()
  bool bIsPlayingEmote = false;

  /** Emote start time */
  UPROPERTY()
  float EmoteStartTime = 0.f;

  /** Active VFX component */
  UPROPERTY()
  UNiagaraComponent* ActiveEmoteVFX = nullptr;

  /** Active audio component */
  UPROPERTY()
  UAudioComponent* ActiveEmoteAudio = nullptr;

  /** Cached anim instance */
  UPROPERTY()
  UAnimInstance* AnimInstance = nullptr;

  // ─── Internal ───────────────────────────────────────────────────────────

  /** Resolve animation instance from owning mesh */
  UAnimInstance* ResolveAnimInstance();

  /** Spawn emote VFX */
  void SpawnEmoteVFX(const FKhaaosEmoteDef& Def);

  /** Play emote audio */
  void PlayEmoteAudio(const FKhaaosEmoteDef& Def);

  /** Clean up active emote */
  void CleanupActiveEmote();
};

// ─── Delegate Declarations ──────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnEmoteStarted, FName, EmoteId, EKhaaosEmoteCategory, Category);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnEmoteEnded, FName, EmoteId);
