// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Audio/KhaaosAdaptiveMusic.h"
#include "Game/Audio/KhaaosAudioManager.h"
#include "Game/Audio/KhaaosMetaSoundConfig.h"

#include "Engine/Engine.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Sound/SoundBase.h"
#include "Components/AudioComponent.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosAdaptiveMusic, Log, All);

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosAdaptiveMusic
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosAdaptiveMusic::UKhaaosAdaptiveMusic()
	: CurrentIntensity(0.0f)
	, TargetIntensity(0.0f)
	, bCombatActive(false)
	, bInitialized(false)
{
}

void UKhaaosAdaptiveMusic::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	MusicStateData.CurrentState = EMusicState::Menu;
	MusicStateData.TargetState = EMusicState::Menu;
	MusicStateData.TransitionProgress = 0.0f;
	MusicStateData.bIsTransitioning = false;

	bInitialized = true;

	UE_LOG(LogKhaaosAdaptiveMusic, Log, TEXT("KhaaosAdaptiveMusic: Initialized."));
}

void UKhaaosAdaptiveMusic::Deinitialize()
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(CombatDeescalationTimer);
	}

	bInitialized = false;
	UE_LOG(LogKhaaosAdaptiveMusic, Log, TEXT("KhaaosAdaptiveMusic: Deinitialized."));
	Super::Deinitialize();
}

void UKhaaosAdaptiveMusic::Tick(float DeltaSeconds)
{
	if (!bInitialized) return;

	// ─── Intensity Ramping ────────────────────────────────────────────────────

	if (!FMath::IsNearlyEqual(CurrentIntensity, TargetIntensity))
	{
		const float RampRate = (TargetIntensity > CurrentIntensity) ? IntensityRampUp : IntensityRampDown;
		const float Delta = RampRate * DeltaSeconds;

		if (TargetIntensity > CurrentIntensity)
		{
			CurrentIntensity = FMath::Min(TargetIntensity, CurrentIntensity + Delta);
		}
		else
		{
			CurrentIntensity = FMath::Max(TargetIntensity, CurrentIntensity - Delta);
		}

		UpdateMetaSoundIntensity();
	}

	// ─── Crossfade Transition ─────────────────────────────────────────────────

	if (MusicStateData.bIsTransitioning)
	{
		MusicStateData.TransitionProgress += (DeltaSeconds / MusicStateData.CrossfadeTime);

		if (MusicStateData.TransitionProgress >= 1.0f)
		{
			MusicStateData.TransitionProgress = 1.0f;
			MusicStateData.CurrentState = MusicStateData.TargetState;
			MusicStateData.bIsTransitioning = false;

			UE_LOG(LogKhaaosAdaptiveMusic, Log, TEXT("Transition complete → %s"),
				UEnum::GetDisplayValueAsText(MusicStateData.CurrentState).ToString());
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Intensity Control
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosAdaptiveMusic::SetMusicIntensity(float Intensity)
{
	TargetIntensity = FMath::Clamp(Intensity, 0.0f, 1.0f);
	UE_LOG(LogKhaaosAdaptiveMusic, Verbose, TEXT("SetMusicIntensity: Target=%.2f"), TargetIntensity);
}

// ═══════════════════════════════════════════════════════════════════════════════
// State Transitions
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosAdaptiveMusic::TransitionToState(EMusicState State)
{
	if (MusicStateData.CurrentState == State && !MusicStateData.bIsTransitioning)
	{
		return; // Already in this state
	}

	MusicStateData.TargetState = State;
	MusicStateData.TransitionProgress = 0.0f;
	MusicStateData.bIsTransitioning = true;

	UE_LOG(LogKhaaosAdaptiveMusic, Log, TEXT("TransitionToState: %s → %s (Crossfade=%.1fs)"),
		UEnum::GetDisplayValueAsText(MusicStateData.CurrentState).ToString(),
		UEnum::GetDisplayValueAsText(State).ToString(),
		MusicStateData.CrossfadeTime);

	// Trigger audio playback for the target state
	UKhaaosAudioManager* AudioMgr = GetGameInstance()->GetSubsystem<UKhaaosAudioManager>();
	if (AudioMgr)
	{
		// Play the appropriate music track based on state
		switch (State)
		{
		case EMusicState::Menu:
			AudioMgr->TransitionToMix(TEXT("Menu"), MusicStateData.CrossfadeTime);
			break;
		case EMusicState::Combat:
			AudioMgr->TransitionToMix(TEXT("Combat"), MusicStateData.CrossfadeTime);
			break;
		default:
			break;
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Game Event Bindings
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosAdaptiveMusic::OnCombatStart()
{
	bCombatActive = true;

	// Cancel any pending de-escalation
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(CombatDeescalationTimer);
	}

	// Escalate to combat
	SetMusicIntensity(1.0f);
	TransitionToState(EMusicState::Combat);

	UE_LOG(LogKhaaosAdaptiveMusic, Log, TEXT("OnCombatStart: Escalating to Combat."));
}

void UKhaaosAdaptiveMusic::OnCombatEnd()
{
	bCombatActive = false;

	// Start de-escalation timer
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(
			CombatDeescalationTimer,
			this,
			&UKhaaosAdaptiveMusic::OnCombatDeescalationTimer,
			CombatDeescalationDelay,
			false
		);
	}

	UE_LOG(LogKhaaosAdaptiveMusic, Log, TEXT("OnCombatEnd: De-escalation in %.1fs."), CombatDeescalationDelay);
}

void UKhaaosAdaptiveMusic::OnZoneShrink()
{
	// Escalate to tension (between exploration and combat)
	SetMusicIntensity(0.6f);
	TransitionToState(EMusicState::Tension);

	UE_LOG(LogKhaaosAdaptiveMusic, Log, TEXT("OnZoneShrink: Escalating to Tension."));
}

void UKhaaosAdaptiveMusic::OnMatchEnd(bool bVictory)
{
	SetMusicIntensity(bVictory ? 0.3f : 0.5f);
	TransitionToState(bVictory ? EMusicState::Victory : EMusicState::Defeat);

	UE_LOG(LogKhaaosAdaptiveMusic, Log, TEXT("OnMatchEnd: %s"), bVictory ? TEXT("Victory") : TEXT("Defeat"));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosAdaptiveMusic::UpdateMetaSoundIntensity()
{
	// Set the Intensity parameter on the active MetaSound source
	// In production:
	//   if (ActiveMusicComponent)
	//   {
	//       ActiveMusicComponent->SetFloatParameter(FName("Intensity"), CurrentIntensity);
	//   }

	UE_LOG(LogKhaaosAdaptiveMusic, VeryVerbose, TEXT("MetaSound Intensity: %.3f"), CurrentIntensity);
}

void UKhaaosAdaptiveMusic::OnCombatDeescalationTimer()
{
	// De-escalate to exploration
	SetMusicIntensity(0.0f);
	TransitionToState(EMusicState::Exploration);

	UE_LOG(LogKhaaosAdaptiveMusic, Log, TEXT("Combat de-escalation: Transitioning to Exploration."));
}
