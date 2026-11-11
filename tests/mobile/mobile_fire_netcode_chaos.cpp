#include "Game/Network/KhaaosMobileFirePolicy.h"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <random>
#include <vector>

enum class RpcKind { Start, Heartbeat, Stop };

struct NetworkProfile
{
    const char* Name;
    double RoundTripMs;
    double JitterMs;
    double PacketLoss;
};

struct NetworkEvent
{
    double ArrivalSeconds;
    std::uint64_t SendOrder;
    RpcKind Kind;
    std::uint32_t PressToken;
};

struct ServerState
{
    bool bButtonDown = false;
    bool bHeld = false;
    bool bHasFired = false;
    std::uint32_t PressToken = 0;
    double LastInput = 0.0;
    double LastShot = 0.0;
    std::vector<double> ShotTimes;
};

static double Uniform(std::mt19937& Rng, double Minimum, double Maximum)
{
    return std::uniform_real_distribution<double>(Minimum, Maximum)(Rng);
}

static double OneWayDelay(const NetworkProfile& Profile, std::mt19937& Rng)
{
    return std::max(0.0, Profile.RoundTripMs / 2000.0
        + Uniform(Rng, -Profile.JitterMs, Profile.JitterMs) / 1000.0);
}

// Reliable RPCs are modeled as ordered and retransmitted; only start/stop use
// this queue in production. Heartbeats are redundant, unreliable datagrams.
static double QueueReliableRpc(double SendAt, const NetworkProfile& Profile,
                               std::mt19937& Rng, double& LastReliableArrival,
                               int& Retransmissions)
{
    int LostAttempts = 0;
    while (Uniform(Rng, 0.0, 1.0) < Profile.PacketLoss)
    {
        ++LostAttempts;
        ++Retransmissions;
        assert(LostAttempts < 32 && "unbounded retry in deterministic transport model");
    }
    const double RetransmitTimeout = std::max(0.15, Profile.RoundTripMs / 1000.0 * 1.5);
    const double Arrival = SendAt + OneWayDelay(Profile, Rng) + LostAttempts * RetransmitTimeout;
    LastReliableArrival = std::max(LastReliableArrival, Arrival);
    return LastReliableArrival;
}

static bool QueueUnreliableHeartbeat(double SendAt, std::uint64_t SendOrder,
                                     std::uint32_t PressToken,
                                     const NetworkProfile& Profile,
                                     std::mt19937& Rng,
                                     std::vector<NetworkEvent>& Events,
                                     int& DroppedHeartbeats)
{
    if (Uniform(Rng, 0.0, 1.0) < Profile.PacketLoss)
    {
        ++DroppedHeartbeats;
        return false;
    }
    Events.push_back({SendAt + OneWayDelay(Profile, Rng), SendOrder,
                      RpcKind::Heartbeat, PressToken});
    return true;
}

static void TryShot(ServerState& State, double Now, int FireRate)
{
    if (!State.bHeld || !KhaaosMobileFirePolicy::IsShotCadenceReady(
            State.bHasFired, Now, State.LastShot, FireRate))
    {
        return;
    }
    State.ShotTimes.push_back(Now);
    State.LastShot = Now;
    State.bHasFired = true;
}

static void ApplyServerRpc(ServerState& State, const NetworkEvent& Event,
                           double Now, int FireRate)
{
    if (Event.Kind == RpcKind::Start)
    {
        if (Event.PressToken == 0)
        {
            return;
        }
        const bool bSamePress = State.bButtonDown && State.PressToken == Event.PressToken;
        State.PressToken = Event.PressToken;
        State.bButtonDown = true;
        State.LastInput = Now;
        if (!bSamePress)
        {
            State.bHeld = true;
        }
        TryShot(State, Now, FireRate);
        return;
    }

    if (Event.Kind == RpcKind::Heartbeat)
    {
        if (!KhaaosMobileFirePolicy::IsCurrentFireHeartbeat(
                State.bButtonDown, State.PressToken, Event.PressToken))
        {
            return;
        }
        State.LastInput = Now;
        if (!State.bHeld)
        {
            State.bHeld = true; // automatic mode resumed after reload
        }
        return;
    }

    if (Event.PressToken == State.PressToken)
    {
        State.bHeld = false;
        State.bButtonDown = false;
    }
}

static void TickAuthoritativeServer(ServerState& State, double Now, int FireRate,
                                    int& LeaseExpirations)
{
    if (KhaaosMobileFirePolicy::HasFireLeaseExpired(
            State.bButtonDown, Now, State.LastInput))
    {
        ++LeaseExpirations;
        State.bHeld = false;
        State.bButtonDown = false;
    }
    TryShot(State, Now, FireRate);
}

static void TestNetworkProfile(const NetworkProfile& Profile, std::uint32_t Seed)
{
    std::mt19937 Rng(Seed);
    std::vector<NetworkEvent> Events;
    double LastReliableArrival = 0.0;
    double LastEventArrival = 0.0;
    int Retransmissions = 0;
    int DroppedHeartbeats = 0;
    std::uint64_t SendOrder = 0;
    constexpr double HoldSeconds = 12.0;
    constexpr int FireRate = 600;
    constexpr std::uint32_t PressToken = 0x4b520601u;

    const double StartArrival = QueueReliableRpc(0.0, Profile, Rng,
        LastReliableArrival, Retransmissions);
    Events.push_back({StartArrival, SendOrder++, RpcKind::Start, PressToken});

    for (double SentAt = KhaaosMobileFirePolicy::HeartbeatIntervalSeconds;
         SentAt < HoldSeconds;
         SentAt += KhaaosMobileFirePolicy::HeartbeatIntervalSeconds)
    {
        QueueUnreliableHeartbeat(SentAt, SendOrder++, PressToken, Profile,
            Rng, Events, DroppedHeartbeats);
    }

    const double StopArrival = QueueReliableRpc(HoldSeconds, Profile, Rng,
        LastReliableArrival, Retransmissions);
    Events.push_back({StopArrival, SendOrder++, RpcKind::Stop, PressToken});
    for (const NetworkEvent& Event : Events)
    {
        LastEventArrival = std::max(LastEventArrival, Event.ArrivalSeconds);
    }
    std::stable_sort(Events.begin(), Events.end(), [](const NetworkEvent& A, const NetworkEvent& B)
    {
        if (A.ArrivalSeconds == B.ArrivalSeconds)
        {
            return A.SendOrder < B.SendOrder;
        }
        return A.ArrivalSeconds < B.ArrivalSeconds;
    });

    ServerState State;
    std::size_t EventIndex = 0;
    int LeaseExpirations = 0;
    const double Step = 1.0 / 120.0;
    for (double Now = 0.0; Now <= LastEventArrival + 1.0; Now += Step)
    {
        while (EventIndex < Events.size() && Events[EventIndex].ArrivalSeconds <= Now)
        {
            ApplyServerRpc(State, Events[EventIndex], Now, FireRate);
            ++EventIndex;
        }
        TickAuthoritativeServer(State, Now, FireRate, LeaseExpirations);
    }

    assert(EventIndex == Events.size());
    assert(!State.bHeld && !State.bButtonDown && "matching reliable stop must end held fire");
    assert(LeaseExpirations == 0 && "redundant heartbeat stream should maintain lease on tested mobile profiles");
    assert(State.ShotTimes.size() > 50 && "the session should exercise automatic fire repeatedly");

    const double MinimumInterval = KhaaosMobileFirePolicy::MinimumShotIntervalSeconds(FireRate);
    for (std::size_t Index = 1; Index < State.ShotTimes.size(); ++Index)
    {
        assert(State.ShotTimes[Index] - State.ShotTimes[Index - 1]
            + KhaaosMobileFirePolicy::FireCadenceEpsilonSeconds >= MinimumInterval);
    }
    assert(State.ShotTimes.back() <= StopArrival
        && "no shots are allowed after the matching release reaches the server");

    std::cout << "profile=" << Profile.Name
              << " rtt_ms=" << Profile.RoundTripMs
              << " jitter_ms=+/-" << Profile.JitterMs
              << " loss=" << Profile.PacketLoss * 100.0 << "%"
              << " retransmissions=" << Retransmissions
              << " dropped_heartbeats=" << DroppedHeartbeats
              << " stop_arrival_s=" << StopArrival
              << " shots=" << State.ShotTimes.size() << " PASS\n";
}

static void TestDisconnectedLeaseExpiresAndRejectsStaleHeartbeat()
{
    constexpr double DisconnectAt = 4.0;
    constexpr double Step = 1.0 / 120.0;
    ServerState State;
    State.bButtonDown = true;
    State.bHeld = true;
    State.PressToken = 77;
    State.LastInput = DisconnectAt;

    assert(!KhaaosMobileFirePolicy::HasFireLeaseExpired(
        true, DisconnectAt + KhaaosMobileFirePolicy::FireInputLeaseSeconds,
        State.LastInput));
    assert(!KhaaosMobileFirePolicy::IsCurrentFireHeartbeat(false, 77, 77));
    assert(!KhaaosMobileFirePolicy::IsCurrentFireHeartbeat(true, 78, 77));

    double StoppedAt = 0.0;
    int LeaseExpirations = 0;
    for (double Now = DisconnectAt; Now <= DisconnectAt + 3.0; Now += Step)
    {
        TickAuthoritativeServer(State, Now, 600, LeaseExpirations);
        if (!State.bButtonDown)
        {
            StoppedAt = Now;
            break;
        }
    }
    assert(LeaseExpirations == 1);
    assert(StoppedAt > DisconnectAt + KhaaosMobileFirePolicy::FireInputLeaseSeconds);
    assert(StoppedAt <= DisconnectAt + KhaaosMobileFirePolicy::FireInputLeaseSeconds + Step * 1.1);
    assert(!State.bHeld && !State.bButtonDown);
    std::cout << "profile=disconnect_lease timeout_s="
              << KhaaosMobileFirePolicy::FireInputLeaseSeconds
              << " stale_heartbeat_rejected PASS\n";
}

int main()
{
    assert(KhaaosMobileFirePolicy::IsShotCadenceReady(false, 0.0, 0.0, 600));
    assert(!KhaaosMobileFirePolicy::IsShotCadenceReady(true, 0.05, 0.0, 600));
    assert(KhaaosMobileFirePolicy::IsShotCadenceReady(true, 0.1, 0.0, 600));
    assert(KhaaosMobileFirePolicy::MinimumShotIntervalSeconds(0) == 60.0);

    const NetworkProfile Profiles[] = {
        {"5G_good", 40.0, 12.0, 0.01},
        {"4G_typical", 150.0, 40.0, 0.03},
        {"4G_weak", 300.0, 80.0, 0.10},
        {"stress_500ms_25loss", 500.0, 150.0, 0.25},
    };
    for (std::size_t Index = 0; Index < sizeof(Profiles) / sizeof(Profiles[0]); ++Index)
    {
        TestNetworkProfile(Profiles[Index], 0x4b520600u + static_cast<std::uint32_t>(Index));
    }
    TestDisconnectedLeaseExpiresAndRejectsStaleHeartbeat();
    std::cout << "mobile fire netcode policy: PASS\n";
    return 0;
}
