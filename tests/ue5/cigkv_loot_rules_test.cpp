#include "CIGKVLootRules.h"

#include <cmath>
#include <iostream>
#include <limits>

namespace
{
int Failures = 0;

void Expect(bool Condition, const char* Description)
{
    if (Condition)
    {
        std::cout << "PASS: " << Description << '\n';
    }
    else
    {
        std::cerr << "FAIL: " << Description << '\n';
        ++Failures;
    }
}

void TestMinPhaseEligibility()
{
    using KhaaosCIGKVRules::IsLootPointEligible;

    Expect(IsLootPointEligible(0, 0, 0.0f, 100.0f), "MinPhase 0 is available in phase 0");
    Expect(!IsLootPointEligible(1, 0, 0.0f, 100.0f), "MinPhase 1 stays locked in phase 0");
    Expect(IsLootPointEligible(1, 1, 0.0f, 100.0f), "MinPhase unlocks at the exact phase");
    Expect(!IsLootPointEligible(2, 1, 0.0f, 100.0f), "MinPhase 2 stays locked in phase 1");
    Expect(IsLootPointEligible(2, 4, 0.0f, 100.0f), "loot remains unlocked in later phases");
    Expect(IsLootPointEligible(0, 0, 10000.0f, 100.0f), "point on zone boundary is eligible");
    Expect(!IsLootPointEligible(0, 0, 10000.5f, 100.0f), "point outside zone is ineligible");
}

void TestWeightedRaritySelection()
{
    using KhaaosCIGKVRules::SelectWeightedLootTier;

    constexpr float DefaultWeights[] = {0.40f, 0.25f, 0.20f, 0.10f, 0.05f};
    Expect(SelectWeightedLootTier(DefaultWeights, 5, 0.10f) == 0, "40% common weight selects tier 0");
    Expect(SelectWeightedLootTier(DefaultWeights, 5, 0.50f) == 1, "uncommon weight selects tier 1");
    Expect(SelectWeightedLootTier(DefaultWeights, 5, 0.75f) == 2, "rare weight selects tier 2");
    Expect(SelectWeightedLootTier(DefaultWeights, 5, 0.90f) == 3, "epic weight selects tier 3");
    Expect(SelectWeightedLootTier(DefaultWeights, 5, 0.98f) == 4, "legendary weight selects tier 4");

    constexpr float SparseWeights[] = {0.5f, 0.0f, -1.0f, 0.5f};
    Expect(SelectWeightedLootTier(SparseWeights, 4, 0.25f) == 0, "zero and negative weights are skipped");
    Expect(SelectWeightedLootTier(SparseWeights, 4, 0.75f) == 3, "positive weight after invalid tiers remains selectable");
    Expect(SelectWeightedLootTier(DefaultWeights, 5, 1.0f) == 4, "upper endpoint clamps to the last weighted tier");

    constexpr float EmptyWeights[] = {0.0f, -0.2f};
    Expect(SelectWeightedLootTier(EmptyWeights, 2, 0.5f) == -1, "all-zero/negative weights have no selection");
    Expect(SelectWeightedLootTier(nullptr, 0, 0.5f) == -1, "empty weight list has no selection");

    const float NonFiniteWeights[] = {0.5f, std::numeric_limits<float>::quiet_NaN(), 0.5f};
    Expect(SelectWeightedLootTier(NonFiniteWeights, 3, 0.75f) == 2, "non-finite weights are ignored");
    Expect(SelectWeightedLootTier(DefaultWeights, 5, std::numeric_limits<float>::quiet_NaN()) == -1,
        "non-finite random roll is rejected");
}
} // namespace

int main()
{
    TestMinPhaseEligibility();
    TestWeightedRaritySelection();

    if (Failures > 0)
    {
        std::cerr << Failures << " loot rule test(s) failed.\n";
        return 1;
    }

    std::cout << "All CIGKV loot rule tests passed.\n";
    return 0;
}
