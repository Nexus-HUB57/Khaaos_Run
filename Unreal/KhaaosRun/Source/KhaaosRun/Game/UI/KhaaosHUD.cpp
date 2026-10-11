// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/KhaaosHUD.h"
#include "Game/UI/Widgets/KhaaosHUDWidget.h"
#include "Game/UI/Widgets/KhaaosScoreboardWidget.h"
#include "Game/UI/Widgets/KhaaosMinimapWidget.h"
#include "Game/KhaaosGameState.h"

#include "Blueprint/UserWidget.h"
#include "Components/WidgetComponent.h"
#include "GameFramework/PlayerController.h"

// ═══════════════════════════════════════════════════════════════════════════════
// AKhaaosHUD
// ═══════════════════════════════════════════════════════════════════════════════

AKhaaosHUD::AKhaaosHUD()
	: bShowHUD(true)
	, bShowScoreboard(false)
	, bShowMinimap(true)
{
	PrimaryActorTick.bCanEverTick = false;
}

void AKhaaosHUD::BeginPlay()
{
	Super::BeginPlay();
	SetupHUD();
}

void AKhaaosHUD::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	RemoveHUD();
	Super::EndPlay(EndPlayReason);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Visibility
// ═══════════════════════════════════════════════════════════════════════════════

void AKhaaosHUD::ShowScoreboard()
{
	if (Scoreboard && !bShowScoreboard)
	{
		Scoreboard->SetVisibility(ESlateVisibility::Visible);
		Scoreboard->SetIsEnabled(true);
		bShowScoreboard = true;
	}
}

void AKhaaosHUD::HideScoreboard()
{
	if (Scoreboard && bShowScoreboard)
	{
		Scoreboard->SetVisibility(ESlateVisibility::Hidden);
		Scoreboard->SetIsEnabled(false);
		bShowScoreboard = false;
	}
}

void AKhaaosHUD::ToggleScoreboard()
{
	if (bShowScoreboard)
	{
		HideScoreboard();
	}
	else
	{
		ShowScoreboard();
	}
}

void AKhaaosHUD::SetHUDVisible(bool bVisible)
{
	bShowHUD = bVisible;
	if (HUDWidget)
	{
		HUDWidget->SetVisibility(bVisible ? ESlateVisibility::Visible : ESlateVisibility::Hidden);
	}
}

void AKhaaosHUD::SetMinimapVisible(bool bVisible)
{
	bShowMinimap = bVisible;
	if (Minimap)
	{
		Minimap->SetVisibility(bVisible ? ESlateVisibility::Visible : ESlateVisibility::Hidden);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════════════════

void AKhaaosHUD::SetupHUD()
{
	APlayerController* PC = GetOwningPlayerController();
	if (!PC)
	{
		return;
	}

	// Create HUD overlay widget
	if (HUDWidgetClass && !HUDWidget)
	{
		HUDWidget = CreateWidget<UKhaaosHUDWidget>(PC, HUDWidgetClass);
		if (HUDWidget)
		{
			HUDWidget->AddToPlayerScreen(0);
			HUDWidget->SetVisibility(bShowHUD ? ESlateVisibility::Visible : ESlateVisibility::Hidden);
		}
	}

	// Create Scoreboard widget
	if (ScoreboardWidgetClass && !Scoreboard)
	{
		Scoreboard = CreateWidget<UKhaaosScoreboardWidget>(PC, ScoreboardWidgetClass);
		if (Scoreboard)
		{
			Scoreboard->AddToPlayerScreen(1);
			Scoreboard->SetVisibility(ESlateVisibility::Hidden);
			Scoreboard->SetIsEnabled(false);
		}
	}

	// Create Minimap widget
	if (MinimapWidgetClass && !Minimap)
	{
		Minimap = CreateWidget<UKhaaosMinimapWidget>(PC, MinimapWidgetClass);
		if (Minimap)
		{
			Minimap->AddToPlayerScreen(2);
			Minimap->SetVisibility(bShowMinimap ? ESlateVisibility::Visible : ESlateVisibility::Hidden);
		}
	}

	// Broadcast match started
	OnMatchStarted.Broadcast();
}

void AKhaaosHUD::RemoveHUD()
{
	if (HUDWidget)
	{
		HUDWidget->RemoveFromParent();
		HUDWidget = nullptr;
	}

	if (Scoreboard)
	{
		Scoreboard->RemoveFromParent();
		Scoreboard = nullptr;
	}

	if (Minimap)
	{
		Minimap->RemoveFromParent();
		Minimap = nullptr;
	}

	OnMatchEnded.Broadcast();
}
