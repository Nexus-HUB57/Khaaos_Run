// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosAccessorySocketSystem
// Socket attachment, instancing, first-person visibility, draw call optimization.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosAccessorySocketSystem.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/Character.h"
#include "Engine/StaticMesh.h"

UKhaaosAccessorySocketSystem::UKhaaosAccessorySocketSystem()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UKhaaosAccessorySocketSystem::EquipAccessory(const FKhaaosAccessorySlot& Accessory)
{
    // Remover acessório anterior no mesmo slot
    if (EquippedAccessories.Contains(Accessory.Slot))
    {
        DetachAccessoryFromSlot(Accessory.Slot);
    }

    // Registrar novo acessório
    EquippedAccessories.Add(Accessory.Slot, Accessory);

    // Fazer attach físico
    AttachAccessoryToSocket(Accessory);

    UE_LOG(LogTemp, Display, TEXT("[AccessorySocket] Equipado: Slot=%s, Socket=%s, Instancing=%s"),
        *UEnum::GetDisplayValueAsText(Accessory.Slot).ToString(),
        *Accessory.SocketName.ToString(),
        Accessory.bUseInstancing ? TEXT("YES") : TEXT("NO"));
}

void UKhaaosAccessorySocketSystem::UnequipSlot(EKhaaosCosmeticSlot Slot)
{
    if (EquippedAccessories.Contains(Slot))
    {
        DetachAccessoryFromSlot(Slot);
        EquippedAccessories.Remove(Slot);
    }
}

void UKhaaosAccessorySocketSystem::UnequipAll()
{
    for (const auto& Pair : EquippedAccessories)
    {
        DetachAccessoryFromSlot(Pair.Key);
    }
    EquippedAccessories.Empty();
    ActiveDrawCalls = 0;
}

void UKhaaosAccessorySocketSystem::UpdateFirstPersonVisibility(bool bIsFirstPerson)
{
    bIsFirstPersonMode = bIsFirstPerson;

    for (const auto& Pair : EquippedAccessories)
    {
        const FKhaaosAccessorySlot& Accessory = Pair.Value;

        if (Accessory.bHideInFirstPerson && bIsFirstPerson)
        {
            if (UStaticMeshComponent* MeshComp = SpawnedMeshComponents.FindRef(Pair.Key))
            {
                MeshComp->SetVisibility(false);
            }
        }
        else
        {
            if (UStaticMeshComponent* MeshComp = SpawnedMeshComponents.FindRef(Pair.Key))
            {
                MeshComp->SetVisibility(true);
            }
        }
    }
}

void UKhaaosAccessorySocketSystem::OptimizeDrawCalls()
{
    // Contar draw calls ativos (1 por componente de mesh não-instanciado)
    ActiveDrawCalls = 0;

    TMap<UMaterialInterface*, int32> MaterialCount;

    for (const auto& Pair : EquippedAccessories)
    {
        const FKhaaosAccessorySlot& Accessory = Pair.Value;

        if (Accessory.bUseInstancing)
        {
            // Instanced meshes compartilham 1 draw call por material
            UMaterialInterface* Mat = Accessory.MaterialOverride.IsValid() ?
                Accessory.MaterialOverride.Get() : nullptr;

            if (Mat)
            {
                MaterialCount.Add(Mat, MaterialCount.FindRef(Mat) + 1);
            }
        }
        else
        {
            // Non-instanced = 1 draw call per accessory
            ActiveDrawCalls++;
        }
    }

    // Adicionar draw calls para materiais instanciados (1 per unique material)
    ActiveDrawCalls += MaterialCount.Num();

    UE_LOG(LogTemp, Verbose, TEXT("[AccessorySocket] Draw calls otimizados: %d (instancing ativo para %d itens)"),
        ActiveDrawCalls, EquippedAccessories.Num());
}

const FKhaaosAccessorySlot* UKhaaosAccessorySocketSystem::GetEquippedAccessory(EKhaaosCosmeticSlot Slot) const
{
    return EquippedAccessories.Find(Slot);
}

void UKhaaosAccessorySocketSystem::AttachAccessoryToSocket(const FKhaaosAccessorySlot& Accessory)
{
    if (!Accessory.AccessoryMesh) return;

    ACharacter* OwnerChar = Cast<ACharacter>(GetOwner());
    if (!OwnerChar) return;

    USkeletalMeshComponent* SkelMesh = OwnerChar->GetMesh();
    if (!SkelMesh) return;

    // Criar StaticMeshComponent para o acessório
    FAttachmentTransformRules AttachRules(EAttachmentRule::SnapToTarget, EAttachmentRule::SnapToTarget, EAttachmentRule::SnapToTarget, true);

    UStaticMeshComponent* AccessoryComp = NewObject<UStaticMeshComponent>(OwnerChar,
        *FString::Printf(TEXT("Accessory_%s"), *UEnum::GetDisplayValueAsText(Accessory.Slot).ToString()));

    AccessoryComp->SetStaticMesh(Accessory.AccessoryMesh);
    AccessoryComp->SetRelativeScale3D(Accessory.LocalScale);
    AccessoryComp->SetRelativeRotation(Accessory.LocalRotation);

    // Material override
    if (Accessory.MaterialOverride)
    {
        AccessoryComp->SetMaterial(0, Accessory.MaterialOverride);
    }

    // Instancing para redução de draw calls
    if (Accessory.bUseInstancing)
    {
        AccessoryComp->SetMobility(EComponentMobility::Movable);
    }

    // Attach ao socket do skeletal mesh
    AccessoryComp->AttachToComponent(SkelMesh, AttachRules, Accessory.SocketName);
    AccessoryComp->RegisterComponent();

    // Aplicar visibilidade de primeira pessoa
    if (Accessory.bHideInFirstPerson && bIsFirstPersonMode)
    {
        AccessoryComp->SetVisibility(false);
    }

    // Registrar componente para cleanup
    SpawnedMeshComponents.Add(Accessory.Slot, AccessoryComp);
}

void UKhaaosAccessorySocketSystem::DetachAccessoryFromSlot(EKhaaosCosmeticSlot Slot)
{
    if (UStaticMeshComponent* MeshComp = SpawnedMeshComponents.FindRef(Slot))
    {
        MeshComp->DestroyComponent();
        SpawnedMeshComponents.Remove(Slot);
    }
}
