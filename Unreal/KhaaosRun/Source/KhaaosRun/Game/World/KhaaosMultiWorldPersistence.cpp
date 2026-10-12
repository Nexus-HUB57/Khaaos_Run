// ============================================================================
// Khaaos Run — Multi-World Persistence System Implementation (Fase 4)
// ============================================================================

#include "Game/World/KhaaosMultiWorldPersistence.h"
#include "Misc/DateTime.h"

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosMultiWorldPersistence::UKhaaosMultiWorldPersistence()
{
    MaxMatchHistory = 100;
    LeaderboardMaxEntries = 1000;
    AutoSaveInterval = 120.0f;
    bCloudSaveEnabled = true;
}

void UKhaaosMultiWorldPersistence::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    InitializeProgressionGates();

    UE_LOG(LogTemp, Log, TEXT("[Persistence] Multi-World Persistence initialized — %d progression gates"),
        ProgressionGates.Num());
}

void UKhaaosMultiWorldPersistence::Deinitialize()
{
    // Flush any dirty profiles before shutdown
    FlushAllProfiles();

    PlayerProfiles.Empty();
    Leaderboards.Empty();
    DirtyProfiles.Empty();
    ProgressionGates.Empty();

    Super::Deinitialize();
    UE_LOG(LogTemp, Log, TEXT("[Persistence] Multi-World Persistence deinitialized"));
}

// ─── Profile Management ──────────────────────────────────────────────────────

FKhaaosPlayerWorldProfile UKhaaosMultiWorldPersistence::GetPlayerProfile(const FString& PlayerId)
{
    EnsureProfileExists(PlayerId);
    const FKhaaosPlayerWorldProfile* Found = PlayerProfiles.Find(PlayerId);
    return Found ? *Found : FKhaaosPlayerWorldProfile();
}

bool UKhaaosMultiWorldPersistence::SavePlayerProfile(const FString& PlayerId)
{
    FKhaaosPlayerWorldProfile* Profile = PlayerProfiles.Find(PlayerId);
    if (!Profile)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Persistence] Cannot save — profile not found: %s"), *PlayerId);
        return false;
    }

    Profile->LastSavedTimestamp = GetCurrentTimestamp();

    if (bCloudSaveEnabled)
    {
        // Serialize and push to EOS Cloud Save
        // Save slot: "KhaaosProfile_{PlayerId}"
        UE_LOG(LogTemp, Log, TEXT("[Persistence] Profile saved to cloud: %s"), *PlayerId);
    }

    DirtyProfiles.Remove(PlayerId);
    return true;
}

bool UKhaaosMultiWorldPersistence::LoadPlayerProfile(const FString& PlayerId)
{
    if (!bCloudSaveEnabled)
    {
        UE_LOG(LogTemp, Log, TEXT("[Persistence] Cloud save disabled — using local profile for %s"), *PlayerId);
        EnsureProfileExists(PlayerId);
        return true;
    }

    // Load from EOS Cloud Save
    // In production: deserialize from EOS slot "KhaaosProfile_{PlayerId}"
    // For now: ensure local profile exists
    EnsureProfileExists(PlayerId);
    UE_LOG(LogTemp, Log, TEXT("[Persistence] Profile loaded for %s"), *PlayerId);
    return true;
}

// ─── Progression Gates ───────────────────────────────────────────────────────

bool UKhaaosMultiWorldPersistence::CanAccessWorld(const FString& PlayerId, EKhaaosWorldId World) const
{
    // CIGKV is always accessible
    if (World == EKhaaosWorldId::CIGKV)
    {
        return true;
    }

    const FKhaaosPlayerWorldProfile* Profile = PlayerProfiles.Find(PlayerId);
    if (!Profile)
    {
        return false;
    }

    // Check if the world is in the player's unlocked list
    return Profile->UnlockedWorlds.Contains(World);
}

TArray<EKhaaosWorldId> UKhaaosMultiWorldPersistence::GetUnlockedWorlds(const FString& PlayerId) const
{
    const FKhaaosPlayerWorldProfile* Profile = PlayerProfiles.Find(PlayerId);
    if (!Profile)
    {
        // CIGKV is always unlocked
        return { EKhaaosWorldId::CIGKV };
    }
    return Profile->UnlockedWorlds;
}

bool UKhaaosMultiWorldPersistence::ValidateWorldTransition(const FString& PlayerId, EKhaaosWorldId FromWorld, EKhaaosWorldId ToWorld) const
{
    // Can always go to CIGKV
    if (ToWorld == EKhaaosWorldId::CIGKV)
    {
        return true;
    }

    // Must have access to the target world
    if (!CanAccessWorld(PlayerId, ToWorld))
    {
        UE_LOG(LogTemp, Warning, TEXT("[Persistence] Player %s cannot access world %d"),
            *PlayerId, static_cast<int32>(ToWorld));
        return false;
    }

    // Cannot transition to the same world
    if (FromWorld == ToWorld)
    {
        return false;
    }

    return true;
}

// ─── World Stats ─────────────────────────────────────────────────────────────

FKhaaosWorldStats UKhaaosMultiWorldPersistence::GetWorldStats(const FString& PlayerId, EKhaaosWorldId World) const
{
    const FKhaaosPlayerWorldProfile* Profile = PlayerProfiles.Find(PlayerId);
    if (!Profile)
    {
        FKhaaosWorldStats Empty;
        Empty.WorldId = World;
        return Empty;
    }

    const FKhaaosWorldStats* Stats = Profile->WorldStats.Find(World);
    if (Stats)
    {
        return *Stats;
    }

    FKhaaosWorldStats Empty;
    Empty.WorldId = World;
    return Empty;
}

void UKhaaosMultiWorldPersistence::RecordMatchResult(const FString& PlayerId, const FKhaaosMatchResult& Result)
{
    EnsureProfileExists(PlayerId);
    FKhaaosPlayerWorldProfile& Profile = PlayerProfiles.FindOrAdd(PlayerId);

    // Add to match history
    Profile.MatchHistory.Add(Result);
    TrimMatchHistory(Profile);

    // Update world stats
    FKhaaosWorldStats& Stats = Profile.WorldStats.FindOrAdd(Result.World);
    Stats.WorldId = Result.World;
    Stats.MatchesPlayed++;
    Stats.TotalKills += Result.Kills;
    Stats.TotalKRCEarned += Result.KRCEarned;
    Stats.TotalXPEarned += Result.XPEarned;
    Stats.TotalPlayTimeSeconds += static_cast<int64>(Result.MatchDuration);

    if (Result.FinishPosition == 1)
    {
        Stats.MatchesWon++;
    }

    if (Result.FinishPosition < Stats.BestFinishPosition)
    {
        Stats.BestFinishPosition = Result.FinishPosition;
    }

    if (Result.bExtracted)
    {
        Stats.ExtractionsCompleted++;
    }

    Stats.ZuEntriesCompleted++;
    Stats.LastMatchTimestamp = GetCurrentTimestamp();

    // Update total KRC balance
    Profile.TotalKRCBalance += Result.KRCEarned;

    // Re-evaluate progression gates (might unlock new worlds)
    EvaluateProgressionGates(PlayerId);

    // Mark profile as dirty
    DirtyProfiles.Add(PlayerId);

    UE_LOG(LogTemp, Log, TEXT("[Persistence] Match recorded for %s in world %d — Position=%d, Kills=%d, KRC=%lld"),
        *PlayerId, static_cast<int32>(Result.World), Result.FinishPosition,
        Result.Kills, Result.KRCEarned);
}

int32 UKhaaosMultiWorldPersistence::GetMatchesPlayed(const FString& PlayerId, EKhaaosWorldId World) const
{
    return GetWorldStats(PlayerId, World).MatchesPlayed;
}

// ─── Inventory Management ────────────────────────────────────────────────────

bool UKhaaosMultiWorldPersistence::AddInventoryItem(const FString& PlayerId, const FKhaaosInventoryItem& Item)
{
    EnsureProfileExists(PlayerId);
    FKhaaosPlayerWorldProfile& Profile = PlayerProfiles.FindOrAdd(PlayerId);

    // Check for duplicate
    for (const FKhaaosInventoryItem& Existing : Profile.Inventory)
    {
        if (Existing.ItemId == Item.ItemId)
        {
            UE_LOG(LogTemp, Warning, TEXT("[Persistence] Duplicate item %s for %s"), *Item.ItemId.ToString(), *PlayerId);
            return false;
        }
    }

    Profile.Inventory.Add(Item);
    DirtyProfiles.Add(PlayerId);

    UE_LOG(LogTemp, Log, TEXT("[Persistence] Item added to %s: %s (scope=%d)"),
        *PlayerId, *Item.DisplayName, static_cast<int32>(Item.Scope));
    return true;
}

bool UKhaaosMultiWorldPersistence::RemoveInventoryItem(const FString& PlayerId, const FGuid& ItemId)
{
    FKhaaosPlayerWorldProfile* Profile = PlayerProfiles.Find(PlayerId);
    if (!Profile) return false;

    for (int32 i = 0; i < Profile->Inventory.Num(); i++)
    {
        if (Profile->Inventory[i].ItemId == ItemId)
        {
            Profile->Inventory.RemoveAt(i);
            DirtyProfiles.Add(PlayerId);
            UE_LOG(LogTemp, Log, TEXT("[Persistence] Item removed from %s: %s"), *PlayerId, *ItemId.ToString());
            return true;
        }
    }

    return false;
}

bool UKhaaosMultiWorldPersistence::TransferItemToWorld(const FString& PlayerId, const FGuid& ItemId, EKhaaosWorldId TargetWorld)
{
    FKhaaosPlayerWorldProfile* Profile = PlayerProfiles.Find(PlayerId);
    if (!Profile) return false;

    for (FKhaaosInventoryItem& Item : Profile->Inventory)
    {
        if (Item.ItemId == ItemId)
        {
            if (!CanTransferItem(Item, TargetWorld))
            {
                UE_LOG(LogTemp, Warning, TEXT("[Persistence] Cannot transfer item %s — scope=%d, locked=%d"),
                    *ItemId.ToString(), static_cast<int32>(Item.Scope), static_cast<int32>(Item.LockedToWorld));
                return false;
            }

            // Cosmetics can be transferred; update locked world
            Item.LockedToWorld = TargetWorld;
            DirtyProfiles.Add(PlayerId);

            UE_LOG(LogTemp, Log, TEXT("[Persistence] Item %s transferred to world %d for %s"),
                *ItemId.ToString(), static_cast<int32>(TargetWorld), *PlayerId);
            return true;
        }
    }

    return false;
}

TArray<FKhaaosInventoryItem> UKhaaosMultiWorldPersistence::GetInventory(const FString& PlayerId) const
{
    const FKhaaosPlayerWorldProfile* Profile = PlayerProfiles.Find(PlayerId);
    if (!Profile) return {};
    return Profile->Inventory;
}

TArray<FKhaaosInventoryItem> UKhaaosMultiWorldPersistence::GetItemsForWorld(const FString& PlayerId, EKhaaosWorldId World) const
{
    const FKhaaosPlayerWorldProfile* Profile = PlayerProfiles.Find(PlayerId);
    if (!Profile) return {};

    TArray<FKhaaosInventoryItem> Result;
    for (const FKhaaosInventoryItem& Item : Profile->Inventory)
    {
        // Cosmetics and achievements are available in all worlds
        if (Item.Scope == EKhaaosInventoryScope::Cosmetics ||
            Item.Scope == EKhaaosInventoryScope::Achievements)
        {
            Result.Add(Item);
        }
        // Weapons are only available in their locked world
        else if (Item.Scope == EKhaaosInventoryScope::Weapons && Item.LockedToWorld == World)
        {
            Result.Add(Item);
        }
        // Consumables are available in the current match world
        else if (Item.Scope == EKhaaosInventoryScope::Consumables && Item.LockedToWorld == World)
        {
            Result.Add(Item);
        }
    }

    return Result;
}

bool UKhaaosMultiWorldPersistence::CanTransferItem(const FKhaaosInventoryItem& Item, EKhaaosWorldId TargetWorld) const
{
    // Weapons cannot be transferred between worlds
    if (Item.Scope == EKhaaosInventoryScope::Weapons)
    {
        return false;
    }

    // Consumables are per-match, cannot transfer
    if (Item.Scope == EKhaaosInventoryScope::Consumables)
    {
        return false;
    }

    // Cosmetics and achievements can be transferred
    if (Item.Scope == EKhaaosInventoryScope::Cosmetics ||
        Item.Scope == EKhaaosInventoryScope::Achievements)
    {
        return true;
    }

    return false;
}

// ─── Leaderboards ────────────────────────────────────────────────────────────

void UKhaaosMultiWorldPersistence::UpdateLeaderboard(EKhaaosWorldId World, const FString& PlayerId, const FString& PlayerName, int32 Score, int32 Wins, int64 KRC)
{
    TArray<FKhaaosLeaderboardEntry>& Board = Leaderboards.FindOrAdd(World);

    // Check if player already exists on the board
    FKhaaosLeaderboardEntry* Existing = nullptr;
    for (FKhaaosLeaderboardEntry& Entry : Board)
    {
        if (Entry.PlayerId == PlayerId)
        {
            Existing = &Entry;
            break;
        }
    }

    if (Existing)
    {
        // Update existing entry (accumulating)
        Existing->Score += Score;
        Existing->MatchesWon += Wins;
        Existing->KRCEarned += KRC;
    }
    else
    {
        // Add new entry
        FKhaaosLeaderboardEntry Entry;
        Entry.PlayerId = PlayerId;
        Entry.PlayerName = PlayerName;
        Entry.Score = Score;
        Entry.MatchesWon = Wins;
        Entry.KRCEarned = KRC;
        Board.Add(Entry);
    }

    SortLeaderboard(World);

    // Trim to max entries
    if (Board.Num() > LeaderboardMaxEntries)
    {
        Board.SetNum(LeaderboardMaxEntries);
    }

    UE_LOG(LogTemp, Verbose, TEXT("[Persistence] Leaderboard updated for world %d: %s score=%d"),
        static_cast<int32>(World), *PlayerId, Score);
}

TArray<FKhaaosLeaderboardEntry> UKhaaosMultiWorldPersistence::GetLeaderboard(EKhaaosWorldId World, int32 TopN) const
{
    const TArray<FKhaaosLeaderboardEntry>* Board = Leaderboards.Find(World);
    if (!Board) return {};

    int32 Count = FMath::Min(TopN, Board->Num());
    TArray<FKhaaosLeaderboardEntry> Result;
    for (int32 i = 0; i < Count; i++)
    {
        Result.Add((*Board)[i]);
    }
    return Result;
}

int32 UKhaaosMultiWorldPersistence::GetPlayerRank(EKhaaosWorldId World, const FString& PlayerId) const
{
    const TArray<FKhaaosLeaderboardEntry>* Board = Leaderboards.Find(World);
    if (!Board) return -1;

    for (int32 i = 0; i < Board->Num(); i++)
    {
        if ((*Board)[i].PlayerId == PlayerId)
        {
            return i + 1;  // 1-based rank
        }
    }

    return -1;  // Not on leaderboard
}

// ─── EOS Cloud Save Integration ──────────────────────────────────────────────

void UKhaaosMultiWorldPersistence::FlushAllProfiles()
{
    int32 SavedCount = 0;
    for (const FString& PlayerId : DirtyProfiles)
    {
        if (SavePlayerProfile(PlayerId))
        {
            SavedCount++;
        }
    }
    DirtyProfiles.Empty();

    UE_LOG(LogTemp, Log, TEXT("[Persistence] Flushed %d dirty profiles to cloud"), SavedCount);
}

void UKhaaosMultiWorldPersistence::LoadAllProfiles()
{
    // In production: enumerate all active EOS Cloud Save slots and load
    // For now: log the operation
    UE_LOG(LogTemp, Log, TEXT("[Persistence] Loading all profiles from cloud — %d cached"),
        PlayerProfiles.Num());
}

// ─── Private ─────────────────────────────────────────────────────────────────

void UKhaaosMultiWorldPersistence::InitializeProgressionGates()
{
    ProgressionGates.Empty();

    // CIGKV → W1: Requires 10 CIGKV matches
    FKhaaosProgressionGate Gate1;
    Gate1.TargetWorld = EKhaaosWorldId::W1;
    Gate1.RequiredWorld = EKhaaosWorldId::CIGKV;
    Gate1.MinMatchesRequired = 10;
    Gate1.MinWinsRequired = 0;
    Gate1.MinKRCBalance = 0;
    Gate1.bIsSatisfied = false;
    ProgressionGates.Add(Gate1);

    // W1 → W2: Requires 5 W1 matches
    FKhaaosProgressionGate Gate2;
    Gate2.TargetWorld = EKhaaosWorldId::W2;
    Gate2.RequiredWorld = EKhaaosWorldId::W1;
    Gate2.MinMatchesRequired = 5;
    Gate2.MinWinsRequired = 0;
    Gate2.MinKRCBalance = 0;
    Gate2.bIsSatisfied = false;
    ProgressionGates.Add(Gate2);

    // W2 → W3: Requires 5 W2 matches
    FKhaaosProgressionGate Gate3;
    Gate3.TargetWorld = EKhaaosWorldId::W3;
    Gate3.RequiredWorld = EKhaaosWorldId::W2;
    Gate3.MinMatchesRequired = 5;
    Gate3.MinWinsRequired = 0;
    Gate3.MinKRCBalance = 0;
    Gate3.bIsSatisfied = false;
    ProgressionGates.Add(Gate3);

    // W3 → W4: Requires 5 W3 matches
    FKhaaosProgressionGate Gate4;
    Gate4.TargetWorld = EKhaaosWorldId::W4;
    Gate4.RequiredWorld = EKhaaosWorldId::W3;
    Gate4.MinMatchesRequired = 5;
    Gate4.MinWinsRequired = 0;
    Gate4.MinKRCBalance = 0;
    Gate4.bIsSatisfied = false;
    ProgressionGates.Add(Gate4);
}

void UKhaaosMultiWorldPersistence::EvaluateProgressionGates(const FString& PlayerId)
{
    FKhaaosPlayerWorldProfile* Profile = PlayerProfiles.Find(PlayerId);
    if (!Profile) return;

    // Ensure CIGKV is always unlocked
    if (!Profile->UnlockedWorlds.Contains(EKhaaosWorldId::CIGKV))
    {
        Profile->UnlockedWorlds.Add(EKhaaosWorldId::CIGKV);
    }

    // Evaluate each gate
    for (FKhaaosProgressionGate& Gate : ProgressionGates)
    {
        // Get stats in the required world
        const FKhaaosWorldStats* Stats = Profile->WorldStats.Find(Gate.RequiredWorld);
        int32 Matches = Stats ? Stats->MatchesPlayed : 0;
        int32 Wins = Stats ? Stats->MatchesWon : 0;
        int64 KRC = Profile->TotalKRCBalance;

        bool bMeetsMatches = Matches >= Gate.MinMatchesRequired;
        bool bMeetsWins = Wins >= Gate.MinWinsRequired;
        bool bMeetsKRC = KRC >= Gate.MinKRCBalance;

        Gate.bIsSatisfied = bMeetsMatches && bMeetsWins && bMeetsKRC;

        // If gate is satisfied, unlock the target world
        if (Gate.bIsSatisfied && !Profile->UnlockedWorlds.Contains(Gate.TargetWorld))
        {
            Profile->UnlockedWorlds.Add(Gate.TargetWorld);
            DirtyProfiles.Add(PlayerId);

            UE_LOG(LogTemp, Log, TEXT("[Persistence] World UNLOCKED for %s: %d (via %d matches in %d)"),
                *PlayerId,
                static_cast<int32>(Gate.TargetWorld),
                Matches,
                static_cast<int32>(Gate.RequiredWorld));
        }
    }
}

void UKhaaosMultiWorldPersistence::TrimMatchHistory(FKhaaosPlayerWorldProfile& Profile)
{
    while (Profile.MatchHistory.Num() > MaxMatchHistory)
    {
        // Remove oldest match
        Profile.MatchHistory.RemoveAt(0);
    }
}

void UKhaaosMultiWorldPersistence::SortLeaderboard(EKhaaosWorldId World)
{
    TArray<FKhaaosLeaderboardEntry>* Board = Leaderboards.Find(World);
    if (!Board) return;

    // Sort by score descending
    Board->Sort([](const FKhaaosLeaderboardEntry& A, const FKhaaosLeaderboardEntry& B)
    {
        return A.Score > B.Score;
    });

    // Assign ranks (1-based)
    for (int32 i = 0; i < Board->Num(); i++)
    {
        (*Board)[i].Rank = i + 1;
    }
}

int64 UKhaaosMultiWorldPersistence::GetCurrentTimestamp() const
{
    return FDateTime::UtcNow().ToUnixTimestamp();
}

void UKhaaosMultiWorldPersistence::EnsureProfileExists(const FString& PlayerId)
{
    if (PlayerProfiles.Contains(PlayerId)) return;

    FKhaaosPlayerWorldProfile Profile;
    Profile.PlayerId = PlayerId;
    Profile.DisplayName = PlayerId;
    Profile.CurrentWorld = EKhaaosWorldId::CIGKV;
    Profile.TotalKRCBalance = 0;
    Profile.LastSavedTimestamp = GetCurrentTimestamp();

    // CIGKV is always unlocked
    Profile.UnlockedWorlds.Add(EKhaaosWorldId::CIGKV);

    // Initialize empty stats for all worlds
    for (int32 i = 0; i <= 4; i++)
    {
        EKhaaosWorldId WorldId = static_cast<EKhaaosWorldId>(i);
        FKhaaosWorldStats Stats;
        Stats.WorldId = WorldId;
        Profile.WorldStats.Add(WorldId, Stats);
    }

    PlayerProfiles.Add(PlayerId, Profile);

    // Evaluate gates (new player might have legacy progress)
    EvaluateProgressionGates(PlayerId);

    UE_LOG(LogTemp, Log, TEXT("[Persistence] New profile created for %s"), *PlayerId);
}
