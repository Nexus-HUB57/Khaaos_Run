// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Save/KhaaosSaveGame.h"
#include "KhaaosRun.h"

#include "Kismet/GameplayStatics.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"
#include "JsonUtilities.h"
#include "Misc/DateTime.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosSaveGame::UKhaaosSaveGame()
{
        // ── Default player stats ──
        PlayerStats.UserId         = TEXT("");
        PlayerStats.Patente        = EPatenteRank::Zheers;
        PlayerStats.XP             = 0;
        PlayerStats.Rating         = 1000;
        PlayerStats.MatchesPlayed  = 0;
        PlayerStats.Wins           = 0;
        PlayerStats.Top5           = 0;
        PlayerStats.TotalKills     = 0;
        PlayerStats.TotalDeaths    = 0;
        PlayerStats.SeasonKills    = 0;
        PlayerStats.WeaponsBalance = 0;
        PlayerStats.BonusBalance   = 0;
        PlayerStats.FbmBalance     = 0;

        // ── Settings ──
        MaxMatchHistory    = 20;
        PreferredQueueMode = TEXT("solo");
        PreferredRegion    = TEXT("us-east");

        // ── Save slot ──
        SaveSlotName   = TEXT("KhaaosSave");
        SaveSlotIndex  = 0;
        LastSaveTimestamp = TEXT("");

        // ── Economy ──
        LastSalaryDate = TEXT("");
}

// ─── Save/Load Interface ────────────────────────────────────────────────────────

bool UKhaaosSaveGame::SaveToSlot(const FString& SlotName, int32 UserIndex)
{
        // Update timestamp
        LastSaveTimestamp = FDateTime::Now().ToString();

        // Save to slot
        UGameplayStatics::SaveGameToSlot(this, SlotName, UserIndex);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSaveGame::SaveToSlot - Saved to %s (index %d)"), *SlotName, UserIndex);

        return true;
}

UKhaaosSaveGame* UKhaaosSaveGame::LoadFromSlot(const FString& SlotName, int32 UserIndex)
{
        if (!UGameplayStatics::DoesSaveGameExist(SlotName, UserIndex))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosSaveGame::LoadFromSlot - Slot %s does not exist"), *SlotName);
                return nullptr;
        }

        USaveGame* LoadedSave = UGameplayStatics::LoadGameFromSlot(SlotName, UserIndex);
        if (!LoadedSave)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosSaveGame::LoadFromSlot - Failed to load slot %s"), *SlotName);
                return nullptr;
        }

        UKhaaosSaveGame* KhaaosSave = Cast<UKhaaosSaveGame>(LoadedSave);
        if (!KhaaosSave)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosSaveGame::LoadFromSlot - Loaded save is not UKhaaosSaveGame"));
                return nullptr;
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSaveGame::LoadFromSlot - Loaded from %s"), *SlotName);
        return KhaaosSave;
}

bool UKhaaosSaveGame::DoesSaveExist(const FString& SlotName, int32 UserIndex)
{
        return UGameplayStatics::DoesSaveGameExist(SlotName, UserIndex);
}

bool UKhaaosSaveGame::DeleteSaveSlot(const FString& SlotName, int32 UserIndex)
{
        if (!UGameplayStatics::DoesSaveGameExist(SlotName, UserIndex))
        {
                return false;
        }

        UGameplayStatics::DeleteGameInSlot(SlotName, UserIndex);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosSaveGame::DeleteSaveSlot - Deleted %s"), *SlotName);
        return true;
}

// ─── JSON Serialization ─────────────────────────────────────────────────────────

FString UKhaaosSaveGame::ToJson() const
{
        TSharedPtr<FJsonObject> RootObj = MakeShared<FJsonObject>();

        // Player stats
        TSharedPtr<FJsonObject> StatsObj = MakeShared<FJsonObject>();
        StatsObj->SetStringField(TEXT("userId"), PlayerStats.UserId);
        StatsObj->SetNumberField(TEXT("xp"), PlayerStats.XP);
        StatsObj->SetNumberField(TEXT("rating"), PlayerStats.Rating);
        StatsObj->SetNumberField(TEXT("matchesPlayed"), PlayerStats.MatchesPlayed);
        StatsObj->SetNumberField(TEXT("wins"), PlayerStats.Wins);
        StatsObj->SetNumberField(TEXT("top5"), PlayerStats.Top5);
        StatsObj->SetNumberField(TEXT("totalKills"), PlayerStats.TotalKills);
        StatsObj->SetNumberField(TEXT("totalDeaths"), PlayerStats.TotalDeaths);
        StatsObj->SetNumberField(TEXT("seasonKills"), PlayerStats.SeasonKills);
        StatsObj->SetNumberField(TEXT("weaponsBalance"), PlayerStats.WeaponsBalance);
        StatsObj->SetNumberField(TEXT("bonusBalance"), PlayerStats.BonusBalance);
        StatsObj->SetNumberField(TEXT("fbmBalance"), PlayerStats.FbmBalance);
        RootObj->SetObjectField(TEXT("playerStats"), StatsObj);

        // Settings
        RootObj->SetStringField(TEXT("preferredQueueMode"), PreferredQueueMode);
        RootObj->SetStringField(TEXT("preferredRegion"), PreferredRegion);
        RootObj->SetStringField(TEXT("settingsJson"), SettingsJson);

        // Timestamps
        RootObj->SetStringField(TEXT("lastSaveTimestamp"), LastSaveTimestamp);
        RootObj->SetStringField(TEXT("lastSalaryDate"), LastSalaryDate);

        FString Output;
        TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
        FJsonSerializer::Serialize(RootObj.ToSharedRef(), Writer);

        return Output;
}

bool UKhaaosSaveGame::FromJson(const FString& JsonString)
{
        TSharedPtr<FJsonObject> RootObj;
        TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);

        if (!FJsonSerializer::Deserialize(Reader, RootObj) || !RootObj.IsValid())
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosSaveGame::FromJson - Failed to deserialize JSON"));
                return false;
        }

        // Player stats
        const TSharedPtr<FJsonObject>* StatsObj;
        if (RootObj->TryGetObjectField(TEXT("playerStats"), StatsObj))
        {
                PlayerStats.UserId = (*StatsObj)->GetStringField(TEXT("userId"));
                PlayerStats.XP = (*StatsObj)->GetIntegerField(TEXT("xp"));
                PlayerStats.Rating = (*StatsObj)->GetIntegerField(TEXT("rating"));
                PlayerStats.MatchesPlayed = (*StatsObj)->GetIntegerField(TEXT("matchesPlayed"));
                PlayerStats.Wins = (*StatsObj)->GetIntegerField(TEXT("wins"));
                PlayerStats.Top5 = (*StatsObj)->GetIntegerField(TEXT("top5"));
                PlayerStats.TotalKills = (*StatsObj)->GetIntegerField(TEXT("totalKills"));
                PlayerStats.TotalDeaths = (*StatsObj)->GetIntegerField(TEXT("totalDeaths"));
                PlayerStats.SeasonKills = (*StatsObj)->GetIntegerField(TEXT("seasonKills"));
                PlayerStats.WeaponsBalance = static_cast<int64>((*StatsObj)->GetNumberField(TEXT("weaponsBalance")));
                PlayerStats.BonusBalance = static_cast<int64>((*StatsObj)->GetNumberField(TEXT("bonusBalance")));
                PlayerStats.FbmBalance = static_cast<int64>((*StatsObj)->GetNumberField(TEXT("fbmBalance")));
        }

        // Settings
        PreferredQueueMode = RootObj->GetStringField(TEXT("preferredQueueMode"));
        PreferredRegion = RootObj->GetStringField(TEXT("preferredRegion"));
        SettingsJson = RootObj->GetStringField(TEXT("settingsJson"));

        // Timestamps
        LastSaveTimestamp = RootObj->GetStringField(TEXT("lastSaveTimestamp"));
        LastSalaryDate = RootObj->GetStringField(TEXT("lastSalaryDate"));

        return true;
}

void UKhaaosSaveGame::AddMatchResult(const FString& MatchResultJson)
{
        RecentMatchResults.Add(MatchResultJson);

        // Evict oldest if over limit
        while (RecentMatchResults.Num() > MaxMatchHistory)
        {
                RecentMatchResults.RemoveAt(0);
        }
}
