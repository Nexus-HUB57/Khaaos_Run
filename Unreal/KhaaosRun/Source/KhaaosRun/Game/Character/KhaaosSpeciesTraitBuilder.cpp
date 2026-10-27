// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Implementação: UKhaaosSpeciesTraitBuilder
// Constrói e aplica traits GAS a partir de definição de espécie.

#include "Game/Character/KhaaosSpeciesTraitBuilder.h"
#include "KhaaosRun.h"
#include "Game/Character/KhaaosSpeciesGAS.h"
#include "AbilitySystemComponent.h"
#include "GameplayEffect.h"
#include "GameplayAbilitySpec.h"
#include "GameplayTagContainer.h"

// ─── Constructor ───────────────────────────────────────────────────────────────

UKhaaosSpeciesTraitBuilder::UKhaaosSpeciesTraitBuilder()
{
    PrimaryComponentTick.bCanEverTick = false;
}

// ─── BeginPlay ────────────────────────────────────────────────────────────────

void UKhaaosSpeciesTraitBuilder::BeginPlay()
{
    Super::BeginPlay();
}

// ─── Trait Building ───────────────────────────────────────────────────────────

FKhaaosSpeciesTraitDef UKhaaosSpeciesTraitBuilder::BuildTraitDefinition(EKhaaosSpecies Species) const
{
    switch (Species)
    {
        case EKhaaosSpecies::HURAN:  return BuildHuranTraits();
        case EKhaaosSpecies::KHAEL:  return BuildKhaelTraits();
        case EKhaaosSpecies::VENEX:  return BuildVenexTraits();
        case EKhaaosSpecies::ONITH:  return BuildOnithTraits();
        case EKhaaosSpecies::ZHEERS: return BuildZheersTraits();
        case EKhaaosSpecies::SKEETW: return BuildSkeetwTraits();
        default:
            UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesTraitBuilder: Espécie NONE — retornando definição vazia"));
            return FKhaaosSpeciesTraitDef();
    }
}

// ─── Apply Traits to GAS ──────────────────────────────────────────────────────

int32 UKhaaosSpeciesTraitBuilder::ApplyTraitsToGAS(const FKhaaosSpeciesTraitDef& TraitDef)
{
    if (TraitDef.Species == EKhaaosSpecies::NONE)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesTraitBuilder: Tentativa de aplicar traits para espécie NONE — ignorado"));
        return 0;
    }

    UAbilitySystemComponent* ASC = GetOwnerASC();
    if (!ASC)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesTraitBuilder: ASC não disponível no owner — traits não aplicados"));
        return 0;
    }

    // Remove traits anteriores se existirem
    if (bTraitsApplied)
    {
        RemoveAllTraits();
    }

    int32 AppliedCount = 0;

    // Aplica GameplayEffects para stats base
    if (GE_BaseHealth)
    {
        FActiveGameplayEffectHandle Handle = ApplyStatEffect(GE_BaseHealth, TraitDef.BaseHealth);
        if (Handle.IsValid())
        {
            ActiveTraitEffectHandles.Add(Handle);
            AppliedCount++;
        }
    }

    if (GE_BaseEnergy)
    {
        FActiveGameplayEffectHandle Handle = ApplyStatEffect(GE_BaseEnergy, TraitDef.BaseEnergy);
        if (Handle.IsValid())
        {
            ActiveTraitEffectHandles.Add(Handle);
            AppliedCount++;
        }
    }

    if (GE_BaseSpeed)
    {
        FActiveGameplayEffectHandle Handle = ApplyStatEffect(GE_BaseSpeed, TraitDef.BaseSpeed);
        if (Handle.IsValid())
        {
            ActiveTraitEffectHandles.Add(Handle);
            AppliedCount++;
        }
    }

    if (GE_BaseShield)
    {
        FActiveGameplayEffectHandle Handle = ApplyStatEffect(GE_BaseShield, TraitDef.BaseShield);
        if (Handle.IsValid())
        {
            ActiveTraitEffectHandles.Add(Handle);
            AppliedCount++;
        }
    }

    // Adiciona tags ao ASC (passive, resistance, bonus)
    if (ASC && TraitDef.PassiveTags.IsValid())
    {
        ASC->AddLooseGameplayTags(TraitDef.PassiveTags);
        AppliedCount += TraitDef.PassiveTags.Num();
    }

    if (ASC && TraitDef.ResistanceTags.IsValid())
    {
        ASC->AddLooseGameplayTags(TraitDef.ResistanceTags);
        AppliedCount += TraitDef.ResistanceTags.Num();
    }

    if (ASC && TraitDef.BonusTags.IsValid())
    {
        ASC->AddLooseGameplayTags(TraitDef.BonusTags);
        AppliedCount += TraitDef.BonusTags.Num();
    }

    // Armazena estado
    CurrentTraitDef = TraitDef;
    bTraitsApplied = true;

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesTraitBuilder: %d traits aplicados para espécie %s (HP=%.0f, Energy=%.0f, Speed=%.0f, Shield=%.0f)"),
        AppliedCount,
        *UEnum::GetDisplayValueAsText(TraitDef.Species).ToString(),
        TraitDef.BaseHealth,
        TraitDef.BaseEnergy,
        TraitDef.BaseSpeed,
        TraitDef.BaseShield);

    OnSpeciesTraitsBuilt.Broadcast(TraitDef.Species, AppliedCount);

    return AppliedCount;
}

// ─── Apply Passive Abilities ──────────────────────────────────────────────────

int32 UKhaaosSpeciesTraitBuilder::ApplyPassiveAbilities(const FKhaaosSpeciesTraitDef& TraitDef)
{
    UAbilitySystemComponent* ASC = GetOwnerASC();
    if (!ASC || !TraitDef.PassiveTags.IsValid())
    {
        return 0;
    }

    int32 GrantedCount = 0;

    // Mapeia passive tags para abilities e concede ao ASC
    // Cada passive tag corresponde a uma ability que é concedida automaticamente
    for (const FGameplayTag& PassiveTag : TraitDef.PassiveTags)
    {
        // Cria uma GameplayAbilitySpec para a passive ability
        // O ability class é resolvido pelo tag-to-ability mapping no SpeciesGAS
        FGameplayAbilitySpec Spec;
        Spec.InputID = static_cast<int32>(PassiveTag.GetID());
        Spec.SourceObject = GetOwner();

        FGameplayAbilitySpecHandle GrantedHandle = ASC->GiveAbility(Spec);
        if (GrantedHandle.IsValid())
        {
            PassiveAbilityHandles.Add(GrantedHandle);
            GrantedCount++;
        }
    }

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesTraitBuilder: %d passive abilities concedidas para espécie %s"),
        GrantedCount,
        *UEnum::GetDisplayValueAsText(TraitDef.Species).ToString());

    return GrantedCount;
}

// ─── Remove All Traits ────────────────────────────────────────────────────────

void UKhaaosSpeciesTraitBuilder::RemoveAllTraits()
{
    UAbilitySystemComponent* ASC = GetOwnerASC();

    // Remove GameplayEffects
    if (ASC)
    {
        for (const FActiveGameplayEffectHandle& Handle : ActiveTraitEffectHandles)
        {
            if (Handle.IsValid())
            {
                ASC->RemoveActiveGameplayEffect(Handle);
            }
        }

        // Remove loose tags
        if (CurrentTraitDef.PassiveTags.IsValid())
        {
            ASC->RemoveLooseGameplayTags(CurrentTraitDef.PassiveTags);
        }
        if (CurrentTraitDef.ResistanceTags.IsValid())
        {
            ASC->RemoveLooseGameplayTags(CurrentTraitDef.ResistanceTags);
        }
        if (CurrentTraitDef.BonusTags.IsValid())
        {
            ASC->RemoveLooseGameplayTags(CurrentTraitDef.BonusTags);
        }

        // Remove passive abilities
        for (const FGameplayAbilitySpecHandle& Handle : PassiveAbilityHandles)
        {
            if (Handle.IsValid())
            {
                ASC->ClearAbility(Handle);
            }
        }
    }

    const EKhaaosSpecies RemovedSpecies = CurrentTraitDef.Species;

    ActiveTraitEffectHandles.Empty();
    PassiveAbilityHandles.Empty();
    CurrentTraitDef = FKhaaosSpeciesTraitDef();
    bTraitsApplied = false;

    UE_LOG(LogKhaaosRun, Log, TEXT("SpeciesTraitBuilder: Todos os traits removidos para espécie %s"),
        *UEnum::GetDisplayValueAsText(RemovedSpecies).ToString());

    OnSpeciesTraitsCleared.Broadcast(RemovedSpecies);
}

// ─── Query ────────────────────────────────────────────────────────────────────

FKhaaosSpeciesTraitDef UKhaaosSpeciesTraitBuilder::GetTraitDefForSpecies(EKhaaosSpecies Species) const
{
    return BuildTraitDefinition(Species);
}

// ─── Species-Specific Trait Builders ──────────────────────────────────────────

FKhaaosSpeciesTraitDef UKhaaosSpeciesTraitBuilder::BuildHuranTraits() const
{
    FKhaaosSpeciesTraitDef Def;
    Def.Species = EKhaaosSpecies::HURAN;
    Def.BaseHealth = 120.0f;
    Def.BaseEnergy = 100.0f;
    Def.BaseSpeed = 580.0f;
    Def.BaseShield = 0.0f;

    // Passivos: WaterBreathing, HPRegen(2/s), SwimSpeed+25%
    Def.PassiveTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Huran.Passive.WaterBreathing"))
    );
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Huran.Passive.HPRegen")));
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Huran.Passive.SwimSpeedBonus")));

    // Bonus: HPRegen rate (2/s), SwimSpeed +25%
    Def.BonusTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Huran.Bonus.HPRegen2"))
    );
    Def.BonusTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Huran.Bonus.SwimSpeed25")));

    return Def;
}

FKhaaosSpeciesTraitDef UKhaaosSpeciesTraitBuilder::BuildKhaelTraits() const
{
    FKhaaosSpeciesTraitDef Def;
    Def.Species = EKhaaosSpecies::KHAEL;
    Def.BaseHealth = 100.0f;
    Def.BaseEnergy = 120.0f;
    Def.BaseSpeed = 550.0f;
    Def.BaseShield = 20.0f;

    // Passivos: CryoResist+40%, CrystalArmor, ManaRegen(3/s)
    Def.PassiveTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Khael.Passive.CryoResist"))
    );
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Khael.Passive.CrystalArmor")));
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Khael.Passive.ManaRegen")));

    // Resistência: Cryo +40%
    Def.ResistanceTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Khael.Resist.Cryo40"))
    );

    // Bonus: ManaRegen rate (3/s)
    Def.BonusTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Khael.Bonus.ManaRegen3"))
    );

    return Def;
}

FKhaaosSpeciesTraitDef UKhaaosSpeciesTraitBuilder::BuildVenexTraits() const
{
    FKhaaosSpeciesTraitDef Def;
    Def.Species = EKhaaosSpecies::VENEX;
    Def.BaseHealth = 90.0f;
    Def.BaseEnergy = 110.0f;
    Def.BaseSpeed = 680.0f;
    Def.BaseShield = 15.0f;

    // Passivos: SpeedBoost+15%, CyberShield, HUDHack
    Def.PassiveTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Venex.Passive.SpeedBoost"))
    );
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Venex.Passive.CyberShield")));
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Venex.Passive.HUDHack")));

    // Bonus: Speed +15%
    Def.BonusTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Venex.Bonus.Speed15"))
    );

    return Def;
}

FKhaaosSpeciesTraitDef UKhaaosSpeciesTraitBuilder::BuildOnithTraits() const
{
    FKhaaosSpeciesTraitDef Def;
    Def.Species = EKhaaosSpecies::ONITH;
    Def.BaseHealth = 150.0f;
    Def.BaseEnergy = 80.0f;
    Def.BaseSpeed = 500.0f;
    Def.BaseShield = 30.0f;

    // Passivos: ToxicResist+50%, CarapaceArmor, TailWhip
    Def.PassiveTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Onith.Passive.ToxicResist"))
    );
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Onith.Passive.CarapaceArmor")));
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Onith.Passive.TailWhip")));

    // Resistência: Toxic +50%
    Def.ResistanceTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Onith.Resist.Toxic50"))
    );

    return Def;
}

FKhaaosSpeciesTraitDef UKhaaosSpeciesTraitBuilder::BuildZheersTraits() const
{
    FKhaaosSpeciesTraitDef Def;
    Def.Species = EKhaaosSpecies::ZHEERS;
    Def.BaseHealth = 100.0f;
    Def.BaseEnergy = 100.0f;
    Def.BaseSpeed = 600.0f;
    Def.BaseShield = 10.0f;

    // Passivos: RadResist+35%, FogStealth, EarPerception
    Def.PassiveTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Zheers.Passive.RadResist"))
    );
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Zheers.Passive.FogStealth")));
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Zheers.Passive.EarPerception")));

    // Resistência: Radiation +35%
    Def.ResistanceTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Zheers.Resist.Rad35"))
    );

    return Def;
}

FKhaaosSpeciesTraitDef UKhaaosSpeciesTraitBuilder::BuildSkeetwTraits() const
{
    FKhaaosSpeciesTraitDef Def;
    Def.Species = EKhaaosSpecies::SKEETW;
    Def.BaseHealth = 85.0f;
    Def.BaseEnergy = 100.0f;
    Def.BaseSpeed = 720.0f;
    Def.BaseShield = 5.0f;

    // Passivos: FlightGlide, FeatherDodge, WindSense
    Def.PassiveTags = FGameplayTagContainer(
        FGameplayTag::RequestGameplayTag(FName("Species.Skeetw.Passive.FlightGlide"))
    );
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Skeetw.Passive.FeatherDodge")));
    Def.PassiveTags.AddTag(FGameplayTag::RequestGameplayTag(FName("Species.Skeetw.Passive.WindSense")));

    return Def;
}

// ─── GAS Helpers ──────────────────────────────────────────────────────────────

UKhaaosSpeciesGAS* UKhaaosSpeciesTraitBuilder::GetOwnerSpeciesGAS() const
{
    AActor* OwnerActor = GetOwner();
    if (!OwnerActor)
    {
        return nullptr;
    }

    // Tenta encontrar no owner diretamente
    UKhaaosSpeciesGAS* SpeciesGAS = OwnerActor->FindComponentByClass<UKhaaosSpeciesGAS>();
    if (SpeciesGAS)
    {
        return SpeciesGAS;
    }

    // Fallback: se o owner é um APawn, busca na chain
    if (APawn* OwnerPawn = Cast<APawn>(OwnerActor))
    {
        return OwnerPawn->FindComponentByClass<UKhaaosSpeciesGAS>();
    }

    return nullptr;
}

UAbilitySystemComponent* UKhaaosSpeciesTraitBuilder::GetOwnerASC() const
{
    UKhaaosSpeciesGAS* SpeciesGAS = GetOwnerSpeciesGAS();
    if (SpeciesGAS)
    {
        return SpeciesGAS->GetAbilitySystemComponent();
    }
    return nullptr;
}

FActiveGameplayEffectHandle UKhaaosSpeciesTraitBuilder::ApplyStatEffect(TSubclassOf<UGameplayEffect> EffectClass, float Magnitude)
{
    UAbilitySystemComponent* ASC = GetOwnerASC();
    if (!ASC || !EffectClass)
    {
        return FActiveGameplayEffectHandle();
    }

    // Cria GameplayEffectSpec com magnitude customizada
    FGameplayEffectContextHandle EffectContext = ASC->MakeEffectContext();
    EffectContext.AddSourceObject(GetOwner());

    FGameplayEffectSpecHandle SpecHandle = ASC->MakeOutgoingSpec(EffectClass, Magnitude, EffectContext);
    if (!SpecHandle.IsValid())
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesTraitBuilder: Falha ao criar spec para effect %s"),
            *EffectClass->GetName());
        return FActiveGameplayEffectHandle();
    }

    // Aplica o effect ao self
    FActiveGameplayEffectHandle ActiveHandle = ASC->ApplyGameplayEffectSpecToSelf(*SpecHandle.Data.Get());
    if (!ActiveHandle.IsValid())
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("SpeciesTraitBuilder: Falha ao aplicar effect %s com magnitude %.2f"),
            *EffectClass->GetName(), Magnitude);
    }

    return ActiveHandle;
}
