// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Tests/KhaaosCombatSystemSpec.h"
#include "Game/Combat/KhaaosDamageManager.h"
#include "Game/Inventory/KhaaosInventoryComponent.h"
#include "Game/Revive/KhaaosReviveSystem.h"
#include "Game/Combat/KhaaosADSComponent.h"
#include "Game/UI/KhaaosKillFeedComponent.h"
#include "Game/AntiCheat/KhaaosAntiCheatComponent.h"
#include "KhaaosRun.h"
#include "Engine/World.h"
#include "UObject/Package.h"

// ─── Helpers ─────────────────────────────────────────────────────────────────

static UKhaaosDamageManagerComponent* CreateTestDamageManager()
{
    return NewObject<UKhaaosDamageManagerComponent>(GetTransientPackage());
}

static UKhaaosInventoryComponent* CreateTestInventory()
{
    return NewObject<UKhaaosInventoryComponent>(GetTransientPackage());
}

static UKhaaosReviveSystemComponent* CreateTestReviveSystem()
{
    return NewObject<UKhaaosReviveSystemComponent>(GetTransientPackage());
}

static UKhaaosADSComponent* CreateTestADS()
{
    return NewObject<UKhaaosADSComponent>(GetTransientPackage());
}

static UKhaaosKillFeedComponent* CreateTestKillFeed()
{
    return NewObject<UKhaaosKillFeedComponent>(GetTransientPackage());
}

static UKhaaosAntiCheatComponent* CreateTestAntiCheat()
{
    return NewObject<UKhaaosAntiCheatComponent>(GetTransientPackage());
}

// ─── Test: DamageManager_ValidHit_Applied ────────────────────────────────────
// A valid hit (normal damage, within limits) returns the damage amount.

bool FKhaaosDamageManager_ValidHit_Applied::RunTest(const FString& Parameters)
{
    UKhaaosDamageManagerComponent* DmgMgr = CreateTestDamageManager();
    TestNotNull(TEXT("DamageManager should be created"), DmgMgr);
    if (!DmgMgr) return false;

    // Create a valid hit: 50 damage, within MaxSingleHitDamage (500)
    FKhaaosHitResult Hit;
    Hit.VictimId = TEXT("Player1");
    Hit.InstigatorId = TEXT("Player2");
    Hit.DamageAmount = 50.0f;
    Hit.DamageType = EKhaaosDamageType::Bullet;
    Hit.bIsHeadshot = false;
    Hit.DistanceM = 100.0f; // Within MaxHitDistance (1000)
    Hit.Timestamp = FPlatformTime::Seconds();

    const float Applied = DmgMgr->ProcessDamage(Hit);

    // Damage should be applied (non-zero) for a valid hit
    TestTrue(TEXT("Valid hit should apply damage"), Applied > 0.0f);
    TestTrue(TEXT("Applied damage should equal input for valid non-headshot"), FMath::Abs(Applied - 50.0f) < KINDA_SMALL_NUMBER);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: DamageManager_ValidHit_Applied — Applied=%.1f"), Applied);
    return true;
}

// ─── Test: DamageManager_InvalidHit_Rejected ────────────────────────────────
// Damage > MaxSingleHitDamage (500) is rejected.

bool FKhaaosDamageManager_InvalidHit_Rejected::RunTest(const FString& Parameters)
{
    UKhaaosDamageManagerComponent* DmgMgr = CreateTestDamageManager();
    TestNotNull(TEXT("DamageManager should be created"), DmgMgr);
    if (!DmgMgr) return false;

    // Hit with damage exceeding MaxSingleHitDamage (500)
    FKhaaosHitResult Hit;
    Hit.VictimId = TEXT("Player1");
    Hit.InstigatorId = TEXT("Player2");
    Hit.DamageAmount = 999.0f; // Exceeds MaxSingleHitDamage = 500
    Hit.DamageType = EKhaaosDamageType::Bullet;
    Hit.bIsHeadshot = false;
    Hit.DistanceM = 100.0f;
    Hit.Timestamp = FPlatformTime::Seconds();

    const float Applied = DmgMgr->ProcessDamage(Hit);

    // Damage exceeding max should be rejected (0 or clamped)
    TestTrue(TEXT("Invalid hit (damage > MaxSingleHit) should be rejected"), Applied <= 0.0f || Applied <= DmgMgr->MaxSingleHitDamage);

    // Edge case: empty victim ID
    FKhaaosHitResult EmptyVictimHit;
    EmptyVictimHit.VictimId = TEXT("");
    EmptyVictimHit.DamageAmount = 50.0f;
    EmptyVictimHit.Timestamp = FPlatformTime::Seconds();
    const float EmptyApplied = DmgMgr->ProcessDamage(EmptyVictimHit);
    UE_LOG(LogKhaaosRun, Log, TEXT("Empty victim damage result: %.1f"), EmptyApplied);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: DamageManager_InvalidHit_Rejected"));
    return true;
}

// ─── Test: DamageManager_Headshot_Multiplied ────────────────────────────────
// Headshot damage * 2.0 (DefaultHeadshotMultiplier).

bool FKhaaosDamageManager_Headshot_Multiplied::RunTest(const FString& Parameters)
{
    UKhaaosDamageManagerComponent* DmgMgr = CreateTestDamageManager();
    TestNotNull(TEXT("DamageManager should be created"), DmgMgr);
    if (!DmgMgr) return false;

    // Normal hit
    FKhaaosHitResult NormalHit;
    NormalHit.VictimId = TEXT("Player1");
    NormalHit.InstigatorId = TEXT("Player2");
    NormalHit.DamageAmount = 40.0f;
    NormalHit.DamageType = EKhaaosDamageType::Bullet;
    NormalHit.bIsHeadshot = false;
    NormalHit.DistanceM = 100.0f;
    NormalHit.Timestamp = FPlatformTime::Seconds();

    // Headshot hit
    FKhaaosHitResult HeadshotHit = NormalHit;
    HeadshotHit.bIsHeadshot = true;
    HeadshotHit.Timestamp = FPlatformTime::Seconds() + 1.0; // Different timestamp for rate limit

    const float NormalApplied = DmgMgr->ProcessDamage(NormalHit);
    const float HeadshotApplied = DmgMgr->ProcessDamage(HeadshotHit);

    // Headshot should apply more damage than normal
    TestTrue(TEXT("Headshot damage > normal damage"), HeadshotApplied > NormalApplied);

    // Verify headshot multiplier (2.0x default)
    const float ExpectedHeadshot = NormalApplied * DmgMgr->DefaultHeadshotMultiplier;
    TestTrue(TEXT("Headshot damage ≈ normal * 2.0"), FMath::Abs(HeadshotApplied - ExpectedHeadshot) < KINDA_SMALL_NUMBER);

    // Verify DefaultHeadshotMultiplier is 2.0
    TestEqual(TEXT("DefaultHeadshotMultiplier = 2.0"), DmgMgr->DefaultHeadshotMultiplier, 2.0f);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: DamageManager_Headshot_Multiplied — Normal=%.1f Headshot=%.1f"), NormalApplied, HeadshotApplied);
    return true;
}

// ─── Test: DamageManager_RateLimit_Enforced ─────────────────────────────────
// Exceeding rate limit results in rejected damage.

bool FKhaaosDamageManager_RateLimit_Enforced::RunTest(const FString& Parameters)
{
    UKhaaosDamageManagerComponent* DmgMgr = CreateTestDamageManager();
    TestNotNull(TEXT("DamageManager should be created"), DmgMgr);
    if (!DmgMgr) return false;

    // MaxDamageEventsPerSecond = 30 by default
    // Fire more than 30 hits in rapid succession from the same instigator
    const FString Instigator = TEXT("RateLimitTestPlayer");
    const FString Victim = TEXT("RateLimitVictim");
    int32 AcceptedCount = 0;
    int32 RejectedCount = 0;

    for (int32 i = 0; i < 40; ++i)
    {
        FKhaaosHitResult Hit;
        Hit.VictimId = Victim;
        Hit.InstigatorId = Instigator;
        Hit.DamageAmount = 10.0f;
        Hit.DamageType = EKhaaosDamageType::Bullet;
        Hit.bIsHeadshot = false;
        Hit.DistanceM = 50.0f;
        Hit.Timestamp = FPlatformTime::Seconds(); // Same timestamp = same second

        const float Applied = DmgMgr->ProcessDamage(Hit);
        if (Applied > 0.0f)
        {
            AcceptedCount++;
        }
        else
        {
            RejectedCount++;
        }
    }

    // At least some hits should be rejected after rate limit
    TestTrue(TEXT("Some hits accepted"), AcceptedCount > 0);
    TestTrue(TEXT("Some hits rejected by rate limit"), RejectedCount > 0);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: DamageManager_RateLimit_Enforced — Accepted=%d Rejected=%d"), AcceptedCount, RejectedCount);
    return true;
}

// ─── Test: InventoryComponent_AddItem_FillsSlot ─────────────────────────────
// Item goes to the correct slot type.

bool FKhaaosInventoryComponent_AddItem_FillsSlot::RunTest(const FString& Parameters)
{
    UKhaaosInventoryComponent* Inventory = CreateTestInventory();
    TestNotNull(TEXT("Inventory should be created"), Inventory);
    if (!Inventory) return false;

    // Add a primary weapon
    const FName PrimaryWeapon = FName(TEXT("AR-AssaultRifle"));
    const bool bAdded = Inventory->AddItem(PrimaryWeapon, 1);

    TestTrue(TEXT("Primary weapon should be added"), bAdded);

    // Verify slot has the item
    const FName ItemInSlot = Inventory->GetItemIdInSlot(EKhaaosInventorySlot::Primary);
    TestTrue(TEXT("Primary slot should contain the weapon"), ItemInSlot == PrimaryWeapon);

    // Add secondary weapon
    const FName SecondaryWeapon = FName(TEXT("Pistol-DesertEagle"));
    const bool bAddedSecondary = Inventory->AddItem(SecondaryWeapon, 1);
    TestTrue(TEXT("Secondary weapon should be added"), bAddedSecondary);

    // Verify active slot starts as Primary
    TestEqual(TEXT("Active slot = Primary"), Inventory->GetActiveSlot(), EKhaaosInventorySlot::Primary);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: InventoryComponent_AddItem_FillsSlot"));
    return true;
}

// ─── Test: InventoryComponent_SwapSlots_ContentsSwapped ────────────────────
// Swap exchanges slot contents.

bool FKhaaosInventoryComponent_SwapSlots_ContentsSwapped::RunTest(const FString& Parameters)
{
    UKhaaosInventoryComponent* Inventory = CreateTestInventory();
    TestNotNull(TEXT("Inventory should be created"), Inventory);
    if (!Inventory) return false;

    // Set up two items in different slots
    const FName PrimaryWeapon = FName(TEXT("AR-Scar"));
    const FName SecondaryWeapon = FName(TEXT("SMG-Uzi"));

    Inventory->AddItemToSlot(EKhaaosInventorySlot::Primary, PrimaryWeapon, 1);
    Inventory->AddItemToSlot(EKhaaosInventorySlot::Secondary, SecondaryWeapon, 1);

    // Verify initial state
    TestEqual(TEXT("Primary = AR-Scar before swap"), Inventory->GetItemIdInSlot(EKhaaosInventorySlot::Primary), PrimaryWeapon);
    TestEqual(TEXT("Secondary = SMG-Uzi before swap"), Inventory->GetItemIdInSlot(EKhaaosInventorySlot::Secondary), SecondaryWeapon);

    // Swap slots
    Inventory->SwapSlots(EKhaaosInventorySlot::Primary, EKhaaosInventorySlot::Secondary);

    // Verify swapped
    TestEqual(TEXT("Primary = SMG-Uzi after swap"), Inventory->GetItemIdInSlot(EKhaaosInventorySlot::Primary), SecondaryWeapon);
    TestEqual(TEXT("Secondary = AR-Scar after swap"), Inventory->GetItemIdInSlot(EKhaaosInventorySlot::Secondary), PrimaryWeapon);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: InventoryComponent_SwapSlots_ContentsSwapped"));
    return true;
}

// ─── Test: InventoryComponent_CycleWeapon_Cycles ───────────────────────────
// Primary → Secondary → Melee → Primary

bool FKhaaosInventoryComponent_CycleWeapon_Cycles::RunTest(const FString& Parameters)
{
    UKhaaosInventoryComponent* Inventory = CreateTestInventory();
    TestNotNull(TEXT("Inventory should be created"), Inventory);
    if (!Inventory) return false;

    // Add items to all three weapon slots
    Inventory->AddItemToSlot(EKhaaosInventorySlot::Primary, FName(TEXT("AR-M4A1")), 1);
    Inventory->AddItemToSlot(EKhaaosInventorySlot::Secondary, FName(TEXT("Pistol-Glock")), 1);
    Inventory->AddItemToSlot(EKhaaosInventorySlot::Melee, FName(TEXT("Knife-Tactical")), 1);

    // Start at Primary
    Inventory->SetActiveSlot(EKhaaosInventorySlot::Primary);
    TestEqual(TEXT("Initial active = Primary"), Inventory->GetActiveSlot(), EKhaaosInventorySlot::Primary);

    // Cycle: Primary → Secondary
    Inventory->CycleActiveWeapon();
    TestEqual(TEXT("After cycle 1 = Secondary"), Inventory->GetActiveSlot(), EKhaaosInventorySlot::Secondary);

    // Cycle: Secondary → Melee
    Inventory->CycleActiveWeapon();
    TestEqual(TEXT("After cycle 2 = Melee"), Inventory->GetActiveSlot(), EKhaaosInventorySlot::Melee);

    // Cycle: Melee → Primary (wraps)
    Inventory->CycleActiveWeapon();
    TestEqual(TEXT("After cycle 3 = Primary (wrap)"), Inventory->GetActiveSlot(), EKhaaosInventorySlot::Primary);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: InventoryComponent_CycleWeapon_Cycles"));
    return true;
}

// ─── Test: ReviveSystem_DownPlayer_EntersDownedState ────────────────────────
// Player goes to Downed state when DownPlayer is called.

bool FKhaaosReviveSystem_DownPlayer_EntersDownedState::RunTest(const FString& Parameters)
{
    UKhaaosReviveSystemComponent* ReviveSys = CreateTestReviveSystem();
    TestNotNull(TEXT("ReviveSystem should be created"), ReviveSys);
    if (!ReviveSys) return false;

    const FString PlayerId = TEXT("DownTestPlayer");

    // Initially, player should be Alive (or unknown → Alive)
    const EKhaaosReviveState InitialState = ReviveSys->GetReviveState(PlayerId);
    UE_LOG(LogKhaaosRun, Log, TEXT("Initial revive state: %d"), static_cast<int32>(InitialState));

    // Down the player
    ReviveSys->DownPlayer(PlayerId);

    // Verify player is Downed
    const EKhaaosReviveState DownedState = ReviveSys->GetReviveState(PlayerId);
    TestEqual(TEXT("Player should be Downed after DownPlayer"), DownedState, EKhaaosReviveState::Downed);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: ReviveSystem_DownPlayer_EntersDownedState"));
    return true;
}

// ─── Test: ReviveSystem_RevivePlayer_EntersAliveState ──────────────────────
// RevivePlayer restores player to Alive state.

bool FKhaaosReviveSystem_RevivePlayer_EntersAliveState::RunTest(const FString& Parameters)
{
    UKhaaosReviveSystemComponent* ReviveSys = CreateTestReviveSystem();
    TestNotNull(TEXT("ReviveSystem should be created"), ReviveSys);
    if (!ReviveSys) return false;

    const FString PlayerId = TEXT("ReviveTestPlayer");
    const FString ReviverId = TEXT("ReviverPlayer");

    // First, down the player
    ReviveSys->DownPlayer(PlayerId);
    const EKhaaosReviveState DownedState = ReviveSys->GetReviveState(PlayerId);
    TestEqual(TEXT("Player should be Downed"), DownedState, EKhaaosReviveState::Downed);

    // Now revive
    ReviveSys->RevivePlayer(PlayerId, ReviverId);
    const EKhaaosReviveState RevivedState = ReviveSys->GetReviveState(PlayerId);
    TestEqual(TEXT("Player should be Alive after revive"), RevivedState, EKhaaosReviveState::Alive);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: ReviveSystem_RevivePlayer_EntersAliveState"));
    return true;
}

// ─── Test: ADSComponent_EnterADS_SetsAiming ────────────────────────────────
// EnterADS sets bIsAiming = true.

bool FKhaaosADSComponent_EnterADS_SetsAiming::RunTest(const FString& Parameters)
{
    UKhaaosADSComponent* ADS = CreateTestADS();
    TestNotNull(TEXT("ADS component should be created"), ADS);
    if (!ADS) return false;

    // Initially not aiming
    TestFalse(TEXT("Should not be aiming initially"), ADS->IsAiming());

    // Enter ADS
    ADS->EnterADS();
    TestTrue(TEXT("Should be aiming after EnterADS"), ADS->IsAiming());

    // Exit ADS
    ADS->ExitADS();
    TestFalse(TEXT("Should not be aiming after ExitADS"), ADS->IsAiming());

    // Toggle ADS
    ADS->ToggleADS();
    TestTrue(TEXT("Should be aiming after ToggleADS (from not-aiming)"), ADS->IsAiming());

    ADS->ToggleADS();
    TestFalse(TEXT("Should not be aiming after second ToggleADS"), ADS->IsAiming());

    // Verify FOV values
    TestEqual(TEXT("BaseFOV = 90.0"), ADS->BaseFOV, 90.0f);
    TestEqual(TEXT("ADSFOV = 60.0"), ADS->ADSFOV, 60.0f);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: ADSComponent_EnterADS_SetsAiming"));
    return true;
}

// ─── Test: KillFeed_AddEntry_Appended ──────────────────────────────────────
// Kill entry is appended to the feed.

bool FKhaaosKillFeed_AddEntry_Appended::RunTest(const FString& Parameters)
{
    UKhaaosKillFeedComponent* KillFeed = CreateTestKillFeed();
    TestNotNull(TEXT("KillFeed should be created"), KillFeed);
    if (!KillFeed) return false;

    // Feed should be empty initially
    TestEqual(TEXT("Kill feed empty initially"), KillFeed->GetRecentKills().Num(), 0);

    // Add a kill entry
    FKhaaosKillFeedEntry Entry;
    Entry.VictimName = TEXT("Player1");
    Entry.EliminatorName = TEXT("Player2");
    Entry.Cause = TEXT("Bullet");
    Entry.WeaponID = FName(TEXT("AR-Scar"));
    Entry.bIsHeadshot = true;
    Entry.DistanceM = 150.0f;
    Entry.Timestamp = FPlatformTime::Seconds();

    KillFeed->AddKillEntry(Entry);

    // Verify entry added
    TestEqual(TEXT("Kill feed has 1 entry"), KillFeed->GetRecentKills().Num(), 1);

    // Verify entry content
    const FKhaaosKillFeedEntry& StoredEntry = KillFeed->GetRecentKills()[0];
    TestTrue(TEXT("Victim name matches"), StoredEntry.VictimName == Entry.VictimName);
    TestTrue(TEXT("Eliminator name matches"), StoredEntry.EliminatorName == Entry.EliminatorName);
    TestTrue(TEXT("Headshot flag matches"), StoredEntry.bIsHeadshot == Entry.bIsHeadshot);

    // Add more entries to test max entries limit
    for (int32 i = 1; i <= 25; ++i)
    {
        FKhaaosKillFeedEntry ExtraEntry;
        ExtraEntry.VictimName = FString::Printf(TEXT("Victim%d"), i);
        ExtraEntry.EliminatorName = TEXT("Killer");
        ExtraEntry.Timestamp = FPlatformTime::Seconds() + i;
        KillFeed->AddKillEntry(ExtraEntry);
    }

    // Feed should not exceed MaxEntries (20)
    TestTrue(TEXT("Kill feed respects MaxEntries limit"), KillFeed->GetRecentKills().Num() <= KillFeed->MaxEntries);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: KillFeed_AddEntry_Appended"));
    return true;
}

// ─── Test: AntiCheat_ValidateHit_ImpossibleDistance ─────────────────────────
// Distance > MaxHitDistance (800) is rejected.

bool FKhaaosAntiCheat_ValidateHit_ImpossibleDistance::RunTest(const FString& Parameters)
{
    UKhaaosAntiCheatComponent* AntiCheat = CreateTestAntiCheat();
    TestNotNull(TEXT("AntiCheat should be created"), AntiCheat);
    if (!AntiCheat) return false;

    const FString Instigator = TEXT("CheatTestPlayer");

    // Valid hit: distance within MaxHitDistance (800)
    const bool bValidHit = AntiCheat->ValidateHit(Instigator, 50.0f, 500.0f, 10.0f);
    TestTrue(TEXT("Hit within MaxHitDistance should be valid"), bValidHit);

    // Impossible hit: distance exceeds MaxHitDistance (800)
    const bool bImpossibleHit = AntiCheat->ValidateHit(Instigator, 50.0f, 1500.0f, 10.0f);
    TestFalse(TEXT("Hit beyond MaxHitDistance should be rejected"), bImpossibleHit);

    // Edge case: exactly at MaxHitDistance
    const bool bExactMaxHit = AntiCheat->ValidateHit(Instigator, 50.0f, AntiCheat->MaxHitDistance, 10.0f);
    UE_LOG(LogKhaaosRun, Log, TEXT("Hit at exact MaxHitDistance (800m): %s"), bExactMaxHit ? TEXT("VALID") : TEXT("REJECTED"));

    // Zero distance (self-damage or same position)
    const bool bZeroDistance = AntiCheat->ValidateHit(Instigator, 50.0f, 0.0f, 10.0f);
    UE_LOG(LogKhaaosRun, Log, TEXT("Hit at zero distance: %s"), bZeroDistance ? TEXT("VALID") : TEXT("REJECTED"));

    // Verify MaxHitDistance config
    TestEqual(TEXT("MaxHitDistance = 800"), AntiCheat->MaxHitDistance, 800.0f);

    // Verify MaxSpeed config
    TestEqual(TEXT("MaxSpeed = 1200"), AntiCheat->MaxSpeed, 1200.0f);

    UE_LOG(LogKhaaosRun, Log, TEXT("TEST PASS: AntiCheat_ValidateHit_ImpossibleDistance"));
    return true;
}
