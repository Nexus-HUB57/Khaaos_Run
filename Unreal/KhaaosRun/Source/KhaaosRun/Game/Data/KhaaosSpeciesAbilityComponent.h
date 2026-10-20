// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Data/KhaaosSpeciesDataAsset.h"
#include "KhaaosSpeciesAbilityComponent.generated.h"

/**
 * UKhaaosSpeciesAbilityComponent
 *
 * ActorComponent that manages species-specific abilities for a player.
 * Assigned by KhaaosGameMode::AssignSpecies, this component:
 *   - Holds the current species DataAsset reference
 *   - Manages the passive ability instance
 *   - Provides species-specific stat modifiers
 *   - Tracks species-specific state for all 6 species:
 *       Zheers  - Adaptation timer + stat boost (environment-based)
 *       Onith   - Armor regen timer + rate + delay (scaled armor regen after damage)
 *       Skeetw  - Glide timer
 *       Huran   - Aquatic regen multiplier + in-water state
 *       Venex   - Overclock timer
 *       Khael   - Channeling state + damage amp + energy drain
 */
UCLASS(BlueprintType, ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class UKhaaosSpeciesAbilityComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosSpeciesAbilityComponent();

    // ─── Species Assignment ──────────────────────────────────────────────────

    /** Assign a species to this component. Activates passive ability. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species")
    void SetSpecies(const UKhaaosSpeciesDataAsset* InSpeciesAsset);

    /** Get the current species asset. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species")
    const UKhaaosSpeciesDataAsset* GetSpecies() const { return SpeciesAsset; }

    /** Check if a species is assigned. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species")
    bool HasSpecies() const { return SpeciesAsset != nullptr; }

    // ─── Passive Ability ────────────────────────────────────────────────────

    /** Activate the species passive ability. Called after species assignment. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species")
    void ActivatePassive();

    /** Deactivate the species passive ability. Called on species change or death. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species")
    void DeactivatePassive();

    /** Check if passive is currently active. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species")
    bool IsPassiveActive() const { return bPassiveActive; }

    // ─── Zheers: Adaptation ─────────────────────────────────────────────────

    /** Trigger environment adaptation (Zheers only). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|Zheers")
    void TriggerAdaptation(float Duration, float StatBoost);

    /** Get adaptation time remaining (Zheers only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Zheers")
    float GetAdaptationTimeRemaining() const { return AdaptationTimeRemaining; }

    /** Check if currently adapting (Zheers only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Zheers")
    bool IsAdapting() const { return bIsAdapting; }

    /** Get current adaptation stat boost value (Zheers only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Zheers")
    float GetAdaptationStatBoost() const { return AdaptationStatBoost; }

    // ─── Onith: Armor Regen ─────────────────────────────────────────────────

    /** Trigger armor regeneration after damage delay (Onith only). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|Onith")
    void TriggerArmorRegen(float RegenRate, float Delay);

    /** Get armor regen timer remaining (Onith only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Onith")
    float GetArmorRegenTimer() const { return ArmorRegenTimer; }

    /** Check if armor is currently regenerating (Onith only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Onith")
    bool IsArmorRegenerating() const { return bIsArmorRegenerating; }

    /** Get current armor regen rate (Onith only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Onith")
    float GetArmorRegenRate() const { return ArmorRegenRate; }

    // ─── Skeetw: Glide ──────────────────────────────────────────────────────

    /** Get glide time remaining (Skeetw only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Skeetw")
    float GetGlideTimeRemaining() const { return GlideTimeRemaining; }

    /** Set glide time (Skeetw: called on jump). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|Skeetw")
    void StartGlide(float Duration);

    /** Check if currently gliding (Skeetw only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Skeetw")
    bool IsGliding() const { return bIsGliding; }

    // ─── Huran: Aquatic Regen ───────────────────────────────────────────────

    /** Enter water, activating aquatic regen (Huran only). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|Huran")
    void EnterWater(float RegenMultiplier);

    /** Exit water, deactivating aquatic regen (Huran only). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|Huran")
    void ExitWater();

    /** Check if currently in water (Huran only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Huran")
    bool IsInWater() const { return bIsInWater; }

    /** Get current aquatic regen multiplier (Huran only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Huran")
    float GetAquaticRegenMultiplier() const { return AquaticRegenMultiplier; }

    // ─── Venex: Overclock ───────────────────────────────────────────────────

    /** Get overclock time remaining (Venex only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Venex")
    float GetOverclockTimeRemaining() const { return OverclockTimeRemaining; }

    /** Trigger overclock on elimination (Venex only). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|Venex")
    void TriggerOverclock(float Duration);

    /** Check if currently overclocked (Venex only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Venex")
    bool IsOverclocked() const { return bIsOverclocked; }

    // ─── Khael: Mystic Channeling ───────────────────────────────────────────

    /** Start mystic channeling (Khael only). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|Khael")
    void StartChanneling(float EnergyDrainPerSec, float DamageAmplification);

    /** Stop mystic channeling (Khael only). */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Species|Khael")
    void StopChanneling();

    /** Check if currently channeling (Khael only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Khael")
    bool IsChanneling() const { return bIsChanneling; }

    /** Get channeling damage amplification (Khael only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Khael")
    float GetChannelingDamageAmp() const { return ChannelingDamageAmp; }

    /** Get channeling energy drain per second (Khael only). */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Species|Khael")
    float GetChannelingEnergyDrain() const { return ChannelingEnergyDrainPerSec; }

    // ─── Tick ────────────────────────────────────────────────────────────────

    virtual void TickComponent(float DeltaTime, ELevelTick TickType,
        FActorComponentTickFunction* ThisTickFunction) override;

protected:

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species")
    const UKhaaosSpeciesDataAsset* SpeciesAsset = nullptr;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species")
    bool bPassiveActive = false;

    // ─── Zheers State ───────────────────────────────────────────────────────

    /** Zheers adaptation timer. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Zheers")
    float AdaptationTimeRemaining = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Zheers")
    bool bIsAdapting = false;

    /** Zheers environment-based stat boost while adapting. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Zheers")
    float AdaptationStatBoost = 0.0f;

    // ─── Onith State ────────────────────────────────────────────────────────

    /** Onith armor regen timer (counts down delay then regen duration). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Onith")
    float ArmorRegenTimer = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Onith")
    bool bIsArmorRegenerating = false;

    /** Onith armor regen rate per second. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Onith")
    float ArmorRegenRate = 0.0f;

    /** Onith delay before armor regen begins after damage. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Onith")
    float ArmorRegenDelay = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Onith")
    bool bArmorRegenWaitingOnDelay = false;

    // ─── Skeetw State ───────────────────────────────────────────────────────

    /** Skeetw glide timer. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Skeetw")
    float GlideTimeRemaining = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Skeetw")
    bool bIsGliding = false;

    // ─── Huran State ────────────────────────────────────────────────────────

    /** Huran aquatic regen multiplier while in water. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Huran")
    float AquaticRegenMultiplier = 1.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Huran")
    bool bIsInWater = false;

    // ─── Venex State ────────────────────────────────────────────────────────

    /** Venex overclock timer. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Venex")
    float OverclockTimeRemaining = 0.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Venex")
    bool bIsOverclocked = false;

    // ─── Khael State ────────────────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Khael")
    bool bIsChanneling = false;

    /** Khael damage amplification while channeling. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Khael")
    float ChannelingDamageAmp = 1.0f;

    /** Khael energy drain per second while channeling. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Species|Khael")
    float ChannelingEnergyDrainPerSec = 0.0f;
};
