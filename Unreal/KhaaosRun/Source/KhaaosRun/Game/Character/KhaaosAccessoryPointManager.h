// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// SUBSISTEMA: UKhaaosAccessoryPointManager
// PROPÓSITO: Gerenciador de pontos de attachment nomeados com hierarquia.
//            Cada ponto suporta múltiplos acessórios, visibilidade em cascata,
//            e validação de referências circulares na hierarquia.
//            Pontos padrão: Head, Face, Shoulders, Back, Chest, Waist, Legs,
//            Feet, Weapon_L, Weapon_R — mapeados para EKhaaosCosmeticSlot.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Character/KhaaosSkinSystem.h"
#include "KhaaosAccessoryPointManager.generated.h"

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Tipo de ponto de attachment — determina como o acessório é conectado */
UENUM(BlueprintType)
enum class EKhaaosAccessoryPointType : uint8
{
    Socket      UMETA(DisplayName = "Socket"),
    Bone        UMETA(DisplayName = "Bone"),
    Surface     UMETA(DisplayName = "Surface"),
    VFXHook     UMETA(DisplayName = "VFX Hook"),
    PropOffset  UMETA(DisplayName = "Prop Offset")
};

// ─── Structs ────────────────────────────────────────────────────────────────

/** Definição de um ponto de attachment com hierarquia opcional */
USTRUCT(BlueprintType)
struct FKhaaosAccessoryPoint
{
    GENERATED_BODY()

    /** Nome único do ponto (ex: "Head", "Face", "Shoulders_L") */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FName PointName;

    /** Tipo de attachment (Socket, Bone, Surface, VFXHook, PropOffset) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosAccessoryPointType PointType = EKhaaosAccessoryPointType::Socket;

    /** Ponto pai na hierarquia (NAME_None = raiz) — para visibilidade em cascata */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FName ParentPoint;

    /** Nome do socket no skeletal mesh (usado quando PointType == Socket) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FName SocketName;

    /** Nome do bone (usado quando PointType == Bone) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FName BoneName;

    /** Offset local em relação ao socket/bone */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FVector LocalOffset = FVector::ZeroVector;

    /** Rotação local */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FRotator LocalRotation = FRotator::ZeroRotator;

    /** Escala local */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FVector LocalScale = FVector(1.0f);

    /** Se true, permite múltiplos acessórios no mesmo ponto */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bAllowMultiple = false;

    /** Se true, visível em primeira pessoa */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bVisibleInFirstPerson = true;

    /** Se true, esconde quando o corpo estiver hidden (ex: primeira pessoa) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bHideWithBody = true;

    /** Máximo de attachments neste ponto (0 = ilimitado quando bAllowMultiple) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 MaxAttachments = 1;

    /** Slot cosmético associado (para mapeamento de pontos → slots) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosCosmeticSlot CosmeticSlot = EKhaaosCosmeticSlot::HEAD;
};

/** Acessório atualmente attached a um ponto */
USTRUCT(BlueprintType)
struct FKhaaosAttachedAccessory
{
    GENERATED_BODY()

    /** ID único do acessório */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FName AccessoryID;

    /** Nome do ponto onde está attached */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FName PointName;

    /** Componente de mesh do acessório (weak ref para segurança) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    TWeakObjectPtr<UMeshComponent> MeshComponent;

    /** Material override aplicado ao acessório */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TSoftObjectPtr<UMaterialInterface> MaterialOverride;

    /** Handle do VFX ativo no acessório */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FName VFXHandle;

    /** Se true, acessório está ativo e visível */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    bool bIsActive = true;
};

// ─── Delegates ──────────────────────────────────────────────────────────────

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnAccessoryAttached, FName, AccessoryID, FName, PointName, bool, bSuccess);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnAccessoryDetached, FName, AccessoryID, FName, PointName);

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * UKhaaosAccessoryPointManager
 *
 * Gerencia pontos de attachment nomeados com hierarquia para acessórios cosméticos.
 * Suporta: múltiplos attachments por ponto, visibilidade em cascata (pai → filhos),
 * validação de hierarquia circular, e mapeamento para EKhaaosCosmeticSlot.
 *
 * Pontos padrão registrados no BeginPlay:
 *   Head (helmet/hat/hair), Face (mask/glasses), Shoulders (pauldrons),
 *   Back (backpack/wings), Chest (armor), Waist (belt/holster),
 *   Legs (knee pads), Feet (boots), Weapon_L/R (weapon skins)
 */
UCLASS(ClassGroup = (Khaaos, Character), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosAccessoryPointManager : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosAccessoryPointManager();

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void BeginPlay() override;

    // ─── Point Registration ────────────────────────────────────────────────

    /** Registra um ponto de attachment. Retorna false se já existe ou hierarquia inválida. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AccessoryPoints")
    bool RegisterPoint(const FKhaaosAccessoryPoint& Point);

    /** Remove um ponto e todos os attachments nele */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AccessoryPoints")
    void UnregisterPoint(FName PointName);

    /** Obtém definição de um ponto pelo nome */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AccessoryPoints")
    bool GetPoint(FName PointName, FKhaaosAccessoryPoint& OutPoint) const;

    // ─── Attachment ─────────────────────────────────────────────────────────

    /** Attach acessório a ponto(s) específico(s). Retorna true se sucesso em todos. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AccessoryPoints")
    bool AttachToPoints(FName AccessoryID, const TArray<FName>& PointNames, UMeshComponent* MeshComponent);

    /** Detach acessório de um ponto específico */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AccessoryPoints")
    void DetachFromPoint(FName AccessoryID, FName PointName);

    /** Detach acessório de todos os pontos */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AccessoryPoints")
    void DetachFromAllPoints(FName AccessoryID);

    // ─── Query ─────────────────────────────────────────────────────────────

    /** Obtém todos os pontos mapeados para um slot cosmético */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AccessoryPoints")
    TArray<FKhaaosAccessoryPoint> GetPointsForSlot(EKhaaosCosmeticSlot Slot) const;

    /** Retorna todos os attachments ativos */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AccessoryPoints")
    TArray<FKhaaosAttachedAccessory> GetActiveAttachments() const;

    /** Retorna attachments ativos em um ponto específico */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AccessoryPoints")
    TArray<FKhaaosAttachedAccessory> GetAttachmentsAtPoint(FName PointName) const;

    /** Obtém pontos filhos de um ponto (descendentes diretos) */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|AccessoryPoints")
    TArray<FName> GetChildPoints(FName PointName) const;

    // ─── Visibility ────────────────────────────────────────────────────────

    /** Define visibilidade de um ponto e propaga para todos os filhos na hierarquia */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AccessoryPoints")
    void SetPointVisibility(FName PointName, bool bVisible);

    /** Atualiza visibilidade para primeira pessoa */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AccessoryPoints")
    void UpdateFirstPersonVisibility(bool bIsFirstPerson);

    // ─── Validation ────────────────────────────────────────────────────────

    /** Valida hierarquia de pontos — verifica referências circulares. Retorna true se válida. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|AccessoryPoints")
    bool ValidatePointHierarchy();

    // ─── Delegates ─────────────────────────────────────────────────────────

    /** Disparado quando acessório é attached com sucesso ou falha */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|AccessoryPoints")
    FOnAccessoryAttached OnAccessoryAttached;

    /** Disparado quando acessório é detached */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|AccessoryPoints")
    FOnAccessoryDetached OnAccessoryDetached;

private:
    /** Pontos registrados (PointName → definição) */
    UPROPERTY()
    TMap<FName, FKhaaosAccessoryPoint> RegisteredPoints;

    /** Attachments ativos (PointName → array de acessórios attached) */
    UPROPERTY()
    TMap<FName, TArray<FKhaaosAttachedAccessory>> ActiveAttachmentsMap;

    /** Mapa reverso (AccessoryID → PointNames onde está attached) */
    TMap<FName, TArray<FName>> AccessoryToPointsMap;

    /** Estado de primeira pessoa */
    bool bIsFirstPersonMode = false;

    // ─── Internal ──────────────────────────────────────────────────────────

    /** Registra os pontos padrão (Head, Face, Shoulders, Back, etc.) */
    void RegisterDefaultPoints();

    /** Coleta todos os descendentes de um ponto (recursivo) */
    void CollectDescendants(FName PointName, TArray<FName>& OutDescendants) const;

    /** Verifica se adicionar ChildName a ParentName criaria ciclo */
    bool WouldCreateCycle(FName ParentName, FName ChildName) const;
};
