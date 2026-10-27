// Khaaos Run - Devs Ph.D | UE5.8 Battle Royale
// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/VFX/KhaaosSpeciesVFXRegistry.h"#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include "NiagaraFunctionLibrary.h"
#include "Engine/World.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosSpeciesVFX, Log, All);

// ─── Subsystem Lifecycle ──────────────────────────────────────────────────────

void UKhaaosSpeciesVFXRegistry::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	RegisterDefaultSpeciesVFX();

	UE_LOG(LogKhaaosSpeciesVFX, Log, TEXT("SpeciesVFXRegistry initialized with %d species entries"), SpeciesVFXMap.Num());
}

void UKhaaosSpeciesVFXRegistry::Deinitialize()
{
	// Clean up all active VFX components
	ActiveVFXComponents.Empty();
	OwnerVFXMap.Empty();
	SpeciesVFXMap.Empty();

	Super::Deinitialize();

	UE_LOG(LogKhaaosSpeciesVFX, Log, TEXT("SpeciesVFXRegistry deinitialized"));
}

// ─── Default Species VFX Registration ─────────────────────────────────────────

void UKhaaosSpeciesVFXRegistry::RegisterDefaultSpeciesVFX()
{
	// ── HURAN ──────────────────────────────────────────────────────────────
	{
		FKhaaosSpeciesVFXSet HuranSet;
		HuranSet.Species = EKhaaosSpecies::HURAN;

		// RegenGlow: Green HP regen particles on skin
		FKhaaosSpeciesVFXEntry RegenGlow;
		RegenGlow.VFXName = FName(TEXT("RegenGlow"));
		RegenGlow.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Huran/NS_HuranRegenGlow.NS_HuranRegenGlow'")));
		RegenGlow.bAutoDestroy = false;
		RegenGlow.bUsePooling = true;
		HuranSet.VFXEntries.Add(RegenGlow);

		// WaterDash: Water splash on entry
		FKhaaosSpeciesVFXEntry WaterDash;
		WaterDash.VFXName = FName(TEXT("WaterDash"));
		WaterDash.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Huran/NS_HuranWaterDash.NS_HuranWaterDash'")));
		WaterDash.bAutoDestroy = true;
		WaterDash.bUsePooling = true;
		HuranSet.VFXEntries.Add(WaterDash);

		// AmphibianEyes: Glowing nictating membrane
		FKhaaosSpeciesVFXEntry AmphibianEyes;
		AmphibianEyes.VFXName = FName(TEXT("AmphibianEyes"));
		AmphibianEyes.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Huran/NS_HuranAmphibianEyes.NS_HuranAmphibianEyes'")));
		AmphibianEyes.bAutoDestroy = false;
		AmphibianEyes.bUsePooling = true;
		HuranSet.VFXEntries.Add(AmphibianEyes);

		SpeciesVFXMap.Add(EKhaaosSpecies::HURAN, HuranSet);
	}

	// ── KHAEL ──────────────────────────────────────────────────────────────
	{
		FKhaaosSpeciesVFXSet KhaelSet;
		KhaelSet.Species = EKhaaosSpecies::KHAEL;

		// CryoShield: Ice crystal aura
		FKhaaosSpeciesVFXEntry CryoShield;
		CryoShield.VFXName = FName(TEXT("CryoShield"));
		CryoShield.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Khael/NS_KhaelCryoShield.NS_KhaelCryoShield'")));
		CryoShield.bAutoDestroy = false;
		CryoShield.bUsePooling = true;
		KhaelSet.VFXEntries.Add(CryoShield);

		// FrostBreath: Cold breath VFX
		FKhaaosSpeciesVFXEntry FrostBreath;
		FrostBreath.VFXName = FName(TEXT("FrostBreath"));
		FrostBreath.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Khael/NS_KhaelFrostBreath.NS_KhaelFrostBreath'")));
		FrostBreath.bAutoDestroy = true;
		FrostBreath.bUsePooling = true;
		KhaelSet.VFXEntries.Add(FrostBreath);

		// EnergyResonance: Purple energy pulse
		FKhaaosSpeciesVFXEntry EnergyResonance;
		EnergyResonance.VFXName = FName(TEXT("EnergyResonance"));
		EnergyResonance.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Khael/NS_KhaelEnergyResonance.NS_KhaelEnergyResonance'")));
		EnergyResonance.bAutoDestroy = false;
		EnergyResonance.bUsePooling = true;
		KhaelSet.VFXEntries.Add(EnergyResonance);

		SpeciesVFXMap.Add(EKhaaosSpecies::KHAEL, KhaelSet);
	}

	// ── VENEX ──────────────────────────────────────────────────────────────
	{
		FKhaaosSpeciesVFXSet VenexSet;
		VenexSet.Species = EKhaaosSpecies::VENEX;

		// CyberneticGlow: Circuit-line glow on cybernetic parts
		FKhaaosSpeciesVFXEntry CyberneticGlow;
		CyberneticGlow.VFXName = FName(TEXT("CyberneticGlow"));
		CyberneticGlow.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Venex/NS_VenexCyberneticGlow.NS_VenexCyberneticGlow'")));
		CyberneticGlow.bAutoDestroy = false;
		CyberneticGlow.bUsePooling = true;
		VenexSet.VFXEntries.Add(CyberneticGlow);

		// ShieldPulse: Energy shield pulse
		FKhaaosSpeciesVFXEntry ShieldPulse;
		ShieldPulse.VFXName = FName(TEXT("ShieldPulse"));
		ShieldPulse.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Venex/NS_VenexShieldPulse.NS_VenexShieldPulse'")));
		ShieldPulse.bAutoDestroy = false;
		ShieldPulse.bUsePooling = true;
		VenexSet.VFXEntries.Add(ShieldPulse);

		// SpeedTrail: Motion blur trail
		FKhaaosSpeciesVFXEntry SpeedTrail;
		SpeedTrail.VFXName = FName(TEXT("SpeedTrail"));
		SpeedTrail.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Venex/NS_VenexSpeedTrail.NS_VenexSpeedTrail'")));
		SpeedTrail.bAutoDestroy = false;
		SpeedTrail.bUsePooling = true;
		VenexSet.VFXEntries.Add(SpeedTrail);

		SpeciesVFXMap.Add(EKhaaosSpecies::VENEX, VenexSet);
	}

	// ── ONITH ──────────────────────────────────────────────────────────────
	{
		FKhaaosSpeciesVFXSet OnithSet;
		OnithSet.Species = EKhaaosSpecies::ONITH;

		// ToxicAura: Poison cloud particles
		FKhaaosSpeciesVFXEntry ToxicAura;
		ToxicAura.VFXName = FName(TEXT("ToxicAura"));
		ToxicAura.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Onith/NS_OnithToxicAura.NS_OnithToxicAura'")));
		ToxicAura.bAutoDestroy = false;
		ToxicAura.bUsePooling = true;
		OnithSet.VFXEntries.Add(ToxicAura);

		// ScaleShimmer: Iridescent scale effect
		FKhaaosSpeciesVFXEntry ScaleShimmer;
		ScaleShimmer.VFXName = FName(TEXT("ScaleShimmer"));
		ScaleShimmer.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Onith/NS_OnithScaleShimmer.NS_OnithScaleShimmer'")));
		ScaleShimmer.bAutoDestroy = false;
		ScaleShimmer.bUsePooling = true;
		OnithSet.VFXEntries.Add(ScaleShimmer);

		// HissVFX: Toxic gas emission
		FKhaaosSpeciesVFXEntry HissVFX;
		HissVFX.VFXName = FName(TEXT("HissVFX"));
		HissVFX.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Onith/NS_OnithHissVFX.NS_OnithHissVFX'")));
		HissVFX.bAutoDestroy = true;
		HissVFX.bUsePooling = true;
		OnithSet.VFXEntries.Add(HissVFX);

		SpeciesVFXMap.Add(EKhaaosSpecies::ONITH, OnithSet);
	}

	// ── ZHEERS ─────────────────────────────────────────────────────────────
	{
		FKhaaosSpeciesVFXSet ZheersSet;
		ZheersSet.Species = EKhaaosSpecies::ZHEERS;

		// RadGlow: Radiation glow on skin
		FKhaaosSpeciesVFXEntry RadGlow;
		RadGlow.VFXName = FName(TEXT("RadGlow"));
		RadGlow.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Zheers/NS_ZheersRadGlow.NS_ZheersRadGlow'")));
		RadGlow.bAutoDestroy = false;
		RadGlow.bUsePooling = true;
		ZheersSet.VFXEntries.Add(RadGlow);

		// MutationPulse: Genetic mutation visual
		FKhaaosSpeciesVFXEntry MutationPulse;
		MutationPulse.VFXName = FName(TEXT("MutationPulse"));
		MutationPulse.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Zheers/NS_ZheersMutationPulse.NS_ZheersMutationPulse'")));
		MutationPulse.bAutoDestroy = false;
		MutationPulse.bUsePooling = true;
		ZheersSet.VFXEntries.Add(MutationPulse);

		// RadResistAura: Protective shell
		FKhaaosSpeciesVFXEntry RadResistAura;
		RadResistAura.VFXName = FName(TEXT("RadResistAura"));
		RadResistAura.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Zheers/NS_ZheersRadResistAura.NS_ZheersRadResistAura'")));
		RadResistAura.bAutoDestroy = false;
		RadResistAura.bUsePooling = true;
		ZheersSet.VFXEntries.Add(RadResistAura);

		SpeciesVFXMap.Add(EKhaaosSpecies::ZHEERS, ZheersSet);
	}

	// ── SKEETW ─────────────────────────────────────────────────────────────
	{
		FKhaaosSpeciesVFXSet SkeetwSet;
		SkeetwSet.Species = EKhaaosSpecies::SKEETW;

		// Bioluminescence: Feather glow
		FKhaaosSpeciesVFXEntry Bioluminescence;
		Bioluminescence.VFXName = FName(TEXT("Bioluminescence"));
		Bioluminescence.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Skeetw/NS_SkeetwBioluminescence.NS_SkeetwBioluminescence'")));
		Bioluminescence.bAutoDestroy = false;
		Bioluminescence.bUsePooling = true;
		SkeetwSet.VFXEntries.Add(Bioluminescence);

		// FogStealthVFX: Fog dissolve effect
		FKhaaosSpeciesVFXEntry FogStealthVFX;
		FogStealthVFX.VFXName = FName(TEXT("FogStealthVFX"));
		FogStealthVFX.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Skeetw/NS_SkeetwFogStealthVFX.NS_SkeetwFogStealthVFX'")));
		FogStealthVFX.bAutoDestroy = false;
		FogStealthVFX.bUsePooling = true;
		SkeetwSet.VFXEntries.Add(FogStealthVFX);

		// AvianTrail: Feather particle trail
		FKhaaosSpeciesVFXEntry AvianTrail;
		AvianTrail.VFXName = FName(TEXT("AvianTrail"));
		AvianTrail.NiagaraSystem = TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(TEXT("NiagaraSystem'/Khaaos/VFX/Species/Skeetw/NS_SkeetwAvianTrail.NS_SkeetwAvianTrail'")));
		AvianTrail.bAutoDestroy = false;
		AvianTrail.bUsePooling = true;
		SkeetwSet.VFXEntries.Add(AvianTrail);

		SpeciesVFXMap.Add(EKhaaosSpecies::SKEETW, SkeetwSet);
	}

	UE_LOG(LogKhaaosSpeciesVFX, Log, TEXT("Registered default VFX for %d species"), SpeciesVFXMap.Num());
}

// ─── Species VFX Lookup ───────────────────────────────────────────────────────

UNiagaraSystem* UKhaaosSpeciesVFXRegistry::GetSpeciesVFX(EKhaaosSpecies SpeciesID, FName VFXName) const
{
	const FKhaaosSpeciesVFXEntry* Entry = FindVFXEntry(SpeciesID, VFXName);
	if (!Entry)
	{
		UE_LOG(LogKhaaosSpeciesVFX, Warning, TEXT("GetSpeciesVFX: VFX '%s' not found for species %d"),
			*VFXName.ToString(), static_cast<int32>(SpeciesID));
		return nullptr;
	}

	return ResolveNiagaraSystem(Entry->NiagaraSystem);
}

UNiagaraComponent* UKhaaosSpeciesVFXRegistry::SpawnSpeciesVFX(
	EKhaaosSpecies SpeciesID,
	FName VFXName,
	USceneComponent* AttachComponent,
	FName SocketName)
{
	if (!AttachComponent)
	{
		UE_LOG(LogKhaaosSpeciesVFX, Warning, TEXT("SpawnSpeciesVFX: Null AttachComponent for %s/%s"),
			*UEnum::GetDisplayValueAsText(SpeciesID).ToString(), *VFXName.ToString());
		return nullptr;
	}

	const FKhaaosSpeciesVFXEntry* Entry = FindVFXEntry(SpeciesID, VFXName);
	if (!Entry)
	{
		UE_LOG(LogKhaaosSpeciesVFX, Warning, TEXT("SpawnSpeciesVFX: VFX '%s' not found for species %d"),
			*VFXName.ToString(), static_cast<int32>(SpeciesID));
		return nullptr;
	}

	UNiagaraSystem* NiagaraSys = ResolveNiagaraSystem(Entry->NiagaraSystem);
	if (!NiagaraSys)
	{
		UE_LOG(LogKhaaosSpeciesVFX, Warning, TEXT("SpawnSpeciesVFX: Failed to load Niagara system for %s/%s"),
			*UEnum::GetDisplayValueAsText(SpeciesID).ToString(), *VFXName.ToString());
		return nullptr;
	}

	// Spawn attached to component at socket
	UNiagaraComponent* NiagaraComp = UNiagaraFunctionLibrary::SpawnSystemAttached(
		NiagaraSys,
		AttachComponent,
		SocketName,
		FVector::ZeroVector,
		FRotator::ZeroRotator,
		EAttachLocation::KeepRelativeOffset,
		Entry->bAutoDestroy,
		true, // bAutoActivate
		Entry->bUsePooling ? ENiagaraEffectPoolPolicy::Auto : ENiagaraEffectPoolPolicy::None,
		true  // bPreCullCheck
	);

	if (NiagaraComp)
	{
		AActor* Owner = AttachComponent->GetOwner();
		TrackSpawnedVFX(SpeciesID, VFXName, NiagaraComp, Owner);
		OnSpeciesVFXSpawned.Broadcast(SpeciesID, VFXName, NiagaraComp, Owner);

		UE_LOG(LogKhaaosSpeciesVFX, Log, TEXT("SpawnSpeciesVFX: Spawned %s/%s attached to %s on socket %s"),
			*UEnum::GetDisplayValueAsText(SpeciesID).ToString(),
			*VFXName.ToString(),
			*GetNameSafe(AttachComponent),
			*SocketName.ToString());
	}

	return NiagaraComp;
}

UNiagaraComponent* UKhaaosSpeciesVFXRegistry::SpawnSpeciesVFXAtLocation(
	EKhaaosSpecies SpeciesID,
	FName VFXName,
	const FVector& WorldLocation,
	const FRotator& WorldRotation)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		UE_LOG(LogKhaaosSpeciesVFX, Warning, TEXT("SpawnSpeciesVFXAtLocation: No world context"));
		return nullptr;
	}

	const FKhaaosSpeciesVFXEntry* Entry = FindVFXEntry(SpeciesID, VFXName);
	if (!Entry)
	{
		UE_LOG(LogKhaaosSpeciesVFX, Warning, TEXT("SpawnSpeciesVFXAtLocation: VFX '%s' not found for species %d"),
			*VFXName.ToString(), static_cast<int32>(SpeciesID));
		return nullptr;
	}

	UNiagaraSystem* NiagaraSys = ResolveNiagaraSystem(Entry->NiagaraSystem);
	if (!NiagaraSys)
	{
		UE_LOG(LogKhaaosSpeciesVFX, Warning, TEXT("SpawnSpeciesVFXAtLocation: Failed to load Niagara system for %s/%s"),
			*UEnum::GetDisplayValueAsText(SpeciesID).ToString(), *VFXName.ToString());
		return nullptr;
	}

	UNiagaraComponent* NiagaraComp = UNiagaraFunctionLibrary::SpawnSystemAtLocation(
		World,
		NiagaraSys,
		WorldLocation,
		WorldRotation,
		FVector::OneVector,
		Entry->bAutoDestroy,
		true, // bAutoActivate
		Entry->bUsePooling ? ENiagaraEffectPoolPolicy::Auto : ENiagaraEffectPoolPolicy::None,
		true  // bPreCullCheck
	);

	if (NiagaraComp)
	{
		TrackSpawnedVFX(SpeciesID, VFXName, NiagaraComp, nullptr);
		OnSpeciesVFXSpawned.Broadcast(SpeciesID, VFXName, NiagaraComp, nullptr);

		UE_LOG(LogKhaaosSpeciesVFX, Log, TEXT("SpawnSpeciesVFXAtLocation: Spawned %s/%s at (%.1f, %.1f, %.1f)"),
			*UEnum::GetDisplayValueAsText(SpeciesID).ToString(),
			*VFXName.ToString(),
			WorldLocation.X, WorldLocation.Y, WorldLocation.Z);
	}

	return NiagaraComp;
}

// ─── Registry Management ──────────────────────────────────────────────────────

void UKhaaosSpeciesVFXRegistry::RegisterSpeciesVFX(EKhaaosSpecies SpeciesID, const FKhaaosSpeciesVFXEntry& Entry)
{
	FKhaaosSpeciesVFXSet* SpeciesSet = SpeciesVFXMap.Find(SpeciesID);
	if (!SpeciesSet)
	{
		FKhaaosSpeciesVFXSet NewSet;
		NewSet.Species = SpeciesID;
		SpeciesVFXMap.Add(SpeciesID, NewSet);
		SpeciesSet = SpeciesVFXMap.Find(SpeciesID);
	}

	// Check for duplicate and replace
	for (int32 i = 0; i < SpeciesSet->VFXEntries.Num(); ++i)
	{
		if (SpeciesSet->VFXEntries[i].VFXName == Entry.VFXName)
		{
			SpeciesSet->VFXEntries[i] = Entry;
			UE_LOG(LogKhaaosSpeciesVFX, Log, TEXT("RegisterSpeciesVFX: Replaced existing entry %s/%s"),
				*UEnum::GetDisplayValueAsText(SpeciesID).ToString(), *Entry.VFXName.ToString());
			return;
		}
	}

	SpeciesSet->VFXEntries.Add(Entry);
	UE_LOG(LogKhaaosSpeciesVFX, Log, TEXT("RegisterSpeciesVFX: Added new entry %s/%s"),
		*UEnum::GetDisplayValueAsText(SpeciesID).ToString(), *Entry.VFXName.ToString());
}

void UKhaaosSpeciesVFXRegistry::UnregisterSpeciesVFX(EKhaaosSpecies SpeciesID, FName VFXName)
{
	FKhaaosSpeciesVFXSet* SpeciesSet = SpeciesVFXMap.Find(SpeciesID);
	if (!SpeciesSet)
	{
		return;
	}

	for (int32 i = 0; i < SpeciesSet->VFXEntries.Num(); ++i)
	{
		if (SpeciesSet->VFXEntries[i].VFXName == VFXName)
		{
			SpeciesSet->VFXEntries.RemoveAtSwap(i);
			UE_LOG(LogKhaaosSpeciesVFX, Log, TEXT("UnregisterSpeciesVFX: Removed %s/%s"),
				*UEnum::GetDisplayValueAsText(SpeciesID).ToString(), *VFXName.ToString());
			return;
		}
	}
}

bool UKhaaosSpeciesVFXRegistry::HasSpeciesVFX(EKhaaosSpecies SpeciesID, FName VFXName) const
{
	return FindVFXEntry(SpeciesID, VFXName) != nullptr;
}

TArray<FName> UKhaaosSpeciesVFXRegistry::GetSpeciesVFXNames(EKhaaosSpecies SpeciesID) const
{
	TArray<FName> Names;

	const FKhaaosSpeciesVFXSet* SpeciesSet = SpeciesVFXMap.Find(SpeciesID);
	if (SpeciesSet)
	{
		for (const FKhaaosSpeciesVFXEntry& Entry : SpeciesSet->VFXEntries)
		{
			Names.Add(Entry.VFXName);
		}
	}

	return Names;
}

// ─── Active VFX Tracking ──────────────────────────────────────────────────────

void UKhaaosSpeciesVFXRegistry::StopAllVFXForSpecies(EKhaaosSpecies SpeciesID, AActor* Owner)
{
	if (!Owner)
	{
		return;
	}

	TArray<TWeakObjectPtr<UNiagaraComponent>> Components;
	OwnerVFXMap.MultiFind(TWeakObjectPtr<AActor>(Owner), Components);

	int32 StoppedCount = 0;
	for (const TWeakObjectPtr<UNiagaraComponent>& WeakComp : Components)
	{
		UNiagaraComponent* Comp = WeakComp.Get();
		if (Comp && Comp->IsActive())
		{
			Comp->Deactivate();
			++StoppedCount;
		}
	}

	UE_LOG(LogKhaaosSpeciesVFX, Log, TEXT("StopAllVFXForSpecies: Stopped %d VFX for species %d on %s"),
		StoppedCount, static_cast<int32>(SpeciesID), *GetNameSafe(Owner));
}

void UKhaaosSpeciesVFXRegistry::StopAllVFXForOwner(AActor* Owner)
{
	if (!Owner)
	{
		return;
	}

	TArray<TWeakObjectPtr<UNiagaraComponent>> Components;
	OwnerVFXMap.MultiFind(TWeakObjectPtr<AActor>(Owner), Components);

	int32 StoppedCount = 0;
	for (const TWeakObjectPtr<UNiagaraComponent>& WeakComp : Components)
	{
		UNiagaraComponent* Comp = WeakComp.Get();
		if (Comp && Comp->IsActive())
		{
			Comp->Deactivate();
			++StoppedCount;
		}
	}

	// Clean up the owner's entry in the map
	OwnerVFXMap.Remove(TWeakObjectPtr<AActor>(Owner));

	UE_LOG(LogKhaaosSpeciesVFX, Log, TEXT("StopAllVFXForOwner: Stopped %d VFX on %s"), StoppedCount, *GetNameSafe(Owner));
}

// ─── Private: Find VFX Entry ──────────────────────────────────────────────────

const FKhaaosSpeciesVFXEntry* UKhaaosSpeciesVFXRegistry::FindVFXEntry(EKhaaosSpecies SpeciesID, FName VFXName) const
{
	const FKhaaosSpeciesVFXSet* SpeciesSet = SpeciesVFXMap.Find(SpeciesID);
	if (!SpeciesSet)
	{
		return nullptr;
	}

	for (const FKhaaosSpeciesVFXEntry& Entry : SpeciesSet->VFXEntries)
	{
		if (Entry.VFXName == VFXName)
		{
			return &Entry;
		}
	}

	return nullptr;
}

// ─── Private: Resolve Niagara System ──────────────────────────────────────────

UNiagaraSystem* UKhaaosSpeciesVFXRegistry::ResolveNiagaraSystem(TSoftObjectPtr<UNiagaraSystem> SoftRef) const
{
	if (SoftRef.IsNull())
	{
		return nullptr;
	}

	if (SoftRef.IsValid())
	{
		return SoftRef.Get();
	}

	// Load synchronously (const_cast for non-const load on soft ref)
	return const_cast<TSoftObjectPtr<UNiagaraSystem>&>(SoftRef).LoadSynchronous();
}

// ─── Private: Track Spawned VFX ───────────────────────────────────────────────

void UKhaaosSpeciesVFXRegistry::TrackSpawnedVFX(EKhaaosSpecies SpeciesID, FName VFXName, UNiagaraComponent* NiagaraComp, AActor* Owner)
{
	if (!NiagaraComp)
	{
		return;
	}

	TPair<EKhaaosSpecies, FName> Key(SpeciesID, VFXName);
	ActiveVFXComponents.Add(Key, TWeakObjectPtr<UNiagaraComponent>(NiagaraComp));

	if (Owner)
	{
		OwnerVFXMap.Add(TWeakObjectPtr<AActor>(Owner), TWeakObjectPtr<UNiagaraComponent>(NiagaraComp));
	}
}
