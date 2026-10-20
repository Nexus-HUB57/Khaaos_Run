// Khaaos Run - Devs Ph.D | UE5.8
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "Modules/ModuleManager.h"

#ifndef KHAOSRUN_API
#define KHAOSRUN_API KHAAOSRUN_API
#endif

DECLARE_LOG_CATEGORY_EXTERN(LogKhaaosRun, Log, All);

class FKhaaosRunModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
