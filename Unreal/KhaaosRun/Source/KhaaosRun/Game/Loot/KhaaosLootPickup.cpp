// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Loot/KhaaosLootPickup.h"
#include "KhaaosRun.h"

#include "Components/SphereComponent.h"
#include "Net/UnrealNetwork.h"
#include "Engine/World.h"
#include "Game/Inventory/KhaaosInventoryComponent.h"

// ─── Constructor ────────────────────────────────────────────────────────────────

AKhaaosLootPickup::AKhaaosLootPickup()
{
        PrimaryActorTick.bCanEverTick = false;
        PrimaryActorTick.bStartWithTickEnabled = false;

        // ── Default loot state ──
        ItemId      = 0;
        ItemName    = TEXT("");
        InventoryItemID = NAME_None;
        InventoryStackCount = 1;
        Rarity      = ELootRarity::Comum;
        ItemType    = EItemType::Recurso;
        bIsActive   = true;
        PickedUpBy  = TEXT("");
        MapPosition = FVector2D::ZeroVector;

        // ── Configuration ──
        DefaultPickupRange = 3.0f;

        // ── Collision ──
        PickupCollision = CreateDefaultSubobject<USphereComponent>(TEXT("PickupCollision"));
        RootComponent = PickupCollision;
        PickupCollision->SetSphereRadius(WorldPickupRangeCm);
        PickupCollision->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
        PickupCollision->SetCollisionResponseToAllChannels(ECR_Ignore);
        PickupCollision->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);

        bReplicates = true;
        bOnlyRelevantToPlayers = true;
		bAlwaysRelevant = false;
		SetNetCullDistanceSquared(FMath::Square(3000.0f));
		NetUpdateFrequency = 3.0f;
		MinNetUpdateFrequency = 1.0f;
		NetDormancy = DORM_DormantAll;
}

// ─── RepNotify ──────────────────────────────────────────────────────────────────

void AKhaaosLootPickup::OnRep_IsActive()
{
        SetActorHiddenInGame(!bIsActive);
        SetActorEnableCollision(bIsActive);
}

// ─── Server Methods ─────────────────────────────────────────────────────────────

bool AKhaaosLootPickup::TryPickupIntoInventory(UKhaaosInventoryComponent* Inventory)
{
	if (!HasAuthority() || !bIsActive || !Inventory || InventoryItemID.IsNone() || InventoryStackCount <= 0)
	{
		return false;
	}
	AActor* PlayerActor = Inventory->GetOwner();
	if (!PlayerActor || !PlayerActor->HasAuthority() ||
		FVector::DistSquared(GetActorLocation(), PlayerActor->GetActorLocation()) > FMath::Square(WorldPickupRangeCm))
	{
		return false;
	}

	if (!Inventory->AddItem(InventoryItemID, InventoryStackCount))
	{
		return false;
	}
	FlushNetDormancy();
	bIsActive = false;
	PickedUpBy = PlayerActor->GetName();
	SetActorHiddenInGame(true);
	SetActorEnableCollision(false);
	OnLootPickedUp.Broadcast(this, PickedUpBy);
	ForceNetUpdate();
	SetNetDormancy(DORM_DormantAll);
	return true;
}

void AKhaaosLootPickup::ConfigureInventoryItem(FName ItemID, int32 StackCount, EItemType InType)
{
	if (!HasAuthority() || ItemID.IsNone() || StackCount <= 0) return;
	FlushNetDormancy();
	InventoryItemID = ItemID;
	ItemId = GetUniqueID();
	InventoryStackCount = StackCount;
	ItemName = ItemID.ToString();
	ItemType = InType;
	ItemStats.Ammo = StackCount;
	ForceNetUpdate();
	SetNetDormancy(DORM_DormantAll);
}

bool AKhaaosLootPickup::TryPickup(const FString& PlayerId, float PlayerPosX, float PlayerPosY, float PickupRange)
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return false;
        }

        // Validate pickup is active
        if (!bIsActive)
        {
                UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosLootPickup::TryPickup - Item %d not active"), ItemId);
                return false;
        }

        // Validate player is in range
        FVector2D PlayerPos(PlayerPosX, PlayerPosY);
        float Distance = FVector2D::Distance(PlayerPos, MapPosition);
        float EffectiveRange = (PickupRange > 0.0f) ? PickupRange : DefaultPickupRange;

        if (Distance > EffectiveRange)
        {
                UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosLootPickup::TryPickup - Player %s too far (%.2f > %.2f)"),
                        *PlayerId, Distance, EffectiveRange);
                return false;
        }

        // Deactivate and record picker
        FlushNetDormancy();
        bIsActive = false;
        PickedUpBy = PlayerId;

        // Broadcast pickup
        OnLootPickedUp.Broadcast(this, PlayerId);

        // Client RPC for effects
        ClientOnPickedUp(PlayerId);
		ForceNetUpdate();
		SetNetDormancy(DORM_DormantAll);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLootPickup::TryPickup - Item %d picked up by %s"), ItemId, *PlayerId);

        return true;
}

void AKhaaosLootPickup::ResetPickup()
{
        if (GetLocalRole() != ROLE_Authority)
        {
                return;
        }

        FlushNetDormancy();
        bIsActive = true;
        PickedUpBy = TEXT("");

        SetActorHiddenInGame(false);
        SetActorEnableCollision(true);
		ForceNetUpdate();
		SetNetDormancy(DORM_DormantAll);
}

void AKhaaosLootPickup::InitFromPreset(int32 InItemId, const FString& InName, EItemType InType, ELootRarity InRarity, float InPosX, float InPosY, const FLootStats& InStats)
{
		if (!HasAuthority()) return;
		FlushNetDormancy();
        ItemId      = InItemId;
        ItemName    = InName;
        ItemType    = InType;
        Rarity      = InRarity;
        MapPosition = FVector2D(InPosX, InPosY);
        ItemStats   = InStats;

        bIsActive   = true;
        PickedUpBy  = TEXT("");
		ForceNetUpdate();
		SetNetDormancy(DORM_DormantAll);

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosLootPickup::InitFromPreset - Item %d: %s at (%.1f, %.1f)"),
                InItemId, *InName, InPosX, InPosY);
}

bool AKhaaosLootPickup::SetRarity(ELootRarity InRarity)
{
        if (!HasAuthority())
        {
                return false;
        }

        FlushNetDormancy();
        Rarity = InRarity;
        ForceNetUpdate();
		SetNetDormancy(DORM_DormantAll);
        return true;
}

// ─── Client RPC ─────────────────────────────────────────────────────────────────

void AKhaaosLootPickup::ClientOnPickedUp_Implementation(const FString& PickerId)
{
        // Client-side pickup VFX, SFX, UI feedback
        UE_LOG(LogKhaaosRun, Verbose, TEXT("KhaaosLootPickup: Client pickup effect for %s"), *PickerId);
}

// ─── Replication ────────────────────────────────────────────────────────────────

void AKhaaosLootPickup::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);

        DOREPLIFETIME(AKhaaosLootPickup, ItemId);
        DOREPLIFETIME(AKhaaosLootPickup, ItemName);
        DOREPLIFETIME(AKhaaosLootPickup, InventoryItemID);
        DOREPLIFETIME(AKhaaosLootPickup, InventoryStackCount);
        DOREPLIFETIME(AKhaaosLootPickup, Rarity);
        DOREPLIFETIME(AKhaaosLootPickup, ItemType);
        DOREPLIFETIME(AKhaaosLootPickup, ItemStats);
        DOREPLIFETIME_CONDITION_NOTIFY(AKhaaosLootPickup, bIsActive, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME(AKhaaosLootPickup, PickedUpBy);
        DOREPLIFETIME(AKhaaosLootPickup, MapPosition);
}
