// Khaaos Run - UE5.8 | Server-authoritative environmental damage policy
// Copyright Nexus-HUB57. All Rights Reserved.
#include "Game/WorldGen/KhaaosEnvironmentalDamagePolicy.h"

#include "Engine/World.h"
#include "Game/Data/KhaaosWorldConfigDataAsset.h"
#include "Game/KhaaosGameMode.h"

FName KhaaosEnvironmentalDamagePolicy::GetActiveWorldId(UWorld* World)
{
	if (!World)
	{
		return NAME_None;
	}

	const AKhaaosGameMode* GameMode = Cast<AKhaaosGameMode>(World->GetAuthGameMode());
	if (!GameMode)
	{
		return NAME_None;
	}

	const UKhaaosWorldConfigDataAsset* WorldConfig = GameMode->GetCurrentWorldConfig();
	return WorldConfig ? WorldConfig->WorldID : NAME_None;
}

bool KhaaosEnvironmentalDamagePolicy::WorldIdsMatch(FName ActiveWorldId, FName SourceWorldId)
{
	return !ActiveWorldId.IsNone() && !SourceWorldId.IsNone() &&
		ActiveWorldId.IsEqual(SourceWorldId, ENameCase::IgnoreCase);
}

bool KhaaosEnvironmentalDamagePolicy::IsSourceWorldActive(UWorld* World, FName SourceWorldId)
{
	return WorldIdsMatch(GetActiveWorldId(World), SourceWorldId);
}
