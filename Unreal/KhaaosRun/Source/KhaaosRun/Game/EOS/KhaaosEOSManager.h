// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Delegates/Delegate.h"
#include "KhaaosEOSManager.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class FOnlineAccountInfo;

// ─── EOS Product ID Wrapper ───────────────────────────────────────────────────

/** Lightweight wrapper around EOS_ProductUserId for safe transport. */
USTRUCT(BlueprintType)
struct FEosProductId
{
	GENERATED_BODY()

	/** String representation of the EOS Product User ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EOS")
	FString ProductUserIdString;

	/** Check if this ID is valid. */
	bool IsValid() const { return !ProductUserIdString.IsEmpty(); }

	/** Comparison operators. */
	bool operator==(const FEosProductId& Other) const { return ProductUserIdString == Other.ProductUserIdString; }
	bool operator!=(const FEosProductId& Other) const { return ProductUserIdString != Other.ProductUserIdString; }
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when EOS login completes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnEOSLoginComplete, bool, bSuccess, const FString&, ErrorMessage);

/** Broadcast when EOS logout completes. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnEOSLogoutComplete, bool, bSuccess);

/**
 * UKhaaosEOSManager
 *
 * GameInstanceSubsystem that wraps the Epic Online Services (EOS) SDK.
 * Handles platform initialization, authentication (login/logout),
 * and provides the EOS_ProductUserId for downstream subsystems
 * (Lobby, Matchmaking, Session).
 *
 * Lifecycle:
 *   1. InitializeEOS() — called from GameInstance::Init()
 *   2. Login() — authenticate with EOS (persistent auth or credentials)
 *   3. Downstream subsystems use GetLocalProductId()
 *   4. ShutdownEOS() — called from GameInstance::Shutdown()
 *
 * EOS SDK pattern:
 *   - EOS_PlatformHandle: singleton platform instance
 *   - EOS_HAuth: auth handle from platform
 *   - All async operations use EOS callbacks
 */
UCLASS(BlueprintType)
class UKhaaosEOSManager : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	// ─── Subsystem Lifecycle ───────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── EOS Platform ──────────────────────────────────────────────────────────

	/**
	 * Initialize the EOS Platform and Auth interface.
	 * Must be called before any other EOS operations.
	 *
	 * @param ProductId    EOS Product ID from dev portal
	 * @param SandboxId    EOS Sandbox ID
	 * @param DeploymentId EOS Deployment ID
	 * @param ClientId     EOS Client ID (for auth)
	 * @param ClientSecret EOS Client Secret (for auth)
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS")
	bool InitializeEOS(FName ProductId, FName SandboxId, FString DeploymentId, FString ClientId, FString ClientSecret);

	/** Shutdown the EOS Platform. Releases all handles. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS")
	void ShutdownEOS();

	/** Check if EOS platform has been initialized. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS")
	bool IsEOSInitialized() const { return bPlatformInitialized; }

	// ─── Authentication ────────────────────────────────────────────────────────

	/**
	 * Login to EOS with credentials (email/password or device auth).
	 * Results broadcast via OnLoginComplete.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS")
	void Login(FString Email, FString Password);

	/**
	 * Login using persistent auth (auto-login from stored credentials).
	 * Results broadcast via OnLoginComplete.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS")
	void LoginWithPersistence();

	/** Logout from EOS. Results broadcast via OnLogoutComplete. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EOS")
	void Logout();

	/** Check if currently logged in. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS")
	bool IsLoggedIn() const { return bLoggedIn; }

	/** Get the local player's EOS Product User ID. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS")
	FEosProductId GetLocalProductId() const { return LocalProductId; }

	/** Get the local player's display name. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EOS")
	FString GetLocalDisplayName() const { return LocalDisplayName; }

	// ─── Tick (for EOS callback pumping) ───────────────────────────────────────

	/** Call EOS_Platform_Tick to pump callbacks. Called from GameInstance tick. */
	void TickEOSPlatform();

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast when login completes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS")
	FOnEOSLoginComplete OnLoginComplete;

	/** Broadcast when logout completes. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EOS")
	FOnEOSLogoutComplete OnLogoutComplete;

private:

	/** Whether EOS platform has been initialized. */
	bool bPlatformInitialized = false;

	/** Whether the local user is logged in. */
	bool bLoggedIn = false;

	/** Local player's EOS Product User ID. */
	FEosProductId LocalProductId;

	/** Local player's display name. */
	FString LocalDisplayName;

	/** EOS Product ID (from config). */
	FName CachedProductId;

	/** EOS Sandbox ID (from config). */
	FName CachedSandboxId;

	/** EOS Deployment ID (from config). */
	FString CachedDeploymentId;

	/** EOS Client ID (from config). */
	FString CachedClientId;

	/** EOS Client Secret (from config). */
	FString CachedClientSecret;

	/** Handle the EOS login callback (internal). */
	void HandleLoginCallback(bool bSuccess, const FString& ErrorMessage);

	/** Handle the EOS logout callback (internal). */
	void HandleLogoutCallback(bool bSuccess);
};
