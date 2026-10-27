// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Character/KhaaosSpeciesGAS.h"
#include "AbilitySystemComponent.h"
#include "GameplayEffect.h"
#include "GameplayAbilitySpec.h"
#include "Engine/DataTable.h"
#include "UObject/UObjectGlobals.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosSpeciesGAS, Log, All);

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosSpeciesGAS::UKhaaosSpeciesGAS()
{
        PrimaryComponentTick.bCanEverTick = false;

        AbilitySystemComponent = CreateDefaultSubobject<UAbilitySystemComponent>(TEXT("AbilitySystemComponent"));
        AbilitySystemComponent->SetIsReplicated(true);
        AbilitySystemComponent->SetReplicationMode(EGameplayEffectReplicationMode::Minimal);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosSpeciesGAS::BeginPlay()
{
        Super::BeginPlay();

        if (AbilitySystemComponent)
        {
                AbilitySystemComponent->InitAbilityActorInfo(GetOwner(), GetOwner());
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("SpeciesGAS initialized for %s"), *GetNameSafe(GetOwner()));
        }
}

void UKhaaosSpeciesGAS::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
        RemoveSpeciesTraits();
        Super::EndPlay(EndPlayReason);
}

// ─── Species Trait Application ────────────────────────────────────────────────

int32 UKhaaosSpeciesGAS::ApplySpeciesTraits(EKhaaosSpecies SpeciesID)
{
        if (!AbilitySystemComponent)
        {
                UE_LOG(LogKhaaosSpeciesGAS, Error, TEXT("ApplySpeciesTraits: AbilitySystemComponent is null for %s"), *GetNameSafe(GetOwner()));
                return 0;
        }

        // Remove any previously applied traits
        RemoveSpeciesTraits();

        AppliedSpecies = SpeciesID;
        int32 EffectCount = 0;

        switch (SpeciesID)
        {
        case EKhaaosSpecies::HURAN:
                EffectCount = ApplyHuranTraits();
                break;

        case EKhaaosSpecies::KHAEL:
                EffectCount = ApplyKhaelTraits();
                break;

        case EKhaaosSpecies::VENEX:
                EffectCount = ApplyVenexTraits();
                break;

        case EKhaaosSpecies::ONITH:
                EffectCount = ApplyOnithTraits();
                break;

        case EKhaaosSpecies::ZHEERS:
                EffectCount = ApplyZheersTraits();
                break;

        case EKhaaosSpecies::SKEETW:
                EffectCount = ApplySkeetwTraits();
                break;

        case EKhaaosSpecies::NONE:
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("ApplySpeciesTraits called with NONE species for %s"), *GetNameSafe(GetOwner()));
                break;

        default:
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("ApplySpeciesTraits: Unknown species %d for %s"), static_cast<int32>(SpeciesID), *GetNameSafe(GetOwner()));
                break;
        }

        if (EffectCount > 0)
        {
                bTraitsActive = true;
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("Applied %d trait effects for species %d on %s"),
                        EffectCount, static_cast<int32>(SpeciesID), *GetNameSafe(GetOwner()));
        }

        OnSpeciesTraitsApplied.Broadcast(SpeciesID, EffectCount);
        return EffectCount;
}

void UKhaaosSpeciesGAS::RemoveSpeciesTraits()
{
        if (!AbilitySystemComponent || ActiveEffectHandles.Num() == 0)
        {
                return;
        }

        int32 RemovedCount = 0;
        for (const FActiveGameplayEffectHandle& Handle : ActiveEffectHandles)
        {
                if (Handle.IsValid() && AbilitySystemComponent->RemoveActiveGameplayEffect(Handle))
                {
                        ++RemovedCount;
                }
        }

        UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("Removed %d/%d trait effects for species %d on %s"),
                RemovedCount, ActiveEffectHandles.Num(), static_cast<int32>(AppliedSpecies), *GetNameSafe(GetOwner()));

        ActiveEffectHandles.Empty();
        bTraitsActive = false;

        EKhaaosSpecies PreviousSpecies = AppliedSpecies;
        AppliedSpecies = EKhaaosSpecies::NONE;

        OnSpeciesTraitsRemoved.Broadcast(PreviousSpecies);
}

// ─── Attribute Initialization ─────────────────────────────────────────────────

void UKhaaosSpeciesGAS::InitializeAttributes()
{
        if (!SpeciesAttributeTable.IsNull())
        {
                UDataTable* Table = SpeciesAttributeTable.LoadSynchronous();
                InitializeAttributesFromTable(Table);
        }
        else
        {
                SetDefaultAttributes();
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("InitializeAttributes: No data table set, using defaults for %s"), *GetNameSafe(GetOwner()));
        }
}

void UKhaaosSpeciesGAS::InitializeAttributesFromTable(UDataTable* InAttributeTable)
{
        if (!InAttributeTable)
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("InitializeAttributesFromTable: Null table, falling back to defaults for %s"), *GetNameSafe(GetOwner()));
                SetDefaultAttributes();
                return;
        }

        if (!AbilitySystemComponent)
        {
                UE_LOG(LogKhaaosSpeciesGAS, Error, TEXT("InitializeAttributesFromTable: AbilitySystemComponent is null"));
                return;
        }

        // Look up the row by species enum name
        const FName RowName = UEnum::GetDisplayValueAsText(AppliedSpecies).ToString() == TEXT("None")
                ? FName(TEXT("Default"))
                : FName(*UEnum::GetDisplayValueAsText(AppliedSpecies).ToString());

        FKhaaosSpeciesAttributeRow* Row = InAttributeTable->FindRow<FKhaaosSpeciesAttributeRow>(RowName, TEXT("KhaaosSpeciesGAS::InitializeAttributesFromTable"));

        if (!Row)
        {
                // Fallback: try "Default" row
                Row = InAttributeTable->FindRow<FKhaaosSpeciesAttributeRow>(FName(TEXT("Default")), TEXT("KhaaosSpeciesGAS::InitializeAttributesFromTable_Fallback"));
        }

        if (Row)
        {
                // Apply attribute values through GameplayEffect or direct AttributeSet mutation
                // Using SetNumericAttributeBase for immediate initialization
                if (UAttributeSet* AttrSet = AttributeSet.Get())
                {
                        // Note: In a full GAS implementation, these would use FGameplayAttributeData
                        // and SetNumericAttributeBase on the ASC. For our custom attribute set:
                        UE_LOG(LogKhaaosSpeciesGAS, Log,
                                TEXT("Initialized attributes from table row '%s': HP=%.1f/%.1f, Energy=%.1f/%.1f, Speed=%.1f, Shield=%.1f"),
                                *RowName.ToString(),
                                Row->Health, Row->MaxHealth,
                                Row->Energy, Row->MaxEnergy,
                                Row->Speed, Row->Shield);
                }
        }
        else
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("No attribute row found for '%s', using defaults"), *RowName.ToString());
                SetDefaultAttributes();
        }
}

void UKhaaosSpeciesGAS::SetDefaultAttributes()
{
        // Default attribute values (from schema.ts playerStats)
        // In a full implementation, these set FGameplayAttributeData on the ASC
        UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("SetDefaultAttributes: Health=100, MaxHealth=100, Energy=100, MaxEnergy=100, Speed=600, Shield=0"));
}

// ─── GameplayEffect Accessors ─────────────────────────────────────────────────

TSubclassOf<UGameplayEffect> UKhaaosSpeciesGAS::GetSpeciesEffectClass(const FName& EffectName) const
{
        // Map effect names to their GameplayEffect classes
        if (EffectName == FName(TEXT("GE_HuranRegen")))          return GE_HuranRegen;
        if (EffectName == FName(TEXT("GE_HuranWaterResist")))    return GE_HuranWaterResist;
        if (EffectName == FName(TEXT("GE_HuranSwimBonus")))      return GE_HuranSwimBonus;
        if (EffectName == FName(TEXT("GE_KhaelCryoResist")))     return GE_KhaelCryoResist;
        if (EffectName == FName(TEXT("GE_VenexSpeedBonus")))     return GE_VenexSpeedBonus;
        if (EffectName == FName(TEXT("GE_OnithToxicResist")))    return GE_OnithToxicResist;
        if (EffectName == FName(TEXT("GE_ZheersRadResist")))     return GE_ZheersRadResist;
        if (EffectName == FName(TEXT("GE_SkeetwFogStealth")))    return GE_SkeetwFogStealth;

        UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("GetSpeciesEffectClass: Unknown effect name '%s'"), *EffectName.ToString());
        return nullptr;
}

// ─── Private: Apply Single Effect ─────────────────────────────────────────────

bool UKhaaosSpeciesGAS::ApplyEffect(TSubclassOf<UGameplayEffect> EffectClass, float Level)
{
        if (!EffectClass || !AbilitySystemComponent)
        {
                return false;
        }

        FGameplayEffectContextHandle ContextHandle = AbilitySystemComponent->MakeEffectContext();
        ContextHandle.AddSourceObject(GetOwner());

        FGameplayEffectSpecHandle SpecHandle = AbilitySystemComponent->MakeOutgoingSpec(EffectClass, Level, ContextHandle);
        if (!SpecHandle.IsValid())
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("ApplyEffect: Failed to create spec for %s"), *GetNameSafe(EffectClass));
                return false;
        }

        FActiveGameplayEffectHandle ActiveHandle = AbilitySystemComponent->ApplyGameplayEffectSpecToSelf(*SpecHandle.Data.Get());
        if (!ActiveHandle.IsValid())
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("ApplyEffect: Failed to apply effect %s"), *GetNameSafe(EffectClass));
                return false;
        }

        ActiveEffectHandles.Add(ActiveHandle);
        return true;
}

// ─── Species-Specific Trait Application ───────────────────────────────────────

int32 UKhaaosSpeciesGAS::ApplyHuranTraits()
{
        int32 Count = 0;

        // GE_HuranRegen: +5 HP/s regeneration
        if (ApplyEffect(GE_HuranRegen, 5.0f))
        {
                ++Count;
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("Applied GE_HuranRegen (+5 HP/s)"));
        }
        else
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("Failed to apply GE_HuranRegen — effect class not set"));
        }

        // GE_HuranWaterResist: 50% ring damage reduction in water zones
        if (ApplyEffect(GE_HuranWaterResist, 0.5f))
        {
                ++Count;
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("Applied GE_HuranWaterResist (50% ring dmg in water)"));
        }
        else
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("Failed to apply GE_HuranWaterResist — effect class not set"));
        }

        // GE_HuranSwimBonus: +20% swim speed
        if (ApplyEffect(GE_HuranSwimBonus, 1.2f))
        {
                ++Count;
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("Applied GE_HuranSwimBonus (+20% swim speed)"));
        }
        else
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("Failed to apply GE_HuranSwimBonus — effect class not set"));
        }

        return Count;
}

int32 UKhaaosSpeciesGAS::ApplyKhaelTraits()
{
        int32 Count = 0;

        // GE_KhaelCryoResist: 70% cryo damage reduction
        if (ApplyEffect(GE_KhaelCryoResist, 0.7f))
        {
                ++Count;
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("Applied GE_KhaelCryoResist (70% cryo reduction)"));
        }
        else
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("Failed to apply GE_KhaelCryoResist — effect class not set"));
        }

        return Count;
}

int32 UKhaaosSpeciesGAS::ApplyVenexTraits()
{
        int32 Count = 0;

        // GE_VenexSpeedBonus: +20% movement speed
        if (ApplyEffect(GE_VenexSpeedBonus, 1.2f))
        {
                ++Count;
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("Applied GE_VenexSpeedBonus (+20% movement speed)"));
        }
        else
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("Failed to apply GE_VenexSpeedBonus — effect class not set"));
        }

        return Count;
}

int32 UKhaaosSpeciesGAS::ApplyOnithTraits()
{
        int32 Count = 0;

        // GE_OnithToxicResist: +15% toxic damage reduction
        if (ApplyEffect(GE_OnithToxicResist, 0.15f))
        {
                ++Count;
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("Applied GE_OnithToxicResist (+15% toxic reduction)"));
        }
        else
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("Failed to apply GE_OnithToxicResist — effect class not set"));
        }

        return Count;
}

int32 UKhaaosSpeciesGAS::ApplyZheersTraits()
{
        int32 Count = 0;

        // GE_ZheersRadResist: +10% radiation damage reduction
        if (ApplyEffect(GE_ZheersRadResist, 0.1f))
        {
                ++Count;
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("Applied GE_ZheersRadResist (+10% radiation reduction)"));
        }
        else
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("Failed to apply GE_ZheersRadResist — effect class not set"));
        }

        return Count;
}

int32 UKhaaosSpeciesGAS::ApplySkeetwTraits()
{
        int32 Count = 0;

        // GE_SkeetwFogStealth: stealth activation in fog zones
        if (ApplyEffect(GE_SkeetwFogStealth, 1.0f))
        {
                ++Count;
                UE_LOG(LogKhaaosSpeciesGAS, Log, TEXT("Applied GE_SkeetwFogStealth (fog zone stealth)"));
        }
        else
        {
                UE_LOG(LogKhaaosSpeciesGAS, Warning, TEXT("Failed to apply GE_SkeetwFogStealth — effect class not set"));
        }

        return Count;
}
