// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Ring/KhaaosRingVisualComponent.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include "NiagaraFunctionLibrary.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosRingVisual, Log, All);

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosRingVisualComponent::UKhaaosRingVisualComponent()
{
        PrimaryComponentTick.bCanEverTick = true;
        PrimaryComponentTick.bStartWithTickEnabled = true;

        // Default phase visual configurations
        // Phase 0-1: Blue border, calm pulse
        PhaseVisual_0_1.BorderColor = FLinearColor(0.1f, 0.4f, 1.0f, 1.0f); // Blue
        PhaseVisual_0_1.EmissiveIntensity = 2.0f;
        PhaseVisual_0_1.PulseSpeed = 1.0f;
        PhaseVisual_0_1.ParticleRateMultiplier = 1.0f;
        PhaseVisual_0_1.bElectricalStorm = false;

        // Phase 2-3: Orange border, fast pulse
        PhaseVisual_2_3.BorderColor = FLinearColor(1.0f, 0.5f, 0.05f, 1.0f); // Orange
        PhaseVisual_2_3.EmissiveIntensity = 4.0f;
        PhaseVisual_2_3.PulseSpeed = 3.0f;
        PhaseVisual_2_3.ParticleRateMultiplier = 2.0f;
        PhaseVisual_2_3.bElectricalStorm = false;

        // Phase 4: Red border, electrical storm
        PhaseVisual_4.BorderColor = FLinearColor(1.0f, 0.05f, 0.05f, 1.0f); // Red
        PhaseVisual_4.EmissiveIntensity = 8.0f;
        PhaseVisual_4.PulseSpeed = 6.0f;
        PhaseVisual_4.ParticleRateMultiplier = 4.0f;
        PhaseVisual_4.bElectricalStorm = true;

        // Phase 5+: Crimson, maximum intensity
        PhaseVisual_5Plus.BorderColor = FLinearColor(0.7f, 0.02f, 0.02f, 1.0f); // Crimson
        PhaseVisual_5Plus.EmissiveIntensity = 15.0f;
        PhaseVisual_5Plus.PulseSpeed = 10.0f;
        PhaseVisual_5Plus.ParticleRateMultiplier = 8.0f;
        PhaseVisual_5Plus.bElectricalStorm = true;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosRingVisualComponent::BeginPlay()
{
        Super::BeginPlay();
        InitializeVisualAssets();
}

void UKhaaosRingVisualComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
        Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

        // Update pulse animation on materials every frame
        UpdatePulse(DeltaTime);

        // Update minimap overlay with current ring state
        UpdateMinimapOverlay();
}

// ─── Visual Update ────────────────────────────────────────────────────────────

void UKhaaosRingVisualComponent::UpdateRingVisual(float CurrentRadius, float TargetRadius, int32 Phase)
{
        LastCurrentRadius = CurrentRadius;
        LastTargetRadius = TargetRadius;

        // Check for phase change
        if (Phase != CurrentVisualPhase)
        {
                SetRingPhaseVisual(Phase);
        }

        // Update Niagara border particle parameters
        SetRingBorderNiagaraParams(CurrentRadius, TargetRadius);

        // Update border material with current radius info
        if (RingBorderMID)
        {
                RingBorderMID->SetScalarParameterValue(FName(TEXT("CurrentRadius")), CurrentRadius);
                RingBorderMID->SetScalarParameterValue(FName(TEXT("TargetRadius")), TargetRadius);

                // Ring shrink ratio for visual intensity
                const float ShrinkRatio = (TargetRadius > 0.0f) ? FMath::Clamp(CurrentRadius / TargetRadius, 0.0f, 2.0f) : 1.0f;
                RingBorderMID->SetScalarParameterValue(FName(TEXT("ShrinkRatio")), ShrinkRatio);
        }

        UE_LOG(LogKhaaosRingVisual, Verbose, TEXT("UpdateRingVisual: Radius=%.1f->%.1f, Phase=%d"), CurrentRadius, TargetRadius, Phase);
}

void UKhaaosRingVisualComponent::ShowNextRingPreview()
{
        if (!RingPreviewComponent)
        {
                // Lazy-spawn the preview Niagara component if not yet created
                UNiagaraSystem* PreviewSystem = RingPreviewNiagaraSystem.LoadSynchronous();
                if (PreviewSystem && GetOwner())
                {
                        RingPreviewComponent = UNiagaraFunctionLibrary::SpawnSystemAttached(
                                PreviewSystem,
                                GetOwner()->GetRootComponent(),
                                FName(TEXT("RingPreview")),
                                FVector::ZeroVector,
                                FRotator::ZeroRotator,
                                EAttachLocation::KeepRelativeOffset,
                                false, // bAutoDestroy
                                true,  // bAutoActivate
                                ENiagaraEffectPoolPolicy::Auto,
                                true   // bPreCullCheck
                        );
                }
        }

        if (RingPreviewComponent)
        {
                // Set the preview ring radius on the Niagara system
                RingPreviewComponent->SetNiagaraVariableFloat(FName(TEXT("PreviewRadius")), NextRingPreviewRadius);

                // White transparent color for preview ring
                RingPreviewComponent->SetNiagaraVariableLinearColor(FName(TEXT("PreviewColor")), FLinearColor(1.0f, 1.0f, 1.0f, 0.4f));

                RingPreviewComponent->Activate();
                bPreviewVisible = true;

                UE_LOG(LogKhaaosRingVisual, Log, TEXT("ShowNextRingPreview: PreviewRadius=%.1f"), NextRingPreviewRadius);
        }
        else
        {
                UE_LOG(LogKhaaosRingVisual, Warning, TEXT("ShowNextRingPreview: Preview Niagara component not available"));
        }
}

void UKhaaosRingVisualComponent::ActivateElectricalStorm()
{
        if (bElectricalStormActive)
        {
                return; // Already active
        }

        // Spawn electrical storm Niagara component
        UNiagaraSystem* StormSystem = ElectricalStormNiagaraSystem.LoadSynchronous();
        if (StormSystem && GetOwner())
        {
                ElectricalStormComponent = UNiagaraFunctionLibrary::SpawnSystemAttached(
                        StormSystem,
                        GetOwner()->GetRootComponent(),
                        FName(TEXT("ElectricalStorm")),
                        FVector::ZeroVector,
                        FRotator::ZeroRotator,
                        EAttachLocation::KeepRelativeOffset,
                        false, // bAutoDestroy
                        true,  // bAutoActivate
                        ENiagaraEffectPoolPolicy::Auto,
                        true   // bPreCullCheck
                );
        }

        bElectricalStormActive = true;

        // Set intense material parameters for storm mode
        if (RingBorderMID)
        {
                RingBorderMID->SetScalarParameterValue(FName(TEXT("StormIntensity")), 1.0f);
                RingBorderMID->SetScalarParameterValue(FName(TEXT("EmissiveBoost")), 3.0f);
        }

        // Apply camera shake if available
        APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
        if (PC && PC->PlayerCameraManager)
        {
                PC->PlayerCameraManager->StartCameraShake(PC->PlayerCameraManager->GetCameraShakeClass(), 0.5f);
        }

        OnElectricalStormActivated.Broadcast();

        UE_LOG(LogKhaaosRingVisual, Log, TEXT("ActivateElectricalStorm: Storm VFX activated for phase %d"), CurrentVisualPhase);
}

void UKhaaosRingVisualComponent::SetRingPhaseVisual(int32 Phase)
{
        CurrentVisualPhase = Phase;

        // Get the visual config for this phase
        const FKhaaosRingPhaseVisual& PhaseVisual = GetPhaseVisualConfig(Phase);
        CurrentBorderColor = PhaseVisual.BorderColor;
        CurrentPulseSpeed = PhaseVisual.PulseSpeed;

        // Apply to materials
        ApplyPhaseVisualToMaterials(PhaseVisual);

        // Update border Niagara particle rate
        if (RingBorderComponent)
        {
                RingBorderComponent->SetNiagaraVariableFloat(FName(TEXT("ParticleRateMultiplier")), PhaseVisual.ParticleRateMultiplier);
        }

        // Activate electrical storm if phase requires it
        if (PhaseVisual.bElectricalStorm && !bElectricalStormActive)
        {
                ActivateElectricalStorm();
        }
        else if (!PhaseVisual.bElectricalStorm && bElectricalStormActive)
        {
                DeactivateElectricalStorm();
        }

        // Hide preview ring on phase change
        if (RingPreviewComponent && bPreviewVisible)
        {
                RingPreviewComponent->Deactivate();
                bPreviewVisible = false;
        }

        OnRingPhaseVisualChanged.Broadcast(Phase, PhaseVisual.BorderColor);

        UE_LOG(LogKhaaosRingVisual, Log, TEXT("SetRingPhaseVisual: Phase=%d, Color=(%.2f,%.2f,%.2f), Pulse=%.1f, Storm=%d"),
                Phase, PhaseVisual.BorderColor.R, PhaseVisual.BorderColor.G, PhaseVisual.BorderColor.B,
                PhaseVisual.PulseSpeed, PhaseVisual.bElectricalStorm ? 1 : 0);
}

// ─── Private: Initialize Visual Assets ────────────────────────────────────────

void UKhaaosRingVisualComponent::InitializeVisualAssets()
{
        if (bAssetsLoaded)
        {
                return;
        }

        AActor* Owner = GetOwner();
        if (!Owner)
        {
                UE_LOG(LogKhaaosRingVisual, Warning, TEXT("InitializeVisualAssets: No owner"));
                return;
        }

        // Load and spawn ring border Niagara system
        UNiagaraSystem* BorderSystem = RingBorderNiagaraSystem.LoadSynchronous();
        if (BorderSystem)
        {
                RingBorderComponent = UNiagaraFunctionLibrary::SpawnSystemAttached(
                        BorderSystem,
                        Owner->GetRootComponent(),
                        FName(TEXT("RingBorder")),
                        FVector::ZeroVector,
                        FRotator::ZeroRotator,
                        EAttachLocation::KeepRelativeOffset,
                        false,
                        true,
                        ENiagaraEffectPoolPolicy::Auto,
                        true
                );
        }

        // Create dynamic material instance for ring border
        UMaterialInterface* BaseMaterial = RingBorderMaterial.LoadSynchronous();
        if (BaseMaterial)
        {
                RingBorderMID = UMaterialInstanceDynamic::Create(BaseMaterial, this, FName(TEXT("RingBorderMID")));
                if (RingBorderComponent)
                {
                        RingBorderComponent->SetNiagaraVariableLinearColor(FName(TEXT("BorderColor")), CurrentBorderColor);
                }
        }

        // Create dynamic material instance for minimap overlay
        UMaterialInterface* MinimapMaterial = MinimapRingMaterial.LoadSynchronous();
        if (MinimapMaterial)
        {
                MinimapRingMID = UMaterialInstanceDynamic::Create(MinimapMaterial, this, FName(TEXT("MinimapRingMID")));
        }

        bAssetsLoaded = true;

        UE_LOG(LogKhaaosRingVisual, Log, TEXT("InitializeVisualAssets: Border=%s, BorderMID=%s, MinimapMID=%s"),
                RingBorderComponent ? TEXT("OK") : TEXT("MISSING"),
                RingBorderMID ? TEXT("OK") : TEXT("MISSING"),
                MinimapRingMID ? TEXT("OK") : TEXT("MISSING"));
}

// ─── Private: Phase Config Resolution ─────────────────────────────────────────

const FKhaaosRingPhaseVisual& UKhaaosRingVisualComponent::GetPhaseVisualConfig(int32 Phase) const
{
        if (Phase >= 5)
        {
                return PhaseVisual_5Plus;
        }
        if (Phase == 4)
        {
                return PhaseVisual_4;
        }
        if (Phase >= 2)
        {
                return PhaseVisual_2_3;
        }
        // Phase 0-1
        return PhaseVisual_0_1;
}

// ─── Private: Apply Phase Visual to Materials ─────────────────────────────────

void UKhaaosRingVisualComponent::ApplyPhaseVisualToMaterials(const FKhaaosRingPhaseVisual& PhaseVisual)
{
        if (RingBorderMID)
        {
                RingBorderMID->SetVectorParameterValue(FName(TEXT("BorderColor")), PhaseVisual.BorderColor);
                RingBorderMID->SetScalarParameterValue(FName(TEXT("EmissiveIntensity")), PhaseVisual.EmissiveIntensity);
                RingBorderMID->SetScalarParameterValue(FName(TEXT("PulseSpeed")), PhaseVisual.PulseSpeed);
        }

        if (MinimapRingMID)
        {
                MinimapRingMID->SetVectorParameterValue(FName(TEXT("RingColor")), PhaseVisual.BorderColor);
                MinimapRingMID->SetScalarParameterValue(FName(TEXT("Intensity")), PhaseVisual.EmissiveIntensity * 0.5f);
        }
}

// ─── Private: Pulse Animation ─────────────────────────────────────────────────

void UKhaaosRingVisualComponent::UpdatePulse(float DeltaTime)
{
        PulseTime += DeltaTime * CurrentPulseSpeed;

        if (RingBorderMID)
        {
                // Sine wave pulse for emissive modulation
                const float PulseValue = FMath::Sin(PulseTime * 2.0f * PI);
                RingBorderMID->SetScalarParameterValue(FName(TEXT("PulsePhase")), PulseValue);

                // Smooth breathing effect for border opacity
                const float BreathValue = 0.7f + 0.3f * FMath::Sin(PulseTime * PI);
                RingBorderMID->SetScalarParameterValue(FName(TEXT("BreathIntensity")), BreathValue);
        }
}

// ─── Private: Minimap Overlay ─────────────────────────────────────────────────

void UKhaaosRingVisualComponent::UpdateMinimapOverlay()
{
        if (!MinimapRingMID)
        {
                return;
        }

        // Update minimap material with current ring radii for the minimap ring overlay
        MinimapRingMID->SetScalarParameterValue(FName(TEXT("CurrentRadius")), LastCurrentRadius);
        MinimapRingMID->SetScalarParameterValue(FName(TEXT("TargetRadius")), LastTargetRadius);

        // Show preview ring on minimap if active
        if (bPreviewVisible)
        {
                MinimapRingMID->SetScalarParameterValue(FName(TEXT("PreviewRadius")), NextRingPreviewRadius);
                MinimapRingMID->SetScalarParameterValue(FName(TEXT("PreviewAlpha")), 0.4f);
        }
        else
        {
                MinimapRingMID->SetScalarParameterValue(FName(TEXT("PreviewAlpha")), 0.0f);
        }
}

// ─── Private: Niagara Parameter Updates ───────────────────────────────────────

void UKhaaosRingVisualComponent::SetRingBorderNiagaraParams(float CurrentRadius, float TargetRadius)
{
        if (!RingBorderComponent)
        {
                return;
        }

        RingBorderComponent->SetNiagaraVariableFloat(FName(TEXT("CurrentRadius")), CurrentRadius);
        RingBorderComponent->SetNiagaraVariableFloat(FName(TEXT("TargetRadius")), TargetRadius);
        RingBorderComponent->SetNiagaraVariableLinearColor(FName(TEXT("BorderColor")), CurrentBorderColor);

        // Speed of ring shrink for particle trail length
        const float ShrinkSpeed = FMath::Max(0.0f, (CurrentRadius - TargetRadius) / FMath::Max(1.0f, CurrentRadius));
        RingBorderComponent->SetNiagaraVariableFloat(FName(TEXT("ShrinkSpeed")), ShrinkSpeed);
}

// ─── Private: Deactivate Electrical Storm ─────────────────────────────────────

void UKhaaosRingVisualComponent::DeactivateElectricalStorm()
{
        if (!bElectricalStormActive)
        {
                return;
        }

        if (ElectricalStormComponent)
        {
                ElectricalStormComponent->Deactivate();
                ElectricalStormComponent = nullptr;
        }

        if (RingBorderMID)
        {
                RingBorderMID->SetScalarParameterValue(FName(TEXT("StormIntensity")), 0.0f);
                RingBorderMID->SetScalarParameterValue(FName(TEXT("EmissiveBoost")), 1.0f);
        }

        bElectricalStormActive = false;

        UE_LOG(LogKhaaosRingVisual, Log, TEXT("DeactivateElectricalStorm: Storm VFX deactivated"));
}
