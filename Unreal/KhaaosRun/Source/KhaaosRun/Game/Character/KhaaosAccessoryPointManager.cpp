// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// IMPLEMENTAÇÃO: UKhaaosAccessoryPointManager
// Gerenciador de pontos de attachment nomeados com hierarquia, visibilidade
// em cascata, e validação de referências circulares.
// ==============================================================================

#include "Game/Character/KhaaosAccessoryPointManager.h"
#include "KhaaosRun.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/Character.h"

// ─── Constructor ─────────────────────────────────────────────────────────────

UKhaaosAccessoryPointManager::UKhaaosAccessoryPointManager()
{
    PrimaryComponentTick.bCanEverTick = false;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

void UKhaaosAccessoryPointManager::BeginPlay()
{
    Super::BeginPlay();

    // Registra pontos padrão para o personagem
    RegisterDefaultPoints();

    UE_LOG(LogKhaaosRun, Log, TEXT("[AccessoryPointManager] Inicializado com %d pontos padrão"), RegisteredPoints.Num());
}

// ─── Point Registration ──────────────────────────────────────────────────────

bool UKhaaosAccessoryPointManager::RegisterPoint(const FKhaaosAccessoryPoint& Point)
{
    // Verificar se já existe
    if (RegisteredPoints.Contains(Point.PointName))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[AccessoryPointManager] Ponto já registrado: %s"), *Point.PointName.ToString());
        return false;
    }

    // Verificar hierarquia — se tem pai, o pai deve existir
    if (Point.ParentPoint != NAME_None && !RegisteredPoints.Contains(Point.ParentPoint))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[AccessoryPointManager] Ponto pai não encontrado: %s para %s"),
            *Point.ParentPoint.ToString(), *Point.PointName.ToString());
        return false;
    }

    // Verificar se criaria ciclo
    if (Point.ParentPoint != NAME_None && WouldCreateCycle(Point.ParentPoint, Point.PointName))
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[AccessoryPointManager] Ciclo detectado ao registrar: %s → pai %s"),
            *Point.PointName.ToString(), *Point.ParentPoint.ToString());
        return false;
    }

    RegisteredPoints.Add(Point.PointName, Point);

    UE_LOG(LogKhaaosRun, Verbose, TEXT("[AccessoryPointManager] Ponto registrado: %s (tipo=%s, slot=%s, pai=%s)"),
        *Point.PointName.ToString(),
        *UEnum::GetDisplayValueAsText(Point.PointType).ToString(),
        *UEnum::GetDisplayValueAsText(Point.CosmeticSlot).ToString(),
        *Point.ParentPoint.ToString());

    return true;
}

void UKhaaosAccessoryPointManager::UnregisterPoint(FName PointName)
{
    if (!RegisteredPoints.Contains(PointName)) return;

    // Detach todos os acessórios neste ponto
    if (TArray<FKhaaosAttachedAccessory>* Attachments = ActiveAttachmentsMap.Find(PointName))
    {
        for (const FKhaaosAttachedAccessory& Acc : *Attachments)
        {
            // Limpar mapa reverso
            if (TArray<FName>* PointList = AccessoryToPointsMap.Find(Acc.AccessoryID))
            {
                PointList->Remove(PointName);
                if (PointList->Num() == 0)
                {
                    AccessoryToPointsMap.Remove(Acc.AccessoryID);
                }
            }
        }
    }
    ActiveAttachmentsMap.Remove(PointName);

    // Remover ponto
    RegisteredPoints.Remove(PointName);

    UE_LOG(LogKhaaosRun, Log, TEXT("[AccessoryPointManager] Ponto removido: %s"), *PointName.ToString());
}

bool UKhaaosAccessoryPointManager::GetPoint(FName PointName, FKhaaosAccessoryPoint& OutPoint) const
{
    const FKhaaosAccessoryPoint* Found = RegisteredPoints.Find(PointName);
    if (Found)
    {
        OutPoint = *Found;
        return true;
    }
    return false;
}

// ─── Attachment ──────────────────────────────────────────────────────────────

bool UKhaaosAccessoryPointManager::AttachToPoints(FName AccessoryID, const TArray<FName>& PointNames, UMeshComponent* MeshComponent)
{
    if (!MeshComponent) return false;

    bool bAllSuccess = true;

    for (const FName& PointName : PointNames)
    {
        FKhaaosAccessoryPoint* Point = RegisteredPoints.Find(PointName);
        if (!Point)
        {
            UE_LOG(LogKhaaosRun, Warning, TEXT("[AccessoryPointManager] Ponto não encontrado: %s"), *PointName.ToString());
            bAllSuccess = false;
            continue;
        }

        // Verificar capacidade
        TArray<FKhaaosAttachedAccessory>* Existing = ActiveAttachmentsMap.Find(PointName);
        int32 CurrentCount = Existing ? Existing->Num() : 0;

        if (!Point->bAllowMultiple && CurrentCount >= 1)
        {
            UE_LOG(LogKhaaosRun, Warning, TEXT("[AccessoryPointManager] Ponto não suporta múltiplos: %s"), *PointName.ToString());
            bAllSuccess = false;
            continue;
        }

        if (Point->MaxAttachments > 0 && CurrentCount >= Point->MaxAttachments)
        {
            UE_LOG(LogKhaaosRun, Warning, TEXT("[AccessoryPointManager] Ponto cheio (%d/%d): %s"),
                CurrentCount, Point->MaxAttachments, *PointName.ToString());
            bAllSuccess = false;
            continue;
        }

        // Criar entrada de attachment
        FKhaaosAttachedAccessory NewAttachment;
        NewAttachment.AccessoryID = AccessoryID;
        NewAttachment.PointName = PointName;
        NewAttachment.MeshComponent = MeshComponent;
        NewAttachment.bIsActive = true;

        // Adicionar ao mapa de attachments
        TArray<FKhaaosAttachedAccessory>& PointAttachments = ActiveAttachmentsMap.FindOrAdd(PointName);
        PointAttachments.Add(NewAttachment);

        // Atualizar mapa reverso
        TArray<FName>& AccessoryPoints = AccessoryToPointsMap.FindOrAdd(AccessoryID);
        AccessoryPoints.AddUnique(PointName);

        // Attach físico ao socket/bone
        ACharacter* OwnerChar = Cast<ACharacter>(GetOwner());
        if (OwnerChar && OwnerChar->GetMesh())
        {
            FAttachmentTransformRules AttachRules(
                EAttachmentRule::SnapToTarget, EAttachmentRule::SnapToTarget,
                EAttachmentRule::SnapToTarget, true);

            if (Point->PointType == EKhaaosAccessoryPointType::Socket && Point->SocketName != NAME_None)
            {
                MeshComponent->AttachToComponent(OwnerChar->GetMesh(), AttachRules, Point->SocketName);
            }
            else if (Point->PointType == EKhaaosAccessoryPointType::Bone && Point->BoneName != NAME_None)
            {
                MeshComponent->AttachToComponent(OwnerChar->GetMesh(), AttachRules, Point->BoneName);
            }

            // Aplicar transform local
            MeshComponent->SetRelativeLocation(Point->LocalOffset);
            MeshComponent->SetRelativeRotation(Point->LocalRotation);
            MeshComponent->SetRelativeScale3D(Point->LocalScale);
        }
    }

    // Disparar delegate
    OnAccessoryAttached.Broadcast(AccessoryID, PointNames.Num() > 0 ? PointNames[0] : NAME_None, bAllSuccess);

    return bAllSuccess;
}

void UKhaaosAccessoryPointManager::DetachFromPoint(FName AccessoryID, FName PointName)
{
    TArray<FKhaaosAttachedAccessory>* Attachments = ActiveAttachmentsMap.Find(PointName);
    if (!Attachments) return;

    // Remover o acessório específico
    int32 RemovedIdx = INDEX_NONE;
    for (int32 i = 0; i < Attachments->Num(); ++i)
    {
        if ((*Attachments)[i].AccessoryID == AccessoryID)
        {
            // Destruir mesh component se ainda válido
            if ((*Attachments)[i].MeshComponent.IsValid())
            {
                (*Attachments)[i].MeshComponent->DestroyComponent();
            }
            RemovedIdx = i;
            break;
        }
    }

    if (RemovedIdx != INDEX_NONE)
    {
        Attachments->RemoveAt(RemovedIdx);

        // Limpar mapa vazio
        if (Attachments->Num() == 0)
        {
            ActiveAttachmentsMap.Remove(PointName);
        }

        // Atualizar mapa reverso
        if (TArray<FName>* PointList = AccessoryToPointsMap.Find(AccessoryID))
        {
            PointList->Remove(PointName);
            if (PointList->Num() == 0)
            {
                AccessoryToPointsMap.Remove(AccessoryID);
            }
        }

        OnAccessoryDetached.Broadcast(AccessoryID, PointName);
    }
}

void UKhaaosAccessoryPointManager::DetachFromAllPoints(FName AccessoryID)
{
    TArray<FName>* PointList = AccessoryToPointsMap.Find(AccessoryID);
    if (!PointList) return;

    // Copiar para evitar invalidação durante iteração
    TArray<FName> PointsCopy = *PointList;
    for (const FName& PointName : PointsCopy)
    {
        DetachFromPoint(AccessoryID, PointName);
    }
}

// ─── Query ───────────────────────────────────────────────────────────────────

TArray<FKhaaosAccessoryPoint> UKhaaosAccessoryPointManager::GetPointsForSlot(EKhaaosCosmeticSlot Slot) const
{
    TArray<FKhaaosAccessoryPoint> Result;
    for (const auto& Pair : RegisteredPoints)
    {
        if (Pair.Value.CosmeticSlot == Slot)
        {
            Result.Add(Pair.Value);
        }
    }
    return Result;
}

TArray<FKhaaosAttachedAccessory> UKhaaosAccessoryPointManager::GetActiveAttachments() const
{
    TArray<FKhaaosAttachedAccessory> Result;
    for (const auto& Pair : ActiveAttachmentsMap)
    {
        for (const FKhaaosAttachedAccessory& Acc : Pair.Value)
        {
            if (Acc.bIsActive)
            {
                Result.Add(Acc);
            }
        }
    }
    return Result;
}

TArray<FKhaaosAttachedAccessory> UKhaaosAccessoryPointManager::GetAttachmentsAtPoint(FName PointName) const
{
    const TArray<FKhaaosAttachedAccessory>* Found = ActiveAttachmentsMap.Find(PointName);
    if (Found)
    {
        return *Found;
    }
    return TArray<FKhaaosAttachedAccessory>();
}

TArray<FName> UKhaaosAccessoryPointManager::GetChildPoints(FName PointName) const
{
    TArray<FName> Children;
    for (const auto& Pair : RegisteredPoints)
    {
        if (Pair.Value.ParentPoint == PointName)
        {
            Children.Add(Pair.Key);
        }
    }
    return Children;
}

// ─── Visibility ─────────────────────────────────────────────────────────────

void UKhaaosAccessoryPointManager::SetPointVisibility(FName PointName, bool bVisible)
{
    // Definir visibilidade dos attachments neste ponto
    TArray<FKhaaosAttachedAccessory>* Attachments = ActiveAttachmentsMap.Find(PointName);
    if (Attachments)
    {
        for (FKhaaosAttachedAccessory& Acc : *Attachments)
        {
            Acc.bIsActive = bVisible;
            if (Acc.MeshComponent.IsValid())
            {
                Acc.MeshComponent->SetVisibility(bVisible);
            }
        }
    }

    // Propagar para filhos na hierarquia
    TArray<FName> Children = GetChildPoints(PointName);
    for (const FName& ChildName : Children)
    {
        SetPointVisibility(ChildName, bVisible);
    }
}

void UKhaaosAccessoryPointManager::UpdateFirstPersonVisibility(bool bIsFirstPerson)
{
    bIsFirstPersonMode = bIsFirstPerson;

    for (const auto& Pair : RegisteredPoints)
    {
        const FKhaaosAccessoryPoint& Point = Pair.Value;

        // Se ponto deve ser escondido em primeira pessoa
        if (!Point.bVisibleInFirstPerson && bIsFirstPerson)
        {
            SetPointVisibility(Point.PointName, false);
        }
        // Se ponto estava escondido por causa de primeira pessoa e saímos dela
        else if (!Point.bVisibleInFirstPerson && !bIsFirstPerson)
        {
            SetPointVisibility(Point.PointName, true);
        }
    }
}

// ─── Validation ─────────────────────────────────────────────────────────────

bool UKhaaosAccessoryPointManager::ValidatePointHierarchy()
{
    bool bValid = true;
    TSet<FName> Visited;
    TSet<FName> RecursionStack;

    for (const auto& Pair : RegisteredPoints)
    {
        Visited.Empty();
        RecursionStack.Empty();

        // Caminhar pela hierarquia para cima — se revisitarmos um nó, há ciclo
        FName Current = Pair.Key;
        while (Current != NAME_None)
        {
            if (RecursionStack.Contains(Current))
            {
                UE_LOG(LogKhaaosRun, Error, TEXT("[AccessoryPointManager] Ciclo detectado envolvendo: %s"), *Current.ToString());
                bValid = false;
                break;
            }

            RecursionStack.Add(Current);

            const FKhaaosAccessoryPoint* Point = RegisteredPoints.Find(Current);
            if (!Point) break; // Ponto não registrado — outro problema, mas não ciclo

            Current = Point->ParentPoint;
        }
    }

    if (bValid)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("[AccessoryPointManager] Hierarquia válida — sem ciclos detectados"));
    }

    return bValid;
}

// ─── Internal ────────────────────────────────────────────────────────────────

void UKhaaosAccessoryPointManager::RegisterDefaultPoints()
{
    // Pontos padrão mapeados para slots cosméticos
    // ── Head (helmet/hat/hair) ──
    {
        FKhaaosAccessoryPoint P;
        P.PointName = FName("Head");
        P.PointType = EKhaaosAccessoryPointType::Socket;
        P.ParentPoint = NAME_None;
        P.SocketName = FName("headSocket");
        P.CosmeticSlot = EKhaaosCosmeticSlot::HEAD;
        P.bAllowMultiple = false;
        P.MaxAttachments = 1;
        P.bVisibleInFirstPerson = false;
        P.bHideWithBody = true;
        RegisterPoint(P);
    }

    // ── Face (mask/glasses) — filho de Head ──
    {
        FKhaaosAccessoryPoint P;
        P.PointName = FName("Face");
        P.PointType = EKhaaosAccessoryPointType::Socket;
        P.ParentPoint = FName("Head");
        P.SocketName = FName("faceSocket");
        P.CosmeticSlot = EKhaaosCosmeticSlot::HEAD;
        P.bAllowMultiple = true;
        P.MaxAttachments = 3;
        P.bVisibleInFirstPerson = false;
        P.bHideWithBody = true;
        RegisterPoint(P);
    }

    // ── Shoulders (pauldrons) ──
    {
        FKhaaosAccessoryPoint P;
        P.PointName = FName("Shoulders");
        P.PointType = EKhaaosAccessoryPointType::Socket;
        P.ParentPoint = NAME_None;
        P.SocketName = FName("shoulderSocket");
        P.CosmeticSlot = EKhaaosCosmeticSlot::BODY;
        P.bAllowMultiple = true;
        P.MaxAttachments = 2;
        P.bVisibleInFirstPerson = true;
        P.bHideWithBody = true;
        RegisterPoint(P);
    }

    // ── Back (backpack/wings) ──
    {
        FKhaaosAccessoryPoint P;
        P.PointName = FName("Back");
        P.PointType = EKhaaosAccessoryPointType::Socket;
        P.ParentPoint = NAME_None;
        P.SocketName = FName("backSocket");
        P.CosmeticSlot = EKhaaosCosmeticSlot::BACK;
        P.bAllowMultiple = false;
        P.MaxAttachments = 1;
        P.bVisibleInFirstPerson = true;
        P.bHideWithBody = true;
        RegisterPoint(P);
    }

    // ── Chest (armor) ──
    {
        FKhaaosAccessoryPoint P;
        P.PointName = FName("Chest");
        P.PointType = EKhaaosAccessoryPointType::Socket;
        P.ParentPoint = NAME_None;
        P.SocketName = FName("chestSocket");
        P.CosmeticSlot = EKhaaosCosmeticSlot::BODY;
        P.bAllowMultiple = false;
        P.MaxAttachments = 1;
        P.bVisibleInFirstPerson = true;
        P.bHideWithBody = true;
        RegisterPoint(P);
    }

    // ── Waist (belt/holster) ──
    {
        FKhaaosAccessoryPoint P;
        P.PointName = FName("Waist");
        P.PointType = EKhaaosAccessoryPointType::Socket;
        P.ParentPoint = NAME_None;
        P.SocketName = FName("waistSocket");
        P.CosmeticSlot = EKhaaosCosmeticSlot::BODY;
        P.bAllowMultiple = true;
        P.MaxAttachments = 2;
        P.bVisibleInFirstPerson = true;
        P.bHideWithBody = true;
        RegisterPoint(P);
    }

    // ── Legs (knee pads) ──
    {
        FKhaaosAccessoryPoint P;
        P.PointName = FName("Legs");
        P.PointType = EKhaaosAccessoryPointType::Socket;
        P.ParentPoint = NAME_None;
        P.SocketName = FName("legSocket");
        P.CosmeticSlot = EKhaaosCosmeticSlot::LEGS;
        P.bAllowMultiple = true;
        P.MaxAttachments = 2;
        P.bVisibleInFirstPerson = true;
        P.bHideWithBody = true;
        RegisterPoint(P);
    }

    // ── Feet (boots) ──
    {
        FKhaaosAccessoryPoint P;
        P.PointName = FName("Feet");
        P.PointType = EKhaaosAccessoryPointType::Socket;
        P.ParentPoint = NAME_None;
        P.SocketName = FName("footSocket");
        P.CosmeticSlot = EKhaaosCosmeticSlot::LEGS;
        P.bAllowMultiple = false;
        P.MaxAttachments = 1;
        P.bVisibleInFirstPerson = true;
        P.bHideWithBody = true;
        RegisterPoint(P);
    }

    // ── Weapon_L (arma esquerda / melee skin) ──
    {
        FKhaaosAccessoryPoint P;
        P.PointName = FName("Weapon_L");
        P.PointType = EKhaaosAccessoryPointType::Socket;
        P.ParentPoint = NAME_None;
        P.SocketName = FName("weaponLSocket");
        P.CosmeticSlot = EKhaaosCosmeticSlot::MELEE;
        P.bAllowMultiple = false;
        P.MaxAttachments = 1;
        P.bVisibleInFirstPerson = true;
        P.bHideWithBody = false;
        RegisterPoint(P);
    }

    // ── Weapon_R (arma direita / melee skin) ──
    {
        FKhaaosAccessoryPoint P;
        P.PointName = FName("Weapon_R");
        P.PointType = EKhaaosAccessoryPointType::Socket;
        P.ParentPoint = NAME_None;
        P.SocketName = FName("weaponRSocket");
        P.CosmeticSlot = EKhaaosCosmeticSlot::MELEE;
        P.bAllowMultiple = false;
        P.MaxAttachments = 1;
        P.bVisibleInFirstPerson = true;
        P.bHideWithBody = false;
        RegisterPoint(P);
    }
}

void UKhaaosAccessoryPointManager::CollectDescendants(FName PointName, TArray<FName>& OutDescendants) const
{
    TArray<FName> Children = GetChildPoints(PointName);
    for (const FName& Child : Children)
    {
        OutDescendants.Add(Child);
        CollectDescendants(Child, OutDescendants);
    }
}

bool UKhaaosAccessoryPointManager::WouldCreateCycle(FName ParentName, FName ChildName) const
{
    // Caminhar de ParentName para cima — se chegarmos em ChildName, haveria ciclo
    FName Current = ParentName;
    while (Current != NAME_None)
    {
        if (Current == ChildName) return true;

        const FKhaaosAccessoryPoint* Point = RegisteredPoints.Find(Current);
        if (!Point) break;

        Current = Point->ParentPoint;
    }
    return false;
}
