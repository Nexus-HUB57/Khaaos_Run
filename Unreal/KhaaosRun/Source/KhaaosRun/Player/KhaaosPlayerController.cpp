// Khaaos Run — CIGKV player controller

#include "Player/KhaaosPlayerController.h"
#include "Game/Level/KhaaosCIGKVLevel.h"
#include "Game/UI/KhaaosHUD.h"
#include "Game/UI/Widgets/KhaaosHUDWidget.h"
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
    PlayZuEntryCinematic(VariantIndex, CinematicDuration);

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
    if (AKhaaosHUD* KhaaosHUD = Cast<AKhaaosHUD>(GetHUD()))
    {
        if (UKhaaosHUDWidget* HUDWidget = KhaaosHUD->GetHUDWidget())
        {
            HUDWidget->HideZuEntryPrompt();
        }
    }
}
