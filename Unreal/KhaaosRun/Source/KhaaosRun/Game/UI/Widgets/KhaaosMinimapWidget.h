// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "CommonUI/Public/Widgets/CommonActivatableWidget.h"
#include "Game/UI/Widgets/KhaaosMinimapWidget.generated.h"

// ─── Delegates ────────────────────────────────────────────────────────────────

DECLARE_DELEGATE_OneParam(FOnMinimapClicked, FVector2D /*ScreenPos*/);

// ─── Data Structures ──────────────────────────────────────────────────────────

/**
 * FKhaaosMinimapIcon
 *
 * An icon rendered on the minimap at a world position.
 */
USTRUCT(BlueprintType)
struct FKhaaosMinimapIcon
{
	GENERATED_BODY()

	/** Unique identifier for this icon. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FName Id;

	/** World position of the icon. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FVector Position;

	/** Icon brush to render. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FSlateBrush IconBrush;

	/** Tint color for the icon. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FLinearColor Color;

	/** Whether the icon rotates with the player's view. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	uint8 bRotateWithPlayer : 1;
};

/**
 * UKhaaosMinimapWidget
 *
 * Minimap widget built on CommonUI with canvas-based custom rendering.
 * Displays player position, zone circle, and tracked icons.
 *
 * Features:
 *   - UpdatePlayerPosition: Update player's world position and rotation
 *   - UpdateZoneCircle: Update the safe zone circle overlay
 *   - AddIcon / RemoveIcon: Track entities (enemies, loot, waypoints)
 *   - ZoomLevel: Adjustable minimap zoom
 *   - OnMinimapClicked: Delegate for ping/waypoint placement
 *
 * Rendering:
 *   - Canvas-based override for custom 2D rendering
 *   - World-to-minimap coordinate conversion
 *   - Zone circle drawn as an arc/ring
 *   - Icons drawn at converted positions
 */
UCLASS(Abstract, Blueprintable, meta = (Category = "Khaaos|UI"))
class UKhaaosMinimapWidget : public UCommonActivatableWidget
{
	GENERATED_BODY()

public:
	UKhaaosMinimapWidget();

	// ─── Position Updates ─────────────────────────────────────────────────────

	/** Update the player's world position and rotation on the minimap. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Minimap")
	void UpdatePlayerPosition(FVector WorldPos, FRotator Rotation);

	/** Update the safe zone circle on the minimap. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Minimap")
	void UpdateZoneCircle(FVector Center, float Radius);

	// ─── Icon Management ──────────────────────────────────────────────────────

	/** Add or update a tracked icon on the minimap. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Minimap")
	void AddIcon(FName Id, FVector Position, const FSlateBrush& Icon, FLinearColor Color);

	/** Remove a tracked icon by ID. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Minimap")
	void RemoveIcon(FName Id);

	// ─── Zoom ─────────────────────────────────────────────────────────────────

	/** Set minimap zoom level (1.0 = default). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Minimap")
	void SetZoomLevel(float NewZoom);

	/** Get current zoom level. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Minimap")
	float GetZoomLevel() const { return ZoomLevel; }

	// ─── Coordinate Conversion ────────────────────────────────────────────────

	/**
	 * Convert a world position to minimap-local 2D coordinates.
	 * Accounts for zoom and player-centered offset.
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Minimap")
	FVector2D WorldToMinimap(FVector WorldPos) const;

	// ─── State ────────────────────────────────────────────────────────────────

	/** Minimap display size in pixels (width = height). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Minimap")
	float MinimapSize = 200.0f;

	/** Zoom level (1.0 = default, higher = more zoomed in). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	float ZoomLevel = 1.0f;

	/** World units per minimap pixel at zoom 1.0. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Minimap")
	float WorldUnitsPerPixel = 5.0f;

	/** Player's current world position. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FVector PlayerWorldPosition;

	/** Player's current rotation. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FRotator PlayerRotation;

	/** Zone center in world space. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FVector ZoneCenter;

	/** Zone radius in world units. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	float ZoneRadius = 0.0f;

	/** All tracked minimap icons. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Minimap")
	TArray<FKhaaosMinimapIcon> Icons;

	// ─── Brush References ─────────────────────────────────────────────────────

	/** Brush for the zone circle overlay. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FSlateBrush ZoneBrush;

	/** Brush for the player icon. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FSlateBrush PlayerBrush;

	/** Brush for enemy icons. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FSlateBrush EnemyBrush;

	/** Brush for loot icons. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Minimap")
	FSlateBrush LootBrush;

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast when the minimap is clicked (for ping/waypoint). */
	FOnMinimapClicked OnMinimapClicked;
};
