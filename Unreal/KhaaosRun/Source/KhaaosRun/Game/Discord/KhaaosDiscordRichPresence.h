/**
 * KhaaosDiscordRichPresence.h
 * Khaaos Run — Discord Rich Presence Integration (Game SDK)
 *
 * Shows real-time game status in Discord:
 *   - Current world (CIGKV → W4 Arukheea)
 *   - Player count / match state
 *   - Species & loadout info
 *   - "Ask to Join" / "Spectate" deep links
 *   - Party sync via EOS ↔ Discord bridge
 *
 * Discord Game SDK: https://discord.com/developers/docs/game-sdk
 * Requires: discord_game_sdk.dll/.so bundled with game
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Khaaos Run • Multi-World Battle Royale • UE5.8 C++ Dedicated Server
 * ══════════════════════════════════════════════════════════════════════════
 */

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "Subsystems/EngineSubsystem.h"
#include "Discord/KhaaosDiscordRichPresence.generated.h"

// ─── Forward Declarations ──────────────────────────────────────────────────

class UWorld;
class AKhaaosGameMode;

// ─── Discord Activity State Enums ──────────────────────────────────────────

/**
 * EKhaaosDiscordActivityType
 * Maps to Discord ActivityType for Rich Presence.
 */
UENUM(BlueprintType)
enum class EKhaaosDiscordActivityType : uint8
{
        Playing     UMETA(DisplayName = "Playing"),
        Streaming   UMETA(DisplayName = "Streaming"),
        Listening   UMETA(DisplayName = "Listening"),
        Watching    UMETA(DisplayName = "Watching"),
        Competing   UMETA(DisplayName = "Competing")
};

/**
 * EKhaaosDiscordPartyPrivacy
 * Privacy level for Discord party (open = Ask to Join, closed = invite only).
 */
UENUM(BlueprintType)
enum class EKhaaosDiscordPartyPrivacy : uint8
{
        Private UMETA(DisplayName = "Private"),
        Public  UMETA(DisplayName = "Public")
};

// ─── Data Structures ───────────────────────────────────────────────────────

/**
 * FKhaaosDiscordActivityAssets
 * Large/small image + tooltip text for Rich Presence.
 */
USTRUCT(BlueprintType)
struct FKhaaosDiscordActivityAssets
{
        GENERATED_BODY()

        /** Large image key (registered in Discord Developer Portal). */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        FString LargeImageKey;

        /** Hover text for large image. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        FString LargeImageText;

        /** Small image key (e.g. species icon). */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        FString SmallImageKey;

        /** Hover text for small image. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        FString SmallImageText;
};

/**
 * FKhaaosDiscordActivityTimestamps
 * Start/end timestamps shown as elapsed/remaining time.
 */
USTRUCT(BlueprintType)
struct FKhaaosDiscordActivityTimestamps
{
        GENERATED_BODY()

        /** Match start (unix ms). 0 = not set. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        int64 StartTimestamp = 0;

        /** Match end (unix ms). 0 = not set. Shows "X remaining". */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        int64 EndTimestamp = 0;
};

/**
 * FKhaaosDiscordActivityParty
 * Party state for "Ask to Join" button.
 */
USTRUCT(BlueprintType)
struct FKhaaosDiscordActivityParty
{
        GENERATED_BODY()

        /** Unique party ID. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        FString Id;

        /** Current party size. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        int32 CurrentSize = 0;

        /** Max party size. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        int32 MaxSize = 0;

        /** Privacy: Public = Ask to Join, Private = Invite Only. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        EKhaaosDiscordPartyPrivacy Privacy = EKhaaosDiscordPartyPrivacy::Public;
};

/**
 * FKhaaosDiscordRichPresenceConfig
 * Configuration asset for Discord Rich Presence.
 */
USTRUCT(BlueprintType)
struct FKhaaosDiscordRichPresenceConfig
{
        GENERATED_BODY()

        /** Discord Application ID (from Developer Portal). */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        int64 ApplicationId = 0;

        /** Steam App ID (for Steam ↔ Discord verification). */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        int32 SteamAppId = 0;

        /** Update interval in seconds. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        float UpdateIntervalSeconds = 15.0f;

        /** Enable Ask to Join via Discord party. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        bool bEnableAskToJoin = true;

        /** Enable Spectate button. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        bool bEnableSpectate = true;

        /** Auto-update presence on world transition. */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|Discord")
        bool bAutoUpdateOnWorldTransition = true;
};

// ─── Delegates ─────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_DELEGATE(FOnDiscordPresenceUpdated);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnDiscordJoinGame, const FString&, JoinSecret);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnDiscordSpectateGame, const FString&, SpectateSecret);
DECLARE_DYNAMIC_DELEGATE(FOnDiscordError);

// ─── UKhaaosDiscordRichPresence ────────────────────────────────────────────

/**
 * UKhaaosDiscordRichPresence
 *
 * Manages Discord Rich Presence for Khaaos Run.
 *
 * Lifecycle:
 *   1. Initialize() — called from KhaaosGameMode::InitializeDiscordSubsystems()
 *   2. UpdateActivity() — called every UpdateIntervalSeconds via Tick
 *   3. OnWorldTransition() — auto-updates when player transitions worlds
 *   4. Shutdown() — called on game exit
 *
 * Activity Format:
 *   State:  "W2 Priadus • 43/75"
 *   Details: "Zheers • Katana + Espingarda"
 *   Large:   World splash art
 *   Small:   Species icon
 *   Party:   Current/max for Ask to Join
 *   Buttons: [Spectate] [Join Discord]
 *
 * Console Considerations:
 *   - PS5/XSX: Discord overlay via system integration
 *   - Switch2: No native Discord SDK — graceful fallback (log only)
 *   - PC: Full SDK with overlay
 */
UCLASS(BlueprintType, Blueprintable, Category = "Khaaos|Discord")
class KHAAOSRUN_API UKhaaosDiscordRichPresence : public UEngineSubsystem
{
        GENERATED_BODY()

public:
        // ─── Lifecycle ─────────────────────────────────────────────────────

        UKhaaosDiscordRichPresence();

        virtual void Initialize(FSubsystemCollectionBase& Collection) override;
        virtual void Deinitialize() override;

        /**
         * Configure and connect to Discord Game SDK.
         * @param Config  Application ID, update interval, feature flags.
         * @return True if SDK initialized successfully.
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
        bool InitializeSDK(const FKhaaosDiscordRichPresenceConfig& Config);

        /** Disconnect from Discord SDK. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
        void ShutdownSDK();

        /** Is the Discord SDK connected and active? */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Discord")
        bool IsConnected() const;

        // ─── Activity Management ───────────────────────────────────────────

        /**
         * Set the full Rich Presence activity.
         * @param State       Short line (e.g. "W2 Priadus • 43/75")
         * @param Details     Long line (e.g. "Zheers • Katana + Espingarda")
         * @param Assets      Image keys and tooltips
         * @param Timestamps  Start/end time
         * @param Party       Party state for Ask to Join
         * @param Type        Activity type (Playing, Competing, etc.)
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
        void SetActivity(
                const FString& State,
                const FString& Details,
                const FKhaaosDiscordActivityAssets& Assets,
                const FKhaaosDiscordActivityTimestamps& Timestamps,
                const FKhaaosDiscordActivityParty& Party,
                EKhaaosDiscordActivityType Type = EKhaaosDiscordActivityType::Playing
        );

        /** Clear the current activity (go idle in Discord). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
        void ClearActivity();

        // ─── Convenience Setters ───────────────────────────────────────────

        /** Set world and player count in the state line. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
        void SetWorldStatus(const FString& WorldName, int32 CurrentPlayers, int32 MaxPlayers);

        /** Set player species and loadout in the details line. */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
        void SetPlayerInfo(const FString& SpeciesName, const FString& LoadoutDesc);

        /** Set match timestamps (start = now, end = estimated). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
        void SetMatchTimestamps(int64 StartMs, int64 EndMs = 0);

        /** Update party size (e.g. when player joins/leaves). */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
        void UpdatePartySize(int32 CurrentSize, int32 MaxSize);

        // ─── World-Transition Hook ─────────────────────────────────────────

        /**
         * Called when player transitions between worlds.
         * Automatically updates state line with new world name + player count.
         * @param FromWorld  World the player is leaving
         * @param ToWorld    World the player is entering
         */
        UFUNCTION(BlueprintCallable, Category = "Khaaos|Discord")
        void OnWorldTransition(const FString& FromWorld, const FString& ToWorld);

        // ─── Deep-Link Secrets ─────────────────────────────────────────────

        /** Generate a Join secret (encrypted session ID). */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Discord")
        FString GenerateJoinSecret(const FString& SessionId) const;

        /** Generate a Spectate secret (encrypted match ID). */
        UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Discord")
        FString GenerateSpectateSecret(const FString& MatchId) const;

        // ─── Delegates ─────────────────────────────────────────────────────

        /** Broadcast when presence is successfully updated. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Discord")
        FOnDiscordPresenceUpdated OnPresenceUpdated;

        /** Broadcast when another player asks to join via Discord. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Discord")
        FOnDiscordJoinGame OnJoinGame;

        /** Broadcast when another player clicks Spectate. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Discord")
        FOnDiscordSpectateGame OnSpectateGame;

        /** Broadcast on SDK error. */
        UPROPERTY(BlueprintAssignable, Category = "Khaaos|Discord")
        FOnDiscordError OnDiscordError;

private:
        // ─── Internal State ────────────────────────────────────────────────

        /** True if Discord Game SDK is initialized. */
        bool bSDKInitialized = false;

        /** Current configuration. */
        FKhaaosDiscordRichPresenceConfig CurrentConfig;

        /** Current activity state line. */
        FString ActivityState;

        /** Current activity details line. */
        FString ActivityDetails;

        /** Current activity assets. */
        FKhaaosDiscordActivityAssets ActivityAssets;

        /** Current activity timestamps. */
        FKhaaosDiscordActivityTimestamps ActivityTimestamps;

        /** Current party state. */
        FKhaaosDiscordActivityParty ActivityParty;

        /** Current activity type. */
        EKhaaosDiscordActivityType ActivityType = EKhaaosDiscordActivityType::Playing;

        /** Cached world name for auto-update. */
        FString CurrentWorldName;

        /** Cached player count. */
        int32 CachedPlayerCount = 0;

        /** Cached max players. */
        int32 CachedMaxPlayers = 0;

        /** Cached species name. */
        FString CachedSpeciesName;

        /** Cached loadout description. */
        FString CachedLoadoutDesc;

        /** Time accumulator for periodic updates. */
        float UpdateAccumulator = 0.0f;

        // ─── Internal Methods ──────────────────────────────────────────────

        /** Flush current activity to Discord SDK. */
        void FlushActivity();

        /** Handle Discord SDK callbacks (run on game thread). */
        void PollDiscordCallbacks();

        /** Encode session/match ID to obfuscated secret. */
        FString EncodeSecret(const FString& RawId) const;

        /** Decode secret back to raw ID. */
        FString DecodeSecret(const FString& Secret) const;

        /** World name → large image key mapping. */
        FString GetWorldImageKey(const FString& WorldName) const;

        /** Species name → small image key mapping. */
        FString GetSpeciesImageKey(const FString& SpeciesName) const;
};
