// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosAccessorySocketSystem
// PROPÓSITO: Sistema otimizado de attachment de acessórios cosméticos via
//            sockets do skeletal mesh com merge de bones e instancing.
//            Reduz draw calls ao batchar acessórios por slot e material.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Character/KhaaosSkinSystem.h"
#include "KhaaosAccessorySocketSystem.generated.h"

USTRUCT(BlueprintType)
struct FKhaaosAccessorySlot
{
    GENERATED_BODY()

    /** Slot cosmético (HEAD, BODY, LEGS, BACK, MELEE, PARACHUTE, EMOTE, BANNER) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosCosmeticSlot Slot = EKhaaosCosmeticSlot::HEAD;

    /** Nome do socket no skeletal mesh para attachment */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FName SocketName;

    /** Static mesh do acessório */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TObjectPtr<class UStaticMesh> AccessoryMesh;

    /** Material override (se null, usa material default do mesh) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TObjectPtr<class UMaterialInterface> MaterialOverride;

    /** Escala local do acessório */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FVector LocalScale = FVector(1.0f);

    /** Rotação local (para ajustes finos de positioning) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FRotator LocalRotation = FRotator::ZeroRotator;

    /** Se true, usa instanced static mesh para reduzir draw calls */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bUseInstancing = true;

    /** Se true, hidden quando operative está em primeira pessoa */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bHideInFirstPerson = true;
};

UCLASS(ClassGroup = (Khaaos, Character), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosAccessorySocketSystem : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosAccessorySocketSystem();

    /** Equipa um acessório em um slot (substitui anterior se existir) */
    void EquipAccessory(const FKhaaosAccessorySlot& Accessory);

    /** Remove o acessório de um slot específico */
    void UnequipSlot(EKhaaosCosmeticSlot Slot);

    /** Remove todos os acessórios */
    void UnequipAll();

    /** Atualiza visibilidade baseada na câmera (primeira vs terceira pessoa) */
    void UpdateFirstPersonVisibility(bool bIsFirstPerson);

    /** Otimiza draw calls ao batchar acessórios com mesmo material */
    void OptimizeDrawCalls();

    /** Obtém acessório equipado em um slot */
    const FKhaaosAccessorySlot* GetEquippedAccessory(EKhaaosCosmeticSlot Slot) const;

    /** Número total de acessórios equipados */
    int32 GetEquippedCount() const { return EquippedAccessories.Num(); }

    /** Draw calls ativos (para debug HUD) */
    int32 GetActiveDrawCalls() const { return ActiveDrawCalls; }

protected:
    /** Faz o attach físico do mesh ao socket do skeletal mesh */
    void AttachAccessoryToSocket(const FKhaaosAccessorySlot& Accessory);

    /** Desatacha e destroy o componente de mesh */
    void DetachAccessoryFromSlot(EKhaaosCosmeticSlot Slot);

private:
    /** Acessórios equipados por slot */
    TMap<EKhaaosCosmeticSlot, FKhaaosAccessorySlot> EquippedAccessories;

    /** Componentes de mesh criados para cada slot (para cleanup) */
    TMap<EKhaaosCosmeticSlot, TObjectPtr<class UStaticMeshComponent>> SpawnedMeshComponents;

    /** Estado de primeira pessoa */
    bool bIsFirstPersonMode = false;

    /** Draw calls ativos (cache) */
    int32 ActiveDrawCalls = 0;
};
