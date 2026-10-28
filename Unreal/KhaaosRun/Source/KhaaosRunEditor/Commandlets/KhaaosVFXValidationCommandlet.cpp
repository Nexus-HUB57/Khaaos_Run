// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosVFXValidationCommandlet
// DATA DE EXECUÇÃO DA AUDITORIA: 2026-10-26
// ==============================================================================

#include "KhaaosVFXValidationCommandlet.h"
#include "Game/World/KhaaosVFXManager.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Misc/EngineVersion.h"
#include "GameFramework/Actor.h"
#include "HAL/PlatformProcess.h"
#include "Subsystems/SubsystemCollection.h"

UKhaaosVFXValidationCommandlet::UKhaaosVFXValidationCommandlet()
{
    IsServer = false;
    IsClient = false;
    IsEditor = true; // Permite o carregamento de ativos brutos Niagara no pipeline
    LogToConsole = true;
}

int32 UKhaaosVFXValidationCommandlet::Main(const FString& Params)
{
    UE_LOG(LogKhaaosVFXValidator, Display, TEXT("=== INICIANDO KHAAOS VFX VALIDATION COMMANDLET [UE %s] ==="), *GEngineVersion.ToString());

    // 1. Criação de um ambiente de World transiente para ancoragem física dos sistemas Niagara
    UWorld* TestWorld = UWorld::CreateWorld(EWorldType::EditorPreview, FWorldSpace::GetCanvasSpace());
    if (!TestWorld)
    {
        UE_LOG(LogKhaaosVFXValidator, Error, TEXT("Falha critica: Impossivel instanciar World virtual para teste de Shaders."));
        return 1; // Código de erro sistêmico
    }

    // 2. Criação de um Ator fantasma estático para servir de vetor de posição
    FActorSpawnParameters SpawnParams;
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    AActor* DummyAnchor = TestWorld->SpawnActor<AActor>(AActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);

    if (!DummyAnchor)
    {
        UE_LOG(LogKhaaosVFXValidator, Error, TEXT("Falha critica: Nao foi possivel instanciar o DummyAnchor Actor."));
        return 1;
    }

    // 3. Resgate do subsistema global do ciclo de vida da engine
    if (GEngine)
    {
        // Como estamos rodando em Commandlet (Engine-less GUI), pegamos o contexto do subsistema 
        // direto via Engine ou criamos a instância manualmente se isolado
        UGameInstance* GameInst = GEngine->GetGameInstance(TestWorld);
        UKhaaosVFXManager* VFXManager = nullptr;

        if (GameInst)
        {
            VFXManager = GameInst->GetSubsystem<UKhaaosVFXManager>();
        }

        if (!VFXManager)
        {
            // Fallback: criar instância standalone para o pipeline de CI/CD
            VFXManager = NewObject<UKhaaosVFXManager>(GetTransientPackage());
            FSubsystemCollectionBase DummyCollection(USubsystem::StaticClass());
            VFXManager->Initialize(DummyCollection);
        }

        // 4. Execução síncrona/bloqueante do teste sequencial
        VFXManager->StartSequentialVFXTest(DummyAnchor);

        // Simulador de Ticks em loop controlado para processar a fila sem congelar 
        // a thread de I/O do terminal Linux
        float TotalElapsedTime = 0.0f;
        const float SimTickInterval = 0.1f;
        const float TimeoutLimit = 180.0f; // 3 minutos de teto limite para travar vazamentos de memória (Hang-guard)

        while (TotalElapsedTime < TimeoutLimit)
        {
            TestWorld->Tick(ELevelTick::LEVELTICK_All, SimTickInterval);
            FPlatformProcess::Sleep(SimTickInterval);
            TotalElapsedTime += SimTickInterval;

            // Se o gerenciador não está mais testando, a fila chegou ao fim naturalmente
            if (!VFXManager->IsTesting())
            {
                UE_LOG(LogKhaaosVFXValidator, Display, TEXT("Fila de validação encerrada naturalmente após %.1f segundos."), TotalElapsedTime);
                break;
            }
        }

        if (TotalElapsedTime >= TimeoutLimit)
        {
            UE_LOG(LogKhaaosVFXValidator, Error, TEXT("TIMEOUT: Validação excedeu o limite de %.0f segundos. Possível hang ou vazamento."), TimeoutLimit);
            VFXManager->StopValidationTest();
            return 2; // Código de timeout
        }

        UE_LOG(LogKhaaosVFXValidator, Display, TEXT("=== EXECUÇÃO HEADLESS FINALIZADA VIA TERMINAL LINUX ==="));
        UE_LOG(LogKhaaosVFXValidator, Display, TEXT("Resultado: %d/%d testes processados com sucesso."), 
            VFXManager->GetCurrentTestIndex(), VFXManager->GetTotalTestCount());
    }
    else
    {
        UE_LOG(LogKhaaosVFXValidator, Error, TEXT("Falha critica: GEngine nulo. Impossível executar Commandlet sem Engine."));
        return 1;
    }

    return 0; // PASS operacional enviado com sucesso ao pipeline de CI/CD
}
