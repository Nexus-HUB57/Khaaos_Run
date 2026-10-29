// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// SUBSISTEMA: UKhaaosVFXQualityManager
// PROPÓSITO: Gerenciamento de orçamento do pool Niagara, qualidade de VFX,
//            LOD baseado em distância e hierarquia de efeitos de eliminação
//            para 6 espécies alienígenas (Huran/Khael/Venex/Onith/Zheers/Skeetw)
//            no Battle Royale Khaaos Run — qualidade VFX alinhada ao Free Fire.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosVFXQualityManager.generated.h"

// ==============================================================================
// ENUMS — Qualidade VFX, Tier de Efeito de Kill, Categoria VFX
// ==============================================================================

/** Níveis de qualidade para efeitos visuais Niagara */
UENUM(BlueprintType)
enum class EKhaaosVFXQuality : uint8
{
	OFF		UMETA(DisplayName = "Off"),
	LOW		UMETA(DisplayName = "Low"),
	MEDIUM	UMETA(DisplayName = "Medium"),
	HIGH	UMETA(DisplayName = "High"),
	ULTRA	UMETA(DisplayName = "Ultra")
};

/** Hierarquia de escalação de efeitos de eliminação — quanto mais raro, mais espetacular */
UENUM(BlueprintType)
enum class EKhaaosKillEffectTier : uint8
{
	NONE				UMETA(DisplayName = "None"),
	NORMAL_KILL			UMETA(DisplayName = "Normal Kill"),
	HEADSHOT			UMETA(DisplayName = "Headshot"),
	STREAK_3			UMETA(DisplayName = "Streak 3"),
	STREAK_5			UMETA(DisplayName = "Streak 5"),
	SPECIAL_ELIMINATION	UMETA(DisplayName = "Special Elimination")
};

/** Categorias de VFX para orçamento e priorização no pool Niagara */
UENUM(BlueprintType)
enum class EKhaaosVFXCategory : uint8
{
	SPECIES_AURA			UMETA(DisplayName = "Species Aura"),
	WEAPON_MUZZLE			UMETA(DisplayName = "Weapon Muzzle"),
	WEAPON_IMPACT			UMETA(DisplayName = "Weapon Impact"),
	EXPLOSION				UMETA(DisplayName = "Explosion"),
	KILL_EFFECT				UMETA(DisplayName = "Kill Effect"),
	ZONE_WARNING			UMETA(DisplayName = "Zone Warning"),
	WEATHER					UMETA(DisplayName = "Weather"),
	ENVIRONMENT_AMBIENT		UMETA(DisplayName = "Environment Ambient"),
	UI_FEEDBACK				UMETA(DisplayName = "UI Feedback")
};

// ==============================================================================
// STRUCTS — Orçamento do Pool, Tier de Qualidade, Config de Kill Effect
// ==============================================================================

/** Configuração do orçamento do pool de sistemas Niagara */
USTRUCT(BlueprintType)
struct FKhaaosVFXPoolBudget
{
	GENERATED_BODY()

	/** Quantidade máxima de sistemas Niagara ativos simultaneamente */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Budget")
	int32 MaxSystemCount = 60;

	/** Quantidade máxima total de partículas em todos os sistemas */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Budget")
	int32 MaxParticleCount = 50000;

	/** Orçamento de instâncias de partícula GPU */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Budget")
	int32 MaxGPUInstanceCount = 100000;

	/** Orçamento de instâncias de partícula CPU */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Budget")
	int32 MaxCPUInstanceCount = 5000;

	/** Orçamento de memória (MB) para o pool de VFX */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Budget")
	int32 PoolSizeMB = 128;

	/** Percentual do total orçado por categoria (soma = 1.0) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Budget")
	TMap<EKhaaosVFXCategory, float> CategoryBudgets;
};

/** Configurações de VFX por nível de qualidade */
USTRUCT(BlueprintType)
struct FKhaaosVFXQualityTier
{
	GENERATED_BODY()

	/** Nível de qualidade desta tier */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	EKhaaosVFXQuality Quality = EKhaaosVFXQuality::MEDIUM;

	/** Multiplicador global de taxa de spawn (0.0–2.0) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	float SpawnRateMultiplier = 1.0f;

	/** Multiplicador de tempo de vida das partículas (0.0–2.0) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	float ParticleLifetimeMultiplier = 1.0f;

	/** Qualidade de simulação Niagara (0=Minimal, 1=Low, 2=Medium, 3=High) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	int32 SimulationQuality = 2;

	/** Habilita partículas GPU (mais performáticas em massa) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	bool bEnableGPUParticles = true;

	/** Habilita colisão de partículas (custo alto) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	bool bEnableCollision = false;

	/** Habilita iluminação de partículas (custo muito alto) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	bool bEnableLighting = false;

	/** Habilita efeitos de ribbon/trail */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	bool bEnableTrails = true;

	/** Permite sistemas com 8+ emissores */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	bool bEnableEmitters_8Plus = true;

	/** Máximo de sistemas Niagara simultâneos para esta tier */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	int32 MaxSimultaneousSystems = 40;

	/** Distância de culling de significância (cm) — VFX além disto são removidos */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Quality")
	float SignificanceCullDistance = 5000.0f;
};

/** Configuração de efeito de eliminação (kill effect) por tier de escalação */
USTRUCT(BlueprintType)
struct FKhaaosKillEffectConfig
{
	GENERATED_BODY()

	/** Tier de escalação deste efeito */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Kill")
	EKhaaosKillEffectTier Tier = EKhaaosKillEffectTier::NONE;

	/** Caminho soft do ativo Niagara para este efeito */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Kill")
	FString VFXAssetPath;

	/** Duração do efeito visual (segundos) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Kill")
	float Duration = 0.5f;

	/** Intensidade do screen shake (0.0–1.0) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Kill")
	float ScreenShakeIntensity = 0.1f;

	/** Escala de tempo para slow-motion (ex: 0.25 para headshot) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Kill")
	float SlowMotionTimeScale = 1.0f;

	/** Duração do slow-motion (segundos) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Kill")
	float SlowMotionDuration = 0.0f;

	/** Habilita flash de tela no momento da eliminação */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Kill")
	bool bEnableScreenFlash = false;

	/** Habilita zoom de câmera no alvo */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Kill")
	bool bEnableCameraZoom = false;

	/** Prioridade — quanto maior, mais importante (não é cortado primeiro) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Khaaos|VFX|Kill")
	int32 Priority = 0;
};

// ==============================================================================
// CLASSE PRINCIPAL — UKhaaosVFXQualityManager
// ==============================================================================

/**
 * Subsistema de engine para gerenciamento de qualidade VFX Niagara.
 * Controla orçamento do pool, tiers de qualidade, LOD por distância
 * e hierarquia de efeitos de eliminação para as 6 espécies do Khaaos Run.
 * Alinhado ao padrão de qualidade VFX do Free Fire — mobile-first com escala.
 */
UCLASS(Config=Game, defaultconfig)
class KHAAOSRUN_API UKhaaosVFXQualityManager : public UEngineSubsystem
{
	GENERATED_BODY()

public:

	// --------------------------------------------------------------------------
	// Ciclo de vida do subsistema
	// --------------------------------------------------------------------------

	/** Inicializa o subsistema — constrói tiers de qualidade e configs de kill */
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	/** Desinicializa o subsistema — limpa contadores e mapas */
	virtual void Deinitialize() override;

	// --------------------------------------------------------------------------
	// Controle de qualidade VFX
	// --------------------------------------------------------------------------

	/** Define o nível de qualidade VFX e aplica configurações correspondentes */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX|Quality")
	void SetVFXQuality(EKhaaosVFXQuality NewQuality);

	/** Retorna o nível de qualidade VFX atual */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX|Quality")
	EKhaaosVFXQuality GetVFXQuality() const;

	// --------------------------------------------------------------------------
	// Orçamento do pool Niagara
	// --------------------------------------------------------------------------

	/** Aplica um orçamento de pool customizado via console commands do Niagara */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX|Budget")
	void ApplyPoolBudget(const FKhaaosVFXPoolBudget& Budget);

	/** Auto-configura o orçamento do pool baseado no nível de qualidade (0–4) */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX|Budget")
	void AutoConfigurePoolBudget(int32 QualityLevel);

	/** Define o percentual de orçamento para uma categoria VFX específica */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX|Budget")
	void SetVFXCategoryBudget(EKhaaosVFXCategory Category, float Percent);

	// --------------------------------------------------------------------------
	// Configuração de efeitos de eliminação
	// --------------------------------------------------------------------------

	/** Retorna a configuração de efeito de eliminação para o tier especificado */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX|Kill")
	FKhaaosKillEffectConfig GetKillEffectConfig(EKhaaosKillEffectTier Tier) const;

	/** Retorna o orçamento de VFX da aura da espécie (categoria SPECIES_AURA) */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX|Species")
	float GetSpeciesVFXBudget(EKhaaosSpecies Species) const;

	// --------------------------------------------------------------------------
	// LOD e Culling
	// --------------------------------------------------------------------------

	/** Calcula o nível de qualidade LOD baseado na distância (cm) */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX|LOD")
	EKhaaosVFXQuality CalculateVFXLOD(float DistanceCm) const;

	/** Verifica se um VFX deve ser cullado baseado na categoria e distância */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX|LOD")
	bool ShouldCullVFX(EKhaaosVFXCategory Category, float DistanceCm) const;

	// --------------------------------------------------------------------------
	// Registro de sistemas ativos
	// --------------------------------------------------------------------------

	/** Registra um sistema VFX ativo na categoria — incrementa contadores */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX|Runtime")
	void RegisterVFXSystem(EKhaaosVFXCategory Category);

	/** Desregistra um sistema VFX ativo da categoria — decrementa contadores */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX|Runtime")
	void UnregisterVFXSystem(EKhaaosVFXCategory Category);

	/** Retorna o total de sistemas VFX ativos */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX|Runtime")
	int32 GetActiveVFXCount() const;

	/** Retorna verdadeiro se o pool está acima do orçamento configurado */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|VFX|Runtime")
	bool IsOverBudget() const;

	// --------------------------------------------------------------------------
	// Debug / Diagnóstico
	// --------------------------------------------------------------------------

	/** Dump do estado completo do VFX para o log — diagnóstico em produção */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|VFX|Debug")
	void DumpVFXState() const;

private:

	// --------------------------------------------------------------------------
	// Construção interna dos dados de qualidade
	// --------------------------------------------------------------------------

	/** Constrói os 5 tiers de qualidade (OFF, LOW, MEDIUM, HIGH, ULTRA) */
	void BuildQualityTiers();

	/** Constrói as 6 configs de efeito de eliminação (NONE → SPECIAL_ELIMINATION) */
	void BuildKillEffectConfigs();

	// --------------------------------------------------------------------------
	// Estado interno
	// --------------------------------------------------------------------------

	/** Nível de qualidade VFX atual */
	UPROPERTY()
	EKhaaosVFXQuality CurrentQuality = EKhaaosVFXQuality::MEDIUM;

	/** Orçamento ativo do pool Niagara */
	UPROPERTY()
	FKhaaosVFXPoolBudget ActiveBudget;

	/** Tiers de qualidade pré-construídos (OFF → ULTRA) */
	UPROPERTY()
	TMap<EKhaaosVFXQuality, FKhaaosVFXQualityTier> QualityTiers;

	/** Configurações de efeito de eliminação por tier (6 tiers) */
	UPROPERTY()
	TMap<EKhaaosKillEffectTier, FKhaaosKillEffectConfig> KillEffectConfigs;

	/** Contagem de sistemas VFX ativos por categoria */
	UPROPERTY()
	TMap<EKhaaosVFXCategory, int32> ActiveVFXCounts;

	/** Total de sistemas VFX ativos (soma de todas as categorias) */
	UPROPERTY()
	int32 TotalActiveVFX = 0;
};
