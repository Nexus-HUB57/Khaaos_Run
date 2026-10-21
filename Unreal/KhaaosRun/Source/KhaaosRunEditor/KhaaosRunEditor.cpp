// Khaaos Run - Devs Ph.D | UE5.8
// Copyright Nexus-HUB57. All Rights Reserved.

#include "KhaaosRunEditor.h"

#include "ToolMenus.h"
#include "Framework/Docking/TabManager.h"
#include "Widgets/Docking/SDockTab.h"
#include "PropertyEditorModule.h"

#define LOCTEXT_NAMESPACE "FKhaaosRunEditorModule"

IMPLEMENT_MODULE(FKhaaosRunEditorModule, KhaaosRunEditor);

void FKhaaosRunEditorModule::StartupModule()
{
        // Register tool menus
        UToolMenus::RegisterStartupCallback(FSimpleMulticastDelegate::FDelegate::CreateRaw(
                this, &FKhaaosRunEditorModule::RegisterMenus));

        // Register custom property editor customizations
        RegisterCustomizations();

        UE_LOG(LogTemp, Log, TEXT("KhaaosRunEditor module started - Devs Ph.D"));
}

void FKhaaosRunEditorModule::ShutdownModule()
{
        // Unregister tool menus
        UToolMenus::UnRegisterStartupCallback(this);

        // Unregister all menus owned by this module
        UToolMenus::UnregisterOwner(this);

        UE_LOG(LogTemp, Log, TEXT("KhaaosRunEditor module shutdown"));
}

void FKhaaosRunEditorModule::RegisterMenus()
{
        // Register Khaaos Run editor menus and toolbar buttons
        // Extend the Level Editor toolbar with Khaaos-specific tools
        UToolMenus* MenuOwner = UToolMenus::Get();
        MenuOwner->RegisterMenuOwner(this);

        // Example: Add a "Khaaos Run" section to the toolbar
        // Full implementation would add spawn loot, reset zone, etc.
}

void FKhaaosRunEditorModule::RegisterCustomizations()
{
        // Register custom detail panel customizations for Khaaos types
        // e.g., KhaaosSafeZone phase editor, KhaaosLootPickup preset editor
        FPropertyEditorModule& PropertyModule = FModuleManager::LoadModuleChecked<FPropertyEditorModule>("PropertyEditor");

        // Custom detail layouts would be registered here:
        // PropertyModule.RegisterCustomClassLayout(
        //     AKhaaosSafeZone::StaticClass(),
        //     FOnGetDetailCustomizationInstance::CreateStatic(&FKhaaosSafeZoneCustomization::MakeInstance)
        // );
}

#undef LOCTEXT_NAMESPACE
