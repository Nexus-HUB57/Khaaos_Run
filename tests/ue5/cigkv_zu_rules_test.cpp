#include "Game/World/CIGKV/CIGKVZuRules.h"

#include <cmath>
#include <iostream>
#include <limits>

namespace
{
int Failures = 0;
void Expect(bool Condition, const char* Description)
{
    if (Condition) std::cout << "PASS: " << Description << '\n';
    else { std::cerr << "FAIL: " << Description << '\n'; ++Failures; }
}
}

int main()
{
    using namespace KhaaosCIGKVRules;
    for (int Variant = 0; Variant < ZuVariantCount; ++Variant)
    {
        Expect(IsCorrectChoice(Variant, ZuProtectiveChoice), "each configured Zu accepts its protective choice");
        Expect(!IsCorrectChoice(Variant, ZuUnsafeChoice), "each configured Zu rejects its unsafe choice as correct");
    }
    Expect(!IsValidVariant(-1) && !IsValidVariant(ZuVariantCount), "unknown Zu variants are rejected");
    Expect(!IsValidChoice(2) && !IsValidChoice(255), "unknown button choices are rejected");
    Expect(std::fabs(ClampWrongDecisionDamageFraction(0.25f) - 0.25f) < 0.0001f, "configured damage below the cap is preserved");
    Expect(std::fabs(ClampWrongDecisionDamageFraction(0.75f) - MaxZuDamageFraction) < 0.0001f, "damage is capped at 30 percent");
    Expect(ClampWrongDecisionDamageFraction(-0.2f) == 0.0f, "negative configured damage is clamped to zero");
    Expect(ClampWrongDecisionDamageFraction(std::numeric_limits<float>::quiet_NaN()) == 0.0f, "non-finite configured damage fails closed");
    if (Failures > 0) return 1;
    std::cout << "All CIGKV Zu rule tests passed.\n";
    return 0;
}
