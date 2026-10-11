// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/EOS/KhaaosEOSManager.h"
#include "OnlineSubsystem.h"
#include "OnlineSubsystemUtils.h"
#include "OnlineIdentityInterface.h"

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosEOSManager::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	bPlatformInitialized = false;
	bLoggedIn = false;

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSManager: Initialized"));
}

void UKhaaosEOSManager::Deinitialize()
{
	ShutdownEOS();

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSManager: Deinitialized"));
	Super::Deinitialize();
}

// ─── InitializeEOS ────────────────────────────────────────────────────────────

bool UKhaaosEOSManager::InitializeEOS(FName ProductId, FName SandboxId, FString DeploymentId, FString ClientId, FString ClientSecret)
{
	if (bPlatformInitialized)
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSManager::InitializeEOS - Already initialized"));
		return true;
	}

	CachedProductId = ProductId;
	CachedSandboxId = SandboxId;
	CachedDeploymentId = DeploymentId;
	CachedClientId = ClientId;
	CachedClientSecret = ClientSecret;

	// The EOSIntegrationKit plugin handles EOS_Platform_Create internally
	// via the OnlineSubsystem. We validate that EOS is available.
	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		UE_LOG(LogTemp, Error, TEXT("KhaaosEOSManager::InitializeEOS - No OnlineSubsystem available"));
		return false;
	}

	FName SubsystemName = OnlineSub->GetSubsystemName();
	if (SubsystemName != FName("EOS"))
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSManager::InitializeEOS - OnlineSubsystem is %s, not EOS"), *SubsystemName.ToString());
	}

	bPlatformInitialized = true;

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSManager::InitializeEOS - EOS initialized (Product=%s, Sandbox=%s)"),
		*ProductId.ToString(), *SandboxId.ToString());

	return true;
}

// ─── ShutdownEOS ──────────────────────────────────────────────────────────────

void UKhaaosEOSManager::ShutdownEOS()
{
	if (!bPlatformInitialized)
	{
		return;
	}

	// Logout if still logged in
	if (bLoggedIn)
	{
		Logout();
	}

	bPlatformInitialized = false;
	bLoggedIn = false;
	LocalProductId = FEosProductId();
	LocalDisplayName.Empty();

	UE_LOG(LogTemp, Log, TEXT("KhaaosEOSManager::ShutdownEOS - EOS shutdown complete"));
}

// ─── Login ────────────────────────────────────────────────────────────────────

void UKhaaosEOSManager::Login(FString Email, FString Password)
{
	if (!bPlatformInitialized)
	{
		HandleLoginCallback(false, TEXT("EOS not initialized"));
		return;
	}

	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		HandleLoginCallback(false, TEXT("No OnlineSubsystem"));
		return;
	}

	IOnlineIdentityPtr Identity = OnlineSub->GetIdentityInterface();
	if (!Identity.IsValid())
	{
		HandleLoginCallback(false, TEXT("No Identity interface"));
		return;
	}

	// Build credentials
	FOnlineAccountCredentials Credentials(TEXT("epic"), Email, Password);

	// Get the first local user (controller index 0)
	int32 LocalUserNum = 0;

	// Bind callback for login completion
	Identity->AddOnLoginCompleteDelegate_Handle(
		LocalUserNum,
		FOnLoginCompleteDelegate::CreateLambda([this, LocalUserNum](int32 /*UserNum*/, bool bSuccess)
		{
			if (bSuccess)
			{
				IOnlineSubsystem* Sub = IOnlineSubsystem::Get();
				if (Sub)
				{
					IOnlineIdentityPtr Id = Sub->GetIdentityInterface();
					if (Id.IsValid())
					{
						TSharedPtr<FOnlineUser> OnlineUser = Id->GetOnlineUser(LocalUserNum);
						if (OnlineUser.IsValid())
						{
							FEosProductId EosId;
							EosId.ProductUserIdString = OnlineUser->GetUserId()->ToString();
							LocalProductId = EosId;
							LocalDisplayName = OnlineUser->GetRealName();
						}
					}
				}
				bLoggedIn = true;
				HandleLoginCallback(true, FString());
			}
			else
			{
				HandleLoginCallback(false, TEXT("EOS login failed"));
			}
		})
	);

	// Initiate login
	if (!Identity->Login(LocalUserNum, Credentials))
	{
		HandleLoginCallback(false, TEXT("Identity::Login returned false"));
	}
}

// ─── LoginWithPersistence ─────────────────────────────────────────────────────

void UKhaaosEOSManager::LoginWithPersistence()
{
	// Use empty credentials to trigger persistent auth
	Login(FString(), FString());
}

// ─── Logout ───────────────────────────────────────────────────────────────────

void UKhaaosEOSManager::Logout()
{
	if (!bPlatformInitialized || !bLoggedIn)
	{
		HandleLogoutCallback(false);
		return;
	}

	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (!OnlineSub)
	{
		HandleLogoutCallback(false);
		return;
	}

	IOnlineIdentityPtr Identity = OnlineSub->GetIdentityInterface();
	if (!Identity.IsValid())
	{
		HandleLogoutCallback(false);
		return;
	}

	int32 LocalUserNum = 0;

	Identity->AddOnLogoutCompleteDelegate_Handle(
		LocalUserNum,
		FOnLogoutCompleteDelegate::CreateLambda([this](int32 /*UserNum*/, bool bSuccess)
		{
			HandleLogoutCallback(bSuccess);
		})
	);

	if (!Identity->Logout(LocalUserNum))
	{
		HandleLogoutCallback(false);
	}
}

// ─── TickEOSPlatform ──────────────────────────────────────────────────────────

void UKhaaosEOSManager::TickEOSPlatform()
{
	if (!bPlatformInitialized)
	{
		return;
	}

	// EOSIntegrationKit handles EOS_Platform_Tick internally via its own tick.
	// This method is provided for explicit pumping if needed.
	IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
	if (OnlineSub)
	{
		OnlineSub->Tick(0.0f);
	}
}

// ─── Internal Callback Handlers ──────────────────────────────────────────────

void UKhaaosEOSManager::HandleLoginCallback(bool bSuccess, const FString& ErrorMessage)
{
	if (bSuccess)
	{
		UE_LOG(LogTemp, Log, TEXT("KhaaosEOSManager: Login successful (User=%s)"), *LocalDisplayName);
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSManager: Login failed - %s"), *ErrorMessage);
	}

	OnLoginComplete.Broadcast(bSuccess, ErrorMessage);
}

void UKhaaosEOSManager::HandleLogoutCallback(bool bSuccess)
{
	if (bSuccess)
	{
		bLoggedIn = false;
		LocalProductId = FEosProductId();
		LocalDisplayName.Empty();
		UE_LOG(LogTemp, Log, TEXT("KhaaosEOSManager: Logout successful"));
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("KhaaosEOSManager: Logout failed"));
	}

	OnLogoutComplete.Broadcast(bSuccess);
}
