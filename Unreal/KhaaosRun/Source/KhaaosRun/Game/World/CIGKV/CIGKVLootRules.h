#pragma once

#include <cmath>
#include <cstddef>

namespace KhaaosCIGKVRules
{

/** True when a loot point is unlocked and lies within the active zone. */
inline bool IsLootPointEligible(
    int MinimumPhase,
    int CurrentPhase,
    float DistanceSquared,
    float ZoneRadius) noexcept
{
    return MinimumPhase <= CurrentPhase && DistanceSquared <= ZoneRadius * ZoneRadius;
}

/**
 * Select an index from non-negative weights using a normalized roll in [0, 1).
 * Invalid/non-positive weights are ignored; -1 means no selectable weight.
 */
inline int SelectWeightedLootTier(
    const float* Weights,
    std::size_t WeightCount,
    float NormalizedRoll) noexcept
{
    if (Weights == nullptr || WeightCount == 0 || !std::isfinite(NormalizedRoll))
    {
        return -1;
    }

    float TotalWeight = 0.0f;
    for (std::size_t Index = 0; Index < WeightCount; ++Index)
    {
        const float Weight = Weights[Index];
        if (std::isfinite(Weight) && Weight > 0.0f)
        {
            TotalWeight += Weight;
        }
    }

    if (!std::isfinite(TotalWeight) || TotalWeight <= 0.0f)
    {
        return -1;
    }

    if (NormalizedRoll < 0.0f)
    {
        NormalizedRoll = 0.0f;
    }
    else if (NormalizedRoll >= 1.0f)
    {
        NormalizedRoll = std::nextafter(1.0f, 0.0f);
    }

    const float Target = NormalizedRoll * TotalWeight;
    float CumulativeWeight = 0.0f;
    int LastPositiveIndex = -1;

    for (std::size_t Index = 0; Index < WeightCount; ++Index)
    {
        const float Weight = Weights[Index];
        if (!std::isfinite(Weight) || Weight <= 0.0f)
        {
            continue;
        }

        CumulativeWeight += Weight;
        LastPositiveIndex = static_cast<int>(Index);
        if (Target < CumulativeWeight)
        {
            return LastPositiveIndex;
        }
    }

    // Protect against floating-point rounding at the upper edge.
    return LastPositiveIndex;
}

} // namespace KhaaosCIGKVRules
