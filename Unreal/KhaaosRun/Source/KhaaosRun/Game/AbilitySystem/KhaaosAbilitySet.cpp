// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AbilitySystem/KhaaosAbilitySet.h"
#include "Game/AbilitySystem/KhaaosGameplayAbility.h"
#include "KhaaosRun.h"

#include "AbilitySystemComponent.h"

// ─── FKhaaosAbilitySet_GrantedHandles ──────────────────────────────────────────

void FKhaaosAbilitySet_GrantedHandles::RemoveFromAbilitySystem(UAbilitySystemComponent* ASC)
{
        if (!ASC)
        {
                return;
        }

        for (const FGameplayAbilitySpecHandle& Handle : AbilitySpecHandles)
        {
                if (Handle.IsValid())
                {
                        ASC->ClearAbility(Handle);
                }
        }

        AbilitySpecHandles.Empty();
}

bool FKhaaosAbilitySet_GrantedHandles::IsEmpty() const
{
        return AbilitySpecHandles.Num() == 0;
}

// ─── UKhaaosAbilitySet ────────────────────────────────────────────────────────

UKhaaosAbilitySet::UKhaaosAbilitySet()
{
}

void UKhaaosAbilitySet::GiveAbilities(UAbilitySystemComponent* ASC,
        FKhaaosAbilitySet_GrantedHandles& OutGrantedHandles,
        UObject* SourceObject) const
{
        if (!ASC)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAbilitySet::GiveAbilities - Null ASC"));
                return;
        }

        if (!ASC->IsOwnerActorAuthoritative())
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAbilitySet::GiveAbilities - Not authoritative, skipping grant"));
                return;
        }

        for (const FKhaaosAbilityGrantEntry& Entry : AbilityGrantEntries)
        {
                if (!Entry.AbilityClass)
                {
                        UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAbilitySet::GiveAbilities - Null ability class in entry, skipping"));
                        continue;
                }

                // Create ability spec
                FGameplayAbilitySpec AbilitySpec(Entry.AbilityClass, Entry.Level, SourceObject);

                // Associate input tag with the spec (for Enhanced Input binding)
                if (Entry.InputTag.IsValid())
                {
                        AbilitySpec.DynamicAbilityTags.AddTag(Entry.InputTag);
                }

                // Give the ability to the ASC
                FGameplayAbilitySpecHandle GrantedHandle = ASC->GiveAbility(AbilitySpec);

                OutGrantedHandles.AbilitySpecHandles.Add(GrantedHandle);

                UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilitySet::GiveAbilities - Granted %s (level %d, input: %s)"),
                        *Entry.AbilityClass->GetName(), Entry.Level,
                        Entry.InputTag.IsValid() ? *Entry.InputTag.ToString() : TEXT("None"));
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilitySet::GiveAbilities - Granted %d abilities from set %s"),
                AbilityGrantEntries.Num(), *GetName());
}

void UKhaaosAbilitySet::RemoveAbilities(UAbilitySystemComponent* ASC,
        FKhaaosAbilitySet_GrantedHandles& GrantedHandles)
{
        if (!ASC)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("KhaaosAbilitySet::RemoveAbilities - Null ASC"));
                return;
        }

        for (const FGameplayAbilitySpecHandle& Handle : GrantedHandles.AbilitySpecHandles)
        {
                if (Handle.IsValid())
                {
                        ASC->ClearAbility(Handle);
                }
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("KhaaosAbilitySet::RemoveAbilities - Removed %d abilities"),
                GrantedHandles.AbilitySpecHandles.Num());

        GrantedHandles.AbilitySpecHandles.Empty();
}
