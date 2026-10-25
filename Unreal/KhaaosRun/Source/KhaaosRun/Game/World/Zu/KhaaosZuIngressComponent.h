// Khaaos Run — bridge from the Zu catalog to the existing vitality component.
// New file. Does not edit CIGKVZuRules, the cinematic component, or vitality.
// Copyright Nexus-HUB57.

#pragma once

#include "CoreMinimal.h"
#include "Game/World/Zu/ZuIngressRules.h"
#include "KhaaosZuIngressComponent.generated.h"

UENUM(BlueprintType)
enum class EKhaaosZuRingId : uint8
{
	CIGKV UMETA(DisplayName = "CIGKV"),
	Barburhen UMETA(DisplayName = "Barburhen"),
	Priadus UMETA(DisplayName = "Priadus"),
	Ckesalth UMETA(DisplayName = "Ckesalth"),
	Arukheea UMETA(DisplayName = "Arukheea")
};

UENUM(BlueprintType)
enum class EKhaaosZuHazardId : uint8
{
	Slow UMETA(DisplayName = "Lentidao"),
	Bleed UMETA(DisplayName = "Fogo ou ar"),
	Invert UMETA(DisplayName = "Inverte comando"),
	Sink UMETA(DisplayName = "Areia movedica"),
	Chomp UMETA(DisplayName = "Tubarao")
};

USTRUCT(BlueprintType)
struct FKhaaosZuHazardView
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Khaaos|Zu")
	EKhaaosZuHazardId Kind = EKhaaosZuHazardId::Slow;

	UPROPERTY(BlueprintReadOnly, Category = "Khaaos|Zu")
	FString Label;

	UPROPERTY(BlueprintReadOnly, Category = "Khaaos|Zu")
	float LocalRight = 0.0f;

	UPROPERTY(BlueprintReadOnly, Category = "Khaaos|Zu")
	float LocalForward = 0.0f;

	UPROPERTY(BlueprintReadOnly, Category = "Khaaos|Zu")
	float Radius = 1.0f;

	UPROPERTY(BlueprintReadOnly, Category = "Khaaos|Zu")
	float Rate = 0.0f;

	UPROPERTY(BlueprintReadOnly, Category = "Khaaos|Zu")
	bool bMaskedSafe = false;
};

struct FKhaaosZuPlainOrder
{
	float PercentageDamage = 0.0f;
	float StunSeconds = 0.0f;
	float BlurSeconds = 0.0f;
	bool bThrownFromVehicle = false;
};

FKhaaosZuPlainOrder KhaaosZu_OrderFromOutcome(const KhaaosZuIngress::FOutcome& Outcome);

DECLARE_DYNAMIC_MULTICAST_DELEGATE_FourParams(
	FOnKhaaosZuResolved,
	bool, bAccepted,
	float, PercentageDamage,
	float, StunSeconds,
	float, BlurSeconds);

/**
 * Add this to the character next to UKhaaosVitalityComponent.
 * The server applies stun, blur and the 30% cap. The client only reads the popup.
 */
UCLASS(ClassGroup = (Khaaos), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosZuIngressComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKhaaosZuIngressComponent();

	UFUNCTION(BlueprintCallable, Category = "Khaaos|Zu")
	bool BeginIngress(EKhaaosZuRingId Ring, int32 Variant);

	UFUNCTION(BlueprintPure, Category = "Khaaos|Zu")
	FString GetPopupText() const;

	UFUNCTION(BlueprintPure, Category = "Khaaos|Zu")
	FString GetSituationText() const;

	/** bAccept false is also the timeout. Exposure01 is how long the player stayed in the crash. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Zu")
	bool SubmitDecision(bool bAccept, float Exposure01, float LockRoll01);

	UFUNCTION(BlueprintPure, Category = "Khaaos|Zu")
	bool WasAppliedOnAuthority() const { return bAppliedOnAuthority; }

	UFUNCTION(BlueprintPure, Category = "Khaaos|Zu")
	bool WasThrownFromVehicle() const { return LastOrder.bThrownFromVehicle; }

	UFUNCTION(BlueprintPure, Category = "Khaaos|Zu")
	int32 GetHazardCount() const;

	UFUNCTION(BlueprintCallable, Category = "Khaaos|Zu")
	bool GetHazard(int32 Index, FKhaaosZuHazardView& OutView) const;

	UFUNCTION(BlueprintCallable, Category = "Khaaos|Zu")
	bool GetLootStock(TArray<int32>& OutStock) const;

	UPROPERTY(BlueprintAssignable, Category = "Khaaos|Zu")
	FOnKhaaosZuResolved OnZuResolved;

private:
	bool bIngressReady = false;
	bool bAppliedOnAuthority = false;
	KhaaosZuIngress::FSpec ActiveSpec;
	FKhaaosZuPlainOrder LastOrder;
};
