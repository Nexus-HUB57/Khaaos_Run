// Khaaos Run — authoritative, idempotent train handover kernel.
// Copyright Nexus-HUB57.
#pragma once

#include "CoreMinimal.h"

namespace KhaaosTrainHandover
{

enum class EState : uint8
{
    Reserved,
    Announced,
    Visualizing,
    ReadyForHandover,
    Handover,
    Completed,
    Cancelled,
    Failed,
};

enum class EResult : uint8
{
    Completed,
    AlreadyCompleted,
    Rejected,
    Failed,
};

struct FTelemetryEvent
{
    FString Name;
    FString IngressId;
    FString Reason;
};

class IEffects
{
public:
    virtual ~IEffects() = default;
    virtual bool TeleportPlayer(const FString& PlayerId, const FVector& Location, const FRotator& Rotation) = 0;
    virtual bool UnlockGameplay(const FString& PlayerId) = 0;
    virtual bool ReleaseSpawnReservation(const FString& IngressId) = 0;
    virtual void EmitTelemetry(const FTelemetryEvent& Event) = 0;
};

struct FIngress
{
    FString IngressId;
    FString PlayerId;
    FVector SpawnLocation = FVector::ZeroVector;
    FRotator SpawnRotation = FRotator::ZeroRotator;
    EState State = EState::Reserved;
    bool bCombatLocked = true;
    bool bSpawnReleased = false;
    FString CompletionReason;
};

/**
 * Pure handover state machine. It deliberately knows no UWorld, Pawn or timer.
 * The first successful completion commits the terminal state before cleanup;
 * every later call for the same ingress is side-effect free.
 */
class KHAAOSRUN_API FController
{
public:
    FController(FIngress Ingress, IEffects& Effects);

    EResult Complete(const FString& Reason);
    bool Cancel(const FString& Reason);

    const FIngress& GetIngress() const { return Ingress; }

private:
    void Emit(const FString& Name, const FString& Reason) const;
    void ReleaseReservationOnce();

    FIngress Ingress;
    IEffects& Effects;
};

} // namespace KhaaosTrainHandover
