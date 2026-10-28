// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// IMPLEMENTAÇÃO: UKhaaosCharacterCustomizer
// Morph targets, color channels, species-specific presets, serialization.
// DATA: 2026-10-27
// ==============================================================================

#include "KhaaosCharacterCustomizer.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/Character.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonSerializer.h"

UKhaaosCharacterCustomizer::UKhaaosCharacterCustomizer()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UKhaaosCharacterCustomizer::InitializeForSpecies(EKhaaosSpecies Species)
{
    ActiveCustomization = BuildSpeciesPreset(Species);
    bInitialized = true;

    for (const auto& Pair : ActiveCustomization.ColorPalettes)
    {
        if (Pair.Value.Num() > 0)
        {
            ActiveColors.Add(Pair.Key, Pair.Value[0]);
        }
    }

    ActiveMorphValues.Empty();
    CurrentHeightScale = 1.0f;

    UE_LOG(LogTemp, Display, TEXT("[CharacterCustomizer] Inicializado para espécie %s. %d morphs disponíveis."),
        *UEnum::GetDisplayValueAsText(Species).ToString(),
        ActiveCustomization.AvailableMorphs.Num());
}

void UKhaaosCharacterCustomizer::ApplyMorphTarget(const FName& MorphName, float Value)
{
    if (!bInitialized) return;

    const float ClampedValue = FMath::Clamp(Value, 0.0f, 1.0f);

    if (!ActiveMorphValues.Contains(MorphName) && ActiveMorphValues.Num() >= ActiveCustomization.MaxActiveMorphs)
    {
        UE_LOG(LogTemp, Warning, TEXT("[CharacterCustomizer] Budget de morphs atingido (%d)."),
            ActiveCustomization.MaxActiveMorphs);
        return;
    }

    ActiveMorphValues.Add(MorphName, ClampedValue);
    ApplyMorphToSkeletalMesh(MorphName, ClampedValue);
}

void UKhaaosCharacterCustomizer::ResetAllMorphs()
{
    for (const auto& Pair : ActiveMorphValues)
    {
        ApplyMorphToSkeletalMesh(Pair.Key, 0.0f);
    }
    ActiveMorphValues.Empty();
    CurrentHeightScale = 1.0f;
}

void UKhaaosCharacterCustomizer::SetColor(EKhaaosColorChannel Channel, const FLinearColor& Color)
{
    if (!bInitialized) return;
    ActiveColors.Add(Channel, Color);
    ApplyColorToMaterial(Channel, Color);
}

void UKhaaosCharacterCustomizer::SetHeightScale(float NormalizedValue)
{
    if (!bInitialized) return;

    const float Clamped = FMath::Clamp(NormalizedValue, 0.0f, 1.0f);
    const float MinScale = ActiveCustomization.HeightRange.X;
    const float MaxScale = ActiveCustomization.HeightRange.Y;
    CurrentHeightScale = FMath::Lerp(MinScale, MaxScale, Clamped);

    if (ACharacter* OwnerChar = Cast<ACharacter>(GetOwner()))
    {
        const FVector CurrentScale = OwnerChar->GetActorScale3D();
        OwnerChar->SetActorScale3D(FVector(CurrentHeightScale, CurrentHeightScale, CurrentHeightScale));
    }
}

FKhaaosSpeciesCustomization UKhaaosCharacterCustomizer::BuildSpeciesPreset(EKhaaosSpecies Species) const
{
    FKhaaosSpeciesCustomization Customization;
    Customization.Species = Species;

    // Morph targets comuns a todas as espécies
    Customization.AvailableMorphs = {
        {FName("Face_Width"),       0.0f, EKhaaosMorphCategory::FaceShape, FText::FromString("Largura Facial")},
        {FName("Chin_Prominence"),  0.0f, EKhaaosMorphCategory::FaceShape, FText::FromString("Proeminência do Queixo")},
        {FName("Nose_Size"),        0.0f, EKhaaosMorphCategory::FaceShape, FText::FromString("Tamanho do Nariz")},
        {FName("Brow_Ridge"),       0.0f, EKhaaosMorphCategory::FaceShape, FText::FromString("Arco Superciliar")},
        {FName("Body_Muscle"),      0.0f, EKhaaosMorphCategory::BodyBuild,  FText::FromString("Massa Muscular")},
        {FName("Body_Shoulders"),   0.0f, EKhaaosMorphCategory::BodyBuild,  FText::FromString("Largura de Ombros")},
        {FName("Body_Waist"),       0.0f, EKhaaosMorphCategory::BodyBuild,  FText::FromString("Cintura")}
    };

    switch (Species)
    {
    case EKhaaosSpecies::HURAN:
        Customization.AvailableMorphs.Append({
            {FName("Gill_Size"),      0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Tamanho de Brânquias")},
            {FName("Webbing_Extent"), 0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Extensão de Membranas")}
        });
        Customization.HeightRange = FVector2D(0.92f, 1.08f);
        Customization.ColorPalettes.Add(EKhaaosColorChannel::SkinTone, {
            FLinearColor(0.15f, 0.35f, 0.25f), FLinearColor(0.20f, 0.45f, 0.35f), FLinearColor(0.10f, 0.25f, 0.40f)
        });
        Customization.ColorPalettes.Add(EKhaaosColorChannel::EmissiveColor, {
            FLinearColor(0.0f, 1.0f, 0.8f), FLinearColor(0.0f, 0.8f, 1.0f)
        });
        break;

    case EKhaaosSpecies::KHAEL:
        Customization.AvailableMorphs.Append({
            {FName("Crystal_Size"),   0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Tamanho de Cristais")},
            {FName("Rune_Glow"),      0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Intensidade Rúnica")}
        });
        Customization.HeightRange = FVector2D(0.88f, 1.12f);
        Customization.ColorPalettes.Add(EKhaaosColorChannel::EmissiveColor, {
            FLinearColor(0.6f, 0.2f, 1.0f), FLinearColor(1.0f, 0.3f, 0.5f)
        });
        break;

    case EKhaaosSpecies::VENEX:
        Customization.AvailableMorphs.Append({
            {FName("Cyber_Implant"),  0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Extensão de Implantes")},
            {FName("Optic_Lens"),     0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Tipo de Lente Ótica")}
        });
        Customization.HeightRange = FVector2D(0.90f, 1.10f);
        Customization.ColorPalettes.Add(EKhaaosColorChannel::EmissiveColor, {
            FLinearColor(0.0f, 1.0f, 0.4f), FLinearColor(1.0f, 0.0f, 0.3f)
        });
        break;

    case EKhaaosSpecies::ONITH:
        Customization.AvailableMorphs.Append({
            {FName("Chitin_Density"), 0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Densidade de Quitina")},
            {FName("Tail_Length"),    0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Comprimento da Cauda")}
        });
        Customization.HeightRange = FVector2D(0.85f, 1.15f);
        Customization.ColorPalettes.Add(EKhaaosColorChannel::SkinTone, {
            FLinearColor(0.25f, 0.35f, 0.10f), FLinearColor(0.40f, 0.25f, 0.10f), FLinearColor(0.15f, 0.15f, 0.10f)
        });
        break;

    case EKhaaosSpecies::ZHEERS:
        Customization.AvailableMorphs.Append({
            {FName("Ear_Point"),      0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Ponta das Orelhas")},
            {FName("Tattoo_Pattern"), 0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Padrão Tribal")}
        });
        Customization.HeightRange = FVector2D(0.93f, 1.07f);
        break;

    case EKhaaosSpecies::SKEETW:
        Customization.AvailableMorphs.Append({
            {FName("Plumage_Volume"), 0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Volume de Plumas")},
            {FName("Beak_Shape"),     0.0f, EKhaaosMorphCategory::SpeciesTrait, FText::FromString("Formato do Bico")}
        });
        Customization.HeightRange = FVector2D(0.87f, 1.13f);
        Customization.ColorPalettes.Add(EKhaaosColorChannel::HairColor, {
            FLinearColor(0.8f, 0.6f, 0.2f), FLinearColor(0.2f, 0.5f, 0.8f), FLinearColor(0.9f, 0.2f, 0.1f)
        });
        break;

    default:
        break;
    }

    // Paleta de olhos comum a todas as espécies
    Customization.ColorPalettes.Add(EKhaaosColorChannel::EyeColor, {
        FLinearColor(0.8f, 0.8f, 0.8f),   // Prata
        FLinearColor(0.9f, 0.7f, 0.1f),   // Âmbar
        FLinearColor(0.1f, 0.6f, 0.9f),   // Azul
        FLinearColor(0.2f, 0.8f, 0.2f),   // Verde
        FLinearColor(0.8f, 0.1f, 0.1f),   // Vermelho
        FLinearColor(0.6f, 0.2f, 0.8f)    // Violeta
    });

    return Customization;
}

void UKhaaosCharacterCustomizer::ApplyMorphToSkeletalMesh(const FName& MorphName, float Value)
{
    if (ACharacter* OwnerChar = Cast<ACharacter>(GetOwner()))
    {
        if (USkeletalMeshComponent* MeshComp = OwnerChar->GetMesh())
        {
            MeshComp->SetMorphTarget(MorphName, Value);
        }
    }
}

void UKhaaosCharacterCustomizer::ApplyColorToMaterial(EKhaaosColorChannel Channel, const FLinearColor& Color)
{
    if (ACharacter* OwnerChar = Cast<ACharacter>(GetOwner()))
    {
        if (USkeletalMeshComponent* MeshComp = OwnerChar->GetMesh())
        {
            if (UMaterialInstanceDynamic* MID = MeshComp->CreateAndSetMID_Gameplay(0))
            {
                FName ParamName;
                switch (Channel)
                {
                case EKhaaosColorChannel::SkinTone:      ParamName = FName("SkinTone"); break;
                case EKhaaosColorChannel::EyeColor:       ParamName = FName("EyeColor"); break;
                case EKhaaosColorChannel::HairColor:      ParamName = FName("HairColor"); break;
                case EKhaaosColorChannel::AccentColor:    ParamName = FName("AccentColor"); break;
                case EKhaaosColorChannel::EmissiveColor:  ParamName = FName("EmissiveColor"); break;
                default: return;
                }
                MID->SetVectorParameterValue(ParamName, Color);
            }
        }
    }
}

FString UKhaaosCharacterCustomizer::SerializeCustomization() const
{
    TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();

    TSharedRef<FJsonObject> MorphsObj = MakeShared<FJsonObject>();
    for (const auto& Pair : ActiveMorphValues)
    {
        MorphsObj->SetNumberField(Pair.Key.ToString(), Pair.Value);
    }
    Root->SetObjectField(TEXT("morphs"), MorphsObj);

    TSharedRef<FJsonObject> ColorsObj = MakeShared<FJsonObject>();
    for (const auto& Pair : ActiveColors)
    {
        const FString Key = UEnum::GetDisplayValueAsText(Pair.Key).ToString();
        TSharedRef<FJsonObject> ColorObj = MakeShared<FJsonObject>();
        ColorObj->SetNumberField(TEXT("R"), Pair.Value.R);
        ColorObj->SetNumberField(TEXT("G"), Pair.Value.G);
        ColorObj->SetNumberField(TEXT("B"), Pair.Value.B);
        ColorObj->SetNumberField(TEXT("A"), Pair.Value.A);
        ColorsObj->SetObjectField(Key, ColorObj);
    }
    Root->SetObjectField(TEXT("colors"), ColorsObj);
    Root->SetNumberField(TEXT("heightScale"), CurrentHeightScale);

    FString Output;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
    FJsonSerializer::Serialize(Root, Writer);
    return Output;
}

void UKhaaosCharacterCustomizer::DeserializeAndApply(const FString& Serialized)
{
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Serialized);
    TSharedPtr<FJsonObject> Root;
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    if (const TSharedPtr<FJsonObject>* MorphsObj = nullptr; Root->TryGetObjectField(TEXT("morphs"), MorphsObj))
    {
        for (const auto& Pair : (*MorphsObj)->Values)
        {
            if (Pair.Value.IsValid() && Pair.Value->Type == EJson::Number)
            {
                ApplyMorphTarget(FName(*Pair.Key), Pair.Value->AsNumber());
            }
        }
    }

    if (Root->HasField(TEXT("heightScale")))
    {
        SetHeightScale(static_cast<float>(Root->GetNumberField(TEXT("heightScale"))));
    }
}
