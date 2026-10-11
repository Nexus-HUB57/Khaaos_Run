// Khaaos Run - Devs Ph.D | UE5.8
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "Modules/ModuleManager.h"

DECLARE_LOG_CATEGORY_EXTERN(LogKhaaosRun, Log, All);

class FKhaaosRunModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
