// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Sistema de Materiais Estilizados por Espécie — perfil visual alienígena
// Qualidade visual alvo: Free Fire (STYLIZED_PBR com rim light e iridescência)

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Components/SkeletalMeshComponent.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosStylizedMaterialSystem.generated.h"

// ─── Modelos de Shading Estilizados ────────────────────────────────────────────

/** Modelos de shading customizados para as 6 espécies alienígenas. */
UENUM(BlueprintType)
enum class EKhaaosShadingModel : uint8
{
	Unlit              UMETA(DisplayName = "Unlit"),
	DefaultLit         UMETA(DisplayName = "DefaultLit"),
	SubsurfaceProfile  UMETA(DisplayName = "SubsurfaceProfile"),
	ClearCoat          UMETA(DisplayName = "ClearCoat"),
	Hair               UMETA(DisplayName = "Hair"),
	Cloth              UMETA(DisplayName = "Cloth"),
	Eye                UMETA(DisplayName = "Eye"),
	Iridescent         UMETA(DisplayName = "Iridescent"),
	Holographic        UMETA(DisplayName = "Holographic"),
	Crystal            UMETA(DisplayName = "Crystal"),
	ThermalVent        UMETA(DisplayName = "ThermalVent")
};

/** Estilo de material — o jogo usa STYLIZED_PBR como padrão. */
UENUM(BlueprintType)
enum class EKhaaosMaterialStyle : uint8
{
	PHOTOREALISTIC  UMETA(DisplayName = "Photorealistic"),
	STYLIZED_PBR    UMETA(DisplayName = "Stylized PBR"),
	TOON            UMETA(DisplayName = "Toon"),
	WATERCOLOR      UMETA(DisplayName = "Watercolor")
};

/** Efeitos climáticos que modificam os materiais em runtime. */
UENUM(BlueprintType)
enum class EKhaaosWeatherEffect : uint8
{
	NONE       UMETA(DisplayName = "None"),
	RAIN       UMETA(DisplayName = "Rain"),
	DUST       UMETA(DisplayName = "Dust"),
	HEAT_HAZE  UMETA(DisplayName = "Heat Haze"),
	FROST      UMETA(DisplayName = "Frost"),
	TOXIC      UMETA(DisplayName = "Toxic")
};

// ─── Perfis Estilizados por Espécie ───────────────────────────────────────────

/**
 * FKhaaosStylizedProfile
 *
 * Parâmetros estilizados por espécie para sistema de material.
 * Cada espécie tem shading, iridescência, anisotropia, rim light,
 * resposta climática e propriedades PBR base próprias.
 */
USTRUCT(BlueprintType)
struct FKhaaosStylizedProfile
{
	GENERATED_BODY()

	/** Espécie à qual este perfil pertence. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Species")
	EKhaaosSpecies Species = EKhaaosSpecies::NONE;

	/** Modelo de shading — ex: Venex=Holographic, Khael=Crystal, Onith=ThermalVent. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Shading")
	EKhaaosShadingModel ShadingModel = EKhaaosShadingModel::DefaultLit;

	/** Intensidade de iridescência (0-1). Skeetw=0.8, Venex=0.3. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Iridescence", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float IridescenceIntensity = 0.0f;

	/** Ângulo de visão para deslocamento de iridescência (0-360 graus). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Iridescence", meta = (ClampMin = "0.0", ClampMax = "360.0"))
	float IridescenceAngle = 0.0f;

	/** Força de anisotropia (0-1). Skeetw=0.7 para direção de penas. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Anisotropy", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float AnisotropyStrength = 0.0f;

	/** Direção tangente de anisotropia (0-360 graus). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Anisotropy", meta = (ClampMin = "0.0", ClampMax = "360.0"))
	float AnisotropyAngle = 0.0f;

	/** Intensidade do rim light estilizado (0-3). Free Fire usa ~1.0-1.5. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|RimLight", meta = (ClampMin = "0.0", ClampMax = "3.0"))
	float RimLightIntensity = 1.0f;

	/** Cor do rim light — específica por espécie. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|RimLight")
	FLinearColor RimLightColor = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);

	/** Deslocamento de cor na sombra para visual estilizado. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Shadow")
	FLinearColor ShadowColorShift = FLinearColor(0.0f, 0.0f, 0.0f, 0.0f);

	/** Boost de luz ambiente nas sombras (0-2). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Shadow", meta = (ClampMin = "0.0", ClampMax = "2.0"))
	float AmbientBoost = 0.0f;

	/** Nome do perfil de subsurface para referência ao USubsurfaceProfile. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Subsurface")
	FName SubsurfaceProfileName = NAME_None;

	/** Velocidade de pulso emissivo em Hz (Khael runes=2.0). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Emissive", meta = (ClampMin = "0.0"))
	float EmissivePulseSpeed = 0.0f;

	/** Quanto o pulso modula o emissivo (0-1). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Emissive", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float EmissivePulseIntensity = 0.0f;

	/** Resposta à umidade — quanto o wet map afeta (Huran=1.0). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Weather", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float WetnessResponse = 0.0f;

	/** Acumulação de poeira na superfície (0-1). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Weather", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float DustResponse = 0.0f;

	/** Força de distorção por calor (Onith=0.5). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Weather", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float HeatDistortionStrength = 0.0f;

	/** Opacidade de gelo na superfície (0-1). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Weather", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float FrostOpacity = 0.0f;

	/** Modo de estilo do material — STYLIZED_PBR padrão. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Style")
	EKhaaosMaterialStyle StyleMode = EKhaaosMaterialStyle::STYLIZED_PBR;

	/** Rugosidade base da espécie. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|PBR", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float BaseRoughness = 0.5f;

	/** Metalicidade base da espécie. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|PBR", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float BaseMetallic = 0.0f;

	/** Override opcional de UMaterialInterface via soft reference. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Stylized|Override")
	FSoftObjectPath CustomMaterialOverride;
};

// ─── Estado Climático de Material ──────────────────────────────────────────────

/**
 * FKhaaosWeatherMaterialState
 *
 * Estado runtime de clima que modifica os materiais estilizados.
 * Aplicado a todos os MIDs registrados no sistema.
 */
USTRUCT(BlueprintType)
struct FKhaaosWeatherMaterialState
{
	GENERATED_BODY()

	/** Efeito climático ativo. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather")
	EKhaaosWeatherEffect ActiveWeather = EKhaaosWeatherEffect::NONE;

	/** Intensidade geral do efeito climático (0-1). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float WeatherIntensity = 0.0f;

	/** Nível de umidade superficial (0-1). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float WetnessLevel = 0.0f;

	/** Nível de poeira acumulada (0-1). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float DustLevel = 0.0f;

	/** Nível de geada/congelamento (0-1). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float FrostLevel = 0.0f;

	/** Nível de distorção de calor (0-1). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float HeatLevel = 0.0f;
};

// ─── Subsistema de Materiais Estilizados ───────────────────────────────────────

/**
 * UKhaaosStylizedMaterialSystem
 *
 * Subsistema de engine que gerencia perfis de material estilizado
 * para as 6 espécies alienígenas do Khaaos Run.
 *
 * Responsabilidades:
 *   - Construir perfis visuais por espécie (Huran/Khael/Venex/Onith/Zheers/Skeetw)
 *   - Aplicar parâmetros estilizados em MIDs de SkeletalMeshComponents
 *   - Atualizar estado climático em runtime (chuva, poeira, calor, geada)
 *   - Pulsar emissivos por frame (runas Khael, brânquias Huran, tatuagens Zheers)
 *   - Permitir ajustes dinâmicos de iridescência e rim light
 */
UCLASS(Config=Game, defaultconfig)
class UKhaaosStylizedMaterialSystem : public UEngineSubsystem
{
	GENERATED_BODY()

public:

	// ─── Ciclo de Vida do Subsistema ────────────────────────────────────────

	/** Inicializa o subsistema e constrói perfis por espécie. */
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	/** Desinicializa o subsistema e limpa registros. */
	virtual void Deinitialize() override;

	// ─── Construção de Perfis ──────────────────────────────────────────────

	/** Constrói os perfis estilizados para todas as 6 espécies. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StylizedMaterial")
	void BuildSpeciesStylizedProfiles();

	// ─── Aplicação de Perfis ───────────────────────────────────────────────

	/**
	 * Aplica o perfil estilizado da espécie no SkeletalMeshComponent.
	 * Cria MIDs e configura todos os parâmetros escalares/vetoriais.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StylizedMaterial")
	void ApplyStylizedProfile(USkeletalMeshComponent* MeshComp, EKhaaosSpecies Species);

	// ─── Atualização Climática ─────────────────────────────────────────────

	/**
	 * Atualiza o estado climático e aplica a todos os MIDs registrados.
	 * Chamado quando o clima muda no mapa (chuva, poeira, calor, geada).
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StylizedMaterial")
	void UpdateWeatherState(const FKhaaosWeatherMaterialState& WeatherState);

	// ─── Registro de Meshes ────────────────────────────────────────────────

	/** Registra um SkeletalMeshComponent com sua espécie para atualizações. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StylizedMaterial")
	void RegisterSpeciesMesh(USkeletalMeshComponent* MeshComp, EKhaaosSpecies Species);

	/** Remove registro de um SkeletalMeshComponent. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StylizedMaterial")
	void UnregisterSpeciesMesh(USkeletalMeshComponent* MeshComp);

	// ─── Consultas ─────────────────────────────────────────────────────────

	/** Retorna o perfil estilizado de uma espécie. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|StylizedMaterial")
	const FKhaaosStylizedProfile& GetSpeciesProfile(EKhaaosSpecies Species) const;

	// ─── Ajustes Dinâmicos ─────────────────────────────────────────────────

	/** Define iridescência para uma espécie e reaplica nos meshes registrados. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StylizedMaterial")
	void SetIridescence(EKhaaosSpecies Species, float Intensity, float Angle);

	/** Define rim light para uma espécie e reaplica nos meshes registrados. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StylizedMaterial")
	void SetRimLight(EKhaaosSpecies Species, float Intensity, FLinearColor Color);

	/** Ativa efeito climático com intensidade e aplica em todos os MIDs. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StylizedMaterial")
	void SetWeatherEffect(EKhaaosWeatherEffect Effect, float Intensity);

	// ─── Atualização por Frame ─────────────────────────────────────────────

	/**
	 * Atualiza pulso emissivo — chamado a cada frame.
	 * Calcula sin(tempo * velocidade * 2π) * intensidade e aplica "EmissivePulseValue".
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StylizedMaterial")
	void UpdateEmissivePulse(float DeltaTime);

	// ─── Debug ─────────────────────────────────────────────────────────────

	/** Faz dump dos perfis no log para debug. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|StylizedMaterial|Debug")
	void DumpProfiles() const;

private:

	// ─── Estado Interno ────────────────────────────────────────────────────

	/** Perfis estilizados indexados por espécie. */
	UPROPERTY()
	TMap<EKhaaosSpecies, FKhaaosStylizedProfile> SpeciesProfiles;

	/** Meshes registrados indexados por ponteiro, com espécie associada. */
	UPROPERTY()
	TMap<USkeletalMeshComponent*, EKhaaosSpecies> RegisteredMeshes;

	/** Estado climático atual aplicado aos materiais. */
	UPROPERTY()
	FKhaaosWeatherMaterialState CurrentWeather;

	/** Acumulador de tempo para pulso emissivo. */
	UPROPERTY()
	float EmissivePulseTime = 0.0f;
};
