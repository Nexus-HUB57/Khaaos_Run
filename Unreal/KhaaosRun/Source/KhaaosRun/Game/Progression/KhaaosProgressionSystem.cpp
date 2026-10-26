// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Progression/KhaaosProgressionSystem.h"
#include "KhaaosRun.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosProgressionSystem::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        CurrentTier = 0;
        CurrentXP = 0;
        XpPerTier = 500;  // 500 XP per tier
        MaxTier = 100;     // 100 tiers per season
        bHasPremium = false;
        CurrentSeasonId = TEXT("S1");

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProgressionSystem: Initialized (season=%s, xpPerTier=%d)"),
                *CurrentSeasonId, XpPerTier);
}

void UKhaaosProgressionSystem::Deinitialize()
{
        Achievements.Empty();
        DailyQuests.Empty();
        AchievementIndexMap.Empty();
        Super::Deinitialize();
}

// ─── Battle Pass ────────────────────────────────────────────────────────────────

void UKhaaosProgressionSystem::GrantXP(const FString& PlayerEosId, int32 Amount, const FString& Source)
{
        if (Amount <= 0) return;

        CurrentXP += Amount;
        CheckTierUp();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProgressionSystem::GrantXP - +%d XP from %s (total: %d, tier: %d)"),
                Amount, *Source, CurrentXP, CurrentTier);
}

void UKhaaosProgressionSystem::CheckTierUp()
{
        const int32 NewTier = FMath::Min(CurrentXP / XpPerTier, MaxTier);

        if (NewTier > CurrentTier)
        {
                // Tier up! Grant rewards for each tier gained
                for (int32 Tier = CurrentTier + 1; Tier <= NewTier; ++Tier)
                {
                        OnBattlePassTierUp.Broadcast(Tier, bHasPremium);
                        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProgressionSystem: Tier up! → Tier %d"), Tier);
                }

                CurrentTier = NewTier;
        }
}

// ─── Achievements ───────────────────────────────────────────────────────────────

void UKhaaosProgressionSystem::UpdateAchievement(const FString& AchievementId, int32 Increment)
{
        int32* Index = AchievementIndexMap.Find(AchievementId);
        if (!Index)
        {
                // Achievement not found, create a tracking entry
                FKhaaosAchievement NewAchievement;
                NewAchievement.Id = AchievementId;
                NewAchievement.bCompleted = false;
                Achievements.Add(NewAchievement);
                AchievementIndexMap.Add(AchievementId, Achievements.Num() - 1);
                Index = AchievementIndexMap.Find(AchievementId);
        }

        FKhaaosAchievement& Achievement = Achievements[*Index];
        if (Achievement.bCompleted) return;

        Achievement.Progress = FMath::Min(Achievement.Progress + Increment, Achievement.Target);

        if (Achievement.Progress >= Achievement.Target)
        {
                Achievement.bCompleted = true;
                OnAchievementCompleted.Broadcast(AchievementId, Achievement.KrcReward);

                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProgressionSystem: Achievement completed! %s (+%d KRC)"),
                        *AchievementId, Achievement.KrcReward);
        }
}

int32 UKhaaosProgressionSystem::GetCompletedAchievementCount() const
{
        int32 Count = 0;
        for (const FKhaaosAchievement& A : Achievements)
        {
                if (A.bCompleted) ++Count;
        }
        return Count;
}

// ─── Daily Quests ───────────────────────────────────────────────────────────────

void UKhaaosProgressionSystem::RefreshDailyQuests()
{
        DailyQuests.Empty();

        // Generate 3 random daily quests
        const TArray<FString> QuestTemplates = {
                TEXT("Elimine %d oponentes"), TEXT("Sobreviva %d minutos"),
                TEXT("Colete %d itens de loot"), TEXT("Cause %d de dano total"),
                TEXT("Use %d veículos"), TEXT("Revive %d aliados")
        };

        for (int32 i = 0; i < 3; ++i)
        {
                FKhaaosDailyQuest Quest;
                Quest.Id = FString::Printf(TEXT("daily_%d_%d"), FMath::RandRange(1000, 9999), i);
                const int32 TemplateIdx = FMath::RandRange(0, QuestTemplates.Num() - 1);
                const int32 TargetVal = FMath::RandRange(3, 10);
                Quest.Description = FString::Printf(*QuestTemplates[TemplateIdx], TargetVal);
                Quest.Target = TargetVal;
                Quest.Progress = 0;
                Quest.XpReward = FMath::RandRange(500, 2000);
                Quest.KrcReward = FMath::RandRange(10, 50);
                Quest.bCompleted = false;
                Quest.bClaimed = false;
                DailyQuests.Add(Quest);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProgressionSystem::RefreshDailyQuests - %d quests generated"), DailyQuests.Num());
}

void UKhaaosProgressionSystem::UpdateQuestProgress(const FString& QuestType, int32 Increment)
{
        for (FKhaaosDailyQuest& Quest : DailyQuests)
        {
                if (Quest.bCompleted || Quest.bClaimed) continue;

                Quest.Progress = FMath::Min(Quest.Progress + Increment, Quest.Target);

                if (Quest.Progress >= Quest.Target)
                {
                        Quest.bCompleted = true;
                        OnQuestCompleted.Broadcast(Quest.Id);

                        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProgressionSystem: Quest completed! %s"), *Quest.Id);
                }
        }
}

void UKhaaosProgressionSystem::ClaimQuestReward(const FString& QuestId)
{
        for (FKhaaosDailyQuest& Quest : DailyQuests)
        {
                if (Quest.Id == QuestId && Quest.bCompleted && !Quest.bClaimed)
                {
                        Quest.bClaimed = true;

                        // Grant XP reward
                        GrantXP(TEXT(""), Quest.XpReward, TEXT("QuestReward"));

                        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosProgressionSystem: Quest claimed! %s (+%d XP, +%d KRC)"),
                                *QuestId, Quest.XpReward, Quest.KrcReward);
                        return;
                }
        }
}
