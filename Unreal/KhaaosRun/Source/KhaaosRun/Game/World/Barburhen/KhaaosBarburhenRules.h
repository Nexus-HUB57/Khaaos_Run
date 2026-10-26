#pragma once

#include "CoreMinimal.h"

namespace KhaaosBarburhenRules
{
    /** ZEX and ring checks use the playable XY plane; elevation never deactivates a terminal. */
    bool IsInsideZone2D(const FVector& Point, const FVector& Center, float Radius);

    /** Computes the authoritative environmental damage rate and fails closed on invalid inputs. */
    float EffectiveZoneDamage(float BaseDamagePerSecond, float PhaseModifier, float SeasonModifier);

    /** Entry closes when the remaining Ring time reaches the configured block window. */
    bool IsEntryOpen(float ElapsedSeconds, float RingDurationSeconds, float EntryBlockSeconds);
}
