#include "Game/World/Barburhen/KhaaosBarburhenRules.h"
#include <cmath>
#include <iostream>

const FVector FVector::ZeroVector(0.0f, 0.0f, 0.0f);
const FRotator FRotator::ZeroRotator(0.0f, 0.0f, 0.0f);

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
    using namespace KhaaosBarburhenRules;
    Expect(IsInsideZone2D(FVector(100.0f, 0.0f, 5000.0f), FVector::ZeroVector, 100.0f),
        "ZEX uses XY distance and ignores elevation");
    Expect(!IsInsideZone2D(FVector(100.1f, 0.0f, 0.0f), FVector::ZeroVector, 100.0f),
        "point outside the zone is inactive");
    Expect(std::fabs(EffectiveZoneDamage(10.0f, 1.5f, 2.0f) - 30.0f) < 0.0001f,
        "phase and season modifiers compose into authoritative damage");
    Expect(EffectiveZoneDamage(-1.0f, 1.0f, 1.0f) == 0.0f,
        "negative damage fails closed");
    Expect(IsEntryOpen(5000.0f, 5400.0f, 180.0f),
        "entry remains open before the final block window");
    Expect(!IsEntryOpen(5220.0f, 5400.0f, 180.0f),
        "entry closes at the configured final block window");
    Expect(!IsEntryOpen(5400.0f, 5400.0f, 180.0f),
        "entry closes when the Ring ends");
    if (Failures > 0) return 1;
    std::cout << "All Barburhen vertical slice rule tests passed.\n";
    return 0;
}
