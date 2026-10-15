// Khaaos Run - Devs Ph.D | UE5.8 | Shared Enums
// Copyright Nexus-HUB57. All Rights Reserved.
// ═══════════════════════════════════════════════════════════════════════════════
// DEDUPLICATED: EKhaaosRarity was in 3 separate headers (Species, Weapon, Loot).
// Now all files include this single source of truth.
// ═══════════════════════════════════════════════════════════════════════════════
#pragma once

#include "CoreMinimal.h"
#include "KhaaosEnums.generated.h"

// ─── Rarity Enum (SHARED) ─────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosRarity : uint8
{
    Comum       UMETA(DisplayName = "COMUM"),
    Raro        UMETA(DisplayName = "RARO"),
    Epico       UMETA(DisplayName = "EPICO"),
    Lendario    UMETA(DisplayName = "LENDARIO"),
    Mitico      UMETA(DisplayName = "MITICO")
};

// ─── Loot Type Enum (SHARED) ──────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EKhaaosLootType : uint8
{
    Curativo    UMETA(DisplayName = "CURATIVO"),
    Defesa      UMETA(DisplayName = "DEFESA"),
    Utilidade   UMETA(DisplayName = "UTILIDADE"),
    Recurso     UMETA(DisplayName = "RECURSO")
};

// ─── Weapon Fire Mode (SHARED) ────────────────────────────────────────────────

UENUM(BlueprintType)
enum class EWeaponFireMode : uint8
{
    Semi        UMETA(DisplayName = "SEMI"),
    Auto        UMETA(DisplayName = "AUTO"),
    Burst       UMETA(DisplayName = "BURST"),
    Melee       UMETA(DisplayName = "MELEE"),
    Charge      UMETA(DisplayName = "CHARGE")
};

// ─── Rarity Weight Helper (inline, no allocation) ─────────────────────────────

namespace KhaaosRarity
{
    /** Get spawn weight for a rarity level (COMUM=55, RARO=28, EPICO=12, LENDARIO=4, MITICO=1). */
    inline int32 GetWeight(EKhaaosRarity Rarity)
    {
        switch (Rarity)
        {
        case EKhaaosRarity::Comum:    return 55;
        case EKhaaosRarity::Raro:     return 28;
        case EKhaaosRarity::Epico:    return 12;
        case EKhaaosRarity::Lendario: return 4;
        case EKhaaosRarity::Mitico:   return 1;
        default:                      return 28;
        }
    }

    /** Get rarity from FName string (for legacy compat). */
    inline EKhaaosRarity FromFName(FName Name)
    {
        const FString S = Name.ToString();
        if (S == TEXT("COMUM"))    return EKhaaosRarity::Comum;
        if (S == TEXT("RARO"))     return EKhaaosRarity::Raro;
        if (S == TEXT("EPICO"))    return EKhaaosRarity::Epico;
        if (S == TEXT("LENDARIO")) return EKhaaosRarity::Lendario;
        if (S == TEXT("MITICO"))   return EKhaaosRarity::Mitico;
        return EKhaaosRarity::Raro;
    }

    /** Get linear color for rarity (for UI glow effects). */
    inline FLinearColor GetColor(EKhaaosRarity Rarity)
    {
        switch (Rarity)
        {
        case EKhaaosRarity::Comum:    return FLinearColor(0.6f, 0.6f, 0.6f, 1.0f); // Gray
        case EKhaaosRarity::Raro:     return FLinearColor(0.2f, 0.6f, 1.0f, 1.0f); // Blue
        case EKhaaosRarity::Epico:    return FLinearColor(0.6f, 0.2f, 1.0f, 1.0f); // Purple
        case EKhaaosRarity::Lendario: return FLinearColor(1.0f, 0.5f, 0.0f, 1.0f); // Orange
        case EKhaaosRarity::Mitico:   return FLinearColor(1.0f, 0.0f, 0.0f, 1.0f); // Red
        default:                      return FLinearColor::White;
        }
    }
}
