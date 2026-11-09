// Khaaos Run — canonical avatar identity validation for server-authoritative spawns.
#pragma once

#include <string>
#include <string_view>

namespace KhaaosAvatarSpawn
{

enum class EResult
{
    Applied,
    AlreadyApplied,
    InvalidAssetId,
    InvalidSkeleton,
    SkeletonMismatch,
};

struct FIdentity
{
    std::string UeAssetId;
    std::string Skeleton;
};

/**
 * Validate the wire projection before it reaches an Unreal actor. The UE
 * adapter is allowed to apply only CHR_* assets and the sex-specific Manny /
 * Gwen rig encoded by the canonical avatar catalog.
 */
EResult Validate(const FIdentity& Identity);

const char* ResultName(EResult Result);

} // namespace KhaaosAvatarSpawn
