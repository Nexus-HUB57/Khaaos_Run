// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/UI/Widgets/KhaaosMinimapWidget.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosMinimapWidget
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosMinimapWidget::UKhaaosMinimapWidget()
	: MinimapSize(200.0f)
	, ZoomLevel(1.0f)
	, WorldUnitsPerPixel(5.0f)
	, PlayerWorldPosition(FVector::ZeroVector)
	, PlayerRotation(FRotator::ZeroRotator)
	, ZoneCenter(FVector::ZeroVector)
	, ZoneRadius(0.0f)
{
}

void UKhaaosMinimapWidget::UpdatePlayerPosition(FVector WorldPos, FRotator Rotation)
{
	PlayerWorldPosition = WorldPos;
	PlayerRotation = Rotation;
}

void UKhaaosMinimapWidget::UpdateZoneCircle(FVector Center, float Radius)
{
	ZoneCenter = Center;
	ZoneRadius = Radius;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Icon Management
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosMinimapWidget::AddIcon(FName Id, FVector Position, const FSlateBrush& Icon, FLinearColor Color)
{
	// Check if icon already exists — update it
	for (FKhaaosMinimapIcon& Existing : Icons)
	{
		if (Existing.Id == Id)
		{
			Existing.Position = Position;
			Existing.IconBrush = Icon;
			Existing.Color = Color;
			return;
		}
	}

	// Add new icon
	FKhaaosMinimapIcon NewIcon;
	NewIcon.Id = Id;
	NewIcon.Position = Position;
	NewIcon.IconBrush = Icon;
	NewIcon.Color = Color;
	NewIcon.bRotateWithPlayer = false;
	Icons.Add(NewIcon);
}

void UKhaaosMinimapWidget::RemoveIcon(FName Id)
{
	Icons.RemoveAll([Id](const FKhaaosMinimapIcon& Icon)
	{
		return Icon.Id == Id;
	});
}

// ═══════════════════════════════════════════════════════════════════════════════
// Zoom
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosMinimapWidget::SetZoomLevel(float NewZoom)
{
	ZoomLevel = FMath::Clamp(NewZoom, 0.25f, 4.0f);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Coordinate Conversion
// ═══════════════════════════════════════════════════════════════════════════════

FVector2D UKhaaosMinimapWidget::WorldToMinimap(FVector WorldPos) const
{
	// Offset from player position
	const FVector Offset = WorldPos - PlayerWorldPosition;

	// Scale by zoom and world-to-pixel ratio
	const float Scale = ZoomLevel / WorldUnitsPerPixel;

	// Rotate by player's yaw to keep player centered facing up
	const float YawRad = FMath::DegreesToRadians(-PlayerRotation.Yaw);
	const float CosYaw = FMath::Cos(YawRad);
	const float SinYaw = FMath::Sin(YawRad);

	const float RotatedX = Offset.X * CosYaw - Offset.Y * SinYaw;
	const float RotatedY = Offset.X * SinYaw + Offset.Y * CosYaw;

	// Convert to minimap-local 2D (centered at minimap center)
	const float HalfSize = MinimapSize * 0.5f;
	FVector2D MinimapPos(
		HalfSize + RotatedX * Scale,
		HalfSize + RotatedY * Scale
	);

	// Clamp to minimap bounds
	MinimapPos.X = FMath::Clamp(MinimapPos.X, 0.0f, MinimapSize);
	MinimapPos.Y = FMath::Clamp(MinimapPos.Y, 0.0f, MinimapSize);

	return MinimapPos;
}
