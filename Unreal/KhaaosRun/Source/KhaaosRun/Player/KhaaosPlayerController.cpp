// Khaaos Run — CIGKV player controller

#include "Player/KhaaosPlayerController.h"
#include "Game/Level/KhaaosCIGKVLevel.h"
#include "Game/UI/KhaaosHUD.h"
#include "Game/UI/Widgets/KhaaosHUDWidget.h"
#include "Game/World/CIGKV/KhaaosZuCinematicComponent.h"
#include "Kismet/GameplayStatics.h"

void AKhaaosPlayerController::ServerSubmitZuChoice_Implementation(uint8 ChoiceIndex)
{
    if (!HasAuthority())
    {
        return;
    }

    AKhaaosCIGKVLevel* CIGKVLevel = Cast<AKhaaosCIGKVLevel>(
        UGameplayStatics::GetActorOfClass(this, AKhaaosCIGKVLevel::StaticClass()));
    if (!CIGKVLevel || !CIGKVLevel->ResolveZuDecision(this, ChoiceIndex))
    {
        UE_LOG(LogTemp, Warning, TEXT("[CIGKV] Ignored Zu choice without an active entry"));
    }
}

void AKhaaosPlayerController::ClientBeginZuEntry_Implementation(
    uint8 VariantIndex,
    FText Prompt,
    FText OptionA,
    FText OptionB,
    float CinematicDuration,
    float ResponseTimeout)
{
    // 1) Spawn (or reuse) the local-only cinematic component and drive it.
    //    Component lives on the PlayerController so the cinematic survives a
    //    pawn swap (pawn is teleported by the level on BeginPlay).
    UKhaaosZuCinematicComponent* Cinematic = FindComponentByClass<UKhaaosZuCinematicComponent>();
    if (!Cinematic)
    {
        Cinematic = NewObject<UKhaaosZuCinematicComponent>(this, TEXT("KhaaosZuCinematic"));
        Cinematic->RegisterComponent();
    }
    if (Cinematic)
    {
        const EKhaaosZuCinematicVariant Variant =
            UKhaaosZuCinematicComponent::VariantFromByte(VariantIndex);
        Cinematic->BeginCinematic(this, Variant, CinematicDuration);
    }

    // 2) BP override still fires so existing Blueprints (if any) keep working.
    PlayZuEntryCinematic(VariantIndex, CinematicDuration);

    // 3) HUD prompt (existing behaviour — unchanged).
    if (AKhaaosHUD* KhaaosHUD = Cast<AKhaaosHUD>(GetHUD()))
    {
        if (UKhaaosHUDWidget* HUDWidget = KhaaosHUD->GetHUDWidget())
        {
            HUDWidget->ShowZuEntryPrompt(VariantIndex, Prompt, OptionA, OptionB, CinematicDuration, ResponseTimeout);
            return;
        }
    }

    UE_LOG(LogTemp, Warning, TEXT("[CIGKV] HUD widget is unavailable; Zu prompt could not be displayed"));
}

void AKhaaosPlayerController::ClientEndZuEntry_Implementation()
{
    if (UKhaaosZuCinematicComponent* Cinematic = FindComponentByClass<UKhaaosZuCinematicComponent>())
    {
        Cinematic->EndCinematic();
    }

    if (AKhaaosHUD* KhaaosHUD = Cast<AKhaaosHUD>(GetHUD()))
    {
        if (UKhaaosHUDWidget* HUDWidget = KhaaosHUD->GetHUDWidget())
        {
            HUDWidget->HideZuEntryPrompt();
        }
    }
}
