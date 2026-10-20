// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/Data/KhaaosWeaponComponent.h"
#include "KhaaosRun.h"

// ═══════════════════════════════════════════════════════════════════════════════
// Constructor
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosWeaponComponent::UKhaaosWeaponComponent()
{
    PrimaryComponentTick.bCanEverTick = true;

    CurrentWeapon      = nullptr;
    CurrentAmmo        = 0;
    ReserveAmmo        = 0;
    MaxReserveAmmo     = 0;
    bIsReloading       = false;
    ReloadTimeRemaining = 0.0f;

    ActiveFireMode     = EWeaponFireMode::Auto;

    bIsBurstFiring     = false;
    BurstShotsRemaining = 0;
    BurstShotsFired    = 0;
    BurstTimeout       = 0.1f;
    BurstTimeoutRemaining = 0.0f;

    EquippedAttachments.Empty();

    HeatLevel          = 0.0f;
    bIsOverheated      = false;
    OverheatThreshold  = 100.0f;
    HeatDecayRate      = 15.0f;
    HeatPerShot        = 5.0f;
    OverheatCooldownDelay   = 2.0f;
    OverheatCooldownRemaining = 0.0f;

    AccumulatedRecoilPitch = 0.0f;
    AccumulatedRecoilYaw   = 0.0f;
    ShotsFired             = 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Weapon Assignment
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosWeaponComponent::EquipWeapon(const UKhaaosWeaponDataAsset* WeaponAsset)
{
    if (!WeaponAsset) return;

    // Cancel any active reload
    CancelReload();

    // Cancel any active burst
    bIsBurstFiring     = false;
    BurstShotsRemaining = 0;
    BurstShotsFired    = 0;
    BurstTimeoutRemaining = 0.0f;

    // Assign weapon
    CurrentWeapon = WeaponAsset;
    CurrentAmmo = WeaponAsset->MagazineSize;
    MaxReserveAmmo = WeaponAsset->MagazineSize * 5; // 5 magazines reserve
    ReserveAmmo = MaxReserveAmmo;

    // Set fire mode from weapon data
    ActiveFireMode = WeaponAsset->FireMode;

    // Reset recoil state
    AccumulatedRecoilPitch = 0.0f;
    AccumulatedRecoilYaw   = 0.0f;
    ShotsFired             = 0;

    // Reset overheat
    HeatLevel              = 0.0f;
    bIsOverheated          = false;
    OverheatCooldownRemaining = 0.0f;

    // Clear all equipped attachments
    EquippedAttachments.Empty();

    // Broadcast state changes
    OnWeaponSwitched.Broadcast(WeaponAsset->WeaponID);
    OnAmmoChanged.Broadcast(CurrentAmmo, WeaponAsset->MagazineSize);

    UE_LOG(LogKhaaosRun, Log, TEXT("WeaponComponent::EquipWeapon - %s (Dmg=%d, Mag=%d, Mode=%d)"),
        *WeaponAsset->WeaponID.ToString(), WeaponAsset->Damage,
        WeaponAsset->MagazineSize, static_cast<int32>(ActiveFireMode));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Ammo
// ═══════════════════════════════════════════════════════════════════════════════

bool UKhaaosWeaponComponent::CanFire() const
{
    if (!CurrentWeapon) return false;
    if (CurrentAmmo <= 0) return false;
    if (bIsReloading)    return false;
    if (bIsOverheated)   return false;
    return true;
}

bool UKhaaosWeaponComponent::ConsumeAmmo()
{
    if (!CanFire()) return false;

    --CurrentAmmo;
    ++ShotsFired;
    OnAmmoChanged.Broadcast(CurrentAmmo, CurrentWeapon->MagazineSize);

    // Add heat per shot (modified by attachments)
    const float ModifiedHeatPerShot = HeatPerShot + GetAttachmentStatModifier(FName("HeatPerShot"));
    AddHeat(ModifiedHeatPerShot);

    // Auto-reload when empty
    if (CurrentAmmo <= 0 && ReserveAmmo > 0)
    {
        StartReload();
    }

    return true;
}

bool UKhaaosWeaponComponent::StartReload()
{
    if (!CurrentWeapon) return false;
    if (bIsReloading) return false;
    if (CurrentAmmo >= CurrentWeapon->MagazineSize) return false;
    if (ReserveAmmo <= 0) return false;
    // Cannot reload while overheated
    if (bIsOverheated) return false;

    bIsReloading = true;
    ReloadTimeRemaining = CurrentWeapon->ReloadTime;

    UE_LOG(LogKhaaosRun, Log, TEXT("WeaponComponent::StartReload - %.1fs"), CurrentWeapon->ReloadTime);
    return true;
}

void UKhaaosWeaponComponent::CancelReload()
{
    bIsReloading = false;
    ReloadTimeRemaining = 0.0f;
}

float UKhaaosWeaponComponent::GetReloadProgress() const
{
    if (!CurrentWeapon || CurrentWeapon->ReloadTime <= 0.0f) return 1.0f;
    return 1.0f - (ReloadTimeRemaining / CurrentWeapon->ReloadTime);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fire Mode
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosWeaponComponent::CycleFireMode()
{
    if (!CurrentWeapon) return;

    const EWeaponFireMode OldMode = ActiveFireMode;

    // Cycle: Semi → Auto → Burst → Semi
    switch (ActiveFireMode)
    {
    case EWeaponFireMode::Semi:
        ActiveFireMode = EWeaponFireMode::Auto;
        break;
    case EWeaponFireMode::Auto:
        ActiveFireMode = EWeaponFireMode::Burst;
        break;
    case EWeaponFireMode::Burst:
        ActiveFireMode = EWeaponFireMode::Semi;
        break;
    default:
        // Melee / Charge → wrap to Semi
        ActiveFireMode = EWeaponFireMode::Semi;
        break;
    }

    // Cancel any active burst when switching away from burst
    if (OldMode == EWeaponFireMode::Burst && ActiveFireMode != EWeaponFireMode::Burst)
    {
        bIsBurstFiring      = false;
        BurstShotsRemaining = 0;
        BurstShotsFired     = 0;
    }

    OnFireModeChanged.Broadcast(OldMode, ActiveFireMode);

    UE_LOG(LogKhaaosRun, Log, TEXT("WeaponComponent::CycleFireMode - %d → %d"),
        static_cast<int32>(OldMode), static_cast<int32>(ActiveFireMode));
}

void UKhaaosWeaponComponent::SetFireMode(EWeaponFireMode NewMode)
{
    if (!CurrentWeapon) return;
    if (ActiveFireMode == NewMode) return;

    const EWeaponFireMode OldMode = ActiveFireMode;
    ActiveFireMode = NewMode;

    // Cancel active burst if switching away from burst
    if (OldMode == EWeaponFireMode::Burst && NewMode != EWeaponFireMode::Burst)
    {
        bIsBurstFiring      = false;
        BurstShotsRemaining = 0;
        BurstShotsFired     = 0;
    }

    OnFireModeChanged.Broadcast(OldMode, ActiveFireMode);

    UE_LOG(LogKhaaosRun, Log, TEXT("WeaponComponent::SetFireMode - %d → %d"),
        static_cast<int32>(OldMode), static_cast<int32>(ActiveFireMode));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Burst Fire
// ═══════════════════════════════════════════════════════════════════════════════

bool UKhaaosWeaponComponent::StartBurst()
{
    if (!CurrentWeapon) return false;
    if (bIsBurstFiring) return false;
    if (ActiveFireMode != EWeaponFireMode::Burst) return false;
    if (!CanFire()) return false;

    bIsBurstFiring      = true;
    BurstShotsRemaining = CurrentWeapon->BurstCount;
    BurstShotsFired     = 0;
    BurstTimeoutRemaining = BurstTimeout;

    return true;
}

bool UKhaaosWeaponComponent::FireBurstShot()
{
    if (!bIsBurstFiring) return false;
    if (BurstShotsRemaining <= 0) return false;
    if (!CanFire()) return false;

    // Consume ammo and apply heat (via ConsumeAmmo)
    if (!ConsumeAmmo()) return false;

    // Apply recoil for this burst shot
    AddRecoil();

    --BurstShotsRemaining;
    ++BurstShotsFired;

    // Reset burst timeout on each shot
    BurstTimeoutRemaining = BurstTimeout;

    // Burst complete
    if (BurstShotsRemaining <= 0)
    {
        bIsBurstFiring      = false;
        BurstShotsFired     = 0;
    }

    return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Attachment System
// ═══════════════════════════════════════════════════════════════════════════════

bool UKhaaosWeaponComponent::EquipAttachment(FName SlotName, const FKhaaosWeaponAttachment& Attachment)
{
    if (!CurrentWeapon) return false;
    if (SlotName.IsNone()) return false;

    // Check if slot already occupied — unequip first
    if (EquippedAttachments.Contains(SlotName))
    {
        UnequipAttachment(SlotName);
    }

    EquippedAttachments.Add(SlotName, Attachment);
    OnAttachmentChanged.Broadcast(SlotName, Attachment, true);

    UE_LOG(LogKhaaosRun, Log, TEXT("WeaponComponent::EquipAttachment - Slot:%s ID:%s"),
        *SlotName.ToString(), *Attachment.AttachmentID.ToString());

    return true;
}

void UKhaaosWeaponComponent::UnequipAttachment(FName SlotName)
{
    if (!EquippedAttachments.Contains(SlotName)) return;

    FKhaaosWeaponAttachment RemovedAttachment = EquippedAttachments[SlotName];
    EquippedAttachments.Remove(SlotName);
    OnAttachmentChanged.Broadcast(SlotName, RemovedAttachment, false);

    UE_LOG(LogKhaaosRun, Log, TEXT("WeaponComponent::UnequipAttachment - Slot:%s ID:%s"),
        *SlotName.ToString(), *RemovedAttachment.AttachmentID.ToString());
}

bool UKhaaosWeaponComponent::GetEquippedAttachment(FName SlotName, FKhaaosWeaponAttachment& OutAttachment) const
{
    const FKhaaosWeaponAttachment* Found = EquippedAttachments.Find(SlotName);
    if (Found)
    {
        OutAttachment = *Found;
        return true;
    }
    return false;
}

float UKhaaosWeaponComponent::GetAttachmentStatModifier(FName StatName) const
{
    float CumulativeModifier = 0.0f;

    for (const auto& Pair : EquippedAttachments)
    {
        const float* Modifier = Pair.Value.StatModifiers.Find(StatName);
        if (Modifier)
        {
            CumulativeModifier += *Modifier;
        }
    }

    return CumulativeModifier;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Overheat
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosWeaponComponent::AddHeat(float HeatPerShotValue)
{
    if (!CurrentWeapon) return;

    HeatLevel += HeatPerShotValue;

    // Check overheat threshold
    if (!bIsOverheated && HeatLevel >= OverheatThreshold)
    {
        bIsOverheated = true;
        OverheatCooldownRemaining = OverheatCooldownDelay;
        OnOverheatChanged.Broadcast(true);

        UE_LOG(LogKhaaosRun, Warning, TEXT("WeaponComponent::Overheat - HeatLevel=%.1f >= Threshold=%.1f"),
            HeatLevel, OverheatThreshold);
    }

    // Clamp heat to a reasonable max (never exceed 2x threshold)
    HeatLevel = FMath::Min(HeatLevel, OverheatThreshold * 2.0f);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Recoil
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosWeaponComponent::AddRecoil()
{
    if (!CurrentWeapon) return;

    const FKhaaosRecoilConfig& RecoilConfig = CurrentWeapon->Recoil;

    // Determine recoil scale from per-shot pattern, fall back to linear (1.0)
    float PatternScale = 1.0f;
    if (RecoilConfig.Pattern.Num() > 0)
    {
        // Index into pattern array, clamped to last element if beyond
        const int32 PatternIndex = FMath::Min(ShotsFired - 1, RecoilConfig.Pattern.Num() - 1);
        PatternScale = RecoilConfig.Pattern[PatternIndex];
    }

    // Apply attachment modifiers to recoil
    const float RecoilModifier = 1.0f + GetAttachmentStatModifier(FName("RecoilScale"));

    AccumulatedRecoilPitch += RecoilConfig.PitchPerShot * PatternScale * RecoilModifier;
    AccumulatedRecoilYaw   += FMath::FRandRange(-RecoilConfig.YawRange, RecoilConfig.YawRange)
                            * PatternScale * RecoilModifier;
}

void UKhaaosWeaponComponent::GetRecoilOffset(float& OutPitch, float& OutYaw) const
{
    OutPitch = AccumulatedRecoilPitch;
    OutYaw = AccumulatedRecoilYaw;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tick
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosWeaponComponent::TickComponent(float DeltaTime, ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (!CurrentWeapon) return;

    // ─── Tick Reload ─────────────────────────────────────────────────────────
    if (bIsReloading)
    {
        ReloadTimeRemaining -= DeltaTime;
        if (ReloadTimeRemaining <= 0.0f)
        {
            // Complete reload
            int32 Needed = CurrentWeapon->MagazineSize - CurrentAmmo;
            int32 ToRefill = FMath::Min(Needed, ReserveAmmo);
            CurrentAmmo += ToRefill;
            ReserveAmmo -= ToRefill;
            OnAmmoChanged.Broadcast(CurrentAmmo, CurrentWeapon->MagazineSize);

            bIsReloading = false;
            ReloadTimeRemaining = 0.0f;
        }
    }

    // ─── Tick Recoil Recovery ────────────────────────────────────────────────
    if (CurrentWeapon->Recoil.RecoverySpeed > 0.0f)
    {
        const float Recovery = CurrentWeapon->Recoil.RecoverySpeed * DeltaTime;
        AccumulatedRecoilPitch = FMath::Max(0.0f, AccumulatedRecoilPitch - Recovery);
        AccumulatedRecoilYaw = FMath::InterpTo(AccumulatedRecoilYaw, 0.0f, DeltaTime, CurrentWeapon->Recoil.RecoverySpeed);
    }

    // ─── Tick Heat Decay ─────────────────────────────────────────────────────
    if (bIsOverheated)
    {
        // During overheat cooldown delay, no decay
        OverheatCooldownRemaining -= DeltaTime;
        if (OverheatCooldownRemaining <= 0.0f)
        {
            OverheatCooldownRemaining = 0.0f;
            // Now allow decay; overheat clears when heat drops below threshold
        }
    }

    // Decay heat when not in cooldown
    if (HeatLevel > 0.0f && (!bIsOverheated || OverheatCooldownRemaining <= 0.0f))
    {
        const float EffectiveDecayRate = HeatDecayRate + GetAttachmentStatModifier(FName("HeatDecayRate"));
        HeatLevel = FMath::Max(0.0f, HeatLevel - FMath::Max(0.0f, EffectiveDecayRate) * DeltaTime);

        // Clear overheat state once heat drops below threshold
        if (bIsOverheated && HeatLevel < OverheatThreshold)
        {
            bIsOverheated = false;
            OnOverheatChanged.Broadcast(false);

            UE_LOG(LogKhaaosRun, Log, TEXT("WeaponComponent::OverheatCleared - HeatLevel=%.1f"), HeatLevel);
        }
    }

    // ─── Tick Burst Timeout ──────────────────────────────────────────────────
    if (bIsBurstFiring && BurstShotsRemaining > 0)
    {
        BurstTimeoutRemaining -= DeltaTime;
        if (BurstTimeoutRemaining <= 0.0f)
        {
            // Burst timed out — reset
            bIsBurstFiring      = false;
            BurstShotsRemaining = 0;
            BurstShotsFired     = 0;
        }
    }
}
