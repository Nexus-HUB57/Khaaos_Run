#pragma once

namespace KhaaosCIGKVRules
{

inline constexpr int ZuVariantCount = 3;
inline constexpr int ZuProtectiveChoice = 0;
inline constexpr int ZuUnsafeChoice = 1;
inline constexpr float MaxZuDamageFraction = 0.30f;

bool IsValidVariant(int VariantId) noexcept;
bool IsValidChoice(int ChoiceIndex) noexcept;
bool IsCorrectChoice(int VariantId, int ChoiceIndex) noexcept;
float ClampWrongDecisionDamageFraction(float DamageFraction) noexcept;

} // namespace KhaaosCIGKVRules
