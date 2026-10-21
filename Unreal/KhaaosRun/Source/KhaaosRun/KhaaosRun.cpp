// Khaaos Run - Devs Ph.D | UE5.8
// Copyright Nexus-HUB57. All Rights Reserved.

#include "KhaaosRun.h"

DEFINE_LOG_CATEGORY(LogKhaaosRun);

IMPLEMENT_MODULE(FKhaaosRunModule, KhaaosRun);

void FKhaaosRunModule::StartupModule()
{
	UE_LOG(LogKhaaosRun, Log, TEXT("Khaaos Run module started - Devs Ph.D"));
}

void FKhaaosRunModule::ShutdownModule()
{
	UE_LOG(LogKhaaosRun, Log, TEXT("Khaaos Run module shutdown"));
}
