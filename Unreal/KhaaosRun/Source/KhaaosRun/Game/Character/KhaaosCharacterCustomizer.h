// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// SUBSISTEMA: UKhaaosCharacterCustomizer
// PROPÓSITO: Sistema de personalização de personagens com morph targets para
//            face/corpo, cores de pele/olhos/cabelo, e accessoios cosméticos.
//            Suporta 6 espécies alienígenas com presets de morph por espécie.
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "KhaaosCharacterCustomizer.generated.h"

UENUM(BlueprintType)
enum class EKhaaosMorphCategory : uint8
{
    FaceShape,      // Largura do rosto, queixo, nariz, sobrancelha
    BodyBuild,      // Massa muscular, ombros, cintura
    Height,         // Estatura (escalonamento proporcional)
    SpeciesTrait,   // Traits específicos por espécie (gills, chitin, plumage)
    Expression      // Expressões faciais (não persistentes, animação)
};

UENUM(BlueprintType)
enum class EKhaaosColorChannel : uint8
{
    SkinTone,       // Cor de pele/escama/chitin
    EyeColor,       // Íris
    HairColor,      // Cabelo/plumage/spines
    AccentColor,    // Marcações tribais, bioluminescência
    EmissiveColor   // Brilho de energia (Khael arcanos, Venex cybernetics)
};

USTRUCT(BlueprintType)
struct FKhaaosMorphEntry
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FName MorphTargetName;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float Value = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosMorphCategory Category = EKhaaosMorphCategory::FaceShape;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FText DisplayName;
};

USTRUCT(BlueprintType)
struct FKhaaosSpeciesCustomization
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    EKhaaosSpecies Species = EKhaaosSpecies::NONE;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TArray<FKhaaosMorphEntry> AvailableMorphs;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TMap<EKhaaosColorChannel, TArray<FLinearColor>> ColorPalettes;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FVector2D HeightRange = FVector2D(0.9f, 1.1f);

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    int32 MaxActiveMorphs = 8;
};

UCLASS(ClassGroup = (Khaaos, Character), meta = (BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosCharacterCustomizer : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosCharacterCustomizer();

    void InitializeForSpecies(EKhaaosSpecies Species);
    void ApplyMorphTarget(const FName& MorphName, float Value);
    void ResetAllMorphs();
    void SetColor(EKhaaosColorChannel Channel, const FLinearColor& Color);
    void SetHeightScale(float NormalizedValue);

    const FKhaaosSpeciesCustomization& GetSpeciesCustomization() const { return ActiveCustomization; }
    const TMap<FName, float>& GetActiveMorphValues() const { return ActiveMorphValues; }
    const TMap<EKhaaosColorChannel, FLinearColor>& GetActiveColors() const { return ActiveColors; }

    FString SerializeCustomization() const;
    void DeserializeAndApply(const FString& Serialized);

protected:
    FKhaaosSpeciesCustomization BuildSpeciesPreset(EKhaaosSpecies Species) const;
    void ApplyMorphToSkeletalMesh(const FName& MorphName, float Value);
    void ApplyColorToMaterial(EKhaaosColorChannel Channel, const FLinearColor& Color);

private:
    FKhaaosSpeciesCustomization ActiveCustomization;
    TMap<FName, float> ActiveMorphValues;
    TMap<EKhaaosColorChannel, FLinearColor> ActiveColors;
    float CurrentHeightScale = 1.0f;
    bool bInitialized = false;
};
