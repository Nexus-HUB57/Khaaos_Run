// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Subsistema: UKhaaosSpeciesMeshRegistry
// Propósito: Registro central de skeletal meshes por espécie com LOD,
//            async loading via FStreamableManager, e caching de estado.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Engine/StreamableManager.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosSpeciesMeshRegistry.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class USkeletalMesh;
class UAnimBlueprint;
class UPhysicsAsset;

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast quando todas as meshes de uma espécie terminam de carregar. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSpeciesMeshesLoaded, EKhaaosSpecies, Species);

// ─── Structs ──────────────────────────────────────────────────────────────────

/**
 * FKhaaosSpeciesMeshSet
 * Conjunto completo de skeletal meshes, AnimBP e PhysicsAsset para uma espécie.
 * Inclui 4 níveis de LOD (LOD0 = alta resolução, LOD3 = muito baixa).
 *
 * Especificações por espécie:
 *   Huran:  85 bones, sem cauda/asas, membranas aquáticas (blend shapes)
 *   Khael:  92 bones, sem cauda/asas, cristais flutuantes (3 bones extra)
 *   Venex:  88 bones, sem cauda/asas, implantes cybernéticos
 *   Onith: 110 bones, cauda (6 bones), sem asas, carapace quitinosa
 *   Zheers: 78 bones, sem cauda/asas, orelhas grandes
 *   Skeetw: 120 bones, sem cauda, asas (4 bones), sistema de penas
 */
USTRUCT(BlueprintType)
struct FKhaaosSpeciesMeshSet
{
    GENERATED_BODY()

    /** Espécie que este mesh set representa */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|Species")
    EKhaaosSpecies Species = EKhaaosSpecies::NONE;

    // ─── LOD Skeletal Meshes ──────────────────────────────────────────────

    /** LOD0 — Alta resolução (até 10m do jogador) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|LOD")
    TSoftObjectPtr<USkeletalMesh> SkeletalMeshLOD0;

    /** LOD1 — Resolução média (10-25m) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|LOD")
    TSoftObjectPtr<USkeletalMesh> SkeletalMeshLOD1;

    /** LOD2 — Baixa resolução (25-50m) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|LOD")
    TSoftObjectPtr<USkeletalMesh> SkeletalMeshLOD2;

    /** LOD3 — Muito baixa resolução (50m+) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|LOD")
    TSoftObjectPtr<USkeletalMesh> SkeletalMeshLOD3;

    // ─── Animation & Physics ──────────────────────────────────────────────

    /** Animation Blueprint específico da espécie */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|Anim")
    TSoftObjectPtr<UAnimBlueprint> AnimBP;

    /** Physics Asset para simulação de corpo */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|Physics")
    TSoftObjectPtr<UPhysicsAsset> PhysicsAsset;

    // ─── Bone Metadata ────────────────────────────────────────────────────

    /** Contagem base de bones no skeleton */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|Bones")
    int32 BaseBoneCount = 0;

    /** Se a espécie possui cauda (Onith) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|Bones")
    bool bHasTail = false;

    /** Se a espécie possui asas (Skeetw) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|Bones")
    bool bHasWings = false;

    /** Se a espécie possui partes flutuantes (Khael cristais) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Mesh|Bones")
    bool bHasFloatingParts = false;
};

// ─── Subsystem ────────────────────────────────────────────────────────────────

/**
 * UKhaaosSpeciesMeshRegistry
 *
 * Registro central (GameInstanceSubsystem) para skeletal meshes de espécie.
 * Gerencia:
 *   - Registro de FKhaaosSpeciesMeshSet por espécie
 *   - Resolução de LOD baseada em distância
 *   - Async loading via FStreamableManager
 *   - Caching de estado de carregamento
 *   - Notificação via delegate quando loading completa
 */
UCLASS(ClassGroup = (Khaaos, Character), meta = (DisplayName = "KhaaosSpeciesMeshRegistry"))
class KHAAOSRUN_API UKhaaosSpeciesMeshRegistry : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    UKhaaosSpeciesMeshRegistry();

    // ─── Subsystem Lifecycle ──────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ─── Registration ─────────────────────────────────────────────────────

    /**
     * Registra um mesh set completo para uma espécie.
     * Sobrescreve registro existente se já presente.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Mesh|Registry")
    void RegisterSpeciesMeshSet(const FKhaaosSpeciesMeshSet& MeshSet);

    /**
     * Registra todos os mesh sets padrão das 6 espécies.
     * Chamado automaticamente em Initialize().
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Mesh|Registry")
    void RegisterDefaultSpeciesMeshSets();

    // ─── Query ────────────────────────────────────────────────────────────

    /**
     * Retorna o mesh set para uma espécie.
     * Retorna mesh set vazio (Species=NONE) se não registrado.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Mesh|Registry")
    FKhaaosSpeciesMeshSet GetMeshSet(EKhaaosSpecies Species) const;

    /**
     * Retorna o skeletal mesh para um nível de LOD específico.
     * @param Species   Espécie alvo
     * @param LODLevel  Nível de LOD (0-3)
     * @return Soft pointer ao skeletal mesh (pode não estar carregado)
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Mesh|Registry")
    TSoftObjectPtr<USkeletalMesh> GetSkeletalMeshForLOD(EKhaaosSpecies Species, int32 LODLevel) const;

    /**
     * Retorna o animation blueprint para uma espécie.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Mesh|Registry")
    TSoftObjectPtr<UAnimBlueprint> GetAnimBPForSpecies(EKhaaosSpecies Species) const;

    /**
     * Verifica se uma espécie está registrada no registry.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Mesh|Registry")
    bool IsSpeciesRegistered(EKhaaosSpecies Species) const;

    // ─── Async Loading ────────────────────────────────────────────────────

    /**
     * Inicia carregamento assíncrono de todas as meshes de uma espécie.
     * Dispara OnSpeciesMeshesLoaded quando completo.
     * @param Species  Espécie para carregar
     * @param Priority Prioridade de loading (default = standard)
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Mesh|Registry")
    void AsyncLoadSpeciesMeshes(EKhaaosSpecies Species, TAsyncLoadPriority Priority = FStreamableManager::DefaultAsyncLoadPriority);

    /**
     * Verifica se todas as meshes de uma espécie estão carregadas em memória.
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Mesh|Registry")
    bool IsSpeciesLoaded(EKhaaosSpecies Species) const;

    /**
     * Força carregamento síncrono de todas as meshes de uma espécie.
     * Use com cautela — bloqueia o game thread.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Mesh|Registry")
    void ForceLoadSpeciesMeshes(EKhaaosSpecies Species);

    // ─── Delegate ─────────────────────────────────────────────────────────

    /** Disparado quando todas as meshes de uma espécie terminam carregamento async */
    UPROPERTY(BlueprintAssignable, Category = "Khaaos|Mesh|Registry")
    FOnSpeciesMeshesLoaded OnSpeciesMeshesLoaded;

private:

    // ─── Internal State ───────────────────────────────────────────────────

    /** Registro de mesh sets por espécie */
    UPROPERTY()
    TMap<EKhaaosSpecies, FKhaaosSpeciesMeshSet> Registry;

    /** Estado de carregamento por espécie (true = todas as meshes loaded) */
    UPROPERTY()
    TMap<EKhaaosSpecies, bool> LoadStatus;

    /** Streamable manager para async loading */
    FStreamableManager StreamableManager;

    /** Handles de async loading ativos por espécie */
    TMap<EKhaaosSpecies, TArray<TSharedRef<FStreamableHandle>>> ActiveLoadHandles;

    // ─── Helpers ──────────────────────────────────────────────────────────

    /** Constrói o mesh set padrão para o Huran (85 bones, aquatic) */
    FKhaaosSpeciesMeshSet BuildHuranMeshSet() const;

    /** Constrói o mesh set padrão para o Khael (92 bones, arcane) */
    FKhaaosSpeciesMeshSet BuildKhaelMeshSet() const;

    /** Constrói o mesh set padrão para o Venex (88 bones, tech) */
    FKhaaosSpeciesMeshSet BuildVenexMeshSet() const;

    /** Constrói o mesh set padrão para o Onith (110 bones, brute) */
    FKhaaosSpeciesMeshSet BuildOnithMeshSet() const;

    /** Constrói o mesh set padrão para o Zheers (78 bones, tribal) */
    FKhaaosSpeciesMeshSet BuildZheersMeshSet() const;

    /** Constrói o mesh set padrão para o Skeetw (120 bones, avian) */
    FKhaaosSpeciesMeshSet BuildSkeetwMeshSet() const;

    /** Callback quando async loading completa para uma espécie */
    void OnAsyncLoadComplete(EKhaaosSpecies Species);

    /** Coleta todos os soft object paths de um mesh set para loading */
    TArray<FSoftObjectPath> CollectMeshSetPaths(const FKhaaosSpeciesMeshSet& MeshSet) const;
};
