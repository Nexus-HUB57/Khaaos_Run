// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Player/KhaaosPlayerState.h"
#include "KhaaosRun.h"
#include "AbilitySystemComponent.h"
#include "Abilities/GameplayAbility.h"
#include "Game/AbilitySystem/KhaaosEffectApplier.h"
#include "Game/AbilitySystem/KhaaosGameplayTags.h"
#include "Game/Attributes/KhaaosAttributeSet.h"
#include "Game/KhaaosGameMode.h"
#include "Game/UI/KhaaosHUD.h"
#include "Game/UI/Widgets/KhaaosHUDWidget.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Net/UnrealNetwork.h"

// ─── EP555 XP thresholds, ordered high-to-low to make RankFromXp deterministic ──

const TArray<TPair<EPatenteRank, int32>> AKhaaosPlayerState::RankXpThresholds = {
        { EPatenteRank::Overlord, 5000000 },
        { EPatenteRank::Malakor,  1000000 },
        { EPatenteRank::Khael,     500000 },
        { EPatenteRank::Venex,     250000 },
        { EPatenteRank::Huran,     100000 },
        { EPatenteRank::Skeetw,     45000 },
        { EPatenteRank::Onith,      15000 },
        { EPatenteRank::Zheers,         0 }
};

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosPlayerState::AKhaaosPlayerState()
{
	AbilitySystemComponent = CreateDefaultSubobject<UAbilitySystemComponent>(TEXT("AbilitySystemComponent"));
	AbilitySystemComponent->SetIsReplicated(true);
	AbilitySystemComponent->SetReplicationMode(EGameplayEffectReplicationMode::Mixed);
	NetUpdateFrequency = 100.0f;

	KhaaosAttributeSet = CreateDefaultSubobject<UKhaaosAttributeSet>(TEXT("KhaaosAttributeSet"));
	AbilitySystemComponent->AddAttributeSetSubobject(KhaaosAttributeSet);

	// ── Core attributes (from TS AttributeSet / playerStats) ──
	Health    = 100.0f;
        MaxHealth = 100.0f;
        Credits   = 0;
        Speed     = 1.0f;
        Energy    = 100.0f;
        MaxEnergy = 100.0f;

        // ── Player status ──
        PlayerStatus = EPlayerStatus::Vivo;
        Patente      = EPatenteRank::Zheers;
        XP           = 0;
        Rating       = 1000;

        // ── Combat stats ──
        Kills           = 0;
        DamageDealt     = 0.0f;
        SurvivedTime    = 0.0f;
        EliminationCause = EEliminationCause::Queda;
        EliminatorId    = TEXT("");

        // ── Map position ──
        MapPosition = FVector2D::ZeroVector;

        // ── Lobby state ──
        bIsReady     = false;
        bIsHost      = false;
        bIsConnected = false;

        // ── Persistent stats ──
        MatchesPlayed = 0;
        Wins          = 0;
        Top5          = 0;
        SeasonKills   = 0;
        Deaths        = 0;
}

// ─── RepNotify Callbacks ────────────────────────────────────────────────────────

void AKhaaosPlayerState::BeginPlay()
{
	Super::BeginPlay();

	if (AbilitySystemComponent)
	{
		AbilitySystemComponent->InitAbilityActorInfo(this, this);
	}

	if (KhaaosAttributeSet)
	{
		Health = KhaaosAttributeSet->GetHealth();
		MaxHealth = KhaaosAttributeSet->GetMaxHealth();
		Energy = KhaaosAttributeSet->GetEnergy();
		MaxEnergy = KhaaosAttributeSet->GetMaxEnergy();
		KhaaosAttributeSet->OnAttributeChanged.AddDynamic(this, &AKhaaosPlayerState::HandleAttributeChanged);
		OutOfHealthDelegateHandle = KhaaosAttributeSet->OnOutOfHealth.AddUObject(
			this,
			&AKhaaosPlayerState::HandleOutOfHealth);
	}
}

void AKhaaosPlayerState::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (KhaaosAttributeSet)
	{
		KhaaosAttributeSet->OnAttributeChanged.RemoveDynamic(this, &AKhaaosPlayerState::HandleAttributeChanged);
		if (OutOfHealthDelegateHandle.IsValid())
		{
			KhaaosAttributeSet->OnOutOfHealth.Remove(OutOfHealthDelegateHandle);
			OutOfHealthDelegateHandle.Reset();
		}
	}

	Super::EndPlay(EndPlayReason);
}

UAbilitySystemComponent* AKhaaosPlayerState::GetAbilitySystemComponent() const
{
	return AbilitySystemComponent;
}

void AKhaaosPlayerState::HandleGameplayCue(
	AActor* Self,
	FGameplayTag GameplayCueTag,
	EGameplayCueEvent::Type EventType,
	const FGameplayCueParameters& Parameters)
{
	(void)Parameters;
	const FKhaaosGameplayTags& Tags = FKhaaosGameplayTags::Get();
	if (Self != this || GameplayCueTag != Tags.GameplayCue_Damage_Zone ||
		EventType != EGameplayCueEvent::Executed)
	{
		return;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
	{
		APlayerController* PlayerController = It->Get();
		if (!PlayerController || !PlayerController->IsLocalController() || PlayerController->PlayerState != this)
		{
			continue;
		}

		if (AKhaaosHUD* KhaaosHUD = Cast<AKhaaosHUD>(PlayerController->GetHUD()))
		{
			if (UKhaaosHUDWidget* HUDWidget = KhaaosHUD->GetHUDWidget())
			{
				const float CurrentHealth = KhaaosAttributeSet ? KhaaosAttributeSet->GetHealth() : Health;
				const float CurrentMaxHealth = KhaaosAttributeSet ? KhaaosAttributeSet->GetMaxHealth() : MaxHealth;
				if (PlayerStatus != EPlayerStatus::Vivo || CurrentHealth <= 0.0f)
				{
					HUDWidget->StopSafeZoneWarningAudio();
				}
				else
				{
					HUDWidget->NotifySafeZoneDamageCue(CurrentHealth, CurrentMaxHealth);
				}
			}
		}
		break;
	}
}

void AKhaaosPlayerState::HandleAttributeChanged(
	UKhaaosAttributeSet* AttributeSet,
	const FString& AttributeName,
	float NewValue)
{
	if (AttributeSet != KhaaosAttributeSet)
	{
		return;
	}

	if (AttributeName == TEXT("Health"))
	{
		const float PreviousHealth = Health;
		Health = NewValue;
		OnHealthChanged.Broadcast(Health, Health - PreviousHealth);
	}
	else if (AttributeName == TEXT("MaxHealth"))
	{
		MaxHealth = NewValue;
	}
	else if (AttributeName == TEXT("Energy"))
	{
		Energy = NewValue;
	}
	else if (AttributeName == TEXT("MaxEnergy"))
	{
		MaxEnergy = NewValue;
	}
}

void AKhaaosPlayerState::HandleOutOfHealth(
	AActor* OwnerActor,
	AActor* AvatarActor,
	AActor* EffectCauser)
{
	(void)AvatarActor;
	if (!HasAuthority() || OwnerActor != this || PlayerStatus != EPlayerStatus::Vivo)
	{
		return;
	}

	const bool bKilledByZone = Cast<AKhaaosSafeZone>(EffectCauser) != nullptr;
	APlayerState* Eliminator = bKilledByZone ? nullptr : Cast<APlayerState>(EffectCauser);
	const FString Cause = bKilledByZone ? TEXT("ZONA") : (Eliminator ? TEXT("PVP") : TEXT("QUEDA"));

	if (UWorld* World = GetWorld())
	{
		if (AKhaaosGameMode* GameMode = World->GetAuthGameMode<AKhaaosGameMode>())
		{
			GameMode->EliminatePlayer(this, Eliminator, Cause);
		}
	}
}

void AKhaaosPlayerState::OnRep_Credits()
{
        // Client-side credits UI update
        OnCreditsChanged.Broadcast(Credits, 0);
}

void AKhaaosPlayerState::OnRep_PlayerStatus()
{
        // FIXED: Previously broadcast (PlayerStatus, PlayerStatus) — both params same
        // Server-side SetPlayerStatus already broadcasts correct old→new.
        // This client RepNotify provides secondary notification for client UI.
        OnPlayerStatusChanged.Broadcast(PlayerStatus, PlayerStatus);
	if (PlayerStatus == EPlayerStatus::Vivo)
	{
		return;
	}

	if (UWorld* World = GetWorld())
	{
		for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
		{
			APlayerController* PlayerController = It->Get();
			if (!PlayerController || !PlayerController->IsLocalController() || PlayerController->PlayerState != this)
			{
				continue;
			}

			if (AKhaaosHUD* KhaaosHUD = Cast<AKhaaosHUD>(PlayerController->GetHUD()))
			{
				if (UKhaaosHUDWidget* HUDWidget = KhaaosHUD->GetHUDWidget())
				{
					HUDWidget->StopSafeZoneWarningAudio();
				}
			}
			break;
		}
	}
}

// ─── Server Authority Methods ───────────────────────────────────────────────────

float AKhaaosPlayerState::ApplyDamage(float DamageAmount, APlayerState* Instigator)
{
	return ApplyDamageOfType(DamageAmount, FGameplayTag(), Instigator);
}

float AKhaaosPlayerState::ApplyDamageOfType(float DamageAmount, const FGameplayTag& DamageType, APlayerState* Instigator)
{
	if (!HasAuthority() || !AbilitySystemComponent || !KhaaosAttributeSet)
	{
		return 0.0f;
	}

        if (PlayerStatus != EPlayerStatus::Vivo || DamageAmount <= 0.0f)
        {
                return 0.0f;
        }

	const float MitigatedDamage = UKhaaosAttributeSet::CalculateSpeciesMitigatedDamage(
		DamageAmount,
		DamageType,
		KhaaosAttributeSet->GetOnithProjectileDamageReduction(),
		KhaaosAttributeSet->GetOnithExplosionDamageReduction());
	if (MitigatedDamage <= 0.0f)
	{
		return 0.0f;
	}

	const float OldHealth = KhaaosAttributeSet->GetHealth();
	if (UGameInstance* GameInstance = GetGameInstance())
	{
		if (UKhaaosEffectApplier* EffectApplier = GameInstance->GetSubsystem<UKhaaosEffectApplier>())
		{
			EffectApplier->ApplyDamage(
				AbilitySystemComponent,
				MitigatedDamage,
				DamageType,
				Instigator,
				Instigator);
		}
	}

	const float ActualDamage = FMath::Max(0.0f, OldHealth - KhaaosAttributeSet->GetHealth());
	DamageDealt += ActualDamage;
	return ActualDamage;
}

void AKhaaosPlayerState::SetSpeciesPassiveAbility(
	TSubclassOf<UGameplayAbility> PassiveAbilityClass,
	UObject* SourceObject)
{
	if (!HasAuthority() || !AbilitySystemComponent)
	{
		return;
	}

	if (SpeciesPassiveAbilityHandle.IsValid())
	{
		const FGameplayAbilitySpec* ExistingSpec = AbilitySystemComponent->FindAbilitySpecFromHandle(SpeciesPassiveAbilityHandle);
		if (ExistingSpec && ExistingSpec->Ability &&
			ExistingSpec->Ability->GetClass() == PassiveAbilityClass.Get() && ExistingSpec->IsActive())
		{
			return;
		}

		AbilitySystemComponent->CancelAbilityHandle(SpeciesPassiveAbilityHandle);
		AbilitySystemComponent->ClearAbility(SpeciesPassiveAbilityHandle);
		SpeciesPassiveAbilityHandle = FGameplayAbilitySpecHandle();
	}

	if (!PassiveAbilityClass)
	{
		return;
	}

	const FGameplayAbilitySpec NewSpec(PassiveAbilityClass, 1, INDEX_NONE, SourceObject ? SourceObject : this);
	SpeciesPassiveAbilityHandle = AbilitySystemComponent->GiveAbility(NewSpec);
	if (!SpeciesPassiveAbilityHandle.IsValid() || !AbilitySystemComponent->TryActivateAbility(SpeciesPassiveAbilityHandle))
	{
		UE_LOG(LogKhaaosRun, Error, TEXT("PlayerState: failed to grant/activate species passive %s"), *GetNameSafe(PassiveAbilityClass.Get()));
		if (SpeciesPassiveAbilityHandle.IsValid())
		{
			AbilitySystemComponent->ClearAbility(SpeciesPassiveAbilityHandle);
			SpeciesPassiveAbilityHandle = FGameplayAbilitySpecHandle();
		}
	}
}

float AKhaaosPlayerState::ApplyZoneDamage(float DamageAmount, AActor* EffectCauser)
{
	if (!HasAuthority() || PlayerStatus != EPlayerStatus::Vivo ||
		DamageAmount <= 0.0f || !AbilitySystemComponent || !KhaaosAttributeSet || !EffectCauser)
	{
		return 0.0f;
	}

	const float OldHealth = KhaaosAttributeSet->GetHealth();
	if (UGameInstance* GameInstance = GetGameInstance())
	{
		if (UKhaaosEffectApplier* EffectApplier = GameInstance->GetSubsystem<UKhaaosEffectApplier>())
		{
			EffectApplier->ApplyZoneDamage(AbilitySystemComponent, DamageAmount, EffectCauser);
		}
	}

	const float ActualDamage = FMath::Max(0.0f, OldHealth - KhaaosAttributeSet->GetHealth());
	DamageDealt += ActualDamage;
	return ActualDamage;
}

float AKhaaosPlayerState::Heal(float HealAmount)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return 0.0f;
        }

        if (HealAmount <= 0.0f)
        {
                return 0.0f;
        }

	if (!KhaaosAttributeSet)
	{
		return 0.0f;
	}
	const float OldHealth = KhaaosAttributeSet->GetHealth();
	KhaaosAttributeSet->Heal(HealAmount);
	const float ActualHeal = FMath::Max(0.0f, KhaaosAttributeSet->GetHealth() - OldHealth);
	return ActualHeal;
}

void AKhaaosPlayerState::GrantCredits(int32 Amount)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        int32 OldCredits = Credits;
        Credits = FMath::Max(0, Credits + Amount);

        OnCreditsChanged.Broadcast(Credits, Credits - OldCredits);
}

void AKhaaosPlayerState::SetPlayerStatus(EPlayerStatus NewStatus)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        EPlayerStatus OldStatus = PlayerStatus;
        PlayerStatus = NewStatus;

        if (OldStatus != NewStatus)
        {
                OnPlayerStatusChanged.Broadcast(OldStatus, NewStatus);
                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosPlayerState: Status changed %d → %d for %s"),
                        static_cast<int32>(OldStatus), static_cast<int32>(NewStatus), *GetPlayerName());
        }
}

EPatenteRank AKhaaosPlayerState::RankFromXp(int32 Xp)
{
        // RankXpThresholds is an ordered TArray, not a hash map, so this
        // high-to-low scan is deterministic and preserves the EP555 thresholds.
        for (const auto& Pair : RankXpThresholds)
        {
                if (Xp >= Pair.Value)
                {
                        return Pair.Key;
                }
        }

        return EPatenteRank::Zheers;
}

FString AKhaaosPlayerState::PatenteToString(EPatenteRank Rank)
{
        switch (Rank)
        {
        case EPatenteRank::Zheers:   return TEXT("ZHEERS");
        case EPatenteRank::Onith:    return TEXT("ONITH");
        case EPatenteRank::Skeetw:   return TEXT("SKEETW");
        case EPatenteRank::Huran:    return TEXT("HURAN");
        case EPatenteRank::Venex:    return TEXT("VENEX");
        case EPatenteRank::Khael:    return TEXT("KHAEL");
        case EPatenteRank::Malakor:  return TEXT("MALAKOR");
        case EPatenteRank::Overlord: return TEXT("OVERLORD");
        default:                     return TEXT("UNKNOWN");
        }
}

// ─── Replication ────────────────────────────────────────────────────────────────

void AKhaaosPlayerState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);

		// Combat values replicate through GAS; private energy/defense are owner-only.
		DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosPlayerState, Credits, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosPlayerState, Speed);

        // Player status
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosPlayerState, PlayerStatus, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosPlayerState, Patente);
        DOREPLIFETIME(AKhaaosPlayerState, XP);
        DOREPLIFETIME(AKhaaosPlayerState, Rating);

        // Combat stats
        DOREPLIFETIME(AKhaaosPlayerState, Kills);
        DOREPLIFETIME(AKhaaosPlayerState, DamageDealt);
        DOREPLIFETIME(AKhaaosPlayerState, SurvivedTime);
        DOREPLIFETIME(AKhaaosPlayerState, EliminationCause);
        DOREPLIFETIME(AKhaaosPlayerState, EliminatorId);

        // Position
        DOREPLIFETIME(AKhaaosPlayerState, MapPosition);

        // Lobby state
        DOREPLIFETIME(AKhaaosPlayerState, bIsReady);
        DOREPLIFETIME(AKhaaosPlayerState, bIsHost);
        DOREPLIFETIME(AKhaaosPlayerState, bIsConnected);

        // Persistent stats
        DOREPLIFETIME(AKhaaosPlayerState, MatchesPlayed);
        DOREPLIFETIME(AKhaaosPlayerState, Wins);
        DOREPLIFETIME(AKhaaosPlayerState, Top5);
        DOREPLIFETIME(AKhaaosPlayerState, SeasonKills);
        DOREPLIFETIME(AKhaaosPlayerState, Deaths);
}
