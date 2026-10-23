// Khaaos Run — Zu ingress rules for every ring.
// Additive. Does not replace Game/World/CIGKV/CIGKVZuRules.
// Copyright Nexus-HUB57.

#pragma once

namespace KhaaosZuIngress
{

enum class ERing : int
{
	CIGKV = 0,
	Barburhen,
	Priadus,
	Ckesalth,
	Arukheea,
	Count
};

enum class EAction : int
{
	Seatbelt = 0,
	Egress,
	Mask
};

enum class EDecision : int
{
	Accept = 0,
	Refuse
};

enum class EHazardKind : int
{
	Slow = 0,
	Bleed,
	Invert,
	Sink,
	Chomp
};

struct FSpec
{
	ERing Ring = ERing::CIGKV;
	int Variant = 1;
	EAction Action = EAction::Seatbelt;
	float RefuseLoss = 0.30f;
	float LockMin = 5.0f;
	float LockMax = 7.0f;
	bool bAcceptLocks = true;
	bool bAcceptBlurs = false;
	const char* Popup = "";
	const char* Situation = "";
	const char* Place = "";
};

struct FOutcome
{
	float VitalityRemaining = 1.0f;
	float ControlLockSeconds = 0.0f;
	float BlurSeconds = 0.0f;
	bool bThrownFromVehicle = false;
	bool bCanActImmediately = true;
};

struct FHazard
{
	EHazardKind Kind = EHazardKind::Slow;
	const char* Label = "";
	float LocalRight = 0.0f;
	float LocalForward = 0.0f;
	float Radius = 1.0f;
	float Rate = 0.0f;
	bool bMaskedSafe = false;
};

inline constexpr int MaxHazardsPerZu = 4;
inline constexpr int LootSlots = 7;
inline constexpr float MaxRefuseLoss = 0.30f;

bool IsRing(ERing Ring) noexcept;
bool IsVariant(int Variant) noexcept;
bool FindSpec(ERing Ring, int Variant, FSpec& Out) noexcept;
FOutcome Resolve(const FSpec& Spec, EDecision Decision, float Exposure01, float LockRoll01) noexcept;
int HazardCount(ERing Ring, int Variant) noexcept;
bool HazardAt(ERing Ring, int Variant, int Index, FHazard& Out) noexcept;
bool LootStock(ERing Ring, int Variant, int OutStock[LootSlots]) noexcept;

} // namespace KhaaosZuIngress
