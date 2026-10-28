// ==============================================================================
// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// SUBSISTEMA: UKhaaosPerformanceBudget
// PROPÓSITO: Rastreamento de tempo de frame, escalação adaptativa de qualidade
//            e gerenciamento de budget mobile para Battle Royale de 6 espécies
//            alienígenas. Visa consistência de 30fps mobile / 60fps desktop
//            no estilo Free Fire.
// ==============================================================================

#include "Game/Graphics/KhaaosPerformanceBudget.h"
#include "HAL/PlatformTime.h"

// ─── Log Category ──────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosRun, Log, All);

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

void UKhaaosPerformanceBudget::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Inicializa o histórico circular com snapshots vazios
    FrameHistory.SetNum(HISTORY_SIZE);
    HistoryIndex = 0;

    // Detecta plataforma e configura o budget padrão
    // Por padrão iniciamos como DESKTOP_MID — o jogo deve chamar
    // SetPlatformTarget() durante a inicialização conforme o device
    SetPlatformTarget(EKhaaosPlatformTarget::DESKTOP_MID);

    // Contadores de histerese
    OverBudgetFrames = 0;
    UnderBudgetFrames = 0;

    // Nível de qualidade inicial — meio da faixa
    CurrentQualityLevel = 2.0f;
    TargetQualityLevel = 2.0f;

    CurrentBudgetState = EKhaaosBudgetState::UNDER_BUDGET;

    UE_LOG(LogKhaaosRun, Log, TEXT("[PerfBudget] Subsistema inicializado — Plataforma: DESKTOP_MID, QualityLevel: 2.0"));
}

void UKhaaosPerformanceBudget::Deinitialize()
{
    // Limpa o histórico e reseta estado
    FrameHistory.Empty();
    HistoryIndex = 0;
    OverBudgetFrames = 0;
    UnderBudgetFrames = 0;
    CurrentQualityLevel = 2.0f;
    TargetQualityLevel = 2.0f;
    CurrentBudgetState = EKhaaosBudgetState::UNDER_BUDGET;

    UE_LOG(LogKhaaosRun, Log, TEXT("[PerfBudget] Subsistema desinicializado"));

    Super::Deinitialize();
}

// ─── Configuração de Plataforma ────────────────────────────────────────────────

void UKhaaosPerformanceBudget::SetPlatformTarget(EKhaaosPlatformTarget NewPlatform)
{
    Platform = NewPlatform;

    // Configura o budget de frame para a plataforma
    FrameBudget = GetBudgetForPlatform(NewPlatform);

    // Configura a escalação adaptativa padrão para a plataforma
    AdaptiveConfig = GetAdaptiveConfigForPlatform(NewPlatform);

    // Configura as restrições mobile para a plataforma
    MobileConstraints = GetMobileConstraintsForPlatform(NewPlatform);

    // Reseta contadores de histerese ao mudar de plataforma
    OverBudgetFrames = 0;
    UnderBudgetFrames = 0;

    // Nível de qualidade inicial baseado na plataforma
    switch (NewPlatform)
    {
    case EKhaaosPlatformTarget::MOBILE_LOW:
        CurrentQualityLevel = 0.5f;
        TargetQualityLevel = 0.5f;
        break;
    case EKhaaosPlatformTarget::MOBILE_MID:
        CurrentQualityLevel = 1.0f;
        TargetQualityLevel = 1.0f;
        break;
    case EKhaaosPlatformTarget::MOBILE_HIGH:
        CurrentQualityLevel = 1.5f;
        TargetQualityLevel = 1.5f;
        break;
    case EKhaaosPlatformTarget::DESKTOP_MIN:
        CurrentQualityLevel = 2.0f;
        TargetQualityLevel = 2.0f;
        break;
    case EKhaaosPlatformTarget::DESKTOP_MID:
        CurrentQualityLevel = 3.0f;
        TargetQualityLevel = 3.0f;
        break;
    case EKhaaosPlatformTarget::DESKTOP_MAX:
        CurrentQualityLevel = 4.0f;
        TargetQualityLevel = 4.0f;
        break;
    default:
        CurrentQualityLevel = 2.0f;
        TargetQualityLevel = 2.0f;
        break;
    }

    // Gera nome da plataforma para log
    const UEnum* PlatformEnum = StaticEnum<EKhaaosPlatformTarget>();
    FString PlatformName = PlatformEnum ? PlatformEnum->GetNameStringByValue(static_cast<int64>(NewPlatform)) : TEXT("Unknown");

    UE_LOG(LogKhaaosRun, Log, TEXT("[PerfBudget] Plataforma definida: %s | FPS: %.1f | GPU Budget: %.2fms | CPU Budget: %.2fms | QualityLevel: %.2f"),
        *PlatformName, FrameBudget.TargetFPS, FrameBudget.MaxGPUTimeMs, FrameBudget.MaxCPUTimeMs, CurrentQualityLevel);
}

FKhaaosFrameBudget UKhaaosPerformanceBudget::GetBudgetForPlatform(EKhaaosPlatformTarget TargetPlatform) const
{
    FKhaaosFrameBudget Budget;

    switch (TargetPlatform)
    {
    case EKhaaosPlatformTarget::MOBILE_LOW:
        Budget.TargetFPS = 30.0f;
        Budget.TargetFrameTimeMs = 1000.0f / 30.0f;  // ~33.33ms
        Budget.MaxGPUTimeMs = 18.0f;
        Budget.MaxCPUTimeMs = 10.0f;
        Budget.MaxRenderThreadTimeMs = 10.0f;
        Budget.HeadroomPercent = 0.15f;  // Mobile precisa de mais headroom
        Budget.bIsMobileTarget = true;
        break;

    case EKhaaosPlatformTarget::MOBILE_MID:
        Budget.TargetFPS = 30.0f;
        Budget.TargetFrameTimeMs = 1000.0f / 30.0f;  // ~33.33ms
        Budget.MaxGPUTimeMs = 18.0f;
        Budget.MaxCPUTimeMs = 12.0f;
        Budget.MaxRenderThreadTimeMs = 10.0f;
        Budget.HeadroomPercent = 0.12f;
        Budget.bIsMobileTarget = true;
        break;

    case EKhaaosPlatformTarget::MOBILE_HIGH:
        Budget.TargetFPS = 60.0f;
        Budget.TargetFrameTimeMs = 1000.0f / 60.0f;  // ~16.67ms
        Budget.MaxGPUTimeMs = 12.0f;
        Budget.MaxCPUTimeMs = 14.0f;
        Budget.MaxRenderThreadTimeMs = 8.0f;
        Budget.HeadroomPercent = 0.10f;
        Budget.bIsMobileTarget = true;
        break;

    case EKhaaosPlatformTarget::DESKTOP_MIN:
        Budget.TargetFPS = 60.0f;
        Budget.TargetFrameTimeMs = 1000.0f / 60.0f;  // ~16.67ms
        Budget.MaxGPUTimeMs = 12.0f;
        Budget.MaxCPUTimeMs = 14.0f;
        Budget.MaxRenderThreadTimeMs = 8.0f;
        Budget.HeadroomPercent = 0.08f;
        Budget.bIsMobileTarget = false;
        break;

    case EKhaaosPlatformTarget::DESKTOP_MID:
        Budget.TargetFPS = 60.0f;
        Budget.TargetFrameTimeMs = 1000.0f / 60.0f;  // ~16.67ms
        Budget.MaxGPUTimeMs = 10.0f;
        Budget.MaxCPUTimeMs = 12.0f;
        Budget.MaxRenderThreadTimeMs = 7.0f;
        Budget.HeadroomPercent = 0.05f;
        Budget.bIsMobileTarget = false;
        break;

    case EKhaaosPlatformTarget::DESKTOP_MAX:
        Budget.TargetFPS = 120.0f;
        Budget.TargetFrameTimeMs = 1000.0f / 120.0f;  // ~8.33ms
        Budget.MaxGPUTimeMs = 6.0f;
        Budget.MaxCPUTimeMs = 8.0f;
        Budget.MaxRenderThreadTimeMs = 5.0f;
        Budget.HeadroomPercent = 0.05f;
        Budget.bIsMobileTarget = false;
        break;

    default:
        // Fallback para DESKTOP_MID
        Budget.TargetFPS = 60.0f;
        Budget.TargetFrameTimeMs = 1000.0f / 60.0f;
        Budget.MaxGPUTimeMs = 10.0f;
        Budget.MaxCPUTimeMs = 12.0f;
        Budget.MaxRenderThreadTimeMs = 7.0f;
        Budget.HeadroomPercent = 0.05f;
        Budget.bIsMobileTarget = false;
        break;
    }

    return Budget;
}

// ─── Budget de Frame ───────────────────────────────────────────────────────────

void UKhaaosPerformanceBudget::SetFrameBudget(const FKhaaosFrameBudget& NewBudget)
{
    FrameBudget = NewBudget;

    UE_LOG(LogKhaaosRun, Log, TEXT("[PerfBudget] Budget manual definido — FPS: %.1f | GPU: %.2fms | CPU: %.2fms | Render: %.2fms | Headroom: %.0f%%"),
        FrameBudget.TargetFPS, FrameBudget.MaxGPUTimeMs, FrameBudget.MaxCPUTimeMs,
        FrameBudget.MaxRenderThreadTimeMs, FrameBudget.HeadroomPercent * 100.0f);
}

// ─── Rastreamento de Frame ─────────────────────────────────────────────────────

void UKhaaosPerformanceBudget::RecordFrameTime(const FKhaaosFrameTimeSnapshot& Snapshot)
{
    // Adiciona ao buffer circular — sobrepõe o slot mais antigo
    FrameHistory[HistoryIndex] = Snapshot;
    HistoryIndex = (HistoryIndex + 1) % HISTORY_SIZE;

    // Atualiza o estado do budget com base na medição atual
    // Utilização = (GPU + CPU) / (GPU_budget + CPU_budget)
    const float TotalTimeMs = Snapshot.GPUTimeMs + Snapshot.CPUTimeMs;
    const float TotalBudgetMs = FrameBudget.MaxGPUTimeMs + FrameBudget.MaxCPUTimeMs;

    if (TotalBudgetMs > 0.0f)
    {
        const float Utilization = TotalTimeMs / TotalBudgetMs;

        // Atualiza contadores de histerese
        if (Utilization > 0.95f)
        {
            OverBudgetFrames++;
            UnderBudgetFrames = 0;
        }
        else if (Utilization < 0.70f)
        {
            UnderBudgetFrames++;
            OverBudgetFrames = 0;
        }
        else
        {
            // Dentro do budget — reseta ambos os contadores
            OverBudgetFrames = 0;
            UnderBudgetFrames = 0;
        }
    }
}

FKhaaosFrameTimeSnapshot UKhaaosPerformanceBudget::GetAverageFrameTime() const
{
    FKhaaosFrameTimeSnapshot AverageSnapshot;

    // Conta quantos snapshots válidos existem no histórico
    // (no início, o buffer pode conter snapshots zerados)
    int32 ValidCount = 0;
    float SumGPU = 0.0f;
    float SumCPU = 0.0f;
    float SumRender = 0.0f;
    float SumRHI = 0.0f;
    float SumFrame = 0.0f;

    for (int32 i = 0; i < HISTORY_SIZE; ++i)
    {
        const FKhaaosFrameTimeSnapshot& S = FrameHistory[i];

        // Considera válido se tem algum tempo registrado ou timestamp > 0
        if (S.FrameTimeMs > 0.0f || S.GPUTimeMs > 0.0f || S.Timestamp > 0.0)
        {
            SumGPU += S.GPUTimeMs;
            SumCPU += S.CPUTimeMs;
            SumRender += S.RenderThreadTimeMs;
            SumRHI += S.RHITimeMs;
            SumFrame += S.FrameTimeMs;
            ValidCount++;
        }
    }

    if (ValidCount > 0)
    {
        AverageSnapshot.GPUTimeMs = SumGPU / static_cast<float>(ValidCount);
        AverageSnapshot.CPUTimeMs = SumCPU / static_cast<float>(ValidCount);
        AverageSnapshot.RenderThreadTimeMs = SumRender / static_cast<float>(ValidCount);
        AverageSnapshot.RHITimeMs = SumRHI / static_cast<float>(ValidCount);
        AverageSnapshot.FrameTimeMs = SumFrame / static_cast<float>(ValidCount);
        AverageSnapshot.Timestamp = FPlatformTime::Seconds();
    }

    return AverageSnapshot;
}

// ─── Estado do Budget ──────────────────────────────────────────────────────────

float UKhaaosPerformanceBudget::GetBudgetUtilization() const
{
    // Calcula a utilização baseada na média do histórico
    // Utilização = avg(GPU + CPU) / (GPU_budget + CPU_budget)
    const FKhaaosFrameTimeSnapshot Avg = GetAverageFrameTime();
    const float TotalTimeMs = Avg.GPUTimeMs + Avg.CPUTimeMs;
    const float TotalBudgetMs = FrameBudget.MaxGPUTimeMs + FrameBudget.MaxCPUTimeMs;

    if (TotalBudgetMs <= 0.0f)
    {
        return 0.0f;
    }

    return TotalTimeMs / TotalBudgetMs;
}

// ─── Escalação Adaptativa ──────────────────────────────────────────────────────

void UKhaaosPerformanceBudget::SetAdaptiveConfig(const FKhaaosAdaptiveQualityConfig& NewConfig)
{
    AdaptiveConfig = NewConfig;

    UE_LOG(LogKhaaosRun, Log, TEXT("[PerfBudget] Config adaptativa definida — Down: %.2f@%.2f/s | Up: %.2f@%.2f/s | Hysteresis: %d | Range: [%.1f, %.1f]"),
        AdaptiveConfig.ScaleDownThreshold, AdaptiveConfig.ScaleDownSpeed,
        AdaptiveConfig.ScaleUpThreshold, AdaptiveConfig.ScaleUpSpeed,
        AdaptiveConfig.HysteresisFrames,
        AdaptiveConfig.MinQualityLevel, AdaptiveConfig.MaxQualityLevel);
}

void UKhaaosPerformanceBudget::UpdateAdaptiveQuality(float DeltaTime)
{
    // Se escalação adaptativa está desabilitada, não faz nada
    if (!AdaptiveConfig.bEnableAdaptiveQuality)
    {
        return;
    }

    // Garante DeltaTime válido
    if (DeltaTime <= 0.0f || DeltaTime > 1.0f)
    {
        return;
    }

    // ─── 1. Calcular utilização atual ───────────────────────────────────────
    // Utilização primária = avg GPU time / GPU budget
    // (GPU é tipicamente o gargalo em mobile e o indicador mais estável)
    const FKhaaosFrameTimeSnapshot Avg = GetAverageFrameTime();
    const float GPUBudgetEffective = FrameBudget.MaxGPUTimeMs * (1.0f - FrameBudget.HeadroomPercent);

    float GPUUtilization = 0.0f;
    if (GPUBudgetEffective > 0.0f)
    {
        GPUUtilization = Avg.GPUTimeMs / GPUBudgetEffective;
    }

    // Utilização secundária = avg CPU time / CPU budget
    const float CPUBudgetEffective = FrameBudget.MaxCPUTimeMs * (1.0f - FrameBudget.HeadroomPercent);
    float CPUUtilization = 0.0f;
    if (CPUBudgetEffective > 0.0f)
    {
        CPUUtilization = Avg.CPUTimeMs / CPUBudgetEffective;
    }

    // Utilização combinada — pior caso entre GPU e CPU
    const float CombinedUtilization = FMath::Max(GPUUtilization, CPUUtilization);

    // ─── 2. Escalação para baixo (qualidade reduz) ─────────────────────────
    // Se a utilização combinada excede o threshold de scale-down por
    // HysteresisFrames consecutivos, reduzimos o nível alvo
    if (CombinedUtilization > AdaptiveConfig.ScaleDownThreshold)
    {
        if (OverBudgetFrames >= AdaptiveConfig.HysteresisFrames)
        {
            const float OldTarget = TargetQualityLevel;
            TargetQualityLevel -= AdaptiveConfig.ScaleDownSpeed * DeltaTime;

            UE_LOG(LogKhaaosRun, Verbose, TEXT("[PerfBudget] Scale DOWN — Utilização: %.2f > Threshold: %.2f | TargetQuality: %.2f → %.2f"),
                CombinedUtilization, AdaptiveConfig.ScaleDownThreshold, OldTarget, TargetQualityLevel);
        }
    }
    // ─── 3. Escalação para cima (qualidade aumenta) ────────────────────────
    // Se a utilização combinada está abaixo do threshold de scale-up por
    // HysteresisFrames consecutivos, aumentamos o nível alvo
    else if (CombinedUtilization < AdaptiveConfig.ScaleUpThreshold)
    {
        if (UnderBudgetFrames >= AdaptiveConfig.HysteresisFrames)
        {
            const float OldTarget = TargetQualityLevel;
            TargetQualityLevel += AdaptiveConfig.ScaleUpSpeed * DeltaTime;

            UE_LOG(LogKhaaosRun, Verbose, TEXT("[PerfBudget] Scale UP — Utilização: %.2f < Threshold: %.2f | TargetQuality: %.2f → %.2f"),
                CombinedUtilization, AdaptiveConfig.ScaleUpThreshold, OldTarget, TargetQualityLevel);
        }
    }

    // ─── 4. Clamp ao range permitido ───────────────────────────────────────
    TargetQualityLevel = FMath::Clamp(TargetQualityLevel, AdaptiveConfig.MinQualityLevel, AdaptiveConfig.MaxQualityLevel);

    // ─── 5. Interpolar suavemente CurrentQualityLevel → TargetQualityLevel ─
    // Taxa de interpolação: velocidade moderada para transições suaves
    // (evita saltos visuais ao mudar nível de qualidade)
    const float LerpSpeed = 2.0f;  // unidades/segundo — transição em ~0.5s por nível
    const float LerpAlpha = FMath::Min(1.0f, LerpSpeed * DeltaTime);

    const float OldQualityLevel = CurrentQualityLevel;
    CurrentQualityLevel = FMath::Lerp(CurrentQualityLevel, TargetQualityLevel, LerpAlpha);

    // Clamp final por segurança
    CurrentQualityLevel = FMath::Clamp(CurrentQualityLevel, AdaptiveConfig.MinQualityLevel, AdaptiveConfig.MaxQualityLevel);

    // ─── 6. Broadcast OnQualityScaled se houve mudança significativa ───────
    // Threshold de 0.01 para evitar broadcasts por flutuação de ponto flutuante
    if (FMath::Abs(CurrentQualityLevel - OldQualityLevel) > 0.01f)
    {
        OnQualityScaled.Broadcast(OldQualityLevel, CurrentQualityLevel);

        UE_LOG(LogKhaaosRun, Log, TEXT("[PerfBudget] Qualidade escalada: %.2f → %.2f (Target: %.2f, Utilização: %.2f)"),
            OldQualityLevel, CurrentQualityLevel, TargetQualityLevel, CombinedUtilization);
    }

    // ─── 7. Atualizar estado do budget e broadcast se mudou ────────────────
    // Classificação baseada na utilização combinada:
    //   UNDER_BUDGET: < 70% do budget
    //   AT_BUDGET:    70-95% do budget
    //   OVER_BUDGET:  95-120% do budget
    //   CRITICAL_OVER: > 120% do budget
    EKhaaosBudgetState NewState = EKhaaosBudgetState::UNDER_BUDGET;

    if (CombinedUtilization > 1.2f)
    {
        NewState = EKhaaosBudgetState::CRITICAL_OVER;
    }
    else if (CombinedUtilization > 0.95f)
    {
        NewState = EKhaaosBudgetState::OVER_BUDGET;
    }
    else if (CombinedUtilization > 0.70f)
    {
        NewState = EKhaaosBudgetState::AT_BUDGET;
    }
    else
    {
        NewState = EKhaaosBudgetState::UNDER_BUDGET;
    }

    if (NewState != CurrentBudgetState)
    {
        const EKhaaosBudgetState OldState = CurrentBudgetState;
        CurrentBudgetState = NewState;

        OnBudgetStateChanged.Broadcast(NewState);

        const UEnum* StateEnum = StaticEnum<EKhaaosBudgetState>();
        const FString OldStateName = StateEnum ? StateEnum->GetNameStringByValue(static_cast<int64>(OldState)) : TEXT("?");
        const FString NewStateName = StateEnum ? StateEnum->GetNameStringByValue(static_cast<int64>(NewState)) : TEXT("?");

        UE_LOG(LogKhaaosRun, Log, TEXT("[PerfBudget] Estado do budget mudou: %s → %s (Utilização: %.2f)"),
            *OldStateName, *NewStateName, CombinedUtilization);
    }
}

// ─── Diagnóstico ───────────────────────────────────────────────────────────────

void UKhaaosPerformanceBudget::DumpBudgetState() const
{
    // Nome da plataforma
    const UEnum* PlatformEnum = StaticEnum<EKhaaosPlatformTarget>();
    const FString PlatformName = PlatformEnum ? PlatformEnum->GetNameStringByValue(static_cast<int64>(Platform)) : TEXT("Unknown");

    // Nome do estado do budget
    const UEnum* StateEnum = StaticEnum<EKhaaosBudgetState>();
    const FString StateName = StateEnum ? StateEnum->GetNameStringByValue(static_cast<int64>(CurrentBudgetState)) : TEXT("Unknown");

    // Média do histórico
    const FKhaaosFrameTimeSnapshot Avg = GetAverageFrameTime();

    // Utilização
    const float Utilization = GetBudgetUtilization();

    UE_LOG(LogKhaaosRun, Log, TEXT("╔══════════════════════════════════════════════════════════╗"));
    UE_LOG(LogKhaaosRun, Log, TEXT("║          KHAAOS PERFORMANCE BUDGET — DIAGNÓSTICO         ║"));
    UE_LOG(LogKhaaosRun, Log, TEXT("╠══════════════════════════════════════════════════════════╣"));
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Plataforma:        %-40s ║"), *PlatformName);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Estado do Budget:  %-40s ║"), *StateName);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Utilização:        %-40.2f ║"), Utilization);
    UE_LOG(LogKhaaosRun, Log, TEXT("╠══════════════════════════════════════════════════════════╣"));
    UE_LOG(LogKhaaosRun, Log, TEXT("║              BUDGET DE FRAME                             ║"));
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Target FPS:        %-40.1f ║"), FrameBudget.TargetFPS);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Frame Time:        %-40.2f ║"), FrameBudget.TargetFrameTimeMs);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ GPU Budget:        %-40.2f ║"), FrameBudget.MaxGPUTimeMs);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ CPU Budget:        %-40.2f ║"), FrameBudget.MaxCPUTimeMs);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Render Budget:     %-40.2f ║"), FrameBudget.MaxRenderThreadTimeMs);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Headroom:          %-40.0f ║"), FrameBudget.HeadroomPercent * 100.0f);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ É Mobile:          %-40s ║"), FrameBudget.bIsMobileTarget ? TEXT("SIM") : TEXT("NÃO"));
    UE_LOG(LogKhaaosRun, Log, TEXT("╠══════════════════════════════════════════════════════════╣"));
    UE_LOG(LogKhaaosRun, Log, TEXT("║              MÉDIA DE FRAME (últimos %d frames)           ║"), HISTORY_SIZE);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ GPU Time (avg):    %-40.2f ║"), Avg.GPUTimeMs);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ CPU Time (avg):    %-40.2f ║"), Avg.CPUTimeMs);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Render Time (avg): %-40.2f ║"), Avg.RenderThreadTimeMs);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ RHI Time (avg):    %-40.2f ║"), Avg.RHITimeMs);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Frame Time (avg):  %-40.2f ║"), Avg.FrameTimeMs);
    UE_LOG(LogKhaaosRun, Log, TEXT("╠══════════════════════════════════════════════════════════╣"));
    UE_LOG(LogKhaaosRun, Log, TEXT("║              ESCALAÇÃO ADAPTATIVA                        ║"));
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Habilitada:        %-40s ║"), AdaptiveConfig.bEnableAdaptiveQuality ? TEXT("SIM") : TEXT("NÃO"));
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Quality Atual:     %-40.2f ║"), CurrentQualityLevel);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Quality Alvo:      %-40.2f ║"), TargetQualityLevel);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Min Quality:       %-40.2f ║"), AdaptiveConfig.MinQualityLevel);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Max Quality:       %-40.2f ║"), AdaptiveConfig.MaxQualityLevel);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Scale Down Thr:    %-40.2f ║"), AdaptiveConfig.ScaleDownThreshold);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Scale Up Thr:      %-40.2f ║"), AdaptiveConfig.ScaleUpThreshold);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Scale Down Speed:  %-40.2f ║"), AdaptiveConfig.ScaleDownSpeed);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Scale Up Speed:    %-40.2f ║"), AdaptiveConfig.ScaleUpSpeed);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Hysteresis Frames: %-40d ║"), AdaptiveConfig.HysteresisFrames);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Over Budget Frames:%-40d ║"), OverBudgetFrames);
    UE_LOG(LogKhaaosRun, Log, TEXT("║ Under Budget Frms: %-40d ║"), UnderBudgetFrames);

    // Seção de restrições mobile (apenas se plataforma é mobile)
    if (FrameBudget.bIsMobileTarget)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("╠══════════════════════════════════════════════════════════╣"));
        UE_LOG(LogKhaaosRun, Log, TEXT("║              RESTRIÇÕES MOBILE                           ║"));
        UE_LOG(LogKhaaosRun, Log, TEXT("║ Max Texture Res:   %-40d ║"), MobileConstraints.MaxTextureResolution);
        UE_LOG(LogKhaaosRun, Log, TEXT("║ Max Particles:     %-40d ║"), MobileConstraints.MaxParticleCount);
        UE_LOG(LogKhaaosRun, Log, TEXT("║ Max Shadow Res:    %-40d ║"), MobileConstraints.MaxShadowResolution);
        UE_LOG(LogKhaaosRun, Log, TEXT("║ SSR Desabilitado:  %-40s ║"), MobileConstraints.bDisableSSR ? TEXT("SIM") : TEXT("NÃO"));
        UE_LOG(LogKhaaosRun, Log, TEXT("║ SSAO Desabilitado: %-40s ║"), MobileConstraints.bDisableSSAO ? TEXT("SIM") : TEXT("NÃO"));
        UE_LOG(LogKhaaosRun, Log, TEXT("║ VolFog Desabilit.: %-40s ║"), MobileConstraints.bDisableVolumetricFog ? TEXT("SIM") : TEXT("NÃO"));
        UE_LOG(LogKhaaosRun, Log, TEXT("║ Lumen GI Desabil.: %-40s ║"), MobileConstraints.bDisableLumenGI ? TEXT("SIM") : TEXT("NÃO"));
        UE_LOG(LogKhaaosRun, Log, TEXT("║ Max Draw Calls:    %-40d ║"), MobileConstraints.MaxDrawCalls);
        UE_LOG(LogKhaaosRun, Log, TEXT("║ Max Triangles:     %-40d ║"), MobileConstraints.MaxTriangleCount);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("╚══════════════════════════════════════════════════════════╝"));
}

// ─── Helpers Internos ──────────────────────────────────────────────────────────

FKhaaosMobileConstraints UKhaaosPerformanceBudget::GetMobileConstraintsForPlatform(EKhaaosPlatformTarget TargetPlatform) const
{
    FKhaaosMobileConstraints Constraints;

    switch (TargetPlatform)
    {
    case EKhaaosPlatformTarget::MOBILE_LOW:
        // Mobile低端 — máximas restrições
        Constraints.MaxTextureResolution = 512;
        Constraints.MaxParticleCount = 2000;
        Constraints.MaxShadowResolution = 512;
        Constraints.bDisableSSR = true;
        Constraints.bDisableSSAO = true;
        Constraints.bDisableVolumetricFog = true;
        Constraints.bDisableLumenGI = true;
        Constraints.MaxDrawCalls = 800;
        Constraints.MaxTriangleCount = 200000;
        break;

    case EKhaaosPlatformTarget::MOBILE_MID:
        // Mobile中端 — restrições moderadas
        Constraints.MaxTextureResolution = 1024;
        Constraints.MaxParticleCount = 5000;
        Constraints.MaxShadowResolution = 512;
        Constraints.bDisableSSR = true;
        Constraints.bDisableSSAO = false;
        Constraints.bDisableVolumetricFog = false;
        Constraints.bDisableLumenGI = true;
        Constraints.MaxDrawCalls = 1500;
        Constraints.MaxTriangleCount = 350000;
        break;

    case EKhaaosPlatformTarget::MOBILE_HIGH:
        // Mobile高端 — menos restrições
        Constraints.MaxTextureResolution = 1024;
        Constraints.MaxParticleCount = 10000;
        Constraints.MaxShadowResolution = 1024;
        Constraints.bDisableSSR = false;
        Constraints.bDisableSSAO = false;
        Constraints.bDisableVolumetricFog = false;
        Constraints.bDisableLumenGI = true;
        Constraints.MaxDrawCalls = 2500;
        Constraints.MaxTriangleCount = 500000;
        break;

    case EKhaaosPlatformTarget::DESKTOP_MIN:
        // Desktop mínimo — sem restrições mobile significativas
        Constraints.MaxTextureResolution = 2048;
        Constraints.MaxParticleCount = 20000;
        Constraints.MaxShadowResolution = 1024;
        Constraints.bDisableSSR = false;
        Constraints.bDisableSSAO = false;
        Constraints.bDisableVolumetricFog = false;
        Constraints.bDisableLumenGI = false;
        Constraints.MaxDrawCalls = 4000;
        Constraints.MaxTriangleCount = 1500000;
        break;

    case EKhaaosPlatformTarget::DESKTOP_MID:
        // Desktop中端 — generoso
        Constraints.MaxTextureResolution = 2048;
        Constraints.MaxParticleCount = 50000;
        Constraints.MaxShadowResolution = 2048;
        Constraints.bDisableSSR = false;
        Constraints.bDisableSSAO = false;
        Constraints.bDisableVolumetricFog = false;
        Constraints.bDisableLumenGI = false;
        Constraints.MaxDrawCalls = 6000;
        Constraints.MaxTriangleCount = 3000000;
        break;

    case EKhaaosPlatformTarget::DESKTOP_MAX:
        // Desktop高端 — sem restrições
        Constraints.MaxTextureResolution = 4096;
        Constraints.MaxParticleCount = 50000;
        Constraints.MaxShadowResolution = 2048;
        Constraints.bDisableSSR = false;
        Constraints.bDisableSSAO = false;
        Constraints.bDisableVolumetricFog = false;
        Constraints.bDisableLumenGI = false;
        Constraints.MaxDrawCalls = 10000;
        Constraints.MaxTriangleCount = 5000000;
        break;

    default:
        // Fallback — restrições de DESKTOP_MIN
        Constraints.MaxTextureResolution = 2048;
        Constraints.MaxParticleCount = 20000;
        Constraints.MaxShadowResolution = 1024;
        Constraints.bDisableSSR = false;
        Constraints.bDisableSSAO = false;
        Constraints.bDisableVolumetricFog = false;
        Constraints.bDisableLumenGI = false;
        Constraints.MaxDrawCalls = 4000;
        Constraints.MaxTriangleCount = 1500000;
        break;
    }

    return Constraints;
}

FKhaaosAdaptiveQualityConfig UKhaaosPerformanceBudget::GetAdaptiveConfigForPlatform(EKhaaosPlatformTarget TargetPlatform) const
{
    FKhaaosAdaptiveQualityConfig Config;

    switch (TargetPlatform)
    {
    case EKhaaosPlatformTarget::MOBILE_LOW:
        // Mobile低端 — escalação agressiva, quality baixo
        Config.bEnableAdaptiveQuality = true;
        Config.ScaleDownThreshold = 0.85f;    // Escala cedo para manter 30fps
        Config.ScaleUpThreshold = 0.50f;      // Só escala acima se muito abaixo
        Config.ScaleDownSpeed = 2.0f;         // Reduz rápido
        Config.ScaleUpSpeed = 0.3f;           // Aumenta devagar (evita spike)
        Config.MinQualityLevel = 0.0f;
        Config.MaxQualityLevel = 2.0f;        // Mobile低 nunca passa de Medium
        Config.HysteresisFrames = 3;          // Pouca histerese (reage rápido)
        break;

    case EKhaaosPlatformTarget::MOBILE_MID:
        // Mobile中端 — escalação moderada
        Config.bEnableAdaptiveQuality = true;
        Config.ScaleDownThreshold = 0.88f;
        Config.ScaleUpThreshold = 0.55f;
        Config.ScaleDownSpeed = 1.5f;
        Config.ScaleUpSpeed = 0.4f;
        Config.MinQualityLevel = 0.0f;
        Config.MaxQualityLevel = 2.5f;
        Config.HysteresisFrames = 4;
        break;

    case EKhaaosPlatformTarget::MOBILE_HIGH:
        // Mobile高端 — escalação conservadora
        Config.bEnableAdaptiveQuality = true;
        Config.ScaleDownThreshold = 0.90f;
        Config.ScaleUpThreshold = 0.60f;
        Config.ScaleDownSpeed = 1.0f;
        Config.ScaleUpSpeed = 0.5f;
        Config.MinQualityLevel = 0.5f;
        Config.MaxQualityLevel = 3.0f;
        Config.HysteresisFrames = 5;
        break;

    case EKhaaosPlatformTarget::DESKTOP_MIN:
        // Desktop mínimo — escalação moderada
        Config.bEnableAdaptiveQuality = true;
        Config.ScaleDownThreshold = 0.90f;
        Config.ScaleUpThreshold = 0.60f;
        Config.ScaleDownSpeed = 1.0f;
        Config.ScaleUpSpeed = 0.5f;
        Config.MinQualityLevel = 1.0f;
        Config.MaxQualityLevel = 3.5f;
        Config.HysteresisFrames = 5;
        break;

    case EKhaaosPlatformTarget::DESKTOP_MID:
        // Desktop中端 — escalação suave
        Config.bEnableAdaptiveQuality = true;
        Config.ScaleDownThreshold = 0.92f;
        Config.ScaleUpThreshold = 0.65f;
        Config.ScaleDownSpeed = 0.8f;
        Config.ScaleUpSpeed = 0.5f;
        Config.MinQualityLevel = 1.0f;
        Config.MaxQualityLevel = 4.0f;
        Config.HysteresisFrames = 6;
        break;

    case EKhaaosPlatformTarget::DESKTOP_MAX:
        // Desktop高端 — escalação mínima (provavelmente não precisa)
        Config.bEnableAdaptiveQuality = true;
        Config.ScaleDownThreshold = 0.95f;    // Só escala se quase no limite
        Config.ScaleUpThreshold = 0.70f;
        Config.ScaleDownSpeed = 0.5f;
        Config.ScaleUpSpeed = 0.3f;
        Config.MinQualityLevel = 2.0f;        // Desktop高 nunca abaixo de High
        Config.MaxQualityLevel = 4.0f;
        Config.HysteresisFrames = 8;          // Mais histerese (evita mudanças)
        break;

    default:
        // Fallback — configuração de DESKTOP_MID
        Config.bEnableAdaptiveQuality = true;
        Config.ScaleDownThreshold = 0.92f;
        Config.ScaleUpThreshold = 0.65f;
        Config.ScaleDownSpeed = 0.8f;
        Config.ScaleUpSpeed = 0.5f;
        Config.MinQualityLevel = 1.0f;
        Config.MaxQualityLevel = 4.0f;
        Config.HysteresisFrames = 6;
        break;
    }

    return Config;
}
