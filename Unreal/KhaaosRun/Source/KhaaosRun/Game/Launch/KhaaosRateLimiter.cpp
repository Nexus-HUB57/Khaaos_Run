// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Launch/KhaaosRateLimiter.h"
#include "HAL/PlatformTime.h"

UKhaaosRateLimiter::UKhaaosRateLimiter()
{
}

void UKhaaosRateLimiter::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogTemp, Log, TEXT("[RateLimiter] Initialized — AutoThrottle: %s"),
		bAutoThrottle ? TEXT("true") : TEXT("false"));
}

void UKhaaosRateLimiter::Deinitialize()
{
	ClientStates.Empty();
	Super::Deinitialize();
}

bool UKhaaosRateLimiter::CheckRateLimit(const FString& ClientId, const FRateLimitConfig& Config)
{
	double CurrentTime = GetCurrentTime();

	// ── Check if currently throttled ────────────────────────────────────────
	FClientRateState* State = ClientStates.Find(ClientId);
	if (!State)
	{
		// New client — initialize state
		FClientRateState NewState;
		NewState.LastResetTime = CurrentTime;
		NewState.LastSecondResetTime = CurrentTime;
		ClientStates.Add(ClientId, NewState);
		State = ClientStates.Find(ClientId);
	}

	// Check throttle expiration
	if (State->bIsThrottled)
	{
		if (CurrentTime >= State->ThrottledUntil)
		{
			// Throttle expired — reset
			State->bIsThrottled = false;
			State->RequestCount = 0;
			State->BurstUsed = 0;
			State->LastResetTime = CurrentTime;
			State->LastSecondResetTime = CurrentTime;
		}
		else
		{
			// Still throttled
			return false;
		}
	}

	// ── Per-minute rate limit ───────────────────────────────────────────────
	double MinuteElapsed = CurrentTime - State->LastResetTime;
	if (MinuteElapsed >= 60.0)
	{
		// Reset per-minute window
		State->RequestCount = 0;
		State->LastResetTime = CurrentTime;
	}

	State->RequestCount++;
	if (State->RequestCount > Config.MaxRequestsPerMinute)
	{
		// Exceeded per-minute limit
		if (bAutoThrottle)
		{
			State->bIsThrottled = true;
			State->ThrottledUntil = CurrentTime + Config.CooldownSeconds;
		}
		OnRateLimitExceeded.ExecuteIfBound(ClientId);
		return false;
	}

	// ── Per-second rate limit with burst ────────────────────────────────────
	double SecondElapsed = CurrentTime - State->LastSecondResetTime;
	if (SecondElapsed >= 1.0)
	{
		// Reset per-second window
		State->BurstUsed = 0;
		State->LastSecondResetTime = CurrentTime;
	}

	State->BurstUsed++;
	if (State->BurstUsed > Config.MaxRequestsPerSecond + Config.BurstAllowance)
	{
		// Exceeded per-second + burst limit
		if (bAutoThrottle)
		{
			State->bIsThrottled = true;
			State->ThrottledUntil = CurrentTime + Config.CooldownSeconds;
		}
		OnRateLimitExceeded.ExecuteIfBound(ClientId);
		return false;
	}

	return true;
}

void UKhaaosRateLimiter::RegisterRequest(const FString& ClientId)
{
	FClientRateState* State = ClientStates.Find(ClientId);
	if (State)
	{
		State->RequestCount++;
		State->BurstUsed++;
	}
}

bool UKhaaosRateLimiter::IsThrottled(const FString& ClientId) const
{
	const FClientRateState* State = ClientStates.Find(ClientId);
	if (!State || !State->bIsThrottled)
	{
		return false;
	}

	// Check if throttle has expired
	return GetCurrentTime() < State->ThrottledUntil;
}

float UKhaaosRateLimiter::GetThrottleRemaining(const FString& ClientId) const
{
	const FClientRateState* State = ClientStates.Find(ClientId);
	if (!State || !State->bIsThrottled)
	{
		return 0.0f;
	}

	double Remaining = State->ThrottledUntil - GetCurrentTime();
	return Remaining > 0.0 ? static_cast<float>(Remaining) : 0.0f;
}

void UKhaaosRateLimiter::RemoveClient(const FString& ClientId)
{
	ClientStates.Remove(ClientId);
}

int32 UKhaaosRateLimiter::GetTrackedClientCount() const
{
	return ClientStates.Num();
}

double UKhaaosRateLimiter::GetCurrentTime() const
{
	return FPlatformTime::Seconds();
}
