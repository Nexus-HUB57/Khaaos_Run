// Khaaos Run — authoritative, idempotent train handover kernel.
#include "Game/MatchFlow/KhaaosTrainHandover.h"

namespace KhaaosTrainHandover
{

FController::FController(FIngress IngressValue, IEffects& EffectsValue)
    : Ingress(std::move(IngressValue))
    , Effects(EffectsValue)
{
}

EResult FController::Complete(const FString& Reason)
{
    if (Ingress.State == EState::Completed)
    {
        Emit(TEXT("barburhen_train_handover_duplicate"), Reason);
        return EResult::AlreadyCompleted;
    }

    if (Ingress.State == EState::Cancelled || Ingress.State == EState::Failed)
    {
        Emit(TEXT("barburhen_train_handover_rejected"), Reason);
        return EResult::Rejected;
    }

    if (Ingress.IngressId == TEXT("") || Ingress.PlayerId == TEXT(""))
    {
        Ingress.State = EState::Failed;
        Emit(TEXT("barburhen_train_ingress_failed"), TEXT("invalid_identity"));
        ReleaseReservationOnce();
        return EResult::Failed;
    }

    if (!Effects.TeleportPlayer(Ingress.PlayerId, Ingress.SpawnLocation, Ingress.SpawnRotation))
    {
        Ingress.State = EState::Failed;
        Emit(TEXT("barburhen_train_ingress_failed"), TEXT("teleport_failed"));
        ReleaseReservationOnce();
        return EResult::Failed;
    }

    if (!Effects.UnlockGameplay(Ingress.PlayerId))
    {
        Ingress.State = EState::Failed;
        Emit(TEXT("barburhen_train_ingress_failed"), TEXT("unlock_failed"));
        ReleaseReservationOnce();
        return EResult::Failed;
    }

    // Commit before cleanup: a duplicate callback after this point cannot
    // teleport or unlock again, even if reservation cleanup reports a warning.
    Ingress.State = EState::Completed;
    Ingress.bCombatLocked = false;
    Ingress.CompletionReason = Reason;
    Emit(TEXT("barburhen_train_handover_completed"), Reason);
    ReleaseReservationOnce();
    return EResult::Completed;
}

bool FController::Cancel(const FString& Reason)
{
    if (Ingress.State == EState::Completed ||
        Ingress.State == EState::Cancelled ||
        Ingress.State == EState::Failed)
    {
        return false;
    }

    Ingress.State = EState::Cancelled;
    Emit(TEXT("barburhen_train_ingress_cancelled"), Reason);
    ReleaseReservationOnce();
    return true;
}

void FController::Emit(const FString& Name, const FString& Reason) const
{
    Effects.EmitTelemetry({ Name, Ingress.IngressId, Reason });
}

void FController::ReleaseReservationOnce()
{
    if (Ingress.bSpawnReleased)
    {
        return;
    }

    Ingress.bSpawnReleased = true;
    if (!Effects.ReleaseSpawnReservation(Ingress.IngressId))
    {
        Emit(TEXT("barburhen_train_spawn_release_failed"), TEXT("reservation_cleanup_failed"));
    }
}

} // namespace KhaaosTrainHandover
