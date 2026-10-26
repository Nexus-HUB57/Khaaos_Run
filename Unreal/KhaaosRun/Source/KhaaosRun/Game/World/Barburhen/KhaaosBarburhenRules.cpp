#include "Game/World/Barburhen/KhaaosBarburhenRules.h"

namespace KhaaosBarburhenRules
{
    bool IsInsideZone2D(const FVector& Point, const FVector& Center, float Radius)
    {
        return Radius >= 0.0f && FVector::DistSquared2D(Point, Center) <= Radius * Radius;
    }

    float EffectiveZoneDamage(float BaseDamagePerSecond, float PhaseModifier, float SeasonModifier)
    {
        if (!std::isfinite(BaseDamagePerSecond) || !std::isfinite(PhaseModifier) || !std::isfinite(SeasonModifier))
        {
            return 0.0f;
        }
        return std::max(0.0f, BaseDamagePerSecond) * std::max(0.0f, PhaseModifier) * std::max(0.0f, SeasonModifier);
    }

    bool IsEntryOpen(float ElapsedSeconds, float RingDurationSeconds, float EntryBlockSeconds)
    {
        if (!std::isfinite(ElapsedSeconds) || !std::isfinite(RingDurationSeconds) || !std::isfinite(EntryBlockSeconds))
        {
            return false;
        }
        if (RingDurationSeconds <= 0.0f || EntryBlockSeconds < 0.0f || ElapsedSeconds < 0.0f)
        {
            return false;
        }
        return ElapsedSeconds < RingDurationSeconds && (RingDurationSeconds - ElapsedSeconds) > EntryBlockSeconds;
    }
}
