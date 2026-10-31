// Khaaos Run - UE5.8 | Runtime CIGKV data-source audit
#pragma once

#if WITH_DEV_AUTOMATION_TESTS
#include "CoreMinimal.h"
#include "AutomationTest.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FKhaaosCIGKVRuntimeDataSourceTest,
    "Khaaos.CIGKV.Runtime.DataSource",
    EAutomationTestFlags::ApplicationContext | EAutomationTestFlags::ProductFilter)
#endif // WITH_DEV_AUTOMATION_TESTS
