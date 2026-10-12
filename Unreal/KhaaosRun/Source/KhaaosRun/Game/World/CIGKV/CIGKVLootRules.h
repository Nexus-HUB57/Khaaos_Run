#pragma once

#include <cstddef>

namespace KhaaosCIGKVRules
{

/** True when a loot point is unlocked and lies within the active zone. */
bool IsLootPointEligible(
    int MinimumPhase,
    int CurrentPhase,
    float DistanceSquared,
    float ZoneRadius) noexcept;

/**
 * Select an index from non-negative weights using a normalized roll in [0, 1).
 * Invalid/non-positive weights are ignored; -1 means no selectable weight.
 */
int SelectWeightedLootTier(
    const float* Weights,
    std::size_t WeightCount,
    float NormalizedRoll) noexcept;

} // namespace KhaaosCIGKVRules
