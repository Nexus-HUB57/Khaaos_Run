// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Blueprints/KhaaosBlueprintLibrary.h"
#include "Game/Data/KhaaosAssetRegistrySubsystem.h"
#include "KhaaosRun.h"

#include "Engine/World.h"

// ─── Species Helpers ───────────────────────────────────────────────────────────

UKhaaosSpeciesDataAsset* UKhaaosBlueprintLibrary::GetSpeciesByID(UObject* WorldContextObject, FName SpeciesID)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return nullptr;

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
   if (!Registry) return nullptr;

    return Registry->GetSpeciesByID(SpeciesID);
}

TArray<UKhaaosSpeciesDataAsset*> UKhaaosBlueprintLibrary::GetAllSpecies(UObject* WorldContextObject)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return {};

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return {};

    return Registry->GetAllSpecies();
}

TArray<UKhaaosSpeciesDataAsset*> UKhaaosBlueprintLibrary::GetSpeciesForWorld(UObject* WorldContextObject, FName WorldID)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return {};

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return {};

    return Registry->GetSpeciesForWorld(WorldID);
}

// ─── Weapon Helpers ────────────────────────────────────────────────────────────

UKhaaosWeaponDataAsset* UKhaaosBlueprintLibrary::GetWeaponByID(UObject* WorldContextObject, FName WeaponID)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return nullptr;

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return nullptr;

    return Registry->GetWeaponByID(WeaponID);
}

TArray<UKhaaosWeaponDataAsset*> UKhaaosBlueprintLibrary::GetWeaponsByCategory(UObject* WorldContextObject, FName CategoryTag)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return {};

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return {};

    TArray<UKhaaosWeaponDataAsset*> Result;
    for (UKhaaosWeaponDataAsset* Weapon : Registry->GetAllWeapons())
    {
        if (Weapon && Weapon->CategoryTag == CategoryTag)
        {
            Result.Add(Weapon);
        }
    }
    return Result;
}

TArray<UKhaaosWeaponDataAsset*> UKhaaosBlueprintLibrary::GetWeaponsByRarity(UObject* WorldContextObject, FName RarityTag)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return {};

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return {};

    TArray<UKhaaosWeaponDataAsset*> Result;
    for (UKhaaosWeaponDataAsset* Weapon : Registry->GetAllWeapons())
    {
        if (Weapon && Weapon->RarityTag == RarityTag)
        {
            Result.Add(Weapon);
        }
    }
    return Result;
}

float UKhaaosBlueprintLibrary::CalculateDamageAtDistance(const UKhaaosWeaponDataAsset* Weapon, float DistanceMeters)
{
    if (!Weapon) return 0.0f;
    return Weapon->CalculateDamageAtDistance(DistanceMeters);
}

float UKhaaosBlueprintLibrary::CalculateDPS(const UKhaaosWeaponDataAsset* Weapon)
{
    if (!Weapon) return 0.0f;
    return Weapon->CalculateDPS();
}

float UKhaaosBlueprintLibrary::TimeToEmptyMagazine(const UKhaaosWeaponDataAsset* Weapon)
{
    if (!Weapon) return 0.0f;
    return Weapon->TimeToEmptyMagazine();
}

TArray<UKhaaosWeaponDataAsset*> UKhaaosBlueprintLibrary::GetWeaponsBySlot(UObject* WorldContextObject, FName SlotTag)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return {};

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return {};

    TArray<UKhaaosWeaponDataAsset*> Result;
    for (UKhaaosWeaponDataAsset* Weapon : Registry->GetAllWeapons())
    {
        if (Weapon && Weapon->Slot == SlotTag)
        {
            Result.Add(Weapon);
        }
    }
    return Result;
}

FText UKhaaosBlueprintLibrary::GetFireModeDisplayName(EWeaponFireMode FireMode)
{
    static const TMap<EWeaponFireMode, FText> Names = {
        { EWeaponFireMode::Semi,   FText::FromString("Semi") },
        { EWeaponFireMode::Auto,   FText::FromString("Auto") },
        { EWeaponFireMode::Burst,  FText::FromString("Burst") },
        { EWeaponFireMode::Melee,  FText::FromString("Melee") },
        { EWeaponFireMode::Charge, FText::FromString("Charge") }
    };

    if (const FText* Found = Names.Find(FireMode))
    {
        return *Found;
    }
    return FText::FromString("Unknown");
}

// ─── Loot Item Helpers ─────────────────────────────────────────────────────────

UKhaaosLootItemDataAsset* UKhaaosBlueprintLibrary::GetLootItemByID(UObject* WorldContextObject, FName ItemID)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return nullptr;

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return nullptr;

    return Registry->GetLootItemByID(ItemID);
}

TArray<UKhaaosLootItemDataAsset*> UKhaaosBlueprintLibrary::GetLootByType(UObject* WorldContextObject, FName TypeTag)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return {};

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return {};

    TArray<UKhaaosLootItemDataAsset*> Result;
    for (UKhaaosLootItemDataAsset* Item : Registry->GetAllLootItems())
    {
        if (Item && Item->TypeTag == TypeTag)
        {
            Result.Add(Item);
        }
    }
    return Result;
}

TArray<UKhaaosLootItemDataAsset*> UKhaaosBlueprintLibrary::GetLootByRarity(UObject* WorldContextObject, FName RarityTag)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return {};

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return {};

    TArray<UKhaaosLootItemDataAsset*> Result;
    for (UKhaaosLootItemDataAsset* Item : Registry->GetAllLootItems())
    {
        if (Item && Item->RarityTag == RarityTag)
        {
            Result.Add(Item);
        }
    }
    return Result;
}

// ─── World Config Helpers ──────────────────────────────────────────────────────

UKhaaosWorldConfigDataAsset* UKhaaosBlueprintLibrary::GetWorldConfig(UObject* WorldContextObject, FName WorldID)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return nullptr;

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return nullptr;

    return Registry->GetWorldConfigByID(WorldID);
}

TArray<UKhaaosWorldConfigDataAsset*> UKhaaosBlueprintLibrary::GetWorldSequence(UObject* WorldContextObject)
{
    UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
    if (!World) return {};

    UKhaaosAssetRegistrySubsystem* Registry = World->GetSubsystem<UKhaaosAssetRegistrySubsystem>();
    if (!Registry) return {};

    return Registry->GetAllWorldConfigs();
}

bool UKhaaosBlueprintLibrary::IsFinalWorld(const UKhaaosWorldConfigDataAsset* WorldConfig)
{
    if (!WorldConfig) return false;
    return WorldConfig->IsFinalWorld();
}

// ─── Rarity Color Helpers ──────────────────────────────────────────────────────

FLinearColor UKhaaosBlueprintLibrary::GetRarityColor(FName Rarity)
{
    // COMUM=Gray, INCOMUM=Green, RARO=Blue, EPICO=Purple, LENDARIO=Gold, MITICO=Red
    static TMap<FName, FLinearColor> Colors = {
        { FName("COMUM"),     FLinearColor(0.6f, 0.6f, 0.6f) },
        { FName("INCOMUM"),   FLinearColor(0.0f, 0.8f, 0.0f) },
        { FName("RARO"),      FLinearColor(0.0f, 0.4f, 1.0f) },
        { FName("EPICO"),     FLinearColor(0.6f, 0.2f, 1.0f) },
        { FName("LENDARIO"),  FLinearColor(1.0f, 0.8f, 0.0f) },
        { FName("MITICO"),   FLinearColor(1.0f, 0.1f, 0.1f) }
    };

    if (const FLinearColor* Found = Colors.Find(Rarity))
    {
        return *Found;
    }
    return FLinearColor::White;
}

FText UKhaaosBlueprintLibrary::GetRarityDisplayName(FName Rarity)
{
    static TMap<FName, FText> Names = {
        { FName("COMUM"),    FText::FromString("Comum") },
        { FName("INCOMUM"),  FText::FromString("Incomum") },
        { FName("RARO"),     FText::FromString("Raro") },
        { FName("EPICO"),    FText::FromString("Epico") },
        { FName("LENDARIO"), FText::FromString("Lendario") },
        { FName("MITICO"),  FText::FromString("Mitico") }
    };

    if (const FText* Found = Names.Find(Rarity))
    {
        return *Found;
    }
    return FText::FromName(Rarity);
}

// ─── Economy Helpers ───────────────────────────────────────────────────────────

FString UKhaaosBlueprintLibrary::FormatKRC(int64 Amount)
{
    // Format with comma separators: 1,000,000
    FString Result = FString::FromInt(Amount);
    FString Formatted;

    int32 Count = 0;
    for (int32 i = Result.Len() - 1; i >= 0; --i)
    {
        if (Count > 0 && Count % 3 == 0)
        {
            Formatted = TEXT(",") + Formatted;
        }
        Formatted = FString::Chr(Result[i]) + Formatted;
        ++Count;
    }

    return Formatted + TEXT(" KRC");
}

int32 UKhaaosBlueprintLibrary::CalculateSupplyAdjustedPrice(int32 BasePrice, float SupplyPressureFactor, int32 CirculatingCount)
{
    // Supply-adjusted pricing from EconomyEngine.ts
    // Price = BasePrice * (1 + SupplyPressure / CirculatingCount)
    if (CirculatingCount <= 0) CirculatingCount = 1;
    float Adjusted = BasePrice * (1.0f + SupplyPressureFactor / CirculatingCount);
    return FMath::RoundToInt(Adjusted);
}
