// Khaaos Run — Emote System Implementation
// ==========================================

#include "Character/KhaaosEmoteSystem.h"
#include "Components/SkeletalMeshComponent.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimMontage.h"
#include "NiagaraFunctionLibrary.h"
#include "NiagaraComponent.h"
#include "Components/AudioComponent.h"
#include "Kismet/GameplayStatics.h"

// ─── Constructor ────────────────────────────────────────────────────────────

UKhaaosEmoteSystem::UKhaaosEmoteSystem()
{
  PrimaryComponentTick.bCanEverTick = false;

  // Initialize wheel bindings (8 slots)
  WheelBindings.SetNum(8);
  for (int32 i = 0; i < 8; ++i)
  {
    WheelBindings[i] = NAME_None;
  }
}

// ─── Emote Registry ─────────────────────────────────────────────────────────

void UKhaaosEmoteSystem::RegisterEmote(const FKhaaosEmoteDef& Def)
{
  EmoteRegistry.Add(Def.EmoteId, Def);
}

TArray<FKhaaosEmoteDef> UKhaaosEmoteSystem::GetEmotesByCategory(EKhaaosEmoteCategory Category) const
{
  TArray<FKhaaosEmoteDef> Result;
  for (const auto& Pair : EmoteRegistry)
  {
    if (Pair.Value.Category == Category)
    {
      Result.Add(Pair.Value);
    }
  }
  return Result;
}

TArray<FKhaaosEmoteDef> UKhaaosEmoteSystem::GetEmoteWheelEmotes() const
{
  TArray<FKhaaosEmoteDef> Result;
  for (const FName& EmoteId : WheelBindings)
  {
    if (EmoteId != NAME_None)
    {
      const FKhaaosEmoteDef* Def = EmoteRegistry.Find(EmoteId);
      if (Def) Result.Add(*Def);
    }
  }
  return Result;
}

// ─── Playback ───────────────────────────────────────────────────────────────

bool UKhaaosEmoteSystem::PlayEmote(FName EmoteId)
{
  if (bIsPlayingEmote) return false;

  const FKhaaosEmoteDef* Def = EmoteRegistry.Find(EmoteId);
  if (!Def) return false;
  if (!OwnedEmotes.Contains(EmoteId)) return false;

  CurrentEmoteId = EmoteId;
  bIsPlayingEmote = true;
  EmoteStartTime = GetWorld()->GetTimeSeconds();

  // Play montage
  UAnimInstance* Anim = ResolveAnimInstance();
  if (Anim && Def->Montage.IsValid())
  {
    UAnimMontage* Montage = Def->Montage.LoadSynchronous();
    if (Montage)
    {
      Anim->Montage_Play(Montage, 1.f);
    }
  }

  // Spawn VFX + Audio
  SpawnEmoteVFX(*Def);
  PlayEmoteAudio(*Def);

  // Broadcast
  OnEmoteStarted.Broadcast(EmoteId, Def->Category);

  // Auto-end for non-looping emotes
  if (!Def->bIsLooping)
  {
    float Duration = Def->Duration > 0 ? Def->Duration : 3.f;
    FTimerHandle EndTimer;
    GetWorld()->GetTimerManager().SetTimer(EndTimer, [this]()
    {
      StopEmote();
    }, Duration, false);
  }

  return true;
}

void UKhaaosEmoteSystem::StopEmote()
{
  if (!bIsPlayingEmote) return;

  FName PreviousEmote = CurrentEmoteId;

  UAnimInstance* Anim = ResolveAnimInstance();
  if (Anim)
  {
    Anim->Montage_Stop(0.25f);
  }

  CleanupActiveEmote();

  CurrentEmoteId = NAME_None;
  bIsPlayingEmote = false;

  OnEmoteEnded.Broadcast(PreviousEmote);
}

float UKhaaosEmoteSystem::GetEmoteElapsedTime() const
{
  if (!bIsPlayingEmote) return 0.f;
  return GetWorld()->GetTimeSeconds() - EmoteStartTime;
}

// ─── Emote Wheel UI ─────────────────────────────────────────────────────────

void UKhaaosEmoteSystem::BindEmoteToWheelSlot(int32 SlotIndex, FName EmoteId)
{
  if (SlotIndex >= 0 && SlotIndex < WheelBindings.Num())
  {
    WheelBindings[SlotIndex] = EmoteId;
  }
}

FName UKhaaosEmoteSystem::GetWheelSlotEmote(int32 SlotIndex) const
{
  if (SlotIndex >= 0 && SlotIndex < WheelBindings.Num())
  {
    return WheelBindings[SlotIndex];
  }
  return NAME_None;
}

bool UKhaaosEmoteSystem::PlayWheelSlotEmote(int32 SlotIndex)
{
  FName EmoteId = GetWheelSlotEmote(SlotIndex);
  if (EmoteId == NAME_None) return false;
  return PlayEmote(EmoteId);
}

// ─── Shop Integration ───────────────────────────────────────────────────────

void UKhaaosEmoteSystem::GrantEmoteOwnership(FName EmoteId)
{
  OwnedEmotes.Add(EmoteId);
  FKhaaosEmoteDef* Def = EmoteRegistry.Find(EmoteId);
  if (Def) Def->bOwned = true;
}

bool UKhaaosEmoteSystem::IsEmoteOwned(FName EmoteId) const
{
  return OwnedEmotes.Contains(EmoteId);
}

// ─── Internal ───────────────────────────────────────────────────────────────

UAnimInstance* UKhaaosEmoteSystem::ResolveAnimInstance()
{
  if (AnimInstance) return AnimInstance;

  AActor* Owner = GetOwner();
  if (!Owner) return nullptr;

  USkeletalMeshComponent* Mesh = Owner->FindComponentByClass<USkeletalMeshComponent>();
  if (!Mesh) return nullptr;

  AnimInstance = Mesh->GetAnimInstance();
  return AnimInstance;
}

void UKhaaosEmoteSystem::SpawnEmoteVFX(const FKhaaosEmoteDef& Def)
{
  if (!Def.VFX.IsValid()) return;

  UNiagaraSystem* VFX = Def.VFX.LoadSynchronous();
  if (!VFX) return;

  AActor* Owner = GetOwner();
  if (!Owner) return;

  ActiveEmoteVFX = UNiagaraFunctionLibrary::SpawnSystemAttached(
    VFX,
    Owner->FindComponentByClass<USkeletalMeshComponent>(),
    FName("Spine_03"),
    FVector::ZeroVector,
    FRotator::ZeroRotator,
    EAttachLocation::KeepRelativeOffset,
    true
  );
}

void UKhaaosEmoteSystem::PlayEmoteAudio(const FKhaaosEmoteDef& Def)
{
  if (!Def.Sound.IsValid()) return;

  USoundBase* Sound = Def.Sound.LoadSynchronous();
  if (!Sound) return;

  AActor* Owner = GetOwner();
  if (!Owner) return;

  ActiveEmoteAudio = UGameplayStatics::SpawnSoundAttached(
    Sound,
    Owner->FindComponentByClass<USkeletalMeshComponent>(),
    FName("Head"),
    FVector::ZeroVector,
    FRotator::ZeroRotator,
    EAttachLocation::KeepRelativeOffset,
    true
  );
}

void UKhaaosEmoteSystem::CleanupActiveEmote()
{
  if (ActiveEmoteVFX)
  {
    ActiveEmoteVFX->DestroyComponent();
    ActiveEmoteVFX = nullptr;
  }

  if (ActiveEmoteAudio)
  {
    ActiveEmoteAudio->Stop();
    ActiveEmoteAudio = nullptr;
  }
}
