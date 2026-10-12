// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Debugger/KhaaosGameplayDebugger.h"
#include "Game/AbilitySystem/KhaaosAbilityComponent.h"
#include "Game/Zone/KhaaosSafeZone.h"
#include "Game/KhaaosGameState.h"
#include "Player/KhaaosPlayerState.h"

#include "Engine/Engine.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/GameStateBase.h"
#include "Kismet/GameplayStatics.h"
#include "Net/UnrealNetwork.h"

// ─── Color Constants ──────────────────────────────────────────────────────────

namespace KhaaosDebuggerColors
{
	static const FColor Green  = FColor(0, 255, 0);
	static const FColor Yellow = FColor(255, 255, 0);
	static const FColor Red    = FColor(255, 0, 0);
	static const FColor Cyan   = FColor(0, 255, 255);
	static const FColor White  = FColor(255, 255, 255);
	static const FColor Orange = FColor(255, 165, 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FKhaaosDebuggerCategory_Abilities
// ═══════════════════════════════════════════════════════════════════════════════

FKhaaosDebuggerCategory_Abilities::FKhaaosDebuggerCategory_Abilities()
{
	SetCategoryName(TEXT("Khaaos.Abilities"));
}

void FKhaaosDebuggerCategory_Abilities::CollectData(APlayerController* OwnerPC, AActor* DebugActor)
{
	AbilityData.Reset();

	if (!OwnerPC || !OwnerPC->GetPawn())
	{
		return;
	}

	// Find the ability component on the local player's pawn
	UKhaaosAbilityComponent* AbilityComp = OwnerPC->GetPawn()->FindComponentByClass<UKhaaosAbilityComponent>();
	if (!AbilityComp && DebugActor)
	{
		AbilityComp = DebugActor->FindComponentByClass<UKhaaosAbilityComponent>();
	}

	if (!AbilityComp)
	{
		return;
	}

	// Gather active ability tags
	const FGameplayTagContainer ActiveTags = AbilityComp->GetActiveActionTags();
	for (const FGameplayTag& Tag : ActiveTags)
	{
		FKhaaosAbilityDebugData Entry;
		Entry.AbilityName = Tag.ToString();
		Entry.bIsActive = true;

		// Check if the ability action has blocked tags
		if (AbilityComp->HasAnyBlockingTag(FGameplayTagContainer(Tag)))
		{
			Entry.BlockedTagNames.Add(TEXT("BLOCKED"));
		}

		AbilityData.Add(Entry);
	}

	// Gather registered but inactive abilities
	for (const auto& Pair : AbilityComp->RegisteredAbilities)
	{
		if (!ActiveTags.HasTag(Pair.Key))
		{
			FKhaaosAbilityDebugData Entry;
			Entry.AbilityName = Pair.Key.ToString();
			Entry.bIsActive = false;

			// Default cooldown values — would be populated from cooldown system
			Entry.CooldownRemaining = 0.0f;
			Entry.CooldownTotal = 0.0f;
			Entry.EnergyCost = 0.0f;

			AbilityData.Add(Entry);
		}
	}
}

void FKhaaosDebuggerCategory_Abilities::DrawData(APlayerController* OwnerPC, FGameplayDebuggerCanvasContext& CanvasContext)
{
	using namespace KhaaosDebuggerColors;

	CanvasContext.PrintLine(TEXT("── Khaaos Abilities ──"), Cyan);

	if (AbilityData.Num() == 0)
	{
		CanvasContext.PrintLine(TEXT("  No ability component found or no abilities registered."), Yellow);
		return;
	}

	for (const FKhaaosAbilityDebugData& Entry : AbilityData)
	{
		const FColor StatusColor = Entry.bIsActive ? Green : White;
		const FString ActiveStr = Entry.bIsActive ? TEXT("[ACTIVE]") : TEXT("[IDLE]");

		CanvasContext.Printf(TEXT("  %s %s"), StatusColor, *ActiveStr, *Entry.AbilityName);

		if (Entry.CooldownTotal > 0.0f)
		{
			const FColor CDColor = Entry.CooldownRemaining > 0.0f ? Yellow : Green;
			CanvasContext.Printf(TEXT("    CD: %.1f / %.1f"), CDColor, Entry.CooldownRemaining, Entry.CooldownTotal);
		}

		if (Entry.EnergyCost > 0.0f)
		{
			CanvasContext.Printf(TEXT("    Energy Cost: %.1f"), White, Entry.EnergyCost);
		}

		if (Entry.BlockedTagNames.Num() > 0)
		{
			for (const FString& Blocked : Entry.BlockedTagNames)
			{
				CanvasContext.Printf(TEXT("    BLOCKED: %s"), Red, *Blocked);
			}
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// FKhaaosDebuggerCategory_Relevancy
// ═══════════════════════════════════════════════════════════════════════════════

FKhaaosDebuggerCategory_Relevancy::FKhaaosDebuggerCategory_Relevancy()
{
	SetCategoryName(TEXT("Khaaos.Relevancy"));
}

void FKhaaosDebuggerCategory_Relevancy::CollectData(APlayerController* OwnerPC, AActor* DebugActor)
{
	RelevancyData.Reset();

	if (!OwnerPC || !OwnerPC->GetPawn())
	{
		return;
	}

	const FVector ViewerLocation = OwnerPC->GetPawn()->GetActorLocation();

	// Iterate all actors and compute relevancy info
	for (TActorIterator<AActor> It(OwnerPC->GetWorld()); It; ++It)
	{
		AActor* Actor = *It;
		if (!Actor || Actor == OwnerPC->GetPawn())
		{
			continue;
		}

		FKhaaosRelevancyDebugData Entry;
		Entry.ActorType = Actor->GetClass()->GetName();
		Entry.DistanceToViewer = FVector::Dist(ViewerLocation, Actor->GetActorLocation()) / 100.0f; // meters
		Entry.NetUpdateFrequency = Actor->NetUpdateFrequency;
		Entry.bIsRelevant = true; // Simplified — would query relevancy manager

		// Significance level mapping based on NetUpdateFrequency
		if (Actor->NetUpdateFrequency >= 100.0f)
		{
			Entry.SignificanceLevel = 0; // Critical
		}
		else if (Actor->NetUpdateFrequency >= 30.0f)
		{
			Entry.SignificanceLevel = 1; // High
		}
		else if (Actor->NetUpdateFrequency >= 10.0f)
		{
			Entry.SignificanceLevel = 2; // Medium
		}
		else
		{
			Entry.SignificanceLevel = 3; // Low
		}

		RelevancyData.Add(Entry);
	}
}

void FKhaaosDebuggerCategory_Relevancy::DrawData(APlayerController* OwnerPC, FGameplayDebuggerCanvasContext& CanvasContext)
{
	using namespace KhaaosDebuggerColors;

	CanvasContext.PrintLine(TEXT("── Khaaos Relevancy ──"), Cyan);

	if (RelevancyData.Num() == 0)
	{
		CanvasContext.PrintLine(TEXT("  No actors found."), Yellow);
		return;
	}

	// Show summary
	CanvasContext.Printf(TEXT("  Total Actors: %d"), White, RelevancyData.Num());

	// Sort by distance (closest first)
	RelevancyData.Sort([](const FKhaaosRelevancyDebugData& A, const FKhaaosRelevancyDebugData& B)
	{
		return A.DistanceToViewer < B.DistanceToViewer;
	});

	// Display top 20 closest actors
	const int32 DisplayCount = FMath::Min(20, RelevancyData.Num());
	for (int32 i = 0; i < DisplayCount; ++i)
	{
		const FKhaaosRelevancyDebugData& Entry = RelevancyData[i];

		static const TCHAR* SignificanceNames[] = { TEXT("Critical"), TEXT("High"), TEXT("Medium"), TEXT("Low") };
		const TCHAR* SigName = SignificanceNames[FMath::Clamp(Entry.SignificanceLevel, 0, 3)];

		const FColor DistColor = Entry.DistanceToViewer < 50.0f ? Green :
		                          Entry.DistanceToViewer < 150.0f ? Yellow : Red;

		CanvasContext.Printf(TEXT("  [%s] %s  Dist: %.0fm  NetFreq: %.0f"),
			DistColor, SigName, *Entry.ActorType, Entry.DistanceToViewer, Entry.NetUpdateFrequency);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// FKhaaosDebuggerCategory_Pool
// ═══════════════════════════════════════════════════════════════════════════════

FKhaaosDebuggerCategory_Pool::FKhaaosDebuggerCategory_Pool()
{
	SetCategoryName(TEXT("Khaaos.Pool"));
}

void FKhaaosDebuggerCategory_Pool::CollectData(APlayerController* OwnerPC, AActor* DebugActor)
{
	PoolData.Reset();

	if (!OwnerPC || !OwnerPC->GetWorld())
	{
		return;
	}

	// Query the actor pool subsystem for pool statistics
	// UKhaaosActorPool* Pool = OwnerPC->GetGameInstance()->GetSubsystem<UKhaaosActorPool>();
	// If pool subsystem exists, gather data from it.
	// Fallback: iterate actors and categorize by class for basic pool stats.

	TMap<FString, int32> ActorCounts;
	for (TActorIterator<AActor> It(OwnerPC->GetWorld()); It; ++It)
	{
		AActor* Actor = *It;
		if (Actor)
		{
			const FString ClassName = Actor->GetClass()->GetName();
			ActorCounts.FindOrAdd(ClassName)++;
		}
	}

	for (const auto& Pair : ActorCounts)
	{
		FKhaaosPoolDebugData Entry;
		Entry.PoolType = Pair.Key;
		Entry.ActiveCount = Pair.Value;
		Entry.AvailableCount = 0; // Would be populated from pool subsystem
		Entry.PeakCount = Pair.Value;
		Entry.HitRatePct = 100.0f; // Would be populated from pool subsystem
		PoolData.Add(Entry);
	}
}

void FKhaaosDebuggerCategory_Pool::DrawData(APlayerController* OwnerPC, FGameplayDebuggerCanvasContext& CanvasContext)
{
	using namespace KhaaosDebuggerColors;

	CanvasContext.PrintLine(TEXT("── Khaaos Pool ──"), Cyan);

	if (PoolData.Num() == 0)
	{
		CanvasContext.PrintLine(TEXT("  No pool data available."), Yellow);
		return;
	}

	CanvasContext.Printf(TEXT("  %-30s  %s  %s  %s  %s"),
		White, TEXT("Pool Type"), TEXT("Avail"), TEXT("Active"), TEXT("Peak"), TEXT("Hit%"));
	CanvasContext.PrintLine(TEXT("  ───────────────────────────────────────────────────────"), White);

	for (const FKhaaosPoolDebugData& Entry : PoolData)
	{
		const FColor HitColor = Entry.HitRatePct >= 90.0f ? Green :
		                        Entry.HitRatePct >= 50.0f ? Yellow : Red;

		CanvasContext.Printf(TEXT("  %-30s  %5d  %5d  %5d  %5.1f%%"),
			HitColor, *Entry.PoolType, Entry.AvailableCount, Entry.ActiveCount,
			Entry.PeakCount, Entry.HitRatePct);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// FKhaaosDebuggerCategory_Zone
// ═══════════════════════════════════════════════════════════════════════════════

FKhaaosDebuggerCategory_Zone::FKhaaosDebuggerCategory_Zone()
{
	SetCategoryName(TEXT("Khaaos.Zone"));
}

void FKhaaosDebuggerCategory_Zone::CollectData(APlayerController* OwnerPC, AActor* DebugActor)
{
	if (!OwnerPC || !OwnerPC->GetWorld())
	{
		return;
	}

	// Find the safe zone actor
	AKhaaosSafeZone* SafeZone = nullptr;
	for (TActorIterator<AKhaaosSafeZone> It(OwnerPC->GetWorld()); It; ++It)
	{
		SafeZone = *It;
		break;
	}

	if (!SafeZone)
	{
		return;
	}

	ZoneData.Phase = SafeZone->CurrentPhase;
	ZoneData.Center = SafeZone->ZoneCenter;
	ZoneData.Radius = SafeZone->ZoneRadius;
	ZoneData.bIsShrinking = SafeZone->bIsShrinking;
	ZoneData.DamagePerTick = SafeZone->DamagePerTick;

	// Get zone status for timers
	float OutRadiusPct, OutTargetPct, OutWaitRemaining, OutShrinkRemaining;
	int32 OutPhase;
	bool OutShrinking;
	float OutDamage;
	SafeZone->GetZoneStatus(OutRadiusPct, OutTargetPct, OutPhase, OutShrinking, OutDamage, OutWaitRemaining, OutShrinkRemaining);
	ZoneData.ShrinkTimer = OutShrinking ? OutShrinkRemaining : OutWaitRemaining;

	// Count players inside the zone
	ZoneData.PlayersInside = 0;
	for (TActorIterator<APlayerState> It(OwnerPC->GetWorld()); It; ++It)
	{
		APlayerState* PS = *It;
		if (PS && PS->GetPawn())
		{
			const FVector2D PlayerPos(PS->GetPawn()->GetActorLocation().X, PS->GetPawn()->GetActorLocation().Y);
			if (SafeZone->IsInsideZone(PlayerPos))
			{
				ZoneData.PlayersInside++;
			}
		}
	}
}

void FKhaaosDebuggerCategory_Zone::DrawData(APlayerController* OwnerPC, FGameplayDebuggerCanvasContext& CanvasContext)
{
	using namespace KhaaosDebuggerColors;

	CanvasContext.PrintLine(TEXT("── Khaaos Zone ──"), Cyan);

	if (ZoneData.Phase == 0)
	{
		CanvasContext.PrintLine(TEXT("  No active zone found."), Yellow);
		return;
	}

	const FColor PhaseColor = ZoneData.Phase <= 2 ? Green :
	                          ZoneData.Phase <= 3 ? Yellow : Red;

	CanvasContext.Printf(TEXT("  Phase: %d/5"), PhaseColor, ZoneData.Phase);
	CanvasContext.Printf(TEXT("  Center: (%.1f, %.1f)"), White, ZoneData.Center.X, ZoneData.Center.Y);
	CanvasContext.Printf(TEXT("  Radius: %.1f%%"), White, ZoneData.Radius);

	const FColor ShrinkColor = ZoneData.bIsShrinking ? Red : Green;
	CanvasContext.Printf(TEXT("  Shrinking: %s  Timer: %.1fs"), ShrinkColor,
		ZoneData.bIsShrinking ? TEXT("YES") : TEXT("NO"), ZoneData.ShrinkTimer);

	CanvasContext.Printf(TEXT("  Damage/tick: %.1f"), Orange, ZoneData.DamagePerTick);
	CanvasContext.Printf(TEXT("  Players Inside: %d"), White, ZoneData.PlayersInside);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FKhaaosDebuggerCategory_Network
// ═══════════════════════════════════════════════════════════════════════════════

FKhaaosDebuggerCategory_Network::FKhaaosDebuggerCategory_Network()
{
	SetCategoryName(TEXT("Khaaos.Network"));
}

void FKhaaosDebuggerCategory_Network::CollectData(APlayerController* OwnerPC, AActor* DebugActor)
{
	if (!OwnerPC)
	{
		return;
	}

	// Get network metrics from the player controller's net driver
	UNetConnection* NetConn = OwnerPC->GetNetConnection();
	if (NetConn)
	{
		NetData.RTT = NetConn->AvgRoundTripTime * 1000.0f; // Convert to ms
		NetData.PacketLossPct = NetConn->GetInLossPercentage();

		// Bandwidth from net connection
		NetData.InBytesPerSec = static_cast<float>(NetConn->InBytesPerSecond);
		NetData.OutBytesPerSec = static_cast<float>(NetConn->OutBytesPerSecond);

		NetData.bHighLatencyAlert = NetData.RTT > NetData.HighLatencyThreshold;
	}
	else
	{
		NetData.RTT = 0.0f;
		NetData.PacketLossPct = 0.0f;
		NetData.InBytesPerSec = 0.0f;
		NetData.OutBytesPerSec = 0.0f;
		NetData.bHighLatencyAlert = false;
	}

	// Count replicated actors
	NetData.ReplicatedActors = 0;
	if (OwnerPC->GetWorld())
	{
		for (TActorIterator<AActor> It(OwnerPC->GetWorld()); It; ++It)
		{
			AActor* Actor = *It;
			if (Actor && Actor->GetIsReplicated())
			{
				NetData.ReplicatedActors++;
			}
		}
	}
}

void FKhaaosDebuggerCategory_Network::DrawData(APlayerController* OwnerPC, FGameplayDebuggerCanvasContext& CanvasContext)
{
	using namespace KhaaosDebuggerColors;

	CanvasContext.PrintLine(TEXT("── Khaaos Network ──"), Cyan);

	// RTT with color coding
	const FColor RTTColor = NetData.RTT < 50.0f ? Green :
	                        NetData.RTT < NetData.HighLatencyThreshold ? Yellow : Red;
	CanvasContext.Printf(TEXT("  RTT: %.1f ms"), RTTColor, NetData.RTT);

	if (NetData.bHighLatencyAlert)
	{
		CanvasContext.Printf(TEXT("  *** HIGH LATENCY ALERT (>%..0fms) ***"), Red, NetData.HighLatencyThreshold);
	}

	// Packet loss
	const FColor LossColor = NetData.PacketLossPct < 1.0f ? Green :
	                         NetData.PacketLossPct < 5.0f ? Yellow : Red;
	CanvasContext.Printf(TEXT("  Packet Loss: %.2f%%"), LossColor, NetData.PacketLossPct);

	// Bandwidth
	CanvasContext.Printf(TEXT("  In:  %.1f KB/s"), White, NetData.InBytesPerSec / 1024.0f);
	CanvasContext.Printf(TEXT("  Out: %.1f KB/s"), White, NetData.OutBytesPerSec / 1024.0f);

	// Replicated actors
	CanvasContext.Printf(TEXT("  Replicated Actors: %d"), White, NetData.ReplicatedActors);
}
