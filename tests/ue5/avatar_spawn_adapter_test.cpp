#include <cassert>
#include <string>

#include "Game/Character/KhaaosAvatarSpawnAdapter.h"

using KhaaosAvatarSpawn::EResult;
using KhaaosAvatarSpawn::FIdentity;

int main()
{
    assert(KhaaosAvatarSpawn::Validate({"CHR_Zheers_Male_Vanguard", "SK_Manny"}) == EResult::Applied);
    assert(KhaaosAvatarSpawn::Validate({"CHR_Zheers_Female_Valkyrie", "SK_Gwen"}) == EResult::Applied);
    assert(KhaaosAvatarSpawn::Validate({"CHR_Zheers_Base", "SK_Manny"}) == EResult::Applied);

    assert(KhaaosAvatarSpawn::Validate({"CHR_Zheers_Male_Vanguard", "SK_Gwen"}) == EResult::SkeletonMismatch);
    assert(KhaaosAvatarSpawn::Validate({"CHR_Zheers_Female_Valkyrie", "SK_Manny"}) == EResult::SkeletonMismatch);
    assert(KhaaosAvatarSpawn::Validate({"../ClientSuppliedMesh", "SK_Manny"}) == EResult::InvalidAssetId);
    assert(KhaaosAvatarSpawn::Validate({"CHR_Zheers_Male_Vanguard", "UE5_Mannequin"}) == EResult::InvalidSkeleton);
    assert(KhaaosAvatarSpawn::Validate({"CHR_UnknownVariant", "SK_Manny"}) == EResult::InvalidAssetId);
    assert(KhaaosAvatarSpawn::Validate({"CHR_Fake_Male_Test", "SK_Manny"}) == EResult::InvalidAssetId);

    assert(std::string(KhaaosAvatarSpawn::ResultName(EResult::SkeletonMismatch)) == "skeleton_mismatch");
    return 0;
}
