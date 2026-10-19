// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Launch/KhaaosDDoSProtection.h"
#include "HAL/PlatformTime.h"

UKhaaosDDoSProtection::UKhaaosDDoSProtection()
{
}

void UKhaaosDDoSProtection::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	WindowStartTime = GetCurrentTime();

	UE_LOG(LogTemp, Log, TEXT("[DDoSProtection] Initialized — Enabled: %s, MaxConn/Sec: %d, MaxPerIP: %d"),
		bProtectionEnabled ? TEXT("true") : TEXT("false"),
		Config.MaxConnectionsPerSecond, Config.MaxConnectionsPerIP);
}

void UKhaaosDDoSProtection::Deinitialize()
{
	IPRecords.Empty();
	Super::Deinitialize();
}

bool UKhaaosDDoSProtection::OnNewConnection(const FString& IP)
{
	if (!bProtectionEnabled)
	{
		return true; // Protection disabled — allow all
	}

	double CurrentTime = GetCurrentTime();

	// ── Check if IP is currently blocked ────────────────────────────────────
	FIPConnectionRecord* Record = IPRecords.Find(IP);
	if (Record && Record->bIsBlocked)
	{
		if (CurrentTime < Record->BlockedUntil)
		{
			// Still blocked
			Metrics.TotalRejected++;
			return false;
		}
		else
		{
			// Block expired
			Record->bIsBlocked = false;
			Record->ConnectionCount = 0;
		}
	}

	// ── Maintain global connection window ───────────────────────────────────
	double WindowElapsed = CurrentTime - WindowStartTime;
	if (WindowElapsed >= Config.ConnectionWindowSeconds)
	{
		GlobalConnectionCount = 0;
		WindowStartTime = CurrentTime;

		// Also reset per-IP connection counts in the window
		for (auto& Pair : IPRecords)
		{
			Pair.Value.ConnectionCount = 0;
		}
	}

	// ── Global rate check ───────────────────────────────────────────────────
	GlobalConnectionCount++;
	float GlobalRate = static_cast<float>(GlobalConnectionCount) / static_cast<float>(Config.ConnectionWindowSeconds);
	if (GlobalRate > static_cast<float>(Config.MaxConnectionsPerSecond))
	{
		// Global connection rate exceeded — reject
		Metrics.TotalRejected++;
		UE_LOG(LogTemp, Warning, TEXT("[DDoSProtection] Global rate exceeded: %.1f conn/s > %d max"),
			GlobalRate, Config.MaxConnectionsPerSecond);
		return false;
	}

	// ── Per-IP rate check ───────────────────────────────────────────────────
	if (!Record)
	{
		// New IP — create record
		FIPConnectionRecord NewRecord;
		NewRecord.IP = IP;
		NewRecord.LastConnectionTime = CurrentTime;
		NewRecord.TotalConnections = 1;
		NewRecord.ConnectionCount = 1;
		IPRecords.Add(IP, NewRecord);
		Record = IPRecords.Find(IP);
	}
	else
	{
		Record->ConnectionCount++;
		Record->TotalConnections++;
		Record->LastConnectionTime = CurrentTime;
	}

	if (Record->ConnectionCount > Config.MaxConnectionsPerIP)
	{
		// Per-IP limit exceeded — auto-block if configured
		if (Config.bAutoBlockIPs)
		{
			BlockIP(IP);
			Metrics.TotalRejected++;
			return false;
		}
		else
		{
			Metrics.TotalRejected++;
			return false;
		}
	}

	// ── Connection allowed ──────────────────────────────────────────────────
	Metrics.ActiveConnections++;
	Metrics.PeakConnections = FMath::Max(Metrics.PeakConnections, Metrics.ActiveConnections);

	return true;
}

void UKhaaosDDoSProtection::OnConnectionClosed(const FString& IP)
{
	Metrics.ActiveConnections = FMath::Max(0, Metrics.ActiveConnections - 1);
}

bool UKhaaosDDoSProtection::IsIPBlocked(const FString& IP) const
{
	const FIPConnectionRecord* Record = IPRecords.Find(IP);
	if (!Record || !Record->bIsBlocked)
	{
		return false;
	}
	return GetCurrentTime() < Record->BlockedUntil;
}

void UKhaaosDDoSProtection::BlockIP(const FString& IP, float DurationMinutes)
{
	FIPConnectionRecord* Record = IPRecords.Find(IP);
	if (!Record)
	{
		FIPConnectionRecord NewRecord;
		NewRecord.IP = IP;
		IPRecords.Add(IP, NewRecord);
		Record = IPRecords.Find(IP);
	}

	float Duration = DurationMinutes > 0.0f ? DurationMinutes : Config.BlockDurationMinutes;
	Record->bIsBlocked = true;
	Record->BlockedUntil = GetCurrentTime() + (Duration * 60.0);

	UE_LOG(LogTemp, Warning, TEXT("[DDoSProtection] IP blocked: %s for %.1f minutes"), *IP, Duration);
}

void UKhaaosDDoSProtection::UnblockIP(const FString& IP)
{
	FIPConnectionRecord* Record = IPRecords.Find(IP);
	if (Record)
	{
		Record->bIsBlocked = false;
		Record->ConnectionCount = 0;
		UE_LOG(LogTemp, Log, TEXT("[DDoSProtection] IP unblocked: %s"), *IP);
	}
}

FDDoSMetrics UKhaaosDDoSProtection::GetConnectionStats() const
{
	FDDoSMetrics Stats = Metrics;
	Stats.BlockedIPs = CountBlockedIPs();
	return Stats;
}

double UKhaaosDDoSProtection::GetCurrentTime() const
{
	return FPlatformTime::Seconds();
}

void UKhaaosDDoSProtection::MaintainRecords()
{
	double CurrentTime = GetCurrentTime();

	// Expire old blocked IPs and clean up stale records
	TArray<FString> ToRemove;
	for (auto& Pair : IPRecords)
	{
		if (Pair.Value.bIsBlocked && CurrentTime >= Pair.Value.BlockedUntil)
		{
			Pair.Value.bIsBlocked = false;
		}

		// Remove records with no connections in the last hour
		if (!Pair.Value.bIsBlocked &&
			(CurrentTime - Pair.Value.LastConnectionTime) > 3600.0)
		{
			ToRemove.Add(Pair.Key);
		}
	}

	for (const FString& IP : ToRemove)
	{
		IPRecords.Remove(IP);
	}
}

int32 UKhaaosDDoSProtection::CountBlockedIPs() const
{
	int32 Count = 0;
	double CurrentTime = GetCurrentTime();
	for (const auto& Pair : IPRecords)
	{
		if (Pair.Value.bIsBlocked && CurrentTime < Pair.Value.BlockedUntil)
		{
			Count++;
		}
	}
	return Count;
}
