// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// SUBSISTEMA: UKhaaosVFXQualityManager (Implementação)
// PROPÓSITO: Gerenciamento de orçamento do pool Niagara, qualidade de VFX,
//            LOD baseado em distância e hierarquia de efeitos de eliminação
//            para 6 espécies alienígenas (Huran/Khael/Venex/Onith/Zheers/Skeetw)
//            no Battle Royale Khaaos Run — qualidade VFX alinhada ao Free Fire.
// ==============================================================================

#include "Game/Graphics/KhaaosVFXQualityManager.h"
#include "KhaaosRun.h"

// ==============================================================================
// Ciclo de vida do subsistema
// ==============================================================================

void UKhaaosVFXQualityManager::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Constrói os tiers de qualidade e configurações de efeito de kill
	BuildQualityTiers();
	BuildKillEffectConfigs();

	// Inicializa contadores por categoria com zero
	ActiveVFXCounts.Empty();
	ActiveVFXCounts.Add(EKhaaosVFXCategory::SPECIES_AURA, 0);
	ActiveVFXCounts.Add(EKhaaosVFXCategory::WEAPON_MUZZLE, 0);
	ActiveVFXCounts.Add(EKhaaosVFXCategory::WEAPON_IMPACT, 0);
	ActiveVFXCounts.Add(EKhaaosVFXCategory::EXPLOSION, 0);
	ActiveVFXCounts.Add(EKhaaosVFXCategory::KILL_EFFECT, 0);
	ActiveVFXCounts.Add(EKhaaosVFXCategory::ZONE_WARNING, 0);
	ActiveVFXCounts.Add(EKhaaosVFXCategory::WEATHER, 0);
	ActiveVFXCounts.Add(EKhaaosVFXCategory::ENVIRONMENT_AMBIENT, 0);
	ActiveVFXCounts.Add(EKhaaosVFXCategory::UI_FEEDBACK, 0);

	TotalActiveVFX = 0;

	// Auto-configura o orçamento com base na qualidade padrão (MEDIUM = nível 2)
	CurrentQuality = EKhaaosVFXQuality::MEDIUM;
	AutoConfigurePoolBudget(static_cast<int32>(CurrentQuality));

	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] Subsistema inicializado — Qualidade: %d, MaxSistemas: %d, MaxPartículas: %d"),
		static_cast<int32>(CurrentQuality), ActiveBudget.MaxSystemCount, ActiveBudget.MaxParticleCount);
}

void UKhaaosVFXQualityManager::Deinitialize()
{
	// Limpa todo o estado do subsistema
	QualityTiers.Empty();
	KillEffectConfigs.Empty();
	ActiveVFXCounts.Empty();
	ActiveBudget.CategoryBudgets.Empty();
	TotalActiveVFX = 0;
	CurrentQuality = EKhaaosVFXQuality::OFF;

	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] Subsistema desinicializado — estado limpo"));

	Super::Deinitialize();
}

// ==============================================================================
// Construção dos tiers de qualidade
// ==============================================================================

void UKhaaosVFXQualityManager::BuildQualityTiers()
{
	QualityTiers.Empty();

	// --- OFF: Nenhum VFX — tudo desligado ---
	FKhaaosVFXQualityTier TierOff;
	TierOff.Quality = EKhaaosVFXQuality::OFF;
	TierOff.SpawnRateMultiplier = 0.0f;
	TierOff.ParticleLifetimeMultiplier = 0.0f;
	TierOff.SimulationQuality = 0;
	TierOff.bEnableGPUParticles = false;
	TierOff.bEnableCollision = false;
	TierOff.bEnableLighting = false;
	TierOff.bEnableTrails = false;
	TierOff.bEnableEmitters_8Plus = false;
	TierOff.MaxSimultaneousSystems = 0;
	TierOff.SignificanceCullDistance = 0.0f;
	QualityTiers.Add(EKhaaosVFXQuality::OFF, TierOff);

	// --- LOW: VFX mínimo — mobile low-end, Free Fire estilo baixo ---
	FKhaaosVFXQualityTier TierLow;
	TierLow.Quality = EKhaaosVFXQuality::LOW;
	TierLow.SpawnRateMultiplier = 0.3f;
	TierLow.ParticleLifetimeMultiplier = 0.5f;
	TierLow.SimulationQuality = 1;
	TierLow.bEnableGPUParticles = false;
	TierLow.bEnableCollision = false;
	TierLow.bEnableLighting = false;
	TierLow.bEnableTrails = false;
	TierLow.bEnableEmitters_8Plus = false;
	TierLow.MaxSimultaneousSystems = 10;
	TierLow.SignificanceCullDistance = 1500.0f;
	QualityTiers.Add(EKhaaosVFXQuality::LOW, TierLow);

	// --- MEDIUM: VFX equilibrado — mobile mid-range, Free Fire padrão ---
	FKhaaosVFXQualityTier TierMedium;
	TierMedium.Quality = EKhaaosVFXQuality::MEDIUM;
	TierMedium.SpawnRateMultiplier = 0.6f;
	TierMedium.ParticleLifetimeMultiplier = 0.75f;
	TierMedium.SimulationQuality = 2;
	TierMedium.bEnableGPUParticles = true;
	TierMedium.bEnableCollision = false;
	TierMedium.bEnableLighting = false;
	TierMedium.bEnableTrails = true;
	TierMedium.bEnableEmitters_8Plus = false;
	TierMedium.MaxSimultaneousSystems = 25;
	TierMedium.SignificanceCullDistance = 3000.0f;
	QualityTiers.Add(EKhaaosVFXQuality::MEDIUM, TierMedium);

	// --- HIGH: VFX alto — desktop / console, Free Fire alto ---
	FKhaaosVFXQualityTier TierHigh;
	TierHigh.Quality = EKhaaosVFXQuality::HIGH;
	TierHigh.SpawnRateMultiplier = 0.85f;
	TierHigh.ParticleLifetimeMultiplier = 0.9f;
	TierHigh.SimulationQuality = 2;
	TierHigh.bEnableGPUParticles = true;
	TierHigh.bEnableCollision = true;
	TierHigh.bEnableLighting = false;
	TierHigh.bEnableTrails = true;
	TierHigh.bEnableEmitters_8Plus = true;
	TierHigh.MaxSimultaneousSystems = 40;
	TierHigh.SignificanceCullDistance = 5000.0f;
	QualityTiers.Add(EKhaaosVFXQuality::HIGH, TierHigh);

	// --- ULTRA: VFX máximo — high-end PC, tudo ligado ---
	FKhaaosVFXQualityTier TierUltra;
	TierUltra.Quality = EKhaaosVFXQuality::ULTRA;
	TierUltra.SpawnRateMultiplier = 1.0f;
	TierUltra.ParticleLifetimeMultiplier = 1.0f;
	TierUltra.SimulationQuality = 3;
	TierUltra.bEnableGPUParticles = true;
	TierUltra.bEnableCollision = true;
	TierUltra.bEnableLighting = true;
	TierUltra.bEnableTrails = true;
	TierUltra.bEnableEmitters_8Plus = true;
	TierUltra.MaxSimultaneousSystems = 60;
	TierUltra.SignificanceCullDistance = 10000.0f;
	QualityTiers.Add(EKhaaosVFXQuality::ULTRA, TierUltra);

	UE_LOG(LogKhaaosRun, Verbose, TEXT("[VFXQuality] BuildQualityTiers — 5 tiers construídos (OFF→ULTRA)"));
}

// ==============================================================================
// Construção das configurações de efeito de eliminação
// ==============================================================================

void UKhaaosVFXQualityManager::BuildKillEffectConfigs()
{
	KillEffectConfigs.Empty();

	// --- NONE: Sem efeito de eliminação ---
	FKhaaosKillEffectConfig ConfigNone;
	ConfigNone.Tier = EKhaaosKillEffectTier::NONE;
	ConfigNone.VFXAssetPath = TEXT("");
	ConfigNone.Duration = 0.0f;
	ConfigNone.ScreenShakeIntensity = 0.0f;
	ConfigNone.SlowMotionTimeScale = 1.0f;
	ConfigNone.SlowMotionDuration = 0.0f;
	ConfigNone.bEnableScreenFlash = false;
	ConfigNone.bEnableCameraZoom = false;
	ConfigNone.Priority = 0;
	KillEffectConfigs.Add(EKhaaosKillEffectTier::NONE, ConfigNone);

	// --- NORMAL_KILL: Eliminação básica — VFX simples, shake leve ---
	FKhaaosKillEffectConfig ConfigNormal;
	ConfigNormal.Tier = EKhaaosKillEffectTier::NORMAL_KILL;
	ConfigNormal.VFXAssetPath = TEXT("/Game/VFX/KillEffects/KE_NormalKill.NKE_NormalKill");
	ConfigNormal.Duration = 0.5f;
	ConfigNormal.ScreenShakeIntensity = 0.1f;
	ConfigNormal.SlowMotionTimeScale = 1.0f;
	ConfigNormal.SlowMotionDuration = 0.0f;
	ConfigNormal.bEnableScreenFlash = false;
	ConfigNormal.bEnableCameraZoom = false;
	ConfigNormal.Priority = 10;
	KillEffectConfigs.Add(EKhaaosKillEffectTier::NORMAL_KILL, ConfigNormal);

	// --- HEADSHOT: Headshot — VFX aprimorado, slow-motion 0.25x por 0.5s, flash + zoom ---
	FKhaaosKillEffectConfig ConfigHeadshot;
	ConfigHeadshot.Tier = EKhaaosKillEffectTier::HEADSHOT;
	ConfigHeadshot.VFXAssetPath = TEXT("/Game/VFX/KillEffects/KE_Headshot.NKE_Headshot");
	ConfigHeadshot.Duration = 1.0f;
	ConfigHeadshot.ScreenShakeIntensity = 0.4f;
	ConfigHeadshot.SlowMotionTimeScale = 0.25f;
	ConfigHeadshot.SlowMotionDuration = 0.5f;
	ConfigHeadshot.bEnableScreenFlash = true;
	ConfigHeadshot.bEnableCameraZoom = true;
	ConfigHeadshot.Priority = 30;
	KillEffectConfigs.Add(EKhaaosKillEffectTier::HEADSHOT, ConfigHeadshot);

	// --- STREAK_3: Streak 3 kills — escalação, slow-motion 0.3x por 0.8s ---
	FKhaaosKillEffectConfig ConfigStreak3;
	ConfigStreak3.Tier = EKhaaosKillEffectTier::STREAK_3;
	ConfigStreak3.VFXAssetPath = TEXT("/Game/VFX/KillEffects/KE_Streak3.NKE_Streak3");
	ConfigStreak3.Duration = 1.5f;
	ConfigStreak3.ScreenShakeIntensity = 0.5f;
	ConfigStreak3.SlowMotionTimeScale = 0.3f;
	ConfigStreak3.SlowMotionDuration = 0.8f;
	ConfigStreak3.bEnableScreenFlash = true;
	ConfigStreak3.bEnableCameraZoom = true;
	ConfigStreak3.Priority = 50;
	KillEffectConfigs.Add(EKhaaosKillEffectTier::STREAK_3, ConfigStreak3);

	// --- STREAK_5: Streak 5 kills — dramático, slow-motion 0.2x por 1.0s ---
	FKhaaosKillEffectConfig ConfigStreak5;
	ConfigStreak5.Tier = EKhaaosKillEffectTier::STREAK_5;
	ConfigStreak5.VFXAssetPath = TEXT("/Game/VFX/KillEffects/KE_Streak5.NKE_Streak5");
	ConfigStreak5.Duration = 2.0f;
	ConfigStreak5.ScreenShakeIntensity = 0.7f;
	ConfigStreak5.SlowMotionTimeScale = 0.2f;
	ConfigStreak5.SlowMotionDuration = 1.0f;
	ConfigStreak5.bEnableScreenFlash = true;
	ConfigStreak5.bEnableCameraZoom = true;
	ConfigStreak5.Priority = 70;
	KillEffectConfigs.Add(EKhaaosKillEffectTier::STREAK_5, ConfigStreak5);

	// --- SPECIAL_ELIMINATION: Eliminação especial — ultimate, slow-motion 0.15x por 1.5s ---
	FKhaaosKillEffectConfig ConfigSpecial;
	ConfigSpecial.Tier = EKhaaosKillEffectTier::SPECIAL_ELIMINATION;
	ConfigSpecial.VFXAssetPath = TEXT("/Game/VFX/KillEffects/KE_SpecialElimination.NKE_SpecialElimination");
	ConfigSpecial.Duration = 3.0f;
	ConfigSpecial.ScreenShakeIntensity = 1.0f;
	ConfigSpecial.SlowMotionTimeScale = 0.15f;
	ConfigSpecial.SlowMotionDuration = 1.5f;
	ConfigSpecial.bEnableScreenFlash = true;
	ConfigSpecial.bEnableCameraZoom = true;
	ConfigSpecial.Priority = 100;
	KillEffectConfigs.Add(EKhaaosKillEffectTier::SPECIAL_ELIMINATION, ConfigSpecial);

	UE_LOG(LogKhaaosRun, Verbose, TEXT("[VFXQuality] BuildKillEffectConfigs — 6 tiers construídos (NONE→SPECIAL_ELIMINATION)"));
}

// ==============================================================================
// Controle de qualidade VFX
// ==============================================================================

void UKhaaosVFXQualityManager::SetVFXQuality(EKhaaosVFXQuality NewQuality)
{
	if (CurrentQuality == NewQuality)
	{
		UE_LOG(LogKhaaosRun, Verbose, TEXT("[VFXQuality] SetVFXQuality — qualidade já é %d, nenhuma mudança"), static_cast<int32>(NewQuality));
		return;
	}

	const EKhaaosVFXQuality PreviousQuality = CurrentQuality;
	CurrentQuality = NewQuality;

	// Obtém a tier de qualidade correspondente
	const FKhaaosVFXQualityTier* Tier = QualityTiers.Find(CurrentQuality);
	if (!Tier)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[VFXQuality] SetVFXQuality — tier não encontrada para qualidade %d"), static_cast<int32>(CurrentQuality));
		return;
	}

	// Auto-configura o orçamento do pool para o novo nível
	AutoConfigurePoolBudget(static_cast<int32>(CurrentQuality));

	// Aplica console commands do Niagara para refletir a qualidade no engine
	// r.NiagaraQualityLevel controla a qualidade de simulação global do Niagara
	const FString NiagaraQualityCmd = FString::Printf(TEXT("r.NiagaraQualityLevel %d"), Tier->SimulationQuality);
	GEngine->Exec(GEngine->GetWorld(), *NiagaraQualityCmd);

	// fx.Niagara.DebugSimGPUSpawnRate controla a taxa de spawn de partículas GPU
	const FString GPUSpawnCmd = FString::Printf(TEXT("fx.Niagara.DebugSimGPUSpawnRate %.2f"), Tier->SpawnRateMultiplier);
	GEngine->Exec(GEngine->GetWorld(), *GPUSpawnCmd);

	// fx.Niagara.DebugTriggerMemoryThresholds força o threshold de memória do pool
	const FString MemoryThresholdCmd = FString::Printf(TEXT("fx.Niagara.DebugTriggerMemoryThresholds %d"), ActiveBudget.PoolSizeMB);
	GEngine->Exec(GEngine->GetWorld(), *MemoryThresholdCmd);

	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] Qualidade alterada: %d → %d | SpawnRate=%.2f SimQuality=%d GPU=%s CullDist=%.0f"),
		static_cast<int32>(PreviousQuality), static_cast<int32>(CurrentQuality),
		Tier->SpawnRateMultiplier, Tier->SimulationQuality,
		Tier->bEnableGPUParticles ? TEXT("Sim") : TEXT("Nao"),
		Tier->SignificanceCullDistance);
}

EKhaaosVFXQuality UKhaaosVFXQualityManager::GetVFXQuality() const
{
	return CurrentQuality;
}

// ==============================================================================
// Orçamento do pool Niagara
// ==============================================================================

void UKhaaosVFXQualityManager::ApplyPoolBudget(const FKhaaosVFXPoolBudget& Budget)
{
	ActiveBudget = Budget;

	// Aplica os limites do pool via console commands do engine/Niagara
	// Threshold de memória para o pool de Niagara
	const FString MemoryThresholdCmd = FString::Printf(TEXT("fx.Niagara.DebugTriggerMemoryThresholds %d"), ActiveBudget.PoolSizeMB);
	GEngine->Exec(GEngine->GetWorld(), *MemoryThresholdCmd);

	// Qualidade de simulação Niagara baseada na tier atual
	const FKhaaosVFXQualityTier* Tier = QualityTiers.Find(CurrentQuality);
	if (Tier)
	{
		const FString NiagaraQualityCmd = FString::Printf(TEXT("r.NiagaraQualityLevel %d"), Tier->SimulationQuality);
		GEngine->Exec(GEngine->GetWorld(), *NiagaraQualityCmd);

		// Taxa de spawn GPU
		const FString GPUSpawnCmd = FString::Printf(TEXT("fx.Niagara.DebugSimGPUSpawnRate %.2f"), Tier->SpawnRateMultiplier);
		GEngine->Exec(GEngine->GetWorld(), *GPUSpawnCmd);
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] ApplyPoolBudget — MaxSistemas=%d MaxParticulas=%d GPU=%d CPU=%d Pool=%dMB"),
		ActiveBudget.MaxSystemCount, ActiveBudget.MaxParticleCount,
		ActiveBudget.MaxGPUInstanceCount, ActiveBudget.MaxCPUInstanceCount,
		ActiveBudget.PoolSizeMB);
}

void UKhaaosVFXQualityManager::AutoConfigurePoolBudget(int32 QualityLevel)
{
	// Restringe o nível ao intervalo válido (0–4)
	QualityLevel = FMath::Clamp(QualityLevel, 0, 4);
	const EKhaaosVFXQuality TargetQuality = static_cast<EKhaaosVFXQuality>(QualityLevel);

	FKhaaosVFXPoolBudget NewBudget;

	// Configura orçamento baseado no nível de qualidade — mobile-first (Free Fire)
	switch (TargetQuality)
	{
	case EKhaaosVFXQuality::OFF:
		NewBudget.MaxSystemCount = 0;
		NewBudget.MaxParticleCount = 0;
		NewBudget.MaxGPUInstanceCount = 0;
		NewBudget.MaxCPUInstanceCount = 0;
		NewBudget.PoolSizeMB = 0;
		break;

	case EKhaaosVFXQuality::LOW:
		NewBudget.MaxSystemCount = 20;
		NewBudget.MaxParticleCount = 5000;
		NewBudget.MaxGPUInstanceCount = 5000;
		NewBudget.MaxCPUInstanceCount = 1000;
		NewBudget.PoolSizeMB = 32;
		break;

	case EKhaaosVFXQuality::MEDIUM:
		NewBudget.MaxSystemCount = 40;
		NewBudget.MaxParticleCount = 20000;
		NewBudget.MaxGPUInstanceCount = 20000;
		NewBudget.MaxCPUInstanceCount = 3000;
		NewBudget.PoolSizeMB = 64;
		break;

	case EKhaaosVFXQuality::HIGH:
		NewBudget.MaxSystemCount = 60;
		NewBudget.MaxParticleCount = 50000;
		NewBudget.MaxGPUInstanceCount = 50000;
		NewBudget.MaxCPUInstanceCount = 5000;
		NewBudget.PoolSizeMB = 128;
		break;

	case EKhaaosVFXQuality::ULTRA:
		NewBudget.MaxSystemCount = 100;
		NewBudget.MaxParticleCount = 100000;
		NewBudget.MaxGPUInstanceCount = 100000;
		NewBudget.MaxCPUInstanceCount = 10000;
		NewBudget.PoolSizeMB = 256;
		break;

	default:
		// Fallback seguro para MEDIUM
		NewBudget.MaxSystemCount = 40;
		NewBudget.MaxParticleCount = 20000;
		NewBudget.MaxGPUInstanceCount = 20000;
		NewBudget.MaxCPUInstanceCount = 3000;
		NewBudget.PoolSizeMB = 64;
		break;
	}

	// Distribuição percentual do orçamento por categoria VFX
	// Soma = 0.20 + 0.15 + 0.15 + 0.15 + 0.10 + 0.05 + 0.10 + 0.05 + 0.05 = 1.00
	NewBudget.CategoryBudgets.Empty();
	NewBudget.CategoryBudgets.Add(EKhaaosVFXCategory::SPECIES_AURA, 0.20f);
	NewBudget.CategoryBudgets.Add(EKhaaosVFXCategory::WEAPON_MUZZLE, 0.15f);
	NewBudget.CategoryBudgets.Add(EKhaaosVFXCategory::WEAPON_IMPACT, 0.15f);
	NewBudget.CategoryBudgets.Add(EKhaaosVFXCategory::EXPLOSION, 0.15f);
	NewBudget.CategoryBudgets.Add(EKhaaosVFXCategory::KILL_EFFECT, 0.10f);
	NewBudget.CategoryBudgets.Add(EKhaaosVFXCategory::ZONE_WARNING, 0.05f);
	NewBudget.CategoryBudgets.Add(EKhaaosVFXCategory::WEATHER, 0.10f);
	NewBudget.CategoryBudgets.Add(EKhaaosVFXCategory::ENVIRONMENT_AMBIENT, 0.05f);
	NewBudget.CategoryBudgets.Add(EKhaaosVFXCategory::UI_FEEDBACK, 0.05f);

	// Aplica o orçamento configurado
	ApplyPoolBudget(NewBudget);

	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] AutoConfigurePoolBudget — Qualidade %d: Sistemas=%d Particulas=%d Pool=%dMB"),
		QualityLevel, NewBudget.MaxSystemCount, NewBudget.MaxParticleCount, NewBudget.PoolSizeMB);
}

void UKhaaosVFXQualityManager::SetVFXCategoryBudget(EKhaaosVFXCategory Category, float Percent)
{
	// Restringe o percentual ao intervalo válido
	Percent = FMath::Clamp(Percent, 0.0f, 1.0f);

	// Atualiza o orçamento da categoria no budget ativo
	ActiveBudget.CategoryBudgets.Add(Category, Percent);

	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] SetVFXCategoryBudget — Categoria %d ajustada para %.2f%%"),
		static_cast<int32>(Category), Percent * 100.0f);
}

// ==============================================================================
// Configuração de efeitos de eliminação
// ==============================================================================

FKhaaosKillEffectConfig UKhaaosVFXQualityManager::GetKillEffectConfig(EKhaaosKillEffectTier Tier) const
{
	const FKhaaosKillEffectConfig* Config = KillEffectConfigs.Find(Tier);
	if (Config)
	{
		return *Config;
	}

	// Fallback: retorna config vazia (NONE) se tier não encontrado
	UE_LOG(LogKhaaosRun, Warning, TEXT("[VFXQuality] GetKillEffectConfig — tier %d não encontrado, retornando NONE"),
		static_cast<int32>(Tier));

	FKhaaosKillEffectConfig EmptyConfig;
	EmptyConfig.Tier = EKhaaosKillEffectTier::NONE;
	return EmptyConfig;
}

float UKhaaosVFXQualityManager::GetSpeciesVFXBudget(EKhaaosSpecies Species) const
{
	// Cada espécie tem seu VFX de aura mapeado na categoria SPECIES_AURA
	// O orçamento é compartilhado entre as 6 espécies (1/6 cada do orçamento de aura)
	const float* AuraBudget = ActiveBudget.CategoryBudgets.Find(EKhaaosVFXCategory::SPECIES_AURA);
	if (!AuraBudget)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[VFXQuality] GetSpeciesVFXBudget — categoria SPECIES_AURA não encontrada no orçamento"));
		return 0.0f;
	}

	// Cada espécie recebe 1/6 do orçamento de aura total
	// (Huran, Khael, Venex, Onith, Zheers, Skeetw = 6 espécies)
	const float SpeciesShare = (*AuraBudget) / 6.0f;

	UE_LOG(LogKhaaosRun, Verbose, TEXT("[VFXQuality] GetSpeciesVFXBudget — Espécie %d: %.4f do orçamento total (1/6 de %.2f)"),
		static_cast<int32>(Species), SpeciesShare, *AuraBudget);

	return SpeciesShare;
}

// ==============================================================================
// LOD e Culling
// ==============================================================================

EKhaaosVFXQuality UKhaaosVFXQualityManager::CalculateVFXLOD(float DistanceCm) const
{
	// LOD baseado em distância — quanto mais longe, menor a qualidade
	// <5m (500cm) = ULTRA, <15m (1500cm) = HIGH, <30m (3000cm) = MEDIUM,
	// <50m (5000cm) = LOW, além = OFF
	if (DistanceCm < 500.0f)
	{
		return EKhaaosVFXQuality::ULTRA;
	}
	if (DistanceCm < 1500.0f)
	{
		return EKhaaosVFXQuality::HIGH;
	}
	if (DistanceCm < 3000.0f)
	{
		return EKhaaosVFXQuality::MEDIUM;
	}
	if (DistanceCm < 5000.0f)
	{
		return EKhaaosVFXQuality::LOW;
	}

	// Além de 50m — VFX desligado para preservar performance
	return EKhaaosVFXQuality::OFF;
}

bool UKhaaosVFXQualityManager::ShouldCullVFX(EKhaaosVFXCategory Category, float DistanceCm) const
{
	// Obtém a distância de culling da tier de qualidade atual
	const FKhaaosVFXQualityTier* Tier = QualityTiers.Find(CurrentQuality);
	if (!Tier)
	{
		// Sem tier — cull tudo além de 1000cm como segurança
		return DistanceCm > 1000.0f;
	}

	// VFX além da distância de culling de significância devem ser removidos
	if (DistanceCm > Tier->SignificanceCullDistance)
	{
		return true;
	}

	// Verifica se a categoria está acima do orçamento de sistemas
	const int32* CategoryCount = ActiveVFXCounts.Find(Category);
	if (CategoryCount)
	{
		// Calcula o máximo de sistemas para esta categoria baseado no orçamento percentual
		const float* CategoryBudgetPercent = ActiveBudget.CategoryBudgets.Find(Category);
		if (CategoryBudgetPercent)
		{
			const int32 CategoryMaxSystems = FMath::FloorToInt(ActiveBudget.MaxSystemCount * (*CategoryBudgetPercent));
			if (*CategoryCount >= CategoryMaxSystems && CategoryMaxSystems > 0)
			{
				// Categoria acima do orçamento — cull novos sistemas
				return true;
			}
		}
	}

	return false;
}

// ==============================================================================
// Registro de sistemas ativos
// ==============================================================================

void UKhaaosVFXQualityManager::RegisterVFXSystem(EKhaaosVFXCategory Category)
{
	// Incrementa o contador da categoria
	int32& CategoryCount = ActiveVFXCounts.FindOrAdd(Category);
	CategoryCount++;

	// Incrementa o total global
	TotalActiveVFX++;

	UE_LOG(LogKhaaosRun, Verbose, TEXT("[VFXQuality] RegisterVFXSystem — Categoria %d: %d sistemas | Total: %d"),
		static_cast<int32>(Category), CategoryCount, TotalActiveVFX);

	// Alerta se acima do orçamento
	if (IsOverBudget())
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[VFXQuality] ACIMA DO ORÇAMENTO — TotalVFX=%d / MaxSistemas=%d"),
			TotalActiveVFX, ActiveBudget.MaxSystemCount);
	}
}

void UKhaaosVFXQualityManager::UnregisterVFXSystem(EKhaaosVFXCategory Category)
{
	// Decrementa o contador da categoria (mínimo 0)
	int32* CategoryCount = ActiveVFXCounts.Find(Category);
	if (CategoryCount && *CategoryCount > 0)
	{
		(*CategoryCount)--;
	}

	// Decrementa o total global (mínimo 0)
	TotalActiveVFX = FMath::Max(0, TotalActiveVFX - 1);

	UE_LOG(LogKhaaosRun, Verbose, TEXT("[VFXQuality] UnregisterVFXSystem — Categoria %d: %d sistemas | Total: %d"),
		static_cast<int32>(Category), CategoryCount ? *CategoryCount : 0, TotalActiveVFX);
}

int32 UKhaaosVFXQualityManager::GetActiveVFXCount() const
{
	return TotalActiveVFX;
}

bool UKhaaosVFXQualityManager::IsOverBudget() const
{
	// Verifica se o total de sistemas ativos excede o orçamento máximo
	if (TotalActiveVFX > ActiveBudget.MaxSystemCount)
	{
		return true;
	}

	return false;
}

// ==============================================================================
// Debug / Diagnóstico
// ==============================================================================

void UKhaaosVFXQualityManager::DumpVFXState() const
{
	UE_LOG(LogKhaaosRun, Log, TEXT("============================================================"));
	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] DUMP DO ESTADO COMPLETO DO VFX"));
	UE_LOG(LogKhaaosRun, Log, TEXT("============================================================"));

	// Qualidade atual
	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] Qualidade Atual: %d"), static_cast<int32>(CurrentQuality));

	// Tier de qualidade atual
	const FKhaaosVFXQualityTier* Tier = QualityTiers.Find(CurrentQuality);
	if (Tier)
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality]   SpawnRate=%.2f LifeTime=%.2f SimQ=%d GPU=%s Col=%s Light=%s Trail=%s Emitters8+=%s"),
			Tier->SpawnRateMultiplier, Tier->ParticleLifetimeMultiplier, Tier->SimulationQuality,
			Tier->bEnableGPUParticles ? TEXT("S") : TEXT("N"),
			Tier->bEnableCollision ? TEXT("S") : TEXT("N"),
			Tier->bEnableLighting ? TEXT("S") : TEXT("N"),
			Tier->bEnableTrails ? TEXT("S") : TEXT("N"),
			Tier->bEnableEmitters_8Plus ? TEXT("S") : TEXT("N"));
		UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality]   MaxSistemas=%d CullDist=%.0fcm"),
			Tier->MaxSimultaneousSystems, Tier->SignificanceCullDistance);
	}

	// Orçamento do pool
	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] Orçamento do Pool:"));
	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality]   MaxSistemas=%d MaxParticulas=%d"), ActiveBudget.MaxSystemCount, ActiveBudget.MaxParticleCount);
	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality]   GPU=%d CPU=%d Pool=%dMB"), ActiveBudget.MaxGPUInstanceCount, ActiveBudget.MaxCPUInstanceCount, ActiveBudget.PoolSizeMB);

	// Orçamento por categoria
	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] Orçamento por Categoria:"));
	for (const auto& Pair : ActiveBudget.CategoryBudgets)
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality]   Categoria %d: %.2f%%"), static_cast<int32>(Pair.Key), Pair.Value * 100.0f);
	}

	// Contadores de sistemas ativos
	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] Sistemas Ativos por Categoria:"));
	for (const auto& Pair : ActiveVFXCounts)
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality]   Categoria %d: %d sistemas"), static_cast<int32>(Pair.Key), Pair.Value);
	}
	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] Total VFX Ativos: %d"), TotalActiveVFX);
	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] Acima do Orçamento: %s"), IsOverBudget() ? TEXT("SIM") : TEXT("NAO"));

	// Configurações de kill effect
	UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality] Configs de Kill Effect:"));
	for (const auto& Pair : KillEffectConfigs)
	{
		const FKhaaosKillEffectConfig& Config = Pair.Value;
		UE_LOG(LogKhaaosRun, Log, TEXT("[VFXQuality]   Tier %d: Dur=%.1fs Shake=%.2f SlowMo=%.2f@%.1fs Flash=%s Zoom=%s Pri=%d"),
			static_cast<int32>(Config.Tier), Config.Duration, Config.ScreenShakeIntensity,
			Config.SlowMotionTimeScale, Config.SlowMotionDuration,
			Config.bEnableScreenFlash ? TEXT("S") : TEXT("N"),
			Config.bEnableCameraZoom ? TEXT("S") : TEXT("N"),
			Config.Priority);
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("============================================================"));
}
