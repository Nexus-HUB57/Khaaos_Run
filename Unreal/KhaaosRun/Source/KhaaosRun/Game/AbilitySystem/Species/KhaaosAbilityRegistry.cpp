#include "Game/AbilitySystem/Species/KhaaosAbilityRegistry.h"
#include "Game/AbilitySystem/Species/KhaaosSpeciesAbilitySet.h"
#include "Game/AbilitySystem/Species/KhaaosAbility_HuranAbilities.h"
#include "Game/AbilitySystem/Species/KhaaosAbility_KhaelAbilities.h"
#include "Game/AbilitySystem/Species/KhaaosAbility_OnithAbilities.h"
#include "Game/AbilitySystem/Species/KhaaosAbility_SkeetwAbilities.h"
#include "Game/AbilitySystem/Species/KhaaosAbility_VenexAbilities.h"
#include "Game/AbilitySystem/Species/KhaaosAbility_ZheersAbilities.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "AbilitySystemComponent.h"
#include "KhaaosRun.h"
UKhaaosAbilityRegistry::UKhaaosAbilityRegistry()
{
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Constructed"));
}

void UKhaaosAbilityRegistry::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Initialize — loading all 48 species abilities"));

    // Species ability sets are loaded from data assets by the game mode
    // and registered via RegisterSpeciesAbilitySet().
    // The registry itself is ready to receive registrations.

    RegisterBuiltinSpeciesAbilities();
    bInitialized = true;
    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Initialized and ready for registrations"));
}

void UKhaaosAbilityRegistry::Deinitialize()
{
    Super::Deinitialize();

    SpeciesAbilityMap.Empty();
    TagLookupMap.Empty();
    bInitialized = false;

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Deinitialized — cleared all registrations"));
}

void UKhaaosAbilityRegistry::RegisterSpeciesAbilitySet(UKhaaosSpeciesAbilitySet* AbilitySet)
{
    if (!AbilitySet)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("KhaaosAbilityRegistry::RegisterSpeciesAbilitySet: Null AbilitySet"));
        return;
    }

    const FName SpeciesName = FName(UEnum::GetValueAsString(AbilitySet->Species));

    for (const FKhaaosSpeciesAbilityEntry& Entry : AbilitySet->AbilityEntries)
    {
        RegisterAbility(Entry.AbilityClass, Entry.AbilityTag, SpeciesName);
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Registered %d abilities for species %s"),
        AbilitySet->AbilityEntries.Num(), *SpeciesName.ToString());
}

void UKhaaosAbilityRegistry::RegisterAbility(TSubclassOf<UKhaaosGameplayAbility> AbilityClass,
    const FGameplayTag& AbilityTag, const FName& SpeciesName)
{
    FKhaaosAbilityRegistryEntry Entry;
    Entry.AbilityClass = AbilityClass;
    Entry.AbilityTag = AbilityTag;
    Entry.SpeciesName = SpeciesName;

    // Add to species map
    TArray<FKhaaosAbilityRegistryEntry>& SpeciesEntries = SpeciesAbilityMap.FindOrAdd(SpeciesName);
    SpeciesEntries.Add(Entry);

    // Add to tag lookup
    TagLookupMap.Add(AbilityTag, Entry);

    UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilityRegistry: Registered ability %s for species %s"),
        *AbilityTag.ToString(), *SpeciesName.ToString());
}

TArray<FKhaaosAbilityRegistryEntry> UKhaaosAbilityRegistry::GetAbilitiesForSpecies(const FName& SpeciesName) const
{
    const TArray<FKhaaosAbilityRegistryEntry>* Found = SpeciesAbilityMap.Find(SpeciesName);
    return Found ? *Found : TArray<FKhaaosAbilityRegistryEntry>();
}

FKhaaosAbilityRegistryEntry UKhaaosAbilityRegistry::FindAbilityByTag(const FGameplayTag& Tag) const
{
    const FKhaaosAbilityRegistryEntry* Found = TagLookupMap.Find(Tag);
    return Found ? *Found : FKhaaosAbilityRegistryEntry();
}

int32 UKhaaosAbilityRegistry::GetTotalAbilityCount() const
{
    int32 Total = 0;
    for (const auto& Pair : SpeciesAbilityMap)
    {
        Total += Pair.Value.Num();
    }
    return Total;
}

TArray<FName> UKhaaosAbilityRegistry::GetRegisteredSpecies() const
{
    TArray<FName> Result;
    SpeciesAbilityMap.GetKeys(Result);
    return Result;
}

void UKhaaosAbilityRegistry::RegisterBuiltinSpeciesAbilities()
{
    if (SpeciesAbilityMap.Contains(FName(TEXT("Huran"))) && SpeciesAbilityMap.FindChecked(FName(TEXT("Huran"))).Num() >= 8) return;
    auto Reg = [this](TSubclassOf<UKhaaosGameplayAbility> Cls, const TCHAR* TagStr, const TCHAR* Species)
    { RegisterAbility(Cls, FGameplayTag::RequestGameplayTag(FName(TagStr), false), FName(Species)); };
    Reg(UKhaaosAbility_TidalSurge::StaticClass(), TEXT("Ability.Species.Huran.TidalSurge"), TEXT("Huran"));
    Reg(UKhaaosAbility_AquaShield::StaticClass(), TEXT("Ability.Species.Huran.AquaShield"), TEXT("Huran"));
    Reg(UKhaaosAbility_DiveBomb::StaticClass(), TEXT("Ability.Species.Huran.DiveBomb"), TEXT("Huran"));
    Reg(UKhaaosAbility_FloodZone::StaticClass(), TEXT("Ability.Species.Huran.FloodZone"), TEXT("Huran"));
    Reg(UKhaaosAbility_PressureStrike::StaticClass(), TEXT("Ability.Species.Huran.PressureStrike"), TEXT("Huran"));
    Reg(UKhaaosAbility_GillsRegen::StaticClass(), TEXT("Ability.Species.Huran.GillsRegen"), TEXT("Huran"));
    Reg(UKhaaosAbility_Whirlpool::StaticClass(), TEXT("Ability.Species.Huran.Whirlpool"), TEXT("Huran"));
    Reg(UKhaaosAbility_TsunamiRage::StaticClass(), TEXT("Ability.Species.Huran.TsunamiRage"), TEXT("Huran"));
    Reg(UKhaaosAbility_FrostBolt::StaticClass(), TEXT("Ability.Species.Khael.FrostBolt"), TEXT("Khael"));
    Reg(UKhaaosAbility_CryoWall::StaticClass(), TEXT("Ability.Species.Khael.CryoWall"), TEXT("Khael"));
    Reg(UKhaaosAbility_Blizzard::StaticClass(), TEXT("Ability.Species.Khael.Blizzard"), TEXT("Khael"));
    Reg(UKhaaosAbility_FrozenArmor::StaticClass(), TEXT("Ability.Species.Khael.FrozenArmor"), TEXT("Khael"));
    Reg(UKhaaosAbility_Avalanche::StaticClass(), TEXT("Ability.Species.Khael.Avalanche"), TEXT("Khael"));
    Reg(UKhaaosAbility_Frostbite::StaticClass(), TEXT("Ability.Species.Khael.Frostbite"), TEXT("Khael"));
    Reg(UKhaaosAbility_IceClone::StaticClass(), TEXT("Ability.Species.Khael.IceClone"), TEXT("Khael"));
    Reg(UKhaaosAbility_AbsoluteZero::StaticClass(), TEXT("Ability.Species.Khael.AbsoluteZero"), TEXT("Khael"));
    Reg(UKhaaosAbility_VenomSpit::StaticClass(), TEXT("Ability.Species.Onith.VenomSpit"), TEXT("Onith"));
    Reg(UKhaaosAbility_NoxiousGas::StaticClass(), TEXT("Ability.Species.Onith.NoxiousGas"), TEXT("Onith"));
    Reg(UKhaaosAbility_PlagueTouch::StaticClass(), TEXT("Ability.Species.Onith.PlagueTouch"), TEXT("Onith"));
    Reg(UKhaaosAbility_ToxicHusk::StaticClass(), TEXT("Ability.Species.Onith.ToxicHusk"), TEXT("Onith"));
    Reg(UKhaaosAbility_Contaminate::StaticClass(), TEXT("Ability.Species.Onith.Contaminate"), TEXT("Onith"));
    Reg(UKhaaosAbility_ParasiteDrain::StaticClass(), TEXT("Ability.Species.Onith.ParasiteDrain"), TEXT("Onith"));
    Reg(UKhaaosAbility_BioMimic::StaticClass(), TEXT("Ability.Species.Onith.BioMimic"), TEXT("Onith"));
    Reg(UKhaaosAbility_Pandemic::StaticClass(), TEXT("Ability.Species.Onith.Pandemic"), TEXT("Onith"));
    Reg(UKhaaosAbility_FogCloud::StaticClass(), TEXT("Ability.Species.Skeetw.FogCloud"), TEXT("Skeetw"));
    Reg(UKhaaosAbility_SkyDive::StaticClass(), TEXT("Ability.Species.Skeetw.SkyDive"), TEXT("Skeetw"));
    Reg(UKhaaosAbility_TalonStrike::StaticClass(), TEXT("Ability.Species.Skeetw.TalonStrike"), TEXT("Skeetw"));
    Reg(UKhaaosAbility_WindGust::StaticClass(), TEXT("Ability.Species.Skeetw.WindGust"), TEXT("Skeetw"));
    Reg(UKhaaosAbility_FeatherFlurry::StaticClass(), TEXT("Ability.Species.Skeetw.FeatherFlurry"), TEXT("Skeetw"));
    Reg(UKhaaosAbility_Camouflage::StaticClass(), TEXT("Ability.Species.Skeetw.Camouflage"), TEXT("Skeetw"));
    Reg(UKhaaosAbility_ScoutEye::StaticClass(), TEXT("Ability.Species.Skeetw.ScoutEye"), TEXT("Skeetw"));
    Reg(UKhaaosAbility_StormCall::StaticClass(), TEXT("Ability.Species.Skeetw.StormCall"), TEXT("Skeetw"));
    Reg(UKhaaosAbility_PulseBlast::StaticClass(), TEXT("Ability.Species.Venex.PulseBlast"), TEXT("Venex"));
    Reg(UKhaaosAbility_Overclock::StaticClass(), TEXT("Ability.Species.Venex.Overclock"), TEXT("Venex"));
    Reg(UKhaaosAbility_TargetLock::StaticClass(), TEXT("Ability.Species.Venex.TargetLock"), TEXT("Venex"));
    Reg(UKhaaosAbility_NaniteRepair::StaticClass(), TEXT("Ability.Species.Venex.NaniteRepair"), TEXT("Venex"));
    Reg(UKhaaosAbility_CyberDash::StaticClass(), TEXT("Ability.Species.Venex.CyberDash"), TEXT("Venex"));
    Reg(UKhaaosAbility_ScannerSweep::StaticClass(), TEXT("Ability.Species.Venex.ScannerSweep"), TEXT("Venex"));
    Reg(UKhaaosAbility_StasisField::StaticClass(), TEXT("Ability.Species.Venex.StasisField"), TEXT("Venex"));
    Reg(UKhaaosAbility_Overload::StaticClass(), TEXT("Ability.Species.Venex.Overload"), TEXT("Venex"));
    Reg(UKhaaosAbility_RadBurst::StaticClass(), TEXT("Ability.Species.Zheers.RadBurst"), TEXT("Zheers"));
    Reg(UKhaaosAbility_MutateForm::StaticClass(), TEXT("Ability.Species.Zheers.MutateForm"), TEXT("Zheers"));
    Reg(UKhaaosAbility_FissionShot::StaticClass(), TEXT("Ability.Species.Zheers.FissionShot"), TEXT("Zheers"));
    Reg(UKhaaosAbility_RadAura::StaticClass(), TEXT("Ability.Species.Zheers.RadAura"), TEXT("Zheers"));
    Reg(UKhaaosAbility_ChernobylCharge::StaticClass(), TEXT("Ability.Species.Zheers.ChernobylCharge"), TEXT("Zheers"));
    Reg(UKhaaosAbility_DegenField::StaticClass(), TEXT("Ability.Species.Zheers.DegenField"), TEXT("Zheers"));
    Reg(UKhaaosAbility_HalfLife::StaticClass(), TEXT("Ability.Species.Zheers.HalfLife"), TEXT("Zheers"));
    Reg(UKhaaosAbility_Meltdown::StaticClass(), TEXT("Ability.Species.Zheers.Meltdown"), TEXT("Zheers"));
}
int32 UKhaaosAbilityRegistry::GrantAbilitiesForSpecies(UAbilitySystemComponent* ASC, FName SpeciesName,
    TArray<FGameplayAbilitySpecHandle>& OutGrantedHandles, UObject* SourceObject)
{
    if (!ASC) return 0;
    ClearGrantedAbilities(ASC, OutGrantedHandles);
    TArray<FKhaaosAbilityRegistryEntry> Entries = GetAbilitiesForSpecies(SpeciesName);
    int32 Slot = 0;
    for (const FKhaaosAbilityRegistryEntry& Entry : Entries)
    {
        if (!Entry.AbilityClass) continue;
        FGameplayAbilitySpec Spec(Entry.AbilityClass, 1, Slot, SourceObject);
        Spec.InputID = Slot;
        if (Entry.AbilityTag.IsValid()) Spec.DynamicAbilityTags.AddTag(Entry.AbilityTag);
        const FGameplayAbilitySpecHandle Handle = ASC->GiveAbility(Spec);
        if (Handle.IsValid()) { OutGrantedHandles.Add(Handle); ++Slot; }
    }
    return OutGrantedHandles.Num();
}
void UKhaaosAbilityRegistry::ClearGrantedAbilities(UAbilitySystemComponent* ASC, TArray<FGameplayAbilitySpecHandle>& GrantedHandles)
{
    if (ASC) for (const FGameplayAbilitySpecHandle& H : GrantedHandles) if (H.IsValid()) ASC->ClearAbility(H);
    GrantedHandles.Empty();
}
