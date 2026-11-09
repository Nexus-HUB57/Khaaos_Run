// Khaaos Run — canonical avatar identity validation for server-authoritative spawns.
#include "Game/Character/KhaaosAvatarSpawnAdapter.h"

#include <array>

namespace
{

bool IsSafeAssetId(std::string_view Value)
{
    if (Value.size() < 8 || Value.rfind("CHR_", 0) != 0)
    {
        return false;
    }

    for (const char Character : Value)
    {
        const bool bAllowed =
            (Character >= 'A' && Character <= 'Z') ||
            (Character >= 'a' && Character <= 'z') ||
            (Character >= '0' && Character <= '9') ||
            Character == '_';
        if (!bAllowed)
        {
            return false;
        }
    }
    return true;
}

bool IsKnownAssetId(std::string_view Value)
{
    static constexpr std::array<std::string_view, 33> KnownIds = {
        "CHR_Zheers_Base",
        "CHR_Zheers_Male_Vanguard", "CHR_Onith_Male_Breacher",
        "CHR_Skeetw_Male_Kage", "CHR_Khael_Male_Medic",
        "CHR_Venex_Male_Hunter", "CHR_Skeetw_Male_Zayn",
        "CHR_Huran_Male_Manoa", "CHR_Overlord_Male_Devan",
        "CHR_Zheers_Female_Valkyrie", "CHR_Skeetw_Female_Ghost",
        "CHR_Skeetw_Female_MeiLing", "CHR_Khael_Female_Amara",
        "CHR_Onith_Female_Kayaen", "CHR_Venex_Female_Freja",
        "CHR_Huran_Female_Soraya", "CHR_Skeetw_Female_Priya",
        "CHR_Zheers_Male_Vulto", "CHR_Skeetw_Male_Eco",
        "CHR_Onith_Male_Ferraz", "CHR_Venex_Male_Grau",
        "CHR_Zheers_Female_Nota", "CHR_Khael_Female_Sirene",
        "CHR_Huran_Female_Soro", "CHR_Skeetw_Female_Coruja",
        "CHR_Khael_Male_Spray", "CHR_Venex_Male_Ventania",
        "CHR_Onith_Male_Corta", "CHR_Khael_Male_Baile",
        "CHR_Venex_Female_Rota", "CHR_Zheers_Female_Cotovela",
        "CHR_Huran_Female_Sombra", "CHR_Skeetw_Female_Pixel",
    };
    for (const std::string_view KnownId : KnownIds)
    {
        if (KnownId == Value) return true;
    }
    return false;
}

bool IsMannyAsset(std::string_view Value)
{
    return Value == "CHR_Zheers_Base" || Value.find("_Male_") != std::string_view::npos;
}

bool IsGwenAsset(std::string_view Value)
{
    return Value.find("_Female_") != std::string_view::npos;
}

} // namespace

namespace KhaaosAvatarSpawn
{

EResult Validate(const FIdentity& Identity)
{
    if (!IsSafeAssetId(Identity.UeAssetId) || !IsKnownAssetId(Identity.UeAssetId))
    {
        return EResult::InvalidAssetId;
    }

    if (Identity.Skeleton != "SK_Manny" && Identity.Skeleton != "SK_Gwen")
    {
        return EResult::InvalidSkeleton;
    }

    if ((IsMannyAsset(Identity.UeAssetId) && Identity.Skeleton != "SK_Manny") ||
        (IsGwenAsset(Identity.UeAssetId) && Identity.Skeleton != "SK_Gwen"))
    {
        return EResult::SkeletonMismatch;
    }

    // An unknown sex marker is rejected instead of silently selecting a mesh.
    if (!IsMannyAsset(Identity.UeAssetId) && !IsGwenAsset(Identity.UeAssetId))
    {
        return EResult::InvalidAssetId;
    }

    return EResult::Applied;
}

const char* ResultName(EResult Result)
{
    switch (Result)
    {
    case EResult::Applied: return "applied";
    case EResult::AlreadyApplied: return "already_applied";
    case EResult::InvalidAssetId: return "invalid_asset_id";
    case EResult::InvalidSkeleton: return "invalid_skeleton";
    case EResult::SkeletonMismatch: return "skeleton_mismatch";
    default: return "unknown";
    }
}

} // namespace KhaaosAvatarSpawn
