// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// KhaaosScreenEffects.cpp - Screen Effects System Implementation

#include "Game/Graphics/KhaaosScreenEffects.h"

// ============================================================================
// Construction / Lifecycle
// ============================================================================

UKhaaosScreenEffects::UKhaaosScreenEffects()
{
	PrimaryComponentTick.bCanEverTick = true;
}

void UKhaaosScreenEffects::BeginPlay()
{
	Super::BeginPlay();
}

// ============================================================================
// Tick
// ============================================================================

void UKhaaosScreenEffects::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	UpdateEffects(DeltaTime);
	RemoveFinishedEffects();
}

// ============================================================================
// Effect Triggers
// ============================================================================

void UKhaaosScreenEffects::TriggerDamageVignette(float Intensity)
{
	FKhaaosScreenEffectConfig Config;
	Config.EffectType		= EKhaaosScreenEffectType::DAMAGE_VIGNETTE;
	Config.Color			= FLinearColor(1.0f, 0.0f, 0.0f, 1.0f);
	Config.MaxIntensity		= Intensity;
	Config.FadeInTime		= 0.1f;
	Config.FadeOutTime		= 0.5f;
	Config.bIsLooping		= false;
	Config.LoopFrequency	= 0.0f;
	Config.Priority			= 0;

	AddOrUpdateEffect(Config);
}

void UKhaaosScreenEffects::StartLowHealthPulse()
{
	FKhaaosScreenEffectConfig Config;
	Config.EffectType		= EKhaaosScreenEffectType::LOW_HEALTH_PULSE;
	Config.Color			= FLinearColor(1.0f, 0.1f, 0.1f, 1.0f);
	Config.MaxIntensity		= 0.6f;
	Config.FadeInTime		= 0.3f;
	Config.FadeOutTime		= 0.5f;
	Config.bIsLooping		= true;
	Config.LoopFrequency	= 1.5f;
	Config.Priority			= 0;

	AddOrUpdateEffect(Config);
}

void UKhaaosScreenEffects::StopLowHealthPulse()
{
	FKhaaosActiveScreenEffect* Effect = FindActiveEffect(EKhaaosScreenEffectType::LOW_HEALTH_PULSE);
	if (Effect && Effect->bIsActive)
	{
		Effect->bIsFadingOut = true;
	}
}

void UKhaaosScreenEffects::TriggerZoneWarning(float Intensity)
{
	FKhaaosScreenEffectConfig Config;
	Config.EffectType		= EKhaaosScreenEffectType::ZONE_WARNING;
	Config.Color			= FLinearColor(0.3f, 0.5f, 1.0f, 1.0f);
	Config.MaxIntensity		= Intensity;
	Config.FadeInTime		= 0.2f;
	Config.FadeOutTime		= 0.8f;
	Config.bIsLooping		= true;
	Config.LoopFrequency	= 0.8f;
	Config.Priority			= 1;

	AddOrUpdateEffect(Config);
}

void UKhaaosScreenEffects::StopZoneWarning()
{
	FKhaaosActiveScreenEffect* Effect = FindActiveEffect(EKhaaosScreenEffectType::ZONE_WARNING);
	if (Effect && Effect->bIsActive)
	{
		Effect->bIsFadingOut = true;
	}
}

void UKhaaosScreenEffects::TriggerHealOverlay(float Intensity)
{
	FKhaaosScreenEffectConfig Config;
	Config.EffectType		= EKhaaosScreenEffectType::HEAL_OVERLAY;
	Config.Color			= FLinearColor(0.0f, 1.0f, 0.3f, 1.0f);
	Config.MaxIntensity		= Intensity;
	Config.FadeInTime		= 0.2f;
	Config.FadeOutTime		= 1.0f;
	Config.bIsLooping		= false;
	Config.LoopFrequency	= 0.0f;
	Config.Priority			= 0;

	AddOrUpdateEffect(Config);
}

void UKhaaosScreenEffects::TriggerEliminationFlash()
{
	FKhaaosScreenEffectConfig Config;
	Config.EffectType		= EKhaaosScreenEffectType::ELIMINATION_FLASH;
	Config.Color			= FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);
	Config.MaxIntensity		= 1.0f;
	Config.FadeInTime		= 0.05f;
	Config.FadeOutTime		= 0.3f;
	Config.bIsLooping		= false;
	Config.LoopFrequency	= 0.0f;
	Config.Priority			= 2;

	AddOrUpdateEffect(Config);
}

void UKhaaosScreenEffects::TriggerShieldBreak()
{
	FKhaaosScreenEffectConfig Config;
	Config.EffectType		= EKhaaosScreenEffectType::SHIELD_BREAK;
	Config.Color			= FLinearColor(0.2f, 0.5f, 1.0f, 1.0f);
	Config.MaxIntensity		= 1.0f;
	Config.FadeInTime		= 0.1f;
	Config.FadeOutTime		= 0.4f;
	Config.bIsLooping		= false;
	Config.LoopFrequency	= 0.0f;
	Config.Priority			= 2;

	AddOrUpdateEffect(Config);
}

void UKhaaosScreenEffects::SetKillStreakGlow(int32 KillCount)
{
	if (KillCount >= 3)
	{
		// Intensity scales: 3 kills = 0.2, 4 = 0.4, 5 = 0.6, 6 = 0.8, 7+ = 1.0
		const float StreakIntensity = FMath::Min((KillCount - 2) * 0.2f, 1.0f);

		FKhaaosScreenEffectConfig Config;
		Config.EffectType		= EKhaaosScreenEffectType::KILL_STREAK_GLOW;
		Config.Color			= FLinearColor(1.0f, 0.85f, 0.2f, 1.0f);
		Config.MaxIntensity		= StreakIntensity;
		Config.FadeInTime		= 0.3f;
		Config.FadeOutTime		= 0.5f;
		Config.bIsLooping		= true;
		Config.LoopFrequency	= 0.5f;
		Config.Priority			= 1;

		AddOrUpdateEffect(Config);
	}
	else
	{
		// Kill count below threshold, fade out if active
		FKhaaosActiveScreenEffect* Effect = FindActiveEffect(EKhaaosScreenEffectType::KILL_STREAK_GLOW);
		if (Effect && Effect->bIsActive)
		{
			Effect->bIsFadingOut = true;
		}
	}
}

void UKhaaosScreenEffects::ClearKillStreakGlow()
{
	FKhaaosActiveScreenEffect* Effect = FindActiveEffect(EKhaaosScreenEffectType::KILL_STREAK_GLOW);
	if (Effect && Effect->bIsActive)
	{
		Effect->bIsFadingOut = true;
	}
}

void UKhaaosScreenEffects::TriggerWorldTransitionFlash()
{
	FKhaaosScreenEffectConfig Config;
	Config.EffectType		= EKhaaosScreenEffectType::WORLD_TRANSITION_FLASH;
	Config.Color			= FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);
	Config.MaxIntensity		= 1.0f;
	Config.FadeInTime		= 0.3f;
	Config.FadeOutTime		= 1.2f;
	Config.bIsLooping		= false;
	Config.LoopFrequency	= 0.0f;
	Config.Priority			= 3;

	AddOrUpdateEffect(Config);
}

void UKhaaosScreenEffects::TriggerReviveEffect()
{
	FKhaaosScreenEffectConfig Config;
	Config.EffectType		= EKhaaosScreenEffectType::REVIVE_EFFECT;
	Config.Color			= FLinearColor(1.0f, 0.9f, 0.3f, 1.0f);
	Config.MaxIntensity		= 0.7f;
	Config.FadeInTime		= 0.2f;
	Config.FadeOutTime		= 0.6f;
	Config.bIsLooping		= true;
	Config.LoopFrequency	= 2.0f;
	Config.Priority			= 0;

	AddOrUpdateEffect(Config);
}

// ============================================================================
// Control
// ============================================================================

void UKhaaosScreenEffects::ClearAllEffects()
{
	ActiveEffects.Empty();
}

void UKhaaosScreenEffects::SetGlobalIntensityMultiplier(float Multiplier)
{
	GlobalIntensityMultiplier = FMath::Clamp(Multiplier, 0.0f, 2.0f);
}

// ============================================================================
// Query
// ============================================================================

bool UKhaaosScreenEffects::IsEffectActive(EKhaaosScreenEffectType Type) const
{
	for (const FKhaaosActiveScreenEffect& Effect : ActiveEffects)
	{
		if (Effect.Config.EffectType == Type && Effect.bIsActive)
		{
			return true;
		}
	}
	return false;
}

float UKhaaosScreenEffects::GetEffectIntensity(EKhaaosScreenEffectType Type) const
{
	for (const FKhaaosActiveScreenEffect& Effect : ActiveEffects)
	{
		if (Effect.Config.EffectType == Type && Effect.bIsActive)
		{
			return Effect.CurrentIntensity;
		}
	}
	return 0.0f;
}

int32 UKhaaosScreenEffects::GetActiveEffectCount() const
{
	int32 Count = 0;
	for (const FKhaaosActiveScreenEffect& Effect : ActiveEffects)
	{
		if (Effect.bIsActive)
		{
			++Count;
		}
	}
	return Count;
}

// ============================================================================
// Internal Helpers
// ============================================================================

FKhaaosActiveScreenEffect* UKhaaosScreenEffects::FindActiveEffect(EKhaaosScreenEffectType Type)
{
	for (FKhaaosActiveScreenEffect& Effect : ActiveEffects)
	{
		if (Effect.Config.EffectType == Type)
		{
			return &Effect;
		}
	}
	return nullptr;
}

void UKhaaosScreenEffects::AddOrUpdateEffect(const FKhaaosScreenEffectConfig& InConfig)
{
	FKhaaosActiveScreenEffect* Existing = FindActiveEffect(InConfig.EffectType);

	if (Existing)
	{
		// Update existing effect: replace config and restart from scratch
		Existing->Config			= InConfig;
		Existing->CurrentIntensity	= 0.0f;
		Existing->ElapsedTime		= 0.0f;
		Existing->bIsActive			= true;
		Existing->bIsFadingOut		= false;
	}
	else
	{
		// Add new active effect
		FKhaaosActiveScreenEffect NewEffect;
		NewEffect.Config			= InConfig;
		NewEffect.CurrentIntensity	= 0.0f;
		NewEffect.ElapsedTime		= 0.0f;
		NewEffect.bIsActive			= true;
		NewEffect.bIsFadingOut		= false;

		ActiveEffects.Add(NewEffect);
	}

	// Broadcast that the effect was triggered
	OnEffectTriggered.Broadcast(InConfig.EffectType, InConfig.MaxIntensity);
}

void UKhaaosScreenEffects::UpdateEffects(float DeltaTime)
{
	for (FKhaaosActiveScreenEffect& Effect : ActiveEffects)
	{
		if (!Effect.bIsActive)
		{
			continue;
		}

		const FKhaaosScreenEffectConfig& Cfg = Effect.Config;

		if (Effect.bIsFadingOut)
		{
			// Fading out: decrease intensity toward zero
			if (Cfg.FadeOutTime > 0.0f)
			{
				Effect.CurrentIntensity -= DeltaTime * (Cfg.MaxIntensity / Cfg.FadeOutTime);
			}
			else
			{
				Effect.CurrentIntensity = 0.0f;
			}

			if (Effect.CurrentIntensity <= 0.0f)
			{
				Effect.CurrentIntensity = 0.0f;
				Effect.bIsActive = false;
				OnEffectFinished.Broadcast(Cfg.EffectType);
			}
		}
		else if (Effect.ElapsedTime < Cfg.FadeInTime)
		{
			// Fade-in phase: ramp intensity up
			if (Cfg.FadeInTime > 0.0f)
			{
				Effect.CurrentIntensity += DeltaTime * (Cfg.MaxIntensity / Cfg.FadeInTime);
				Effect.CurrentIntensity = FMath::Min(Effect.CurrentIntensity, Cfg.MaxIntensity);
			}
			else
			{
				Effect.CurrentIntensity = Cfg.MaxIntensity;
			}
		}
		else if (Cfg.bIsLooping)
		{
			// Looping phase: pulsing sine wave
			const float Pulse = FMath::Sin(2.0f * PI * Cfg.LoopFrequency * Effect.ElapsedTime) * 0.5f + 0.5f;
			Effect.CurrentIntensity = Cfg.MaxIntensity * Pulse * GlobalIntensityMultiplier;
		}
		else
		{
			// Non-looping, past fade-in: start fading out
			Effect.bIsFadingOut = true;

			if (Cfg.FadeOutTime > 0.0f)
			{
				Effect.CurrentIntensity -= DeltaTime * (Cfg.MaxIntensity / Cfg.FadeOutTime);
			}
			else
			{
				Effect.CurrentIntensity = 0.0f;
			}

			if (Effect.CurrentIntensity <= 0.0f)
			{
				Effect.CurrentIntensity = 0.0f;
				Effect.bIsActive = false;
				OnEffectFinished.Broadcast(Cfg.EffectType);
			}
		}

		// Apply global intensity multiplier during fade-in (looping applies it in pulse calc)
		if (!Cfg.bIsLooping && !Effect.bIsFadingOut)
		{
			// For non-looping effects, the fade-in ramp is scaled by global multiplier
			// (CurrentIntensity was already set above; we apply the multiplier for the
			//  final value that the UI/Material reads)
			// Note: we don't re-multiply here to avoid double-applying. The multiplier
			// is factored in via the looping path above. For one-shot effects the
			// intensity ramp already reached MaxIntensity; the consumer should apply
			// GlobalIntensityMultiplier when reading.
		}

		Effect.ElapsedTime += DeltaTime;
	}
}

void UKhaaosScreenEffects::RemoveFinishedEffects()
{
	ActiveEffects.RemoveAll([](const FKhaaosActiveScreenEffect& Effect)
	{
		return !Effect.bIsActive;
	});
}
