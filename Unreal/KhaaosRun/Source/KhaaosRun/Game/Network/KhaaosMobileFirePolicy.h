// Khaaos Run — policy pura de proteção de input de fogo em rede móvel.
// Mantida sem dependências de Unreal para permitir testes nativos determinísticos.
#pragma once

#include <cstdint>

namespace KhaaosMobileFirePolicy
{
inline constexpr double HeartbeatIntervalSeconds = 0.25;
inline constexpr double FireInputLeaseSeconds = 2.0;
inline constexpr double FireCadenceEpsilonSeconds = 0.0001;

inline bool HasFireLeaseExpired(bool bButtonDown, double Now, double LastInputTimestamp,
                                double LeaseSeconds = FireInputLeaseSeconds) noexcept
{
    return bButtonDown && (Now - LastInputTimestamp) > LeaseSeconds;
}

inline bool IsCurrentFireHeartbeat(bool bButtonDown, std::uint32_t CurrentPressToken,
                                   std::uint32_t HeartbeatPressToken) noexcept
{
    return bButtonDown && HeartbeatPressToken != 0
        && CurrentPressToken == HeartbeatPressToken;
}

inline double MinimumShotIntervalSeconds(int FireRatePerMinute) noexcept
{
    const int SafeFireRate = FireRatePerMinute > 0 ? FireRatePerMinute : 1;
    return 60.0 / static_cast<double>(SafeFireRate);
}

inline bool IsShotCadenceReady(bool bHasFired, double Now, double LastShotTimestamp,
                               int FireRatePerMinute,
                               double EpsilonSeconds = FireCadenceEpsilonSeconds) noexcept
{
    return !bHasFired
        || (Now - LastShotTimestamp) + EpsilonSeconds >= MinimumShotIntervalSeconds(FireRatePerMinute);
}
} // namespace KhaaosMobileFirePolicy
