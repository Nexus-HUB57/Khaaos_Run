// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AntiCheat/KhaaosAntiCheat.h"
#include "GameFramework/PlayerState.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/GameSession.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

UKhaaosAntiCheat::UKhaaosAntiCheat()
{
}

void UKhaaosAntiCheat::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogTemp, Log, TEXT("[AntiCheat] Initialized — AutoKick: %s, StrikeThreshold: %d, SpeedTolerance: %.2fx"),
		bAutoKickOnCheat ? TEXT("true") : TEXT("false"), CheatStrikeThreshold, MaxSpeedTolerance);
}

void UKhaaosAntiCheat::Deinitialize()
{
	PlayerScores.Empty();
	LastShotTime.Empty();
	Super::Deinitialize();
	UE_LOG(LogTemp, Log, TEXT("[AntiCheat] Deinitialized"));
}

void UKhaaosAntiCheat::RegisterPlayer(APlayerState* Player)
{
	if (!Player || PlayerScores.Contains(Player))
	{
		return;
	}

	FPlayerSuspicionScore Score;
	Score.PlayerId = Player->GetPlayerId();
	PlayerScores.Add(Player, Score);

	UE_LOG(LogTemp, Log, TEXT("[AntiCheat] Player registered: %s (ID: %d)"),
		*Player->GetPlayerName(), Score.PlayerId);
}

void UKhaaosAntiCheat::UnregisterPlayer(APlayerState* Player)
{
	if (!Player)
	{
		return;
	}

	PlayerScores.Remove(Player);
	LastShotTime.Remove(Player);

	UE_LOG(LogTemp, Log, TEXT("[AntiCheat] Player unregistered: %s"), *Player->GetPlayerName());
}

FPlayerSuspicionScore UKhaaosAntiCheat::GetPlayerScore(APlayerState* Player) const
{
	if (const FPlayerSuspicionScore* Score = PlayerScores.Find(Player))
	{
		return *Score;
	}
	return FPlayerSuspicionScore();
}

// ─── Movement Validation ───────────────────────────────────────────────────────

bool UKhaaosAntiCheat::ValidateMovement(APlayerState* Player, FVector OldLocation, FVector NewLocation, float DeltaTime)
{
	if (!Player || DeltaTime <= 0.0f)
	{
		return false;
	}

	FPlayerSuspicionScore* Score = PlayerScores.Find(Player);
	if (!Score)
	{
		RegisterPlayer(Player);
		Score = PlayerScores.Find(Player);
		if (!Score)
		{
			return false;
		}
	}

	bool bValid = true;

	// ── Speed Hack Check ────────────────────────────────────────────────────
	float Distance = FVector::Dist(OldLocation, NewLocation);
	float Speed = Distance / DeltaTime;
	float MaxAllowedSpeed = MaxMovementPerSecond * MaxSpeedTolerance;

	if (Speed > MaxAllowedSpeed)
	{
		bValid = false;
		Score->SpeedHackScore += 15.0f;
		Score->StrikesCount++;
		Score->LastDetectionTime = FPlatformTime::Seconds();

		FString Evidence = FString::Printf(TEXT("Speed: %.1f > Max: %.1f (DT: %.4f)"), Speed, MaxAllowedSpeed, DeltaTime);
		IssueStrike(Player, ECheatType::SpeedHack, Evidence);
	}

	// ── Teleport Check ──────────────────────────────────────────────────────
	if (Distance > MaxTeleportDistance)
	{
		bValid = false;
		Score->TeleportScore += 20.0f;
		Score->StrikesCount++;
		Score->LastDetectionTime = FPlatformTime::Seconds();

		FString Evidence = FString::Printf(TEXT("Distance: %.1f > Max: %.1f"), Distance, MaxTeleportDistance);
		IssueStrike(Player, ECheatType::Teleport, Evidence);
	}

	// ── Fly Hack Check ──────────────────────────────────────────────────────
	float HeightAboveGround = NewLocation.Z - GroundZ;
	if (HeightAboveGround > MaxHeightAboveGround)
	{
		bValid = false;
		Score->SpeedHackScore += 10.0f; // Categorized under speed for now
		Score->StrikesCount++;
		Score->LastDetectionTime = FPlatformTime::Seconds();

		FString Evidence = FString::Printf(TEXT("Height: %.1f > Max: %.1f"), HeightAboveGround, MaxHeightAboveGround);
		IssueStrike(Player, ECheatType::FlyHack, Evidence);
	}

	Score->RecomputeTotal();
	return bValid;
}

// ─── Shot Validation ───────────────────────────────────────────────────────────

bool UKhaaosAntiCheat::ValidateShot(APlayerState* Shooter, FVector ShotOrigin, FVector ShotDirection, float ShotTime)
{
	if (!Shooter)
	{
		return false;
	}

	FPlayerSuspicionScore* Score = PlayerScores.Find(Shooter);
	if (!Score)
	{
		RegisterPlayer(Shooter);
		Score = PlayerScores.Find(Shooter);
		if (!Score)
		{
			return false;
		}
	}

	bool bValid = true;
	double CurrentTime = FPlatformTime::Seconds();

	// ── Fire Rate Check ─────────────────────────────────────────────────────
	if (double* LastTime = LastShotTime.Find(Shooter))
	{
		double TimeSinceLastShot = CurrentTime - *LastTime;
		if (TimeSinceLastShot < MinTimeBetweenShots)
		{
			bValid = false;
			Score->StrikesCount++;

			FString Evidence = FString::Printf(TEXT("FireInterval: %.4fs < Min: %.4fs"),
				(float)TimeSinceLastShot, MinTimeBetweenShots);
			IssueStrike(Shooter, ECheatType::FireRateHack, Evidence);
		}
	}

	LastShotTime.Add(Shooter, CurrentTime);
	Score->TotalShots++;

	// ── Aimbot Check ────────────────────────────────────────────────────────
	if (Score->TotalShots >= MinShotsForAimbotAnalysis)
	{
		if (CheckAimbotSuspicion(Shooter))
		{
			bValid = false;
		}
	}

	Score->RecomputeTotal();
	return bValid;
}

// ─── Damage Validation ─────────────────────────────────────────────────────────

bool UKhaaosAntiCheat::ValidateDamage(APlayerState* Victim, float DamageAmount, FGameplayTag DamageType)
{
	if (!Victim || DamageAmount <= 0.0f)
	{
		return false;
	}

	// ── Damage Range Check ──────────────────────────────────────────────────
	// Expected damage range: 1-200 for any single hit
	const float MinExpectedDamage = 1.0f;
	const float MaxExpectedDamage = 200.0f;

	if (DamageAmount < MinExpectedDamage || DamageAmount > MaxExpectedDamage)
	{
		FPlayerSuspicionScore* Score = PlayerScores.Find(Victim);
		if (Score)
		{
			Score->StrikesCount++;
			Score->RecomputeTotal();
		}

		FString Evidence = FString::Printf(TEXT("Damage: %.1f outside range [%.1f, %.1f]"),
			DamageAmount, MinExpectedDamage, MaxExpectedDamage);
		IssueStrike(Victim, ECheatType::InvalidDamage, Evidence);
		return false;
	}

	// ── Damage Type Validation ──────────────────────────────────────────────
	// Valid if the tag is non-empty (specific check per weapon type is done in weapon code)
	if (!DamageType.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("[AntiCheat] Invalid damage type tag for victim: %s"), *Victim->GetPlayerName());
		return false;
	}

	return true;
}

// ─── Item Pickup Validation ────────────────────────────────────────────────────

bool UKhaaosAntiCheat::ValidateItemPickup(APlayerState* Player, AActor* Item)
{
	if (!Player || !Item)
	{
		return false;
	}

	// ── Distance Check ──────────────────────────────────────────────────────
	const float MaxPickupDistance = 500.0f; // 5 meters
	float Distance = FVector::Dist(Player->GetPawn() ? Player->GetPawn()->GetActorLocation() : FVector::ZeroVector,
		Item->GetActorLocation());

	if (Distance > MaxPickupDistance)
	{
		FString Evidence = FString::Printf(TEXT("Pickup distance: %.1f > Max: %.1f"), Distance, MaxPickupDistance);
		IssueStrike(Player, ECheatType::ItemPickupHack, Evidence);
		return false;
	}

	// ── Item Validity Check ─────────────────────────────────────────────────
	if (Item->IsPendingKillPending())
	{
		FString Evidence = TEXT("Item is pending kill");
		IssueStrike(Player, ECheatType::ItemPickupHack, Evidence);
		return false;
	}

	return true;
}

// ─── Enforcement ───────────────────────────────────────────────────────────────

void UKhaaosAntiCheat::KickPlayer(APlayerState* Player, const FString& Reason)
{
	if (!Player)
	{
		return;
	}

	UE_LOG(LogTemp, Warning, TEXT("[AntiCheat] Kicking player %s — Reason: %s"),
		*Player->GetPlayerName(), *Reason);

	// Server-authoritative kick via game mode
	UWorld* World = GetWorld();
	if (World && World->GetAuthGameMode())
	{
		if (APlayerController* PC = Player->GetPlayerController())
		{
			World->GetAuthGameMode()->GameSession->KickPlayer(PC, FText::FromString(Reason));
		}
	}

	// Clean up tracking
	UnregisterPlayer(Player);
}

void UKhaaosAntiCheat::IssueStrike(APlayerState* Player, ECheatType CheatType, const FString& Evidence)
{
	if (!Player)
	{
		return;
	}

	UE_LOG(LogTemp, Warning, TEXT("[AntiCheat] Strike — Player: %s, Type: %s, Evidence: %s"),
		*Player->GetPlayerName(),
		StaticEnum<ECheatType>()->GetNameStringByValue(static_cast<int64>(CheatType)).operator*(),
		*Evidence);

	// Broadcast cheat detection event
	OnCheatDetected.ExecuteIfBound(Player->GetPlayerId(), CheatType, Evidence);

	// Check if auto-kick threshold is reached
	if (bAutoKickOnCheat)
	{
		FPlayerSuspicionScore* Score = PlayerScores.Find(Player);
		if (Score && Score->StrikesCount >= CheatStrikeThreshold)
		{
			FString Reason = FString::Printf(TEXT("Anti-cheat: %d strikes (last: %s)"),
				Score->StrikesCount,
				StaticEnum<ECheatType>()->GetNameStringByValue(static_cast<int64>(CheatType)).operator*());
			KickPlayer(Player, Reason);
		}
	}
}

// ─── Internal Methods ──────────────────────────────────────────────────────────

void UKhaaosAntiCheat::RecordHit(APlayerState* Shooter, bool bHit)
{
	FPlayerSuspicionScore* Score = PlayerScores.Find(Shooter);
	if (Score)
	{
		if (bHit)
		{
			Score->TotalHits++;
		}
	}
}

bool UKhaaosAntiCheat::CheckAimbotSuspicion(APlayerState* Shooter)
{
	FPlayerSuspicionScore* Score = PlayerScores.Find(Shooter);
	if (!Score || Score->TotalShots < MinShotsForAimbotAnalysis)
	{
		return false;
	}

	float Accuracy = static_cast<float>(Score->TotalHits) / static_cast<float>(Score->TotalShots);

	if (Accuracy > MaxAccuracyBeforeSuspicious)
	{
		Score->AimbotScore += 10.0f;
		Score->StrikesCount++;
		Score->LastDetectionTime = FPlatformTime::Seconds();

		FString Evidence = FString::Printf(TEXT("Accuracy: %.3f > Max: %.3f (%d shots, %d hits)"),
			Accuracy, MaxAccuracyBeforeSuspicious, Score->TotalShots, Score->TotalHits);
		IssueStrike(Shooter, ECheatType::Aimbot, Evidence);

		return true;
	}

	return false;
}
