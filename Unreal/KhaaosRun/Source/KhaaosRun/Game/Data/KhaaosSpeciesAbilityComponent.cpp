// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/Data/KhaaosSpeciesAbilityComponent.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "KhaaosRun.h"

UKhaaosSpeciesAbilityComponent::UKhaaosSpeciesAbilityComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    SpeciesAsset = nullptr;
    bPassiveActive = false;

    // Zheers
    AdaptationTimeRemaining = 0.0f;
    bIsAdapting = false;
    AdaptationStatBoost = 0.0f;

    // Onith
    ArmorRegenTimer = 0.0f;
    bIsArmorRegenerating = false;
    ArmorRegenRate = 0.0f;
    ArmorRegenDelay = 0.0f;
    bArmorRegenWaitingOnDelay = false;

    // Skeetw
    GlideTimeRemaining = 0.0f;
    bIsGliding = false;

    // Huran
    AquaticRegenMultiplier = 1.0f;
    bIsInWater = false;

    // Venex
    OverclockTimeRemaining = 0.0f;
    bIsOverclocked = false;

    // Khael
    bIsChanneling = false;
    ChannelingDamageAmp = 1.0f;
    ChannelingEnergyDrainPerSec = 0.0f;
}

void UKhaaosSpeciesAbilityComponent::SetSpecies(const UKhaaosSpeciesDataAsset* InSpeciesAsset)
{
    if (!InSpeciesAsset) return;

    // Deactivate old passive if switching species
    if (bPassiveActive)
    {
        DeactivatePassive();
    }

    SpeciesAsset = InSpeciesAsset;

    // Activate new passive
    ActivatePassive();

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::SetSpecies - %s (HP=%d, Energy=%d, Speed=%.1f)"),
        *SpeciesAsset->SpeciesID.ToString(),
        SpeciesAsset->BaseHealth, SpeciesAsset->BaseEnergy, SpeciesAsset->BaseSpeed);
}

void UKhaaosSpeciesAbilityComponent::ActivatePassive()
{
    if (!SpeciesAsset || bPassiveActive) return;

    bPassiveActive = true;

    // Species-specific passive initialization
    const FName& SpeciesID = SpeciesAsset->SpeciesID;

    if (SpeciesID == FName("Zheers"))
    {
        // Zheers: adaptation passive starts inactive, triggered by environment
        bIsAdapting = false;
        AdaptationTimeRemaining = 0.0f;
        AdaptationStatBoost = 0.0f;
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::ActivatePassive - Zheers adaptation passive ready"));
    }
    else if (SpeciesID == FName("Onith"))
    {
        // Onith: armor regen starts inactive, triggered on damage taken
        bIsArmorRegenerating = false;
        bArmorRegenWaitingOnDelay = false;
        ArmorRegenTimer = 0.0f;
        ArmorRegenRate = 0.0f;
        ArmorRegenDelay = 0.0f;
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::ActivatePassive - Onith armor regen passive ready"));
    }
    else if (SpeciesID == FName("Skeetw"))
    {
        // Skeetw: glide starts inactive, triggered on jump
        bIsGliding = false;
        GlideTimeRemaining = 0.0f;
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::ActivatePassive - Skeetw glide passive ready"));
    }
    else if (SpeciesID == FName("Huran"))
    {
        // Huran: aquatic regen starts inactive, triggered by entering water
        bIsInWater = false;
        AquaticRegenMultiplier = 1.0f;
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::ActivatePassive - Huran aquatic regen passive ready"));
    }
    else if (SpeciesID == FName("Venex"))
    {
        // Venex: overclock starts inactive, triggered on elimination
        bIsOverclocked = false;
        OverclockTimeRemaining = 0.0f;
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::ActivatePassive - Venex overclock passive ready"));
    }
    else if (SpeciesID == FName("Khael"))
    {
        // Khael: channeling starts inactive, triggered manually
        bIsChanneling = false;
        ChannelingDamageAmp = 1.0f;
        ChannelingEnergyDrainPerSec = 0.0f;
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::ActivatePassive - Khael mystic channeling passive ready"));
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::ActivatePassive - %s passive activated"),
        *SpeciesAsset->SpeciesID.ToString());
}

void UKhaaosSpeciesAbilityComponent::DeactivatePassive()
{
    bPassiveActive = false;

    // Reset Zheers state
    bIsAdapting = false;
    AdaptationTimeRemaining = 0.0f;
    AdaptationStatBoost = 0.0f;

    // Reset Onith state
    bIsArmorRegenerating = false;
    bArmorRegenWaitingOnDelay = false;
    ArmorRegenTimer = 0.0f;
    ArmorRegenRate = 0.0f;
    ArmorRegenDelay = 0.0f;

    // Reset Skeetw state
    bIsGliding = false;
    GlideTimeRemaining = 0.0f;

    // Reset Huran state
    bIsInWater = false;
    AquaticRegenMultiplier = 1.0f;

    // Reset Venex state
    bIsOverclocked = false;
    OverclockTimeRemaining = 0.0f;

    // Reset Khael state
    bIsChanneling = false;
    ChannelingDamageAmp = 1.0f;
    ChannelingEnergyDrainPerSec = 0.0f;

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::DeactivatePassive - Passive deactivated"));
}

// ─── Zheers: Adaptation ──────────────────────────────────────────────────────

void UKhaaosSpeciesAbilityComponent::TriggerAdaptation(float Duration, float StatBoost)
{
    if (!SpeciesAsset || SpeciesAsset->SpeciesID != FName("Zheers")) return;

    bIsAdapting = true;
    AdaptationTimeRemaining = Duration;
    AdaptationStatBoost = StatBoost;

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::TriggerAdaptation - Adapting for %.1fs with %.1f stat boost"),
        Duration, StatBoost);
}

// ─── Onith: Armor Regen ──────────────────────────────────────────────────────

void UKhaaosSpeciesAbilityComponent::TriggerArmorRegen(float RegenRate, float Delay)
{
    if (!SpeciesAsset || SpeciesAsset->SpeciesID != FName("Onith")) return;

    // If already regenerating, just update the rate
    if (bIsArmorRegenerating)
    {
        ArmorRegenRate = RegenRate;
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::TriggerArmorRegen - Updated regen rate to %.1f"), RegenRate);
        return;
    }

    ArmorRegenRate = RegenRate;
    ArmorRegenDelay = Delay;

    if (Delay > 0.0f)
    {
        // Start delay timer before regen begins
        bArmorRegenWaitingOnDelay = true;
        ArmorRegenTimer = Delay;
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::TriggerArmorRegen - Armor regen in %.1fs (rate=%.1f/s)"),
            Delay, RegenRate);
    }
    else
    {
        // No delay, start regen immediately
        bArmorRegenWaitingOnDelay = false;
        bIsArmorRegenerating = true;
        ArmorRegenTimer = 0.0f;
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::TriggerArmorRegen - Armor regen started (rate=%.1f/s)"),
            RegenRate);
    }
}

// ─── Skeetw: Glide ───────────────────────────────────────────────────────────

void UKhaaosSpeciesAbilityComponent::StartGlide(float Duration)
{
    if (!SpeciesAsset || SpeciesAsset->SpeciesID != FName("Skeetw")) return;

    bIsGliding = true;
    GlideTimeRemaining = Duration;

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::StartGlide - Glide for %.1fs"), Duration);
}

// ─── Huran: Aquatic Regen ────────────────────────────────────────────────────

void UKhaaosSpeciesAbilityComponent::EnterWater(float RegenMultiplier)
{
    if (!SpeciesAsset || SpeciesAsset->SpeciesID != FName("Huran")) return;

    bIsInWater = true;
    AquaticRegenMultiplier = RegenMultiplier;

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::EnterWater - Aquatic regen x%.1f"), RegenMultiplier);
}

void UKhaaosSpeciesAbilityComponent::ExitWater()
{
    if (!SpeciesAsset || SpeciesAsset->SpeciesID != FName("Huran")) return;

    bIsInWater = false;
    AquaticRegenMultiplier = 1.0f;

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::ExitWater - Left water, regen normalized"));
}

// ─── Venex: Overclock ────────────────────────────────────────────────────────

void UKhaaosSpeciesAbilityComponent::TriggerOverclock(float Duration)
{
    if (!SpeciesAsset || SpeciesAsset->SpeciesID != FName("Venex")) return;

    bIsOverclocked = true;
    OverclockTimeRemaining = Duration;

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::TriggerOverclock - Overclock for %.1fs"), Duration);
}

// ─── Khael: Mystic Channeling ────────────────────────────────────────────────

void UKhaaosSpeciesAbilityComponent::StartChanneling(float EnergyDrainPerSec, float DamageAmplification)
{
    if (!SpeciesAsset || SpeciesAsset->SpeciesID != FName("Khael")) return;

    bIsChanneling = true;
    ChannelingEnergyDrainPerSec = EnergyDrainPerSec;
    ChannelingDamageAmp = DamageAmplification;

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::StartChanneling - Channeling (drain=%.1f/s, amp=%.1f)"),
        EnergyDrainPerSec, DamageAmplification);
}

void UKhaaosSpeciesAbilityComponent::StopChanneling()
{
    if (!SpeciesAsset || SpeciesAsset->SpeciesID != FName("Khael")) return;

    bIsChanneling = false;
    ChannelingDamageAmp = 1.0f;
    ChannelingEnergyDrainPerSec = 0.0f;

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesAbilityComponent::StopChanneling - Channeling stopped"));
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

void UKhaaosSpeciesAbilityComponent::TickComponent(float DeltaTime, ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    // Tick Zheers adaptation
    if (bIsAdapting)
    {
        AdaptationTimeRemaining -= DeltaTime;
        if (AdaptationTimeRemaining <= 0.0f)
        {
            bIsAdapting = false;
            AdaptationTimeRemaining = 0.0f;
            AdaptationStatBoost = 0.0f;
        }
    }

    // Tick Onith armor regen
    if (bArmorRegenWaitingOnDelay)
    {
        ArmorRegenTimer -= DeltaTime;
        if (ArmorRegenTimer <= 0.0f)
        {
            bArmorRegenWaitingOnDelay = false;
            bIsArmorRegenerating = true;
            ArmorRegenTimer = 0.0f;
        }
    }
    // Armor regen itself persists until explicitly stopped or deactivated
    // (the timer-based regen is driven externally by the health/armor component
    //  reading ArmorRegenRate each frame; no duration timer needed here)

    // Tick Skeetw glide
    if (bIsGliding)
    {
        GlideTimeRemaining -= DeltaTime;
        if (GlideTimeRemaining <= 0.0f)
        {
            bIsGliding = false;
            GlideTimeRemaining = 0.0f;
        }
    }

    // Huran aquatic regen is state-driven (in-water flag + multiplier),
    // no timer to tick — external systems read IsInWater() / GetAquaticRegenMultiplier()

    // Tick Venex overclock
    if (bIsOverclocked)
    {
        OverclockTimeRemaining -= DeltaTime;
        if (OverclockTimeRemaining <= 0.0f)
        {
            bIsOverclocked = false;
            OverclockTimeRemaining = 0.0f;
        }
    }

    // Khael channeling has no timer — it persists until StopChanneling() is called
    // or energy is depleted externally. The component exposes state for other systems.
}
