// Khaaos Run - UE5.8 | Server-authoritative environmental damage policy
// Copyright Nexus-HUB57. All Rights Reserved.
#pragma once

#include "CoreMinimal.h"

class UWorld;

namespace KhaaosEnvironmentalDamagePolicy
{
	/** Returns the configured world ID from the authoritative GameMode, or NAME_None. */
	FName GetActiveWorldId(UWorld* World);

	/** Compares non-empty world IDs case-insensitively. Exposed for deterministic tests. */
	bool WorldIdsMatch(FName ActiveWorldId, FName SourceWorldId);

	/** Fails closed unless SourceWorldId is the currently configured server world. */
	bool IsSourceWorldActive(UWorld* World, FName SourceWorldId);
}
