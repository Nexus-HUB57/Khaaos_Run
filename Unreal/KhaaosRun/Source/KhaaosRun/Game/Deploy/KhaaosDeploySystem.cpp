// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Deploy/KhaaosDeploySystem.h"
#include "KhaaosRun.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

UKhaaosDeploySystemComponent::UKhaaosDeploySystemComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.bStartWithTickEnabled = true;

    TotalDeployed = 0;
    LandedCount   = 0;

    // Default Free Fire-like deploy configuration
    DeployConfig.DeployHeight          = 1500.0f;
    DeployConfig.FreeFallSpeed         = 800.0f;
    DeployConfig.ParachuteOpenHeight   = 200.0f;
    DeployConfig.ParachuteDescendSpeed = 300.0f;
    DeployConfig.ParachuteHorizontalSpeed = 600.0f;
    DeployConfig.LandingThreshold      = 10.0f;
    DeployConfig.MapBoundsCenter       = FVector2D::ZeroVector;
    DeployConfig.MapBoundsRadius       = 10000.0f;
}

// ─── Deploy Control ─────────────────────────────────────────────────────────────

void UKhaaosDeploySystemComponent::StartDeploy(APlayerState* PlayerState)
{
    if (!PlayerState) return;
    if (GetOwnerRole() != ROLE_Authority) return;

    const FString Key = GetPlayerKey(PlayerState);
    if (DeployingPlayers.Contains(Key))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("DeploySystem::StartDeploy - Player %s already deploying"), *Key);
        return;
    }

    FKhaaosDeployState State;
    State.PlayerId       = Key;
    State.CurrentPosition = ComputeInitialDeployPosition();
    State.TargetLandingPosition = State.CurrentPosition;
    State.TargetLandingPosition.Z = 0.0f; // Ground level
    State.bParachuteOpen = false;
    State.bHasLanded     = false;
    State.SteeringDirection = FVector2D::ZeroVector;

    DeployingPlayers.Add(Key, State);
    TotalDeployed++;

    OnDeployStarted.Broadcast(Key);

    UE_LOG(LogKhaaosRun, Log, TEXT("DeploySystem::StartDeploy - Player %s at (%.0f,%.0f,%.0f) TotalDeployed=%d"),
        *Key, State.CurrentPosition.X, State.CurrentPosition.Y, State.CurrentPosition.Z, TotalDeployed);
}

void UKhaaosDeploySystemComponent::OpenParachute(APlayerState* PlayerState)
{
    if (!PlayerState) return;
    if (GetOwnerRole() != ROLE_Authority) return;

    const FString Key = GetPlayerKey(PlayerState);
    FKhaaosDeployState* State = DeployingPlayers.Find(Key);
    if (!State || State->bParachuteOpen || State->bHasLanded)
    {
        return;
    }

    State->bParachuteOpen = true;

    OnParachuteOpened.Broadcast(Key);

    UE_LOG(LogKhaaosRun, Log, TEXT("DeploySystem::OpenParachute - Player %s at altitude %.0f"),
        *Key, State->CurrentPosition.Z);
}

void UKhaaosDeploySystemComponent::LandPlayer(APlayerState* PlayerState)
{
    if (!PlayerState) return;
    if (GetOwnerRole() != ROLE_Authority) return;

    const FString Key = GetPlayerKey(PlayerState);
    FKhaaosDeployState* State = DeployingPlayers.Find(Key);
    if (!State || State->bHasLanded)
    {
        return;
    }

    State->bHasLanded     = true;
    State->CurrentPosition.Z = 0.0f; // Snap to ground
    LandedCount++;

    OnPlayerLanded.Broadcast(Key, State->CurrentPosition);

    UE_LOG(LogKhaaosRun, Log, TEXT("DeploySystem::LandPlayer - Player %s at (%.0f,%.0f,%.0f) LandedCount=%d"),
        *Key, State->CurrentPosition.X, State->CurrentPosition.Y, State->CurrentPosition.Z, LandedCount);
}

void UKhaaosDeploySystemComponent::SetSteeringDirection(APlayerState* PlayerState, const FVector2D& Direction)
{
    if (!PlayerState) return;

    const FString Key = GetPlayerKey(PlayerState);
    FKhaaosDeployState* State = DeployingPlayers.Find(Key);
    if (!State || State->bHasLanded)
    {
        return;
    }

    // Normalize steering direction
    const float Len = Direction.Size();
    State->SteeringDirection = Len > 0.01f ? Direction / Len : FVector2D::ZeroVector;
}

// ─── Query ──────────────────────────────────────────────────────────────────────

bool UKhaaosDeploySystemComponent::IsDeploying(APlayerState* PlayerState) const
{
    if (!PlayerState) return false;
    const FString Key = GetPlayerKey(PlayerState);
    const FKhaaosDeployState* State = DeployingPlayers.Find(Key);
    return State && !State->bHasLanded;
}

bool UKhaaosDeploySystemComponent::IsParachuteOpen(APlayerState* PlayerState) const
{
    if (!PlayerState) return false;
    const FString Key = GetPlayerKey(PlayerState);
    const FKhaaosDeployState* State = DeployingPlayers.Find(Key);
    return State && State->bParachuteOpen;
}

bool UKhaaosDeploySystemComponent::HasLanded(APlayerState* PlayerState) const
{
    if (!PlayerState) return false;
    const FString Key = GetPlayerKey(PlayerState);
    const FKhaaosDeployState* State = DeployingPlayers.Find(Key);
    return State && State->bHasLanded;
}

FVector UKhaaosDeploySystemComponent::GetDeployPosition(APlayerState* PlayerState) const
{
    if (!PlayerState) return FVector::ZeroVector;
    const FString Key = GetPlayerKey(PlayerState);
    const FKhaaosDeployState* State = DeployingPlayers.Find(Key);
    return State ? State->CurrentPosition : FVector::ZeroVector;
}

int32 UKhaaosDeploySystemComponent::GetDeployingCount() const
{
    int32 Count = 0;
    for (const auto& Pair : DeployingPlayers)
    {
        if (!Pair.Value.bHasLanded)
        {
            Count++;
        }
    }
    return Count;
}

int32 UKhaaosDeploySystemComponent::GetLandedCount() const
{
    return LandedCount;
}

bool UKhaaosDeploySystemComponent::AllPlayersLanded() const
{
    if (TotalDeployed == 0) return false;
    return LandedCount >= TotalDeployed;
}

// ─── Configuration ──────────────────────────────────────────────────────────────

void UKhaaosDeploySystemComponent::SetDeployConfig(const FKhaaosDeployConfig& InConfig)
{
    DeployConfig = InConfig;
    UE_LOG(LogKhaaosRun, Log, TEXT("DeploySystem::SetDeployConfig - Height=%.0f ChuteOpen=%.0f FreeFall=%.0f ChuteDesc=%.0f"),
        DeployConfig.DeployHeight, DeployConfig.ParachuteOpenHeight,
        DeployConfig.FreeFallSpeed, DeployConfig.ParachuteDescendSpeed);
}

// ─── Internal Helpers ───────────────────────────────────────────────────────────

FString UKhaaosDeploySystemComponent::GetPlayerKey(APlayerState* PS)
{
    if (!PS) return TEXT("Invalid");
    return PS->GetUniqueId().ToString();
}

FVector UKhaaosDeploySystemComponent::ComputeInitialDeployPosition() const
{
    // Random position within map bounds at deploy height
    const float Angle = FMath::FRandRange(0.0f, 2.0f * PI);
    const float Dist  = FMath::FRandRange(0.0f, DeployConfig.MapBoundsRadius * 0.8f);

    return FVector(
        DeployConfig.MapBoundsCenter.X + FMath::Cos(Angle) * Dist,
        DeployConfig.MapBoundsCenter.Y + FMath::Sin(Angle) * Dist,
        DeployConfig.DeployHeight
    );
}

// ─── Tick ────────────────────────────────────────────────────────────────────────

void UKhaaosDeploySystemComponent::TickComponent(float DeltaTime, ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (GetOwnerRole() != ROLE_Authority)
    {
        return;
    }

    // Update all deploying player positions
    for (auto& Pair : DeployingPlayers)
    {
        FKhaaosDeployState& State = Pair.Value;

        // Skip players who have already landed
        if (State.bHasLanded)
        {
            continue;
        }

        // ─── Auto-open parachute at threshold altitude ─────────────────────
        if (!State.bParachuteOpen && State.CurrentPosition.Z <= DeployConfig.ParachuteOpenHeight)
        {
            State.bParachuteOpen = true;
            OnParachuteOpened.Broadcast(State.PlayerId);
            UE_LOG(LogKhaaosRun, Log, TEXT("DeploySystem - Auto-open parachute for %s at altitude %.0f"),
                *State.PlayerId, State.CurrentPosition.Z);
        }

        // ─── Update vertical position ──────────────────────────────────────
        if (State.bParachuteOpen)
        {
            // Parachute descent
            State.CurrentPosition.Z -= DeployConfig.ParachuteDescendSpeed * DeltaTime;
        }
        else
        {
            // Free fall
            State.CurrentPosition.Z -= DeployConfig.FreeFallSpeed * DeltaTime;
        }

        // ─── Update horizontal position (parachute steering) ───────────────
        if (State.bParachuteOpen && State.SteeringDirection.SizeSquared() > 0.001f)
        {
            const float HorizDelta = DeployConfig.ParachuteHorizontalSpeed * DeltaTime;
            State.CurrentPosition.X += State.SteeringDirection.X * HorizDelta;
            State.CurrentPosition.Y += State.SteeringDirection.Y * HorizDelta;

            // Clamp to map bounds
            const FVector2D ToCenter(
                State.CurrentPosition.X - DeployConfig.MapBoundsCenter.X,
                State.CurrentPosition.Y - DeployConfig.MapBoundsCenter.Y
            );
            const float DistFromCenter = ToCenter.Size();
            if (DistFromCenter > DeployConfig.MapBoundsRadius)
            {
                const FVector2D Clamped = DeployConfig.MapBoundsCenter +
                    (ToCenter / DistFromCenter) * DeployConfig.MapBoundsRadius;
                State.CurrentPosition.X = Clamped.X;
                State.CurrentPosition.Y = Clamped.Y;
            }
        }

        // ─── Auto-land when at ground level ────────────────────────────────
        if (State.CurrentPosition.Z <= DeployConfig.LandingThreshold)
        {
            State.CurrentPosition.Z = 0.0f;
            State.bHasLanded = true;
            LandedCount++;

            OnPlayerLanded.Broadcast(State.PlayerId, State.CurrentPosition);

            UE_LOG(LogKhaaosRun, Log, TEXT("DeploySystem - Auto-land %s at (%.0f,%.0f,%.0f) Landed=%d/%d"),
                *State.PlayerId, State.CurrentPosition.X, State.CurrentPosition.Y,
                State.CurrentPosition.Z, LandedCount, TotalDeployed);
        }
    }
}
