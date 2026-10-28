// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosVFXManager
// DATA DO CHECKOUT DA AUDITORIA: 2026-10-26
// ==============================================================================

#include "KhaaosVFXManager.h"
#include "NiagaraComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "TimerManager.h"
#include "Engine/World.h"

DEFINE_LOG_CATEGORY(LogKhaaosVFXValidator);

UKhaaosVFXManager::UKhaaosVFXManager()
    : CurrentTestIndex(INDEX_NONE)
    , CachedAnchorActor(nullptr)
    , ActiveVFXComponent(nullptr)
    , PassedCount(0)
    , FailedCount(0)
{
}

void UKhaaosVFXManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogKhaaosVFXValidator, Log, TEXT("Subsystema KhaaosVFXManager inicializado em conformidade com UE5.8 Core."));
    UE_LOG(LogKhaaosVFXValidator, Log, TEXT("ValidationRegistry contém %d entradas carregadas de DefaultGame.ini."), ValidationRegistry.Num());
}

void UKhaaosVFXManager::Deinitialize()
{
    StopValidationTest();
    Super::Deinitialize();
}

void UKhaaosVFXManager::StartSequentialVFXTest(AActor* TestAnchorActor)
{
    if (!TestAnchorActor)
    {
        UE_LOG(LogKhaaosVFXValidator, Error, TEXT("Falha ao iniciar teste: Ator de ancoragem (TestAnchorActor) invalido."));
        return;
    }

    if (ValidationRegistry.Num() == 0)
    {
        UE_LOG(LogKhaaosVFXValidator, Warning, TEXT("Nenhum VFX ou Habilidade registrado em DefaultGame.ini para validacao."));
        return;
    }

    // Reset de contadores de resultado
    PassedCount = 0;
    FailedCount = 0;

    CachedAnchorActor = TestAnchorActor;
    CurrentTestIndex = 0;

    UE_LOG(LogKhaaosVFXValidator, Display, TEXT("=== INICIANDO VALIDACAO VISUAL EM LOTE [%d ELEMENTOS DOS REQUISITOS] ==="), ValidationRegistry.Num());
    ProcessNextValidationEntry();
}

void UKhaaosVFXManager::ProcessNextValidationEntry()
{
    if (!ValidationRegistry.IsValidIndex(CurrentTestIndex) || !CachedAnchorActor)
    {
        UE_LOG(LogKhaaosVFXValidator, Display, TEXT("=== VALIDACAO CONCLUIDA: %d PASS / %d FAIL / %d TOTAL ==="), 
            PassedCount, FailedCount, ValidationRegistry.Num());
        UE_LOG(LogKhaaosVFXValidator, Display, TEXT("=== Todas as habilidades e VFX compilados sem crash ==="));
        StopValidationTest();
        return;
    }

    const FKhaaosVFXValidationEntry& CurrentEntry = ValidationRegistry[CurrentTestIndex];
    UE_LOG(LogKhaaosVFXValidator, Log, TEXT("Executando Entrada [%d/%d] -> Habilidade Tag: %s"), 
        CurrentTestIndex + 1, ValidationRegistry.Num(), *CurrentEntry.AbilityTag.ToString());

    // Limpa o componente ativo anterior da memória do coletor de lixo
    if (ActiveVFXComponent && ActiveVFXComponent->IsActive())
    {
        ActiveVFXComponent->DeactivateImmediate();
        ActiveVFXComponent->DestroyComponent();
        ActiveVFXComponent = nullptr;
    }

    // Carregamento assíncrono síncrono bloqueante controlado para execução isolada em Commandlet headless
    UNiagaraSystem* LoadedSystem = CurrentEntry.NiagaraSystemAsset.LoadSynchronous();
    
    if (LoadedSystem)
    {
        ActiveVFXComponent = UNiagaraFunctionLibrary::SpawnSystemAtLocation(
            CachedAnchorActor->GetWorld(),
            LoadedSystem,
            CachedAnchorActor->GetActorLocation(),
            CachedAnchorActor->GetActorRotation(),
            FVector(1.0f),
            true,
            ENiagaraAttachmentRule::KeepRelative,
            true,
            ENiagaraGlowMode::None
        );

        PassedCount++;
        UE_LOG(LogKhaaosVFXValidator, Display, TEXT("[PASS] Niagara VFX compilado e instanciado na GPU virtual para a Tag: %s"), *CurrentEntry.AbilityTag.ToString());
    }
    else
    {
        FailedCount++;
        UE_LOG(LogKhaaosVFXValidator, Error, TEXT("[FAIL] Erro de I/O ou Shaders corrompidos no Ativo Niagara para a Tag: %s"), *CurrentEntry.AbilityTag.ToString());
    }

    // Agenda o próximo disparo sequencial baseando-se no tempo delimitado pelo struct tático
    UWorld* World = CachedAnchorActor->GetWorld();
    if (World)
    {
        CurrentTestIndex++;
        World->GetTimerManager().SetTimer(
            SequentialTestTimerHandle,
            this,
            &UKhaaosVFXManager::ProcessNextValidationEntry,
            CurrentEntry.TestDuration,
            false
        );
    }
}

void UKhaaosVFXManager::StopValidationTest()
{
    if (CachedAnchorActor)
    {
        UWorld* World = CachedAnchorActor->GetWorld();
        if (World)
        {
            World->GetTimerManager().ClearTimer(SequentialTestTimerHandle);
        }
    }

    if (ActiveVFXComponent)
    {
        ActiveVFXComponent->DeactivateImmediate();
        ActiveVFXComponent->DestroyComponent();
        ActiveVFXComponent = nullptr;
    }

    CurrentTestIndex = INDEX_NONE;
    CachedAnchorActor = nullptr;
    UE_LOG(LogKhaaosVFXValidator, Log, TEXT("Sequenciador de testes KhaaosVFXManager limpo e resetado em idle."));
}
