// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Discord/KhaaosDiscordRichPresence.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosDiscordRichPresence::UKhaaosDiscordRichPresence()
        : bSDKInitialized(false)
        , ActivityType(EKhaaosDiscordActivityType::Playing)
        , CachedPlayerCount(0)
        , CachedMaxPlayers(0)
        , UpdateAccumulator(0.0f)
{
}

// ─── Subsystem Lifecycle ─────────────────────────────────────────────────────────

void UKhaaosDiscordRichPresence::Initialize(FSubsystemCollectionBase& Collection)
{
        Super::Initialize(Collection);

        bSDKInitialized = false;
        UpdateAccumulator = 0.0f;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordRichPresence: Initialized"));
}

void UKhaaosDiscordRichPresence::Deinitialize()
{
        ShutdownSDK();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordRichPresence: Deinitialized"));
        Super::Deinitialize();
}

// ─── InitializeSDK ──────────────────────────────────────────────────────────────

bool UKhaaosDiscordRichPresence::InitializeSDK(const FKhaaosDiscordRichPresenceConfig& Config)
{
        if (bSDKInitialized)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordRichPresence::InitializeSDK - Already initialized"));
                return true;
        }

        // Validate Application ID
        if (Config.ApplicationId == 0)
        {
                UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosDiscordRichPresence::InitializeSDK - ApplicationId is 0, cannot initialize"));
                return false;
        }

        CurrentConfig = Config;

        // Platform detection
#if PLATFORM_SWITCH
        // Nintendo Switch has no native Discord SDK - log-only mode
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordRichPresence::InitializeSDK - Platform: Switch (no Discord SDK, log-only mode)"));
        bSDKInitialized = true;
#elif PLATFORM_PS5 || PLATFORM_XBOXONE
        // Console platforms use system-level Discord overlay integration
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordRichPresence::InitializeSDK - Platform: Console (system overlay integration)"));
        bSDKInitialized = true;
#else
        // PC - Full Discord Game SDK with overlay
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordRichPresence::InitializeSDK - Platform: PC (full Discord SDK)"));
        bSDKInitialized = true;
#endif

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordRichPresence::InitializeSDK - SDK initialized with ApplicationId %lld"),
                Config.ApplicationId);

        return true;
}

// ─── ShutdownSDK ─────────────────────────────────────────────────────────────────

void UKhaaosDiscordRichPresence::ShutdownSDK()
{
        if (!bSDKInitialized)
        {
                return;
        }

        ClearActivity();
        bSDKInitialized = false;

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordRichPresence::ShutdownSDK - SDK shut down"));
}

// ─── IsConnected ─────────────────────────────────────────────────────────────────

bool UKhaaosDiscordRichPresence::IsConnected() const
{
        return bSDKInitialized;
}

// ─── Activity Management ─────────────────────────────────────────────────────────

void UKhaaosDiscordRichPresence::SetActivity(
        const FString& State,
        const FString& Details,
        const FKhaaosDiscordActivityAssets& Assets,
        const FKhaaosDiscordActivityTimestamps& Timestamps,
        const FKhaaosDiscordActivityParty& Party,
        EKhaaosDiscordActivityType Type)
{
        ActivityState = State;
        ActivityDetails = Details;
        ActivityAssets = Assets;
        ActivityTimestamps = Timestamps;
        ActivityParty = Party;
        ActivityType = Type;

        FlushActivity();
}

void UKhaaosDiscordRichPresence::ClearActivity()
{
        ActivityState.Empty();
        ActivityDetails.Empty();
        ActivityAssets = FKhaaosDiscordActivityAssets();
        ActivityTimestamps = FKhaaosDiscordActivityTimestamps();
        ActivityParty = FKhaaosDiscordActivityParty();
        ActivityType = EKhaaosDiscordActivityType::Playing;

        OnPresenceUpdated.Broadcast();

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordRichPresence::ClearActivity - Activity cleared"));
}

// ─── Convenience Setters ─────────────────────────────────────────────────────────

void UKhaaosDiscordRichPresence::SetWorldStatus(const FString& WorldName, int32 CurrentPlayers, int32 MaxPlayers)
{
        CurrentWorldName = WorldName;
        CachedPlayerCount = CurrentPlayers;
        CachedMaxPlayers = MaxPlayers;

        // Format: "WorldName * Current/Max"
        ActivityState = FString::Printf(TEXT("%s \u2022 %d/%d"), *WorldName, CurrentPlayers, MaxPlayers);

        // Update large image key to match the world
        ActivityAssets.LargeImageKey = GetWorldImageKey(WorldName);
        ActivityAssets.LargeImageText = WorldName;

        FlushActivity();
}

void UKhaaosDiscordRichPresence::SetPlayerInfo(const FString& SpeciesName, const FString& LoadoutDesc)
{
        CachedSpeciesName = SpeciesName;
        CachedLoadoutDesc = LoadoutDesc;

        // Format: "Species * Loadout"
        ActivityDetails = FString::Printf(TEXT("%s \u2022 %s"), *SpeciesName, *LoadoutDesc);

        // Update small image key to match the species
        ActivityAssets.SmallImageKey = GetSpeciesImageKey(SpeciesName);
        ActivityAssets.SmallImageText = SpeciesName;

        FlushActivity();
}

void UKhaaosDiscordRichPresence::SetMatchTimestamps(int64 StartMs, int64 EndMs)
{
        ActivityTimestamps.StartTimestamp = StartMs;
        ActivityTimestamps.EndTimestamp = EndMs;

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosDiscordRichPresence::SetMatchTimestamps - Start: %lld, End: %lld"),
                StartMs, EndMs);
}

void UKhaaosDiscordRichPresence::UpdatePartySize(int32 CurrentSize, int32 MaxSize)
{
        ActivityParty.CurrentSize = CurrentSize;
        ActivityParty.MaxSize = MaxSize;

        FlushActivity();
}

// ─── World-Transition Hook ───────────────────────────────────────────────────────

void UKhaaosDiscordRichPresence::OnWorldTransition(const FString& FromWorld, const FString& ToWorld)
{
        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordRichPresence::OnWorldTransition - %s -> %s"),
                *FromWorld, *ToWorld);

        SetWorldStatus(ToWorld, CachedPlayerCount, CachedMaxPlayers);
}

// ─── Deep-Link Secrets ───────────────────────────────────────────────────────────

FString UKhaaosDiscordRichPresence::GenerateJoinSecret(const FString& SessionId) const
{
        return EncodeSecret(TEXT("J:") + SessionId);
}

FString UKhaaosDiscordRichPresence::GenerateSpectateSecret(const FString& MatchId) const
{
        return EncodeSecret(TEXT("S:") + MatchId);
}

// ─── FlushActivity ───────────────────────────────────────────────────────────────

void UKhaaosDiscordRichPresence::FlushActivity()
{
        if (!bSDKInitialized)
        {
                return;
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosDiscordRichPresence::FlushActivity - State: %s | Details: %s"),
                *ActivityState, *ActivityDetails);
        UE_LOG(LogKhaaosRun, Log, TEXT("  Assets - Large: %s (%s), Small: %s (%s)"),
                *ActivityAssets.LargeImageKey, *ActivityAssets.LargeImageText,
                *ActivityAssets.SmallImageKey, *ActivityAssets.SmallImageText);
        UE_LOG(LogKhaaosRun, Log, TEXT("  Timestamps - Start: %lld, End: %lld"),
                ActivityTimestamps.StartTimestamp, ActivityTimestamps.EndTimestamp);
        UE_LOG(LogKhaaosRun, Log, TEXT("  Party - Id: %s, Size: %d/%d, Privacy: %s"),
                *ActivityParty.Id, ActivityParty.CurrentSize, ActivityParty.MaxSize,
                ActivityParty.Privacy == EKhaaosDiscordPartyPrivacy::Public ? TEXT("Public") : TEXT("Private"));

        // In production, this would call:
        //   discord::Activity Activity;
        //   Activity.SetState(TCHAR_TO_UTF8(*ActivityState));
        //   Activity.SetDetails(TCHAR_TO_UTF8(*ActivityDetails));
        //   Activity.GetAssets().SetLargeImage(TCHAR_TO_UTF8(*ActivityAssets.LargeImageKey));
        //   Activity.GetAssets().SetLargeText(TCHAR_TO_UTF8(*ActivityAssets.LargeImageText));
        //   Activity.GetAssets().SetSmallImage(TCHAR_TO_UTF8(*ActivityAssets.SmallImageKey));
        //   Activity.GetAssets().SetSmallText(TCHAR_TO_UTF8(*ActivityAssets.SmallImageText));
        //   Activity.GetTimestamps().SetStart(ActivityTimestamps.StartTimestamp);
        //   Activity.GetTimestamps().SetEnd(ActivityTimestamps.EndTimestamp);
        //   Activity.GetParty().SetId(TCHAR_TO_UTF8(*ActivityParty.Id));
        //   Activity.GetParty().GetSize().SetCurrentSize(ActivityParty.CurrentSize);
        //   Activity.GetParty().GetSize().SetMaxSize(ActivityParty.MaxSize);
        //   Activity.SetType(static_cast<discord::ActivityType>(ActivityType));
        //   DiscordCore->ActivityManager().UpdateActivity(Activity, [](discord::Result Result) { ... });

        OnPresenceUpdated.Broadcast();
}

// ─── PollDiscordCallbacks ────────────────────────────────────────────────────────

void UKhaaosDiscordRichPresence::PollDiscordCallbacks()
{
        if (!bSDKInitialized)
        {
                return;
        }

        // In production, this would call:
        //   DiscordCore->RunCallbacks();
        //
        // This must be called every tick on the game thread to process
        // Discord SDK events (join requests, spectate requests, etc.).
}

// ─── EncodeSecret / DecodeSecret ─────────────────────────────────────────────────

FString UKhaaosDiscordRichPresence::EncodeSecret(const FString& RawId) const
{
        // Khaaos-specific salt prefix
        static const FString SaltPrefix = TEXT("khr_");

        // Convert the raw ID to bytes for encoding
        const TCHAR* RawData = *RawId;
        const int32 RawLen = RawId.Len();

        // Simple XOR encoding with a Khaaos-specific key
        // This provides obfuscation rather than cryptographic security
        static const uint8 XORKey[] = { 0x4B, 0x48, 0x41, 0x41, 0x4F, 0x53 }; // "KHAOS"
        static const int32 XORKeyLen = 6;

        TArray<uint8> EncodedBytes;
        EncodedBytes.SetNumUninitialized(RawLen * sizeof(TCHAR));

        for (int32 i = 0; i < RawLen; ++i)
        {
                const uint8* CharBytes = reinterpret_cast<const uint8*>(&RawData[i]);
                const uint8 KeyByte = XORKey[i % XORKeyLen];

                for (int32 b = 0; b < static_cast<int32>(sizeof(TCHAR)); ++b)
                {
                        EncodedBytes[i * sizeof(TCHAR) + b] = CharBytes[b] ^ KeyByte;
                }
        }

        // Base64 encode the XOR'd bytes
        FString Base64Result = FBase64::Encode(EncodedBytes);

        return SaltPrefix + Base64Result;
}

FString UKhaaosDiscordRichPresence::DecodeSecret(const FString& Secret) const
{
        static const FString SaltPrefix = TEXT("khr_");

        // Verify and strip the salt prefix
        if (!Secret.StartsWith(SaltPrefix))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordRichPresence::DecodeSecret - Invalid secret prefix"));
                return FString();
        }

        FString Base64Data = Secret.RightChop(SaltPrefix.Len());

        // Base64 decode
        TArray<uint8> EncodedBytes;
        if (!FBase64::Decode(Base64Data, EncodedBytes))
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordRichPresence::DecodeSecret - Base64 decode failed"));
                return FString();
        }

        // Reverse XOR decoding
        static const uint8 XORKey[] = { 0x4B, 0x48, 0x41, 0x41, 0x4F, 0x53 }; // "KHAOS"
        static const int32 XORKeyLen = 6;

        const int32 CharCount = EncodedBytes.Num() / static_cast<int32>(sizeof(TCHAR));
        if (CharCount <= 0)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosDiscordRichPresence::DecodeSecret - Decoded byte count invalid"));
                return FString();
        }

        FString Result;
        Result.Reserve(CharCount);

        for (int32 i = 0; i < CharCount; ++i)
        {
                TCHAR DecodedChar = 0;
                const uint8 KeyByte = XORKey[i % XORKeyLen];
                uint8* CharBytes = reinterpret_cast<uint8*>(&DecodedChar);

                for (int32 b = 0; b < static_cast<int32>(sizeof(TCHAR)); ++b)
                {
                        CharBytes[b] = EncodedBytes[i * sizeof(TCHAR) + b] ^ KeyByte;
                }

                Result += DecodedChar;
        }

        return Result;
}

// ─── GetWorldImageKey ────────────────────────────────────────────────────────────

FString UKhaaosDiscordRichPresence::GetWorldImageKey(const FString& WorldName) const
{
        if (WorldName == TEXT("CIGKV"))
        {
                return TEXT("world_cigkv");
        }
        else if (WorldName == TEXT("Barburhen"))
        {
                return TEXT("world_w1_barburhen");
        }
        else if (WorldName == TEXT("Priadus"))
        {
                return TEXT("world_w2_priadus");
        }
        else if (WorldName == TEXT("Ckesalth"))
        {
                return TEXT("world_w3_ckesalth");
        }
        else if (WorldName == TEXT("Arukheea"))
        {
                return TEXT("world_w4_arukheea");
        }

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosDiscordRichPresence::GetWorldImageKey - Unknown world: %s"), *WorldName);
        return TEXT("world_unknown");
}

// ─── GetSpeciesImageKey ──────────────────────────────────────────────────────────

FString UKhaaosDiscordRichPresence::GetSpeciesImageKey(const FString& SpeciesName) const
{
        if (SpeciesName == TEXT("Zheers"))
        {
                return TEXT("species_zheers");
        }
        else if (SpeciesName == TEXT("Onith"))
        {
                return TEXT("species_onith");
        }
        else if (SpeciesName == TEXT("Skeetw"))
        {
                return TEXT("species_skeetw");
        }
        else if (SpeciesName == TEXT("Huran"))
        {
                return TEXT("species_huran");
        }
        else if (SpeciesName == TEXT("Venex"))
        {
                return TEXT("species_venex");
        }
        else if (SpeciesName == TEXT("Khael"))
        {
                return TEXT("species_khael");
        }

        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosDiscordRichPresence::GetSpeciesImageKey - Unknown species: %s"), *SpeciesName);
        return TEXT("species_unknown");
}
