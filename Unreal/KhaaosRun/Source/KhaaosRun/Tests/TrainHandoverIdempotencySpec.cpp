// Khaaos Run — Unreal Automation coverage for exactly-once train handover.
#include "CoreMinimal.h"
#include "AutomationTest.h"
#include "Game/Character/KhaaosAvatarSpawnAdapter.h"
#include "Game/MatchFlow/KhaaosTrainHandover.h"

namespace
{
using namespace KhaaosTrainHandover;

struct FAutomationEffects final : IEffects
{
    int32 TeleportCount = 0;
    int32 UnlockCount = 0;
    int32 ReleaseCount = 0;
    TArray<FTelemetryEvent> Events;

    bool TeleportPlayer(const FString&, const FVector&, const FRotator&) override
    {
        ++TeleportCount;
        return true;
    }

    bool UnlockGameplay(const FString&) override
    {
        ++UnlockCount;
        return true;
    }

    bool ReleaseSpawnReservation(const FString&) override
    {
        ++ReleaseCount;
        return true;
    }

    void EmitTelemetry(const FTelemetryEvent& Event) override
    {
        Events.Add(Event);
    }

    int32 Count(const FString& Name) const
    {
        int32 Result = 0;
        for (const FTelemetryEvent& Event : Events)
        {
            if (Event.Name == Name) ++Result;
        }
        return Result;
    }
};

FIngress MakeIngress()
{
    FIngress Ingress;
    Ingress.IngressId = TEXT("pie-match/player-1/ingress-1");
    Ingress.PlayerId = TEXT("player-1");
    Ingress.SpawnLocation = FVector(1840.0f, -620.0f, 112.0f);
    Ingress.SpawnRotation = FRotator(0.0f, 92.0f, 0.0f);
    Ingress.State = EState::Handover;
    return Ingress;
}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FKhaaosTrainHandoverExactlyOnce,
    "Khaaos.Fase3.TrainHandover.ExactlyOnce",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosTrainHandoverExactlyOnce::RunTest(const FString& Parameters)
{
    (void)Parameters;
    FAutomationEffects Effects;
    FController Controller(MakeIngress(), Effects);

    TestEqual(TEXT("First callback completes"),
        static_cast<uint8>(Controller.Complete(TEXT("server_deadline"))),
        static_cast<uint8>(EResult::Completed));
    TestEqual(TEXT("Client callback is deduplicated"),
        static_cast<uint8>(Controller.Complete(TEXT("client_ready"))),
        static_cast<uint8>(EResult::AlreadyCompleted));
    TestEqual(TEXT("Watchdog callback is deduplicated"),
        static_cast<uint8>(Controller.Complete(TEXT("timeout_guard"))),
        static_cast<uint8>(EResult::AlreadyCompleted));

    TestEqual(TEXT("Teleport happens once"), Effects.TeleportCount, 1);
    TestEqual(TEXT("Gameplay unlock happens once"), Effects.UnlockCount, 1);
    TestEqual(TEXT("Reservation release happens once"), Effects.ReleaseCount, 1);
    TestEqual(TEXT("Business completion telemetry happens once"),
        Effects.Count(TEXT("barburhen_train_handover_completed")), 1);
    TestEqual(TEXT("Duplicate telemetry does not duplicate success"),
        Effects.Count(TEXT("barburhen_train_handover_duplicate")), 2);
    TestFalse(TEXT("Combat is unlocked after completion"), Controller.GetIngress().bCombatLocked);
    TestEqual(TEXT("First reason remains canonical"),
        Controller.GetIngress().CompletionReason,
        FString(TEXT("server_deadline")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FKhaaosTrainAvatarContract,
    "Khaaos.Fase3.TrainHandover.AvatarContract",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)

bool FKhaaosTrainAvatarContract::RunTest(const FString& Parameters)
{
    (void)Parameters;
    using namespace KhaaosAvatarSpawn;

    TestEqual(TEXT("Manny asset accepts Manny rig"),
        static_cast<uint8>(Validate({"CHR_Zheers_Male_Vanguard", "SK_Manny"})),
        static_cast<uint8>(EResult::Applied));
    TestEqual(TEXT("Gwen asset accepts Gwen rig"),
        static_cast<uint8>(Validate({"CHR_Zheers_Female_Valkyrie", "SK_Gwen"})),
        static_cast<uint8>(EResult::Applied));
    TestEqual(TEXT("Mismatched rig is rejected before spawn"),
        static_cast<uint8>(Validate({"CHR_Zheers_Female_Valkyrie", "SK_Manny"})),
        static_cast<uint8>(EResult::SkeletonMismatch));
    TestEqual(TEXT("Client path traversal is rejected"),
        static_cast<uint8>(Validate({"../ClientSuppliedMesh", "SK_Manny"})),
        static_cast<uint8>(EResult::InvalidAssetId));
    return true;
}
