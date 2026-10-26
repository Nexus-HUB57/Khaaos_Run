// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Game/Progression/KhaaosProgressionSystem.generated.h"

// ─── Progression Types ──────────────────────────────────────────────────────────

/**
 * EKhaaosRarity
 * Rarity used for battle pass rewards and achievements.
 */
UENUM(BlueprintType)
enum class EKhaaosProgressionRarity : uint8
{
        Comum    UMETA(DisplayName = "COMUM"),
        Raro     UMETA(DisplayName = "RARO"),
        Epico    UMETA(DisplayName = "EPICO"),
        Lendario UMETA(DisplayName = "LENDARIO"),
        Mitico   UMETA(DisplayName = "MITICO")
};

/**
 * FKhaaosBattlePassTier
 * A single tier in the battle pass with its rewards.
 */
USTRUCT(BlueprintType)
struct FKhaaosBattlePassTier
{
        GENERATED_BODY()

        /** Tier number (1-100). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|BP")
        int32 TierNumber = 0;

        /** XP required to unlock (cumulative). */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|BP")
        int32 XpRequired = 0;

        /** Free track reward item ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|BP")
        FString FreeRewardId;

        /** Free reward rarity. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|BP")
        EKhaaosProgressionRarity FreeRarity = EKhaaosProgressionRarity::Comum;

        /** Premium track reward item ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|BP")
        FString PremiumRewardId;

        /** Premium reward rarity. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|BP")
        EKhaaosProgressionRarity PremiumRarity = EKhaaosProgressionRarity::Raro;

        /** KRC reward for this tier. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|BP")
        int32 KrcReward = 0;
};

/**
 * FKhaaosAchievement
 * Achievement definition and progress.
 */
USTRUCT(BlueprintType)
struct FKhaaosAchievement
{
        GENERATED_BODY()

        /** Achievement ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Achievement")
        FString Id;

        /** Display name. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Achievement")
        FString Name;

        /** Description. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Achievement")
        FString Description;

        /** Category. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Achievement")
        FString Category;

        /** Current progress. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Achievement")
        int32 Progress = 0;

        /** Target value to complete. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Achievement")
        int32 Target = 1;

        /** KRC reward on completion. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Achievement")
        int32 KrcReward = 0;

        /** Rarity. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Achievement")
        EKhaaosProgressionRarity Rarity = EKhaaosProgressionRarity::Comum;

        /** Is completed? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Achievement")
        uint8 bCompleted : 1;
};

/**
 * FKhaaosDailyQuest
 * Daily quest with objective tracking.
 */
USTRUCT(BlueprintType)
struct FKhaaosDailyQuest
{
        GENERATED_BODY()

        /** Quest ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Quest")
        FString Id;

        /** Description. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Quest")
        FString Description;

        /** Current progress. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Quest")
        int32 Progress = 0;

        /** Target value. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Quest")
        int32 Target = 1;

        /** XP reward. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Quest")
        int32 XpReward = 1000;

        /** KRC reward. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Quest")
        int32 KrcReward = 0;

        /** Is completed? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Quest")
        uint8 bCompleted : 1;

        /** Is claimed? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|Quest")
        uint8 bClaimed : 1;
};

// ─── Delegates ──────────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnBattlePassTierUp, int32, NewTier, bool, bIsPremium);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnAchievementCompleted, const FString&, AchievementId, int32, KrcReward);
DECLARE_DYNAMIC_DELEGATE_OneParam(FOnQuestCompleted, const FString&, QuestId);

/**
 * UKhaaosProgressionSystem
 *
 * Player progression: Battle Pass, Achievements, Daily Quests.
 *
 * Battle Pass:
 *   - 100 tiers per season (8-week season)
 *   - Free track + Premium track (KRC purchase)
 *   - XP from: matches, kills, survival time, quests, events
 *   - 10 KRC per 5 tiers (free track), premium has exclusive rewards
 *
 * Achievements:
 *   - 50+ achievements across 6 categories
 *   - Categories: Combat, Survival, Social, Collection, Economy, World
 *   - One-time KRC rewards on completion
 *   - Achievement points displayed on profile
 *
 * Daily Quests:
 *   - 3 quests per day, refresh at midnight UTC
 *   - Objectives: kills with weapon, survive X minutes, loot items, etc
 *   - XP + KRC rewards
 *   - Weekly quest: harder, bigger rewards
 *
 * Free Fire Parity:
 *   - Battle pass with elite track purchase
 *   - Daily login rewards
 *   - Achievement badge display
 *   - Quest refresh system
 */
UCLASS(BlueprintType)
class UKhaaosProgressionSystem : public UGameInstanceSubsystem
{
        GENERATED_BODY()

public:

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        // ─── Battle Pass ──────────────────────────────────────────────────────

        /** Grant XP to player. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Progression|BP")
        void GrantXP(const FString& PlayerEosId, int32 Amount, const FString& Source);

        /** Get current tier. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Progression|BP")
        int32 GetCurrentTier() const { return CurrentTier; }

        /** Get current XP. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Progression|BP")
        int32 GetCurrentXP() const { return CurrentXP; }

        /** Does player have premium? */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|BP")
        uint8 bHasPremium : 1;

        /** Current season ID. */
        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Progression|BP")
        FString CurrentSeasonId;

        // ─── Achievements ─────────────────────────────────────────────────────

        /** Update achievement progress. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Progression|Achievement")
        void UpdateAchievement(const FString& AchievementId, int32 Increment = 1);

        /** Get all achievements. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Progression|Achievement")
        const TArray<FKhaaosAchievement>& GetAchievements() const { return Achievements; }

        /** Get completed achievement count. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Progression|Achievement")
        int32 GetCompletedAchievementCount() const;

        // ─── Daily Quests ─────────────────────────────────────────────────────

        /** Refresh daily quests (called at midnight UTC). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Progression|Quest")
        void RefreshDailyQuests();

        /** Update quest progress. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Progression|Quest")
        void UpdateQuestProgress(const FString& QuestType, int32 Increment = 1);

        /** Claim completed quest reward. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Progression|Quest")
        void ClaimQuestReward(const FString& QuestId);

        /** Get active daily quests. */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Progression|Quest")
        const TArray<FKhaaosDailyQuest>& GetDailyQuests() const { return DailyQuests; }

        // ─── Delegates ────────────────────────────────────────────────────────

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Progression")
        FOnBattlePassTierUp OnBattlePassTierUp;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Progression")
        FOnAchievementCompleted OnAchievementCompleted;

        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Progression")
        FOnQuestCompleted OnQuestCompleted;

private:

        /** Current tier. */
        int32 CurrentTier;

        /** Current XP (cumulative). */
        int32 CurrentXP;

        /** XP per tier. */
        int32 XpPerTier;

        /** Max tier. */
        int32 MaxTier;

        /** Achievements. */
        TArray<FKhaaosAchievement> Achievements;

        /** Daily quests. */
        TArray<FKhaaosDailyQuest> DailyQuests;

        /** Achievement ID → index map for fast lookup. */
        TMap<FString, int32> AchievementIndexMap;

        /** Check and advance battle pass tiers. */
        void CheckTierUp();
};
