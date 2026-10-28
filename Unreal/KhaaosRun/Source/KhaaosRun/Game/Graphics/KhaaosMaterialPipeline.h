// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosMaterialPipeline
// PROPÓSITO: Pipeline completo de processamento de materiais — define passes de
//            material (BaseColor, Normal, Emissive, ORM, Subsurface, ClearCoat,
//            WaterWetMap, SpeciesTrait), perfis por espécie com necessidades
//            específicas, e configuração de async streaming por texture group.
//            Cada espécie alienígena tem requisitos visuais únicos:
//            - Huran:  subsurface (pele aquática), wet map, emissive (brânquias)
//            - Khael:  clear coat (armadura cristalina), emissive (runas), ORM (rúnico)
//            - Venex:  clear coat (chrome cyber), emissive (holograma), normal (cyber pattern)
//            - Onith:  normal (chitin bumps), ORM (carapaça metálica), emissive (thermal vents)
//            - Zheers: subsurface (tecido auricular), emissive (tattoo glow), ORM (orgânico)
//            - Skeetw: subsurface (barba de pena), normal (direção de pena), emissive (iridescência)
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosMaterialPipeline.generated.h"

// ─── Material Pass Enumeration ────────────────────────────────────────────────

/** Passes de material suportados pelo pipeline. */
UENUM(BlueprintType)
enum class EKhaaosMaterialPass : uint8
{
    BASE_COLOR       UMETA(DisplayName = "Base Color"),       // Albedo/difusa principal
    NORMAL_MAP       UMETA(DisplayName = "Normal Map"),       // Tangent-space normals
    EMISSIVE         UMETA(DisplayName = "Emissive"),         // Glow/bioluminescência
    ORM              UMETA(DisplayName = "ORM"),              // Occlusion/Roughness/Metallic packed
    SUBSURFACE       UMETA(DisplayName = "Subsurface"),       // Subsurface scattering (pele, penas)
    CLEAR_COAT       UMETA(DisplayName = "Clear Coat"),       // Clear coat layer (cristal, chrome)
    WATER_WET_MAP    UMETA(DisplayName = "Water Wet Map"),    // Wetness/umidade para Huran
    SPECIES_TRAIT    UMETA(DisplayName = "Species Trait")     // Pass específico por espécie
};

// ─── Material Pass Configuration ──────────────────────────────────────────────

/** Configuração de um pass de material individual. */
USTRUCT(BlueprintType)
struct FKhaaosMaterialPassConfig
{
    GENERATED_BODY()

    /** Tipo de pass */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosMaterialPass Pass = EKhaaosMaterialPass::BASE_COLOR;

    /** Se este pass está habilitado */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bEnabled = true;

    /** Texture group para streaming priority */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 TextureGroup = 0;

    /** Mip bias para este pass (-1 = high quality, 1 = save memory) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "-2", ClampMax = "3"))
    int32 MipBias = 0;

    /** Configuração de compressão de textura */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 CompressionSetting = 0;

    /** Se texturas deste pass devem ser streamadas async */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bStreamAsync = true;
};

// ─── Species Material Profile ─────────────────────────────────────────────────

/** Perfil de material completo para uma espécie alienígena. */
USTRUCT(BlueprintType)
struct FKhaaosSpeciesMaterialProfile
{
    GENERATED_BODY()

    /** Espécie deste perfil */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosSpecies Species = EKhaaosSpecies::NONE;

    /** Passes de material configurados para esta espécie */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TArray<FKhaaosMaterialPassConfig> Passes;

    /** Intensidade emissive padrão para esta espécie */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "10.0"))
    float EmissiveIntensity = 1.0f;

    /** Cor de subsurface scattering */
    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FLinearColor SubsurfaceColor = FLinearColor(1.0f, 0.4f, 0.2f);

    /** Override de Roughness (-1 = usar default do material) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "-1.0", ClampMax = "1.0"))
    float ORMOverrideRoughness = -1.0f;

    /** Override de Metallic (-1 = usar default do material) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "-1.0", ClampMax = "1.0"))
    float ORMOverrideMetallic = -1.0f;

    /** Override de Occlusion (-1 = usar default do material) */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "-1.0", ClampMax = "1.0"))
    float ORMOverrideOcclusion = -1.0f;
};

// ─── Material Pipeline Subsystem ──────────────────────────────────────────────

/**
 * UKhaaosMaterialPipeline — Pipeline completo de processamento de materiais.
 *
 * Define passes de material (BaseColor, Normal, Emissive, ORM, Subsurface,
 * ClearCoat, WaterWetMap, SpeciesTrait), constrói perfis por espécie com
 * necessidades visuais específicas, e configura async streaming por texture group.
 *
 * Cada uma das 6 espécies alienígenas tem um perfil de material único que
 * define quais passes são necessários, suas prioridades de streaming, e
 * parâmetros de runtime (emissive intensity, subsurface color, ORM overrides).
 */
UCLASS(Config = Game, defaultconfig)
class KHAAOSRUN_API UKhaaosMaterialPipeline : public UEngineSubsystem
{
    GENERATED_BODY()

public:
    // ─── Lifecycle ──────────────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize(FSubsystemCollectionBase& Collection) override;

    // ─── Species Material Profiles ──────────────────────────────────────────

    /** Constrói perfis de material para todas as 6 espécies.
     *  Cada espécie tem passes específicos:
     *  - Huran:  subsurface (aquatic skin), wet map, emissive (gills)
     *  - Khael:  clear coat (crystal armor), emissive (rune glow), ORM (metallic runes)
     *  - Venex:  clear coat (chrome cyber), emissive (hologram), normal (cyber pattern)
     *  - Onith:  normal (chitin bumps), ORM (carapace metallic), emissive (thermal vents)
     *  - Zheers: subsurface (ear tissue), emissive (tattoo glow), ORM (organic)
     *  - Skeetw: subsurface (feather barb), normal (feather direction), emissive (iridescence)
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MaterialPipeline")
    void BuildSpeciesMaterialProfiles();

    // ─── Material Application ───────────────────────────────────────────────

    /** Aplica perfil de material específico da espécie a um skeletal mesh component.
     *  Cria MaterialInstanceDynamic e configura parâmetros (emissive, subsurface, ORM).
     *  @param MeshComp - Skeletal mesh para aplicar material
     *  @param Species - Espécie cujo perfil será aplicado
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MaterialPipeline")
    void ApplyMaterialProfile(class USkeletalMeshComponent* MeshComp, EKhaaosSpecies Species);

    // ─── Async Streaming Configuration ──────────────────────────────────────

    /** Configura prioridades de streaming assíncrono por texture group.
     *  Texturas de personagem (alta prioridade) são streamadas primeiro,
     *  texturas de VFX e ambiente (baixa prioridade) depois.
     */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MaterialPipeline")
    void ConfigureAsyncStreaming();

    // ─── Query ──────────────────────────────────────────────────────────────

    /** Obtém o perfil de material para uma espécie. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MaterialPipeline")
    const FKhaaosSpeciesMaterialProfile& GetSpeciesMaterialProfile(EKhaaosSpecies Species) const;

    /** Obtém a configuração de um pass específico para uma espécie.
     *  @return true se o pass foi encontrado, false caso contrário
     */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MaterialPipeline")
    bool GetMaterialPassConfig(EKhaaosSpecies Species, EKhaaosMaterialPass Pass, FKhaaosMaterialPassConfig& OutConfig) const;

    /** Verifica se um pass está habilitado para uma espécie. */
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|MaterialPipeline")
    bool IsPassEnabled(EKhaaosSpecies Species, EKhaaosMaterialPass Pass) const;

    /** Debug: dump perfis de material para console. */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|MaterialPipeline")
    void DumpMaterialProfiles() const;

protected:

    /** Constrói perfil de material para uma espécie individual. */
    FKhaaosSpeciesMaterialProfile BuildSingleSpeciesProfile(EKhaaosSpecies Species) const;

    /** Constrói configuração de pass de material. */
    FKhaaosMaterialPassConfig MakePassConfig(EKhaaosMaterialPass Pass, bool bEnabled, int32 TextureGroup, int32 MipBias, int32 CompressionSetting, bool bStreamAsync) const;

private:

    /** Perfis de material por espécie */
    UPROPERTY(Transient)
    TMap<EKhaaosSpecies, FKhaaosSpeciesMaterialProfile> SpeciesProfiles;

    /** Texture group priority map para async streaming */
    TMap<int32, float> StreamingPriorities;

    /** Singleton default para queries que falham */
    static FKhaaosSpeciesMaterialProfile DefaultProfile;
};
