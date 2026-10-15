// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Player/KhaaosVitalityComponent.h"
#include "KhaaosAttributeSet.h"
#include "AbilitySystemComponent.h"
#include "GameplayTagContainer.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "Camera/PlayerCameraManager.h"
#include "TimerManager.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

UKhaaosVitalityComponent::UKhaaosVitalityComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 1.0f; // 1 Hz é suficiente para sobrevivência

	// Tags padrão (ajuste se o projeto já tiver um GameplayTags.ini)
	StunTag = FGameplayTag::RequestGameplayTag(FName("Debuff.Stun"), false);
	VisionBlurTag = FGameplayTag::RequestGameplayTag(FName("Debuff.VisionBlur"), false);
}

void UKhaaosVitalityComponent::BeginPlay()
{
	Super::BeginPlay();

	CurrentVitality = MaxVitality;

	// Tenta encontrar o ASC no Owner ou no PlayerState
	if (AActor* Owner = GetOwner())
	{
		if (UAbilitySystemComponent* ASC = Owner->FindComponentByClass<UAbilitySystemComponent>())
		{
			InitializeFromASC(ASC);
		}
		else if (APawn* Pawn = Cast<APawn>(Owner))
		{
			if (APlayerState* PS = Pawn->GetPlayerState())
			{
				if (UAbilitySystemComponent* ASC = PS->FindComponentByClass<UAbilitySystemComponent>())
				{
					InitializeFromASC(ASC);
				}
			}
		}
	}

	NotifyVitalityChanged();
}

void UKhaaosVitalityComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	GetWorld()->GetTimerManager().ClearAllTimersForObject(this);
	Super::EndPlay(EndPlayReason);
}

void UKhaaosVitalityComponent::InitializeFromASC(UAbilitySystemComponent* ASC)
{
	AbilitySystemComp = ASC;
	if (!ASC)
	{
		return;
	}

	if (const UKhaaosAttributeSet* Attr = ASC->GetSet<UKhaaosAttributeSet>())
	{
		const float MaxH = Attr->GetMaxHealth();
		const float H = Attr->GetHealth();
		if (MaxH > 0.f)
		{
			MaxVitality = MaxH;
			CurrentVitality = FMath::Clamp(H, 0.f, MaxH);
			NotifyVitalityChanged();
		}
	}
}
}

void UKhaaosVitalityComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (!IsAlive()) return;

	// Aumento natural de sobrevivência
	Hunger = FMath::Clamp(Hunger + HungerRate * DeltaTime, 0.f, 100.f);
	Thirst = FMath::Clamp(Thirst + ThirstRate * DeltaTime, 0.f, 100.f);

	// Cansaço só aumenta se o personagem estiver se movendo
	if (ACharacter* Char = Cast<ACharacter>(GetOwner()))
	{
		if (Char->GetVelocity().SizeSquared() > 100.f)
		{
			Fatigue = FMath::Clamp(Fatigue + FatigueRate * DeltaTime, 0.f, 100.f);
		}
		else
		{
			// Regenera cansaço parado
			Fatigue = FMath::Clamp(Fatigue - FatigueRate * 0.5f * DeltaTime, 0.f, 100.f);
		}
	}

	// Dano passivo por fome/sede extrema
	if (Hunger > 90.f || Thirst > 90.f)
	{
		ApplyDamage(0.5f * DeltaTime); // 0.5 por segundo quando crítico
	}
}

// ============================================================
// DANO / CURA
// ============================================================

void UKhaaosVitalityComponent::ApplyPercentageDamage(float Percent, AActor* DamageCauser)
{
	if (!IsAlive() || Percent <= 0.f) return;

	float Multiplier = 1.0f;
	if (Hunger > 70.f || Thirst > 70.f)
	{
		Multiplier = StarvationDamageMultiplier;
	}

	const float Amount = MaxVitality * Percent * Multiplier;
	ApplyDamage(Amount, DamageCauser);
}

void UKhaaosVitalityComponent::ApplyDamage(float Amount, AActor* DamageCauser)
{
	if (!IsAlive() || Amount <= 0.f) return;

	CurrentVitality = FMath::Max(0.f, CurrentVitality - Amount);
	ClampVitality();
	SyncToGASHealth();
	NotifyVitalityChanged();

	UE_LOG(LogTemp, Log, TEXT("[Vitality] Damage %.1f from %s → Current %.1f / %.1f (%.0f%%)"),
		Amount,
		DamageCauser ? *DamageCauser->GetName() : TEXT("Unknown"),
		CurrentVitality, MaxVitality, GetVitalityPercent() * 100.f);

	if (CurrentVitality <= 0.f)
	{
		HandleDeath();
	}
}

void UKhaaosVitalityComponent::ApplyPercentageHeal(float Percent)
{
	if (Percent <= 0.f) return;
	ApplyHeal(MaxVitality * Percent);
}

void UKhaaosVitalityComponent::ApplyHeal(float Amount)
{
	if (Amount <= 0.f || !IsAlive()) return;

	CurrentVitality = FMath::Min(MaxVitality, CurrentVitality + Amount);
	ClampVitality();
	SyncToGASHealth();
	NotifyVitalityChanged();
}

float UKhaaosVitalityComponent::GetVitalityPercent() const
{
	return MaxVitality > 0.f ? CurrentVitality / MaxVitality : 0.f;
}

bool UKhaaosVitalityComponent::IsAlive() const
{
	return CurrentVitality > 0.f;
}

void UKhaaosVitalityComponent::ClampVitality()
{
	CurrentVitality = FMath::Clamp(CurrentVitality, 0.f, MaxVitality);
}

void UKhaaosVitalityComponent::SyncToGASHealth()
{
	UAbilitySystemComponent* ASC = AbilitySystemComp.Get();
	if (!ASC)
	{
		return;
	}

	const UKhaaosAttributeSet* ConstAttr = ASC->GetSet<UKhaaosAttributeSet>();
	if (!ConstAttr)
	{
		return;
	}

	UKhaaosAttributeSet* Attr = const_cast<UKhaaosAttributeSet*>(ConstAttr);
	const float MaxH = Attr->GetMaxHealth();
	if (MaxH <= 0.f)
	{
		return;
	}

	const float TargetHealth = GetVitalityPercent() * MaxH;
	const float CurrentHealth = Attr->GetHealth();
	const float Delta = TargetHealth - CurrentHealth;

	if (Delta < -KINDA_SMALL_NUMBER)
	{
		Attr->ApplyDamage(-Delta, GetOwner());
	}
	else if (Delta > KINDA_SMALL_NUMBER)
	{
		Attr->Heal(Delta);
	}
}

void UKhaaosVitalityComponent::NotifyVitalityChanged()
{
	OnVitalityChanged.Broadcast(GetVitalityPercent(), MaxVitality);
}

void UKhaaosVitalityComponent::HandleDeath()
{
	UE_LOG(LogTemp, Warning, TEXT("[Vitality] Owner %s depleted vitality."), *GetNameSafe(GetOwner()));
	OnVitalityDepleted.Broadcast(GetOwner());
}

// ============================================================
// DEBUFFS
// ============================================================

void UKhaaosVitalityComponent::ApplyStun(float Duration)
{
	if (Duration <= 0.f) return;

	ActiveDebuffs.Add(StunTag);
	OnDebuffApplied.Broadcast(StunTag, Duration);

	if (ACharacter* Char = Cast<ACharacter>(GetOwner()))
	{
		if (UCharacterMovementComponent* Move = Char->GetCharacterMovement())
		{
			Move->DisableMovement();
		}
	}

	GetWorld()->GetTimerManager().ClearTimer(StunTimerHandle);
	GetWorld()->GetTimerManager().SetTimer(StunTimerHandle, this, &UKhaaosVitalityComponent::ClearStun, Duration, false);

	UE_LOG(LogTemp, Log, TEXT("[Vitality] Stun applied for %.1fs"), Duration);
}

void UKhaaosVitalityComponent::ClearStun()
{
	ActiveDebuffs.Remove(StunTag);
	OnDebuffRemoved.Broadcast(StunTag);

	if (ACharacter* Char = Cast<ACharacter>(GetOwner()))
	{
		if (UCharacterMovementComponent* Move = Char->GetCharacterMovement())
		{
			Move->SetMovementMode(MOVE_Walking);
		}
	}

	UE_LOG(LogTemp, Log, TEXT("[Vitality] Stun cleared"));
}

void UKhaaosVitalityComponent::ApplyVisionBlur(float Duration)
{
	if (Duration <= 0.f) return;

	ActiveDebuffs.Add(VisionBlurTag);
	OnDebuffApplied.Broadcast(VisionBlurTag, Duration);

	if (APawn* Pawn = Cast<APawn>(GetOwner()))
	{
		if (APlayerController* PC = Cast<APlayerController>(Pawn->GetController()))
		{
			if (APlayerCameraManager* Cam = PC->PlayerCameraManager)
			{
				Cam->SetFOV(Cam->GetFOVAngle() * 0.72f);
			}
		}
	}

	GetWorld()->GetTimerManager().ClearTimer(BlurTimerHandle);
	GetWorld()->GetTimerManager().SetTimer(BlurTimerHandle, this, &UKhaaosVitalityComponent::ClearVisionBlur, Duration, false);

	UE_LOG(LogTemp, Log, TEXT("[Vitality] VisionBlur applied for %.1fs"), Duration);
}

void UKhaaosVitalityComponent::ClearVisionBlur()
{
	ActiveDebuffs.Remove(VisionBlurTag);
	OnDebuffRemoved.Broadcast(VisionBlurTag);

	if (APawn* Pawn = Cast<APawn>(GetOwner()))
	{
		if (APlayerController* PC = Cast<APlayerController>(Pawn->GetController()))
		{
			if (APlayerCameraManager* Cam = PC->PlayerCameraManager)
			{
				Cam->SetFOV(90.0f); // valor padrão do projeto – ajuste se necessário
			}
		}
	}

	UE_LOG(LogTemp, Log, TEXT("[Vitality] VisionBlur cleared"));
}

void UKhaaosVitalityComponent::RemoveDebuff(FGameplayTag DebuffTag)
{
	if (DebuffTag == StunTag) ClearStun();
	else if (DebuffTag == VisionBlurTag) ClearVisionBlur();
	else ActiveDebuffs.Remove(DebuffTag);
}

bool UKhaaosVitalityComponent::HasDebuff(FGameplayTag DebuffTag) const
{
	return ActiveDebuffs.Contains(DebuffTag);
}
