// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Implementação: UKhaaosSpeciesMeshRegistry
// Registro central de skeletal meshes por espécie com async loading.

#include "Game/Character/KhaaosSpeciesMeshRegistry.h"
#include "KhaaosRun.h"
#include "Engine/StreamableManager.h"
#include "Engine/SkeletalMesh.h"
#include "Animation/AnimBlueprint.h"
#include "PhysicsEngine/PhysicsAsset.h"

// ─── Constructor ───────────────────────────────────────────────────────────────

UKhaaosSpeciesMeshRegistry::UKhaaosSpeciesMeshRegistry()
{
}

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosSpeciesMeshRegistry::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Registra todos os mesh sets padrão na inicialização do GameInstance
    RegisterDefaultSpeciesMeshSets();

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesMeshRegistry: Inicializado com %d espécies registradas"), Registry.Num());
}

void UKhaaosSpeciesMeshRegistry::Deinitialize()
{
    // Cancela todos os async loads pendentes
    for (auto& Pair : ActiveLoadHandles)
    {
        for (auto& Handle : Pair.Value)
        {
            if (Handle->IsActive())
            {
                Handle->CancelHandle();
            }
        }
    }
    ActiveLoadHandles.Empty();

    Registry.Empty();
    LoadStatus.Empty();

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesMeshRegistry: Desinicializado"));
    Super::Deinitialize();
}

// ─── Registration ─────────────────────────────────────────────────────────────

void UKhaaosSpeciesMeshRegistry::RegisterSpeciesMeshSet(const FKhaaosSpeciesMeshSet& MeshSet)
{
    if (MeshSet.Species == EKhaaosSpecies::NONE)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesMeshRegistry: Tentativa de registrar mesh set para espécie NONE — ignorado"));
        return;
    }

    const bool bAlreadyRegistered = Registry.Contains(MeshSet.Species);
    Registry.Add(MeshSet.Species, MeshSet);

    // Inicializa status de carregamento como false
    LoadStatus.Add(MeshSet.Species, false);

    if (bAlreadyRegistered)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesMeshRegistry: Mesh set atualizado para espécie %s"),
            *UEnum::GetDisplayValueAsText(MeshSet.Species).ToString());
    }
    else
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesMeshRegistry: Mesh set registrado para espécie %s (Bones: %d, Cauda: %s, Asas: %s, Flutuantes: %s)"),
            *UEnum::GetDisplayValueAsText(MeshSet.Species).ToString(),
            MeshSet.BaseBoneCount,
            MeshSet.bHasTail ? TEXT("Sim") : TEXT("Não"),
            MeshSet.bHasWings ? TEXT("Sim") : TEXT("Não"),
            MeshSet.bHasFloatingParts ? TEXT("Sim") : TEXT("Não"));
    }
}

void UKhaaosSpeciesMeshRegistry::RegisterDefaultSpeciesMeshSets()
{
    // Registra as 6 espécies com paths padrão e metadata de bones
    RegisterSpeciesMeshSet(BuildHuranMeshSet());
    RegisterSpeciesMeshSet(BuildKhaelMeshSet());
    RegisterSpeciesMeshSet(BuildVenexMeshSet());
    RegisterSpeciesMeshSet(BuildOnithMeshSet());
    RegisterSpeciesMeshSet(BuildZheersMeshSet());
    RegisterSpeciesMeshSet(BuildSkeetwMeshSet());

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesMeshRegistry: 6 mesh sets padrão registrados"));
}

// ─── Query ────────────────────────────────────────────────────────────────────

FKhaaosSpeciesMeshSet UKhaaosSpeciesMeshRegistry::GetMeshSet(EKhaaosSpecies Species) const
{
    if (const FKhaaosSpeciesMeshSet* Found = Registry.Find(Species))
    {
        return *Found;
    }

    UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesMeshRegistry: Mesh set não encontrado para espécie %s"),
        *UEnum::GetDisplayValueAsText(Species).ToString());

    // Retorna struct vazio com Species = NONE
    return FKhaaosSpeciesMeshSet();
}

TSoftObjectPtr<USkeletalMesh> UKhaaosSpeciesMeshRegistry::GetSkeletalMeshForLOD(EKhaaosSpecies Species, int32 LODLevel) const
{
    const FKhaaosSpeciesMeshSet MeshSet = GetMeshSet(Species);
    if (MeshSet.Species == EKhaaosSpecies::NONE)
    {
        return nullptr;
    }

    // Clamp LOD level ao range válido [0-3]
    const int32 ClampedLOD = FMath::Clamp(LODLevel, 0, 3);

    switch (ClampedLOD)
    {
        case 0:  return MeshSet.SkeletalMeshLOD0;
        case 1:  return MeshSet.SkeletalMeshLOD1;
        case 2:  return MeshSet.SkeletalMeshLOD2;
        case 3:  return MeshSet.SkeletalMeshLOD3;
        default: return MeshSet.SkeletalMeshLOD0;
    }
}

TSoftObjectPtr<UAnimBlueprint> UKhaaosSpeciesMeshRegistry::GetAnimBPForSpecies(EKhaaosSpecies Species) const
{
    const FKhaaosSpeciesMeshSet MeshSet = GetMeshSet(Species);
    if (MeshSet.Species == EKhaaosSpecies::NONE)
    {
        return nullptr;
    }
    return MeshSet.AnimBP;
}

bool UKhaaosSpeciesMeshRegistry::IsSpeciesRegistered(EKhaaosSpecies Species) const
{
    return Registry.Contains(Species);
}

// ─── Async Loading ────────────────────────────────────────────────────────────

void UKhaaosSpeciesMeshRegistry::AsyncLoadSpeciesMeshes(EKhaaosSpecies Species, TAsyncLoadPriority Priority)
{
    if (Species == EKhaaosSpecies::NONE)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesMeshRegistry: AsyncLoad para espécie NONE — ignorado"));
        return;
    }

    // Se já carregado, dispara callback imediatamente
    if (IsSpeciesLoaded(Species))
    {
        OnSpeciesMeshesLoaded.Broadcast(Species);
        return;
    }

    const FKhaaosSpeciesMeshSet MeshSet = GetMeshSet(Species);
    if (MeshSet.Species == EKhaaosSpecies::NONE)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesMeshRegistry: Espécie %s não registrada — async load abortado"),
            *UEnum::GetDisplayValueAsText(Species).ToString());
        return;
    }

    // Coleta todos os soft object paths para loading
    TArray<FSoftObjectPath> PathsToLoad = CollectMeshSetPaths(MeshSet);
    if (PathsToLoad.Num() == 0)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesMeshRegistry: Nenhum path para carregar para espécie %s"),
            *UEnum::GetDisplayValueAsText(Species).ToString());
        LoadStatus.Add(Species, true);
        OnSpeciesMeshesLoaded.Broadcast(Species);
        return;
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesMeshRegistry: Iniciando async load de %d assets para espécie %s"),
        PathsToLoad.Num(), *UEnum::GetDisplayValueAsText(Species).ToString());

    // Cancela handles existentes para esta espécie
    if (ActiveLoadHandles.Contains(Species))
    {
        for (auto& Handle : ActiveLoadHandles[Species])
        {
            if (Handle->IsActive())
            {
                Handle->CancelHandle();
            }
        }
        ActiveLoadHandles.Remove(Species);
    }

    // Request async loading com callback
    TArray<TSharedRef<FStreamableHandle>> NewHandles;
    FStreamableDelegate OnAllLoaded = FStreamableDelegate::CreateUObject(this, &UKhaaosSpeciesMeshRegistry::OnAsyncLoadComplete, Species);

    TSharedRef<FStreamableHandle> Handle = StreamableManager.RequestAsyncLoad(
        PathsToLoad,
        OnAllLoaded,
        Priority,
        false // bManageActiveHandle
    );

    NewHandles.Add(Handle);
    ActiveLoadHandles.Add(Species, MoveTemp(NewHandles));

    // Marca como não carregado enquanto o load está em progresso
    LoadStatus.Add(Species, false);
}

bool UKhaaosSpeciesMeshRegistry::IsSpeciesLoaded(EKhaaosSpecies Species) const
{
    if (const bool* IsLoaded = LoadStatus.Find(Species))
    {
        return *IsLoaded;
    }
    return false;
}

void UKhaaosSpeciesMeshRegistry::ForceLoadSpeciesMeshes(EKhaaosSpecies Species)
{
    if (Species == EKhaaosSpecies::NONE)
    {
        return;
    }

    const FKhaaosSpeciesMeshSet MeshSet = GetMeshSet(Species);
    if (MeshSet.Species == EKhaaosSpecies::NONE)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesMeshRegistry: Espécie %s não registrada — force load abortado"),
            *UEnum::GetDisplayValueAsText(Species).ToString());
        return;
    }

    TArray<FSoftObjectPath> PathsToLoad = CollectMeshSetPaths(MeshSet);
    StreamableManager.RequestSyncLoad(PathsToLoad, true);

    LoadStatus.Add(Species, true);
    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesMeshRegistry: Force load completo para espécie %s"),
        *UEnum::GetDisplayValueAsText(Species).ToString());

    OnSpeciesMeshesLoaded.Broadcast(Species);
}

// ─── Async Load Callback ─────────────────────────────────────────────────────

void UKhaaosSpeciesMeshRegistry::OnAsyncLoadComplete(EKhaaosSpecies Species)
{
    // Verifica se todos os assets realmente carregaram
    const FKhaaosSpeciesMeshSet MeshSet = GetMeshSet(Species);
    bool bAllLoaded = true;

    if (MeshSet.SkeletalMeshLOD0.IsValid() && !MeshSet.SkeletalMeshLOD0.IsLoaded()) bAllLoaded = false;
    if (MeshSet.SkeletalMeshLOD1.IsValid() && !MeshSet.SkeletalMeshLOD1.IsLoaded()) bAllLoaded = false;
    if (MeshSet.SkeletalMeshLOD2.IsValid() && !MeshSet.SkeletalMeshLOD2.IsLoaded()) bAllLoaded = false;
    if (MeshSet.SkeletalMeshLOD3.IsValid() && !MeshSet.SkeletalMeshLOD3.IsLoaded()) bAllLoaded = false;
    if (MeshSet.AnimBP.IsValid() && !MeshSet.AnimBP.IsLoaded()) bAllLoaded = false;
    if (MeshSet.PhysicsAsset.IsValid() && !MeshSet.PhysicsAsset.IsLoaded()) bAllLoaded = false;

    LoadStatus.Add(Species, bAllLoaded);

    // Limpa handles completados
    ActiveLoadHandles.Remove(Species);

    if (bAllLoaded)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesMeshRegistry: Async load completo para espécie %s"),
            *UEnum::GetDisplayValueAsText(Species).ToString());
    }
    else
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesMeshRegistry: Async load parcialmente falhou para espécie %s"),
            *UEnum::GetDisplayValueAsText(Species).ToString());
    }

    OnSpeciesMeshesLoaded.Broadcast(Species);
}

// ─── Path Collection Helper ───────────────────────────────────────────────────

TArray<FSoftObjectPath> UKhaaosSpeciesMeshRegistry::CollectMeshSetPaths(const FKhaaosSpeciesMeshSet& MeshSet) const
{
    TArray<FSoftObjectPath> Paths;

    if (MeshSet.SkeletalMeshLOD0.IsValid()) Paths.Add(MeshSet.SkeletalMeshLOD0.ToSoftObjectPath());
    if (MeshSet.SkeletalMeshLOD1.IsValid()) Paths.Add(MeshSet.SkeletalMeshLOD1.ToSoftObjectPath());
    if (MeshSet.SkeletalMeshLOD2.IsValid()) Paths.Add(MeshSet.SkeletalMeshLOD2.ToSoftObjectPath());
    if (MeshSet.SkeletalMeshLOD3.IsValid()) Paths.Add(MeshSet.SkeletalMeshLOD3.ToSoftObjectPath());
    if (MeshSet.AnimBP.IsValid()) Paths.Add(MeshSet.AnimBP.ToSoftObjectPath());
    if (MeshSet.PhysicsAsset.IsValid()) Paths.Add(MeshSet.PhysicsAsset.ToSoftObjectPath());

    return Paths;
}

// ─── Species Mesh Set Builders ────────────────────────────────────────────────
// Cada builder configura paths padrão de assets e metadata de bones.

FKhaaosSpeciesMeshSet UKhaaosSpeciesMeshRegistry::BuildHuranMeshSet() const
{
    FKhaaosSpeciesMeshSet Set;
    Set.Species = EKhaaosSpecies::HURAN;
    Set.SkeletalMeshLOD0 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Huran/Mesh/SK_Huran_LOD0.SK_Huran_LOD0")));
    Set.SkeletalMeshLOD1 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Huran/Mesh/SK_Huran_LOD1.SK_Huran_LOD1")));
    Set.SkeletalMeshLOD2 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Huran/Mesh/SK_Huran_LOD2.SK_Huran_LOD2")));
    Set.SkeletalMeshLOD3 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Huran/Mesh/SK_Huran_LOD3.SK_Huran_LOD3")));
    Set.AnimBP = TSoftObjectPtr<UAnimBlueprint>(FSoftObjectPath(TEXT("/Game/Characters/Huran/Anim/ABP_Huran_Aquatic.ABP_Huran_Aquatic")));
    Set.PhysicsAsset = TSoftObjectPtr<UPhysicsAsset>(FSoftObjectPath(TEXT("/Game/Characters/Huran/Physics/PA_Huran.PA_Huran")));
    Set.BaseBoneCount = 85;
    Set.bHasTail = false;
    Set.bHasWings = false;
    Set.bHasFloatingParts = false; // Membranas são blend shapes, não bones flutuantes
    return Set;
}

FKhaaosSpeciesMeshSet UKhaaosSpeciesMeshRegistry::BuildKhaelMeshSet() const
{
    FKhaaosSpeciesMeshSet Set;
    Set.Species = EKhaaosSpecies::KHAEL;
    Set.SkeletalMeshLOD0 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Khael/Mesh/SK_Khael_LOD0.SK_Khael_LOD0")));
    Set.SkeletalMeshLOD1 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Khael/Mesh/SK_Khael_LOD1.SK_Khael_LOD1")));
    Set.SkeletalMeshLOD2 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Khael/Mesh/SK_Khael_LOD2.SK_Khael_LOD2")));
    Set.SkeletalMeshLOD3 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Khael/Mesh/SK_Khael_LOD3.SK_Khael_LOD3")));
    Set.AnimBP = TSoftObjectPtr<UAnimBlueprint>(FSoftObjectPath(TEXT("/Game/Characters/Khael/Anim/ABP_Khael_Arcane.ABP_Khael_Arcane")));
    Set.PhysicsAsset = TSoftObjectPtr<UPhysicsAsset>(FSoftObjectPath(TEXT("/Game/Characters/Khael/Physics/PA_Khael.PA_Khael")));
    Set.BaseBoneCount = 92;
    Set.bHasTail = false;
    Set.bHasWings = false;
    Set.bHasFloatingParts = true; // 3 cristais flutuantes (bones extras)
    return Set;
}

FKhaaosSpeciesMeshSet UKhaaosSpeciesMeshRegistry::BuildVenexMeshSet() const
{
    FKhaaosSpeciesMeshSet Set;
    Set.Species = EKhaaosSpecies::VENEX;
    Set.SkeletalMeshLOD0 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Venex/Mesh/SK_Venex_LOD0.SK_Venex_LOD0")));
    Set.SkeletalMeshLOD1 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Venex/Mesh/SK_Venex_LOD1.SK_Venex_LOD1")));
    Set.SkeletalMeshLOD2 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Venex/Mesh/SK_Venex_LOD2.SK_Venex_LOD2")));
    Set.SkeletalMeshLOD3 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Venex/Mesh/SK_Venex_LOD3.SK_Venex_LOD3")));
    Set.AnimBP = TSoftObjectPtr<UAnimBlueprint>(FSoftObjectPath(TEXT("/Game/Characters/Venex/Anim/ABP_Venex_Tech.ABP_Venex_Tech")));
    Set.PhysicsAsset = TSoftObjectPtr<UPhysicsAsset>(FSoftObjectPath(TEXT("/Game/Characters/Venex/Physics/PA_Venex.PA_Venex")));
    Set.BaseBoneCount = 88;
    Set.bHasTail = false;
    Set.bHasWings = false;
    Set.bHasFloatingParts = false; // Cyber implantes são attach points, não bones flutuantes
    return Set;
}

FKhaaosSpeciesMeshSet UKhaaosSpeciesMeshRegistry::BuildOnithMeshSet() const
{
    FKhaaosSpeciesMeshSet Set;
    Set.Species = EKhaaosSpecies::ONITH;
    Set.SkeletalMeshLOD0 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Onith/Mesh/SK_Onith_LOD0.SK_Onith_LOD0")));
    Set.SkeletalMeshLOD1 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Onith/Mesh/SK_Onith_LOD1.SK_Onith_LOD1")));
    Set.SkeletalMeshLOD2 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Onith/Mesh/SK_Onith_LOD2.SK_Onith_LOD2")));
    Set.SkeletalMeshLOD3 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Onith/Mesh/SK_Onith_LOD3.SK_Onith_LOD3")));
    Set.AnimBP = TSoftObjectPtr<UAnimBlueprint>(FSoftObjectPath(TEXT("/Game/Characters/Onith/Anim/ABP_Onith_Brute.ABP_Onith_Brute")));
    Set.PhysicsAsset = TSoftObjectPtr<UPhysicsAsset>(FSoftObjectPath(TEXT("/Game/Characters/Onith/Physics/PA_Onith.PA_Onith")));
    Set.BaseBoneCount = 110;
    Set.bHasTail = true;  // Cauda réptil com 6 bones
    Set.bHasWings = false;
    Set.bHasFloatingParts = false;
    return Set;
}

FKhaaosSpeciesMeshSet UKhaaosSpeciesMeshRegistry::BuildZheersMeshSet() const
{
    FKhaaosSpeciesMeshSet Set;
    Set.Species = EKhaaosSpecies::ZHEERS;
    Set.SkeletalMeshLOD0 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Zheers/Mesh/SK_Zheers_LOD0.SK_Zheers_LOD0")));
    Set.SkeletalMeshLOD1 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Zheers/Mesh/SK_Zheers_LOD1.SK_Zheers_LOD1")));
    Set.SkeletalMeshLOD2 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Zheers/Mesh/SK_Zheers_LOD2.SK_Zheers_LOD2")));
    Set.SkeletalMeshLOD3 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Zheers/Mesh/SK_Zheers_LOD3.SK_Zheers_LOD3")));
    Set.AnimBP = TSoftObjectPtr<UAnimBlueprint>(FSoftObjectPath(TEXT("/Game/Characters/Zheers/Anim/ABP_Zheers_Tribal.ABP_Zheers_Tribal")));
    Set.PhysicsAsset = TSoftObjectPtr<UPhysicsAsset>(FSoftObjectPath(TEXT("/Game/Characters/Zheers/Physics/PA_Zheers.PA_Zheers")));
    Set.BaseBoneCount = 78;
    Set.bHasTail = false;
    Set.bHasWings = false;
    Set.bHasFloatingParts = false; // Orelhas grandes usam EarBounce physics, não floating bones
    return Set;
}

FKhaaosSpeciesMeshSet UKhaaosSpeciesMeshRegistry::BuildSkeetwMeshSet() const
{
    FKhaaosSpeciesMeshSet Set;
    Set.Species = EKhaaosSpecies::SKEETW;
    Set.SkeletalMeshLOD0 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Skeetw/Mesh/SK_Skeetw_LOD0.SK_Skeetw_LOD0")));
    Set.SkeletalMeshLOD1 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Skeetw/Mesh/SK_Skeetw_LOD1.SK_Skeetw_LOD1")));
    Set.SkeletalMeshLOD2 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Skeetw/Mesh/SK_Skeetw_LOD2.SK_Skeetw_LOD2")));
    Set.SkeletalMeshLOD3 = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Skeetw/Mesh/SK_Skeetw_LOD3.SK_Skeetw_LOD3")));
    Set.AnimBP = TSoftObjectPtr<UAnimBlueprint>(FSoftObjectPath(TEXT("/Game/Characters/Skeetw/Anim/ABP_Skeetw_Avian.ABP_Skeetw_Avian")));
    Set.PhysicsAsset = TSoftObjectPtr<UPhysicsAsset>(FSoftObjectPath(TEXT("/Game/Characters/Skeetw/Physics/PA_Skeetw.PA_Skeetw")));
    Set.BaseBoneCount = 120;
    Set.bHasTail = false;
    Set.bHasWings = true;  // Asas com 4 bones
    Set.bHasFloatingParts = false; // Penas são Niagara system, não bones flutuantes
    return Set;
}
