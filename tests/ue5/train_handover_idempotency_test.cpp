#include "Game/MatchFlow/KhaaosTrainHandover.h"
#include <cmath>
#include <iostream>
#include <string>
#include <vector>

const FVector FVector::ZeroVector(0.0f, 0.0f, 0.0f);
const FRotator FRotator::ZeroRotator(0.0f, 0.0f, 0.0f);

namespace
{
using namespace KhaaosTrainHandover;

struct FakeEffects final : IEffects
{
    int32 TeleportCount = 0;
    int32 UnlockCount = 0;
    int32 ReleaseCount = 0;
    bool TeleportSucceeds = true;
    bool UnlockSucceeds = true;
    bool ReleaseSucceeds = true;
    std::vector<FTelemetryEvent> Events;
    FVector LastLocation = FVector::ZeroVector;
    FRotator LastRotation = FRotator::ZeroRotator;

    bool TeleportPlayer(const FString&, const FVector& Location, const FRotator& Rotation) override
    {
        ++TeleportCount;
        LastLocation = Location;
        LastRotation = Rotation;
        return TeleportSucceeds;
    }

    bool UnlockGameplay(const FString&) override
    {
        ++UnlockCount;
        return UnlockSucceeds;
    }

    bool ReleaseSpawnReservation(const FString&) override
    {
        ++ReleaseCount;
        return ReleaseSucceeds;
    }

    void EmitTelemetry(const FTelemetryEvent& Event) override
    {
        Events.push_back(Event);
    }

    int32 Count(const FString& Name) const
    {
        int32 Count = 0;
        for (const FTelemetryEvent& Event : Events)
        {
            if (Event.Name == Name) ++Count;
        }
        return Count;
    }
};

int Failures = 0;
void Expect(bool Condition, const char* Description)
{
    if (Condition) std::cout << "PASS: " << Description << '\n';
    else { std::cerr << "FAIL: " << Description << '\n'; ++Failures; }
}

FIngress MakeIngress(const FString& Id = "match-1/player-1/ingress-1")
{
    FIngress Ingress;
    Ingress.IngressId = Id;
    Ingress.PlayerId = "player-1";
    Ingress.SpawnLocation = FVector(1840.0f, -620.0f, 112.0f);
    Ingress.SpawnRotation = FRotator(0.0f, 92.0f, 0.0f);
    Ingress.State = EState::Handover;
    return Ingress;
}
}

int main()
{
    {
        FakeEffects Effects;
        FController Controller(MakeIngress(), Effects);
        Expect(Controller.Complete("server_deadline") == EResult::Completed,
            "first handover completes");
        Expect(Controller.Complete("client_ready") == EResult::AlreadyCompleted,
            "duplicate handover is acknowledged without replay");
        Expect(Controller.Complete("timeout_guard") == EResult::AlreadyCompleted,
            "third callback remains idempotent");
        Expect(Effects.TeleportCount == 1, "teleport executes exactly once");
        Expect(Effects.UnlockCount == 1, "gameplay unlock executes exactly once");
        Expect(Effects.ReleaseCount == 1, "spawn reservation releases exactly once");
        Expect(Effects.Count("barburhen_train_handover_completed") == 1,
            "one business completion event is emitted");
        Expect(Effects.Count("barburhen_train_handover_duplicate") == 2,
            "duplicate callbacks are observable without duplicate success");
        Expect(!Controller.GetIngress().bCombatLocked, "combat unlocks after handover");
        Expect(Controller.GetIngress().CompletionReason == "server_deadline",
            "first completion reason remains canonical");
        Expect(std::fabs(Effects.LastLocation.X - 1840.0f) < 0.001f,
            "reserved spawn location is authoritative");
    }

    {
        FakeEffects Effects;
        FController Controller(MakeIngress(), Effects);
        Expect(Controller.Cancel("player_disconnected"), "active ingress can be cancelled");
        Expect(Controller.Complete("late_callback") == EResult::Rejected,
            "cancelled ingress rejects late handover");
        Expect(!Controller.Cancel("duplicate_cancel"), "duplicate cancellation has no effect");
        Expect(Effects.TeleportCount == 0 && Effects.UnlockCount == 0,
            "cancelled ingress never unlocks gameplay");
        Expect(Effects.ReleaseCount == 1, "cancel releases reservation once");
        Expect(Effects.Count("barburhen_train_ingress_cancelled") == 1,
            "cancel telemetry is emitted once");
    }

    {
        FakeEffects Effects;
        Effects.TeleportSucceeds = false;
        FController Controller(MakeIngress("match-1/player-2/ingress-1"), Effects);
        Expect(Controller.Complete("server_deadline") == EResult::Failed,
            "teleport failure fails closed");
        Expect(Controller.Complete("retry") == EResult::Rejected,
            "failed handover does not retry implicitly");
        Expect(Effects.TeleportCount == 1 && Effects.UnlockCount == 0,
            "teleport failure does not unlock gameplay");
        Expect(Effects.ReleaseCount == 1, "failed teleport releases reservation once");
        Expect(Effects.Count("barburhen_train_ingress_failed") == 1,
            "teleport failure telemetry is emitted once");
    }

    {
        FakeEffects Effects;
        Effects.UnlockSucceeds = false;
        FController Controller(MakeIngress("match-1/player-3/ingress-1"), Effects);
        Expect(Controller.Complete("server_deadline") == EResult::Failed,
            "unlock failure fails closed");
        Expect(Effects.TeleportCount == 1 && Effects.UnlockCount == 1,
            "unlock failure never repeats teleport");
        Expect(Controller.GetIngress().bCombatLocked,
            "combat remains locked after failed unlock");
    }

    {
        FakeEffects Effects;
        FController First(MakeIngress("match-1/player-4/ingress-a"), Effects);
        FController Second(MakeIngress("match-1/player-4/ingress-b"), Effects);
        Expect(First.Complete("deadline") == EResult::Completed,
            "first ingress completes");
        Expect(Second.Complete("deadline") == EResult::Completed,
            "different ingress remains independent");
        Expect(Effects.TeleportCount == 2,
            "deduplication is scoped to ingress id");
    }

    {
        FakeEffects Effects;
        FIngress Invalid = MakeIngress();
        Invalid.IngressId.clear();
        FController Controller(Invalid, Effects);
        Expect(Controller.Complete("invalid") == EResult::Failed,
            "invalid identity fails closed");
        Expect(Effects.TeleportCount == 0 && Effects.UnlockCount == 0,
            "invalid identity has no gameplay side effects");
    }

    if (Failures > 0) return 1;
    std::cout << "All train handover idempotency tests passed.\n";
    return 0;
}
