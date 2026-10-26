// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AI/KhaaosBotSpawner.h"
#include "Game/AI/KhaaosBotBehaviorTree.h"
#include "KhaaosRun.h"

#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

void UKhaaosBotSpawner::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        ActiveBotCount = 0;
        TotalBotsSpawned = 0;
        TimeSinceLastSpawnCheck = 0.0f;
        bHordeModeActive = false;
        HordeWave = 0;
        HordeBaseWaveSize = 0;
        HordeWaveInterval = 30.0f;
        HordeWaveTimer = 0.0f;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotSpawner: Initialized"));
}

void UKhaaosBotSpawner::Deinitialize()
{
        StopHordeMode();
        Super::Deinitialize();
}

// ─── Configuration ──────────────────────────────────────────────────────────────

void UKhaaosBotSpawner::SetSpawnRules(const FKhaaosBotSpawnRule& InRules)
{
        SpawnRules = InRules;
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotSpawner::SetSpawnRules - Threshold: %d, MinBots: %d, MaxBots: %d"),
                SpawnRules.PlayersAliveThreshold, SpawnRules.MinBots, SpawnRules.MaxBots);
}

// ─── Bot Management ─────────────────────────────────────────────────────────────

void UKhaaosBotSpawner::UpdateBotPopulation(int32 PlayersAlive, float MatchElapsed)
{
        TimeSinceLastSpawnCheck += MatchElapsed > 0 ? 0.1f : 0.0f; // Approximate dt

        if (TimeSinceLastSpawnCheck < SpawnRules.SpawnCheckInterval)
        {
                return;
        }
        TimeSinceLastSpawnCheck = 0.0f;

        const int32 DesiredCount = GetDesiredBotCount(PlayersAlive);

        if (DesiredCount > ActiveBotCount)
        {
                // Spawn bots to reach desired count
                const int32 ToSpawn = FMath::Min(DesiredCount - ActiveBotCount, 3); // Max 3 per check
                const EKhaaosBotDifficulty Difficulty = SpawnRules.bScaleWithMatchPhase
                        ? GetDifficultyForMatchPhase(MatchElapsed / 1800.0f) // 30 min match
                        : SpawnRules.DefaultDifficulty;

                for (int32 i = 0; i < ToSpawn; ++i)
                {
                        const FKhaaosBotProfile Profile = GenerateBotProfile(Difficulty);
                        const FVector SpawnLoc = SelectSpawnLocation();
                        SpawnBot(Profile, SpawnLoc);
                }

                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotSpawner: Spawned %d bots (desired: %d, alive: %d, players: %d)"),
                        ToSpawn, DesiredCount, ActiveBotCount, PlayersAlive);
        }

        // Horde mode tick
        if (bHordeModeActive)
        {
                HordeWaveTimer += SpawnRules.SpawnCheckInterval;
                if (HordeWaveTimer >= HordeWaveInterval)
                {
                        SpawnHordeWave();
                        HordeWaveTimer = 0.0f;
                }
        }
}

int32 UKhaaosBotSpawner::GetDesiredBotCount(int32 PlayersAlive) const
{
        if (PlayersAlive >= SpawnRules.PlayersAliveThreshold)
        {
                // Enough real players, minimal bots
                return SpawnRules.MinBots;
        }

        // Scale bots inversely with player count
        const float FillRatio = 1.0f - (float)PlayersAlive / (float)SpawnRules.PlayersAliveThreshold;
        const int32 Desired = FMath::RoundToInt(SpawnRules.MinBots + FillRatio * (SpawnRules.MaxBots - SpawnRules.MinBots));

        return FMath::Clamp(Desired, SpawnRules.MinBots, SpawnRules.MaxBots);
}

void UKhaaosBotSpawner::OnBotEliminated()
{
        ActiveBotCount = FMath::Max(0, ActiveBotCount - 1);
}

// ─── Horde Mode ─────────────────────────────────────────────────────────────────

void UKhaaosBotSpawner::StartHordeMode(int32 BaseWaveSize, float WaveInterval)
{
        bHordeModeActive = true;
        HordeWave = 1;
        HordeBaseWaveSize = BaseWaveSize;
        HordeWaveInterval = WaveInterval;
        HordeWaveTimer = 0.0f;

        // Spawn first wave immediately
        SpawnHordeWave();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotSpawner::StartHordeMode - BaseWave: %d, Interval: %.0fs"),
                BaseWaveSize, WaveInterval);
}

void UKhaaosBotSpawner::StopHordeMode()
{
        bHordeModeActive = false;
        HordeWave = 0;
}

void UKhaaosBotSpawner::SpawnHordeWave()
{
        if (!bHordeModeActive) return;

        // Wave size increases each wave: Base * (1 + 0.3 * Wave)
        const int32 WaveSize = FMath::RoundToInt(HordeBaseWaveSize * (1.0f + 0.3f * HordeWave));
        const EKhaaosBotDifficulty HordeDifficulty = HordeWave >= 5
                ? EKhaaosBotDifficulty::Veteran
                : (HordeWave >= 3 ? EKhaaosBotDifficulty::Elite : EKhaaosBotDifficulty::Regular);

        for (int32 i = 0; i < WaveSize; ++i)
        {
                const FKhaaosBotProfile Profile = GenerateBotProfile(HordeDifficulty);
                const FVector SpawnLoc = SelectSpawnLocation();
                SpawnBot(Profile, SpawnLoc);
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosBotSpawner: Horde wave %d spawned (%d bots, difficulty %d)"),
                HordeWave, WaveSize, (int32)HordeDifficulty);

        HordeWave++;
}

// ─── Difficulty Scaling ─────────────────────────────────────────────────────────

EKhaaosBotDifficulty UKhaaosBotSpawner::GetDifficultyForMatchPhase(float MatchPhaseNormalized) const
{
        // MatchPhaseNormalized: 0.0 = start, 1.0 = endgame
        const float Phase = FMath::Clamp(MatchPhaseNormalized, 0.0f, 1.0f);

        if (Phase < 0.2f)
                return EKhaaosBotDifficulty::Recruit;
        else if (Phase < 0.4f)
                return EKhaaosBotDifficulty::Regular;
        else if (Phase < 0.6f)
                return EKhaaosBotDifficulty::Elite;
        else if (Phase < 0.8f)
                return EKhaaosBotDifficulty::Veteran;
        else
                return EKhaaosBotDifficulty::Mythic;
}

// ─── Internal ───────────────────────────────────────────────────────────────────

void UKhaaosBotSpawner::SpawnBot(const FKhaaosBotProfile& Profile, const FVector& Location)
{
        // In production, this would spawn a pawn with AKhaaosBotAI controller
        // at the given location with the provided profile.
        ActiveBotCount++;
        TotalBotsSpawned++;

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosBotSpawner: Bot spawned at (%.0f, %.0f, %.0f) difficulty=%d role=%d"),
                Location.X, Location.Y, Location.Z, (int32)Profile.Difficulty, (int32)Profile.Role);
}

FVector UKhaaosBotSpawner::SelectSpawnLocation() const
{
        // Placeholder: random location within 2000 units of origin
        // Production: NavMesh random reachable point inside zone, away from players
        return FVector(
                FMath::FRandRange(-2000.0f, 2000.0f),
                FMath::FRandRange(-2000.0f, 2000.0f),
                0.0f
        );
}

FKhaaosBotProfile UKhaaosBotSpawner::GenerateBotProfile(EKhaaosBotDifficulty Difficulty) const
{
        FKhaaosBotProfile Profile;
        Profile.Difficulty = Difficulty;
        Profile.SpeciesId = FMath::RandRange(0, 5); // Random species (0-5)

        // Role distribution: 40% Assault, 20% Sniper, 15% Support, 10% Flanker, 10% Defender, 5% Scout
        const float RoleRoll = FMath::FRand();
        if (RoleRoll < 0.40f)       Profile.Role = EKhaaosBotRole::Assault;
        else if (RoleRoll < 0.60f)  Profile.Role = EKhaaosBotRole::Sniper;
        else if (RoleRoll < 0.75f)  Profile.Role = EKhaaosBotRole::Support;
        else if (RoleRoll < 0.85f)  Profile.Role = EKhaaosBotRole::Flanker;
        else if (RoleRoll < 0.95f)  Profile.Role = EKhaaosBotRole::Defender;
        else                        Profile.Role = EKhaaosBotRole::Scout;

        return Profile;
}
