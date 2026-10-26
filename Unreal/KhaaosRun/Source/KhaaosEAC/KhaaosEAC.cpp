// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#include "KhaaosEAC.h"

namespace KhaaosEACSupport
{
	bool IsSDKAvailable()
	{
#if KHAAOS_EAC_SDK
		return true;
#else
		return false;
#endif
	}

	FString SdkStatus()
	{
#if KHAAOS_EAC_SDK
		return TEXT("sdk");
#else
		return TEXT("stub");
#endif
	}
}
