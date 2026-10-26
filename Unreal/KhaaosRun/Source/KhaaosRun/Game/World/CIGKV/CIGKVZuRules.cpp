#include "Game/World/CIGKV/CIGKVZuRules.h"

#include <algorithm>
#include <cmath>

namespace KhaaosCIGKVRules
{

bool IsValidVariant(int VariantId) noexcept
{
    return VariantId >= 0 && VariantId < ZuVariantCount;
}

bool IsValidChoice(int ChoiceIndex) noexcept
{
    return ChoiceIndex == ZuProtectiveChoice || ChoiceIndex == ZuUnsafeChoice;
}

bool IsCorrectChoice(int VariantId, int ChoiceIndex) noexcept
{
    return IsValidVariant(VariantId) && IsValidChoice(ChoiceIndex) && ChoiceIndex == ZuProtectiveChoice;
}

float ClampWrongDecisionDamageFraction(float DamageFraction) noexcept
{
    if (!std::isfinite(DamageFraction))
    {
        return 0.0f;
    }
    return std::clamp(DamageFraction, 0.0f, MaxZuDamageFraction);
}

} // namespace KhaaosCIGKVRules
