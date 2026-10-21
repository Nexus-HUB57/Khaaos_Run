// Khaaos Run - Devs Ph.D | UE5.8
// Copyright Nexus-HUB57. All Rights Reserved.

#pragma once

#include "Modules/ModuleManager.h"

class FKhaaosRunEditorModule : public IModuleInterface
{
public:
        virtual void StartupModule() override;
        virtual void ShutdownModule() override;

private:
        /** Register editor toolbar and menu extensions. */
        void RegisterMenus();

        /** Register custom detail panel customizations. */
        void RegisterCustomizations();
};
