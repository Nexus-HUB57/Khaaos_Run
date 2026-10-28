// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// IMPLEMENTAÇÃO: UKhaaosVFXHookSystem
// Sistema de hooks VFX com Niagara spawning, species filtering, pooling,
// e gerenciamento de lifecycle.
// ==============================================================================

#include "Game/Character/KhaaosVFXHookSystem.h"
#include "KhaaosRun.h"
#include "NiagaraFunctionLibrary.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/Character.h"
#include "Game/VFX/KhaaosVFXManager.h"

// ─── Constructor ─────────────────────────────────────────────────────────────

UKhaaosVFXHookSystem::UKhaaosVFXHookSystem()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.bStartWithTickEnabled = true;
    PrimaryComponentTick.TickInterval = 0.5f; // Tick a cada 0.5s para cleanup
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

void UKhaaosVFXHookSystem::BeginPlay()
{
    Super::BeginPlay();

    // Registrar hooks pré-construídos por espécie
    RegisterSpeciesHooks();

    UE_LOG(LogKhaaosRun, Log, TEXT("[VFXHook] Inicializado com %d hooks registrados (espécie=%s)"),
        RegisteredHooks.Num(), *UEnum::GetDisplayValueAsText(OwnerSpecies).ToString());
}

void UKhaaosVFXHookSystem::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    // Parar todos os hooks ao destruir
    StopAllHooks(false);

    Super::EndPlay(EndPlayReason);
}

void UKhaaosVFXHookSystem::TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    // Cleanup periódico de hooks expirados
    CleanupTimer += DeltaTime;
    if (CleanupTimer >= CLEANUP_INTERVAL)
    {
        CleanupTimer = 0.0f;
        CleanupExpiredHooks();
    }
}

// ─── Hook Registration ──────────────────────────────────────────────────────

bool UKhaaosVFXHookSystem::RegisterHook(const FKhaaosVFXHook& Hook)
{
    if (RegisteredHooks.Contains(Hook.HookName))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[VFXHook] Hook já registrado: %s"), *Hook.HookName.ToString());
        return false;
    }

    RegisteredHooks.Add(Hook.HookName, Hook);

    UE_LOG(LogKhaaosRun, Verbose, TEXT("[VFXHook] Registrado: %s (evento=%s, espécie-specific=%s)"),
        *Hook.HookName.ToString(),
        *UEnum::GetDisplayValueAsText(Hook.HookEvent).ToString(),
        Hook.bSpeciesSpecific ? TEXT("YES") : TEXT("NO"));

    return true;
}

void UKhaaosVFXHookSystem::UnregisterHook(FName HookName)
{
    // Parar hook ativo primeiro
    StopHook(HookName, false);
    RegisteredHooks.Remove(HookName);
}

// ─── Hook Triggering ─────────────────────────────────────────────────────────

void UKhaaosVFXHookSystem::TriggerHook(EKhaaosVFXHookEvent Event, EKhaaosSpecies CurrentSpecies)
{
    EKhaaosSpecies Species = (CurrentSpecies != EKhaaosSpecies::NONE) ? CurrentSpecies : OwnerSpecies;

    for (const auto& Pair : RegisteredHooks)
    {
        const FKhaaosVFXHook& Hook = Pair.Value;

        // Filtrar por evento
        if (Hook.HookEvent != Event) continue;

        // Filtrar por espécie
        if (!IsHookCompatibleWithSpecies(Hook, Species)) continue;

        // Filtrar por habilitado
        if (!Hook.bEnabled) continue;

        // Disparar hook
        TriggerHookByName(Hook.HookName, Species);
    }
}

void UKhaaosVFXHookSystem::TriggerHookByName(FName HookName, EKhaaosSpecies CurrentSpecies)
{
    const FKhaaosVFXHook* HookDef = RegisteredHooks.Find(HookName);
    if (!HookDef)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[VFXHook] Hook não encontrado: %s"), *HookName.ToString());
        OnVFXHookTriggered.Broadcast(HookName, EKhaaosVFXHookEvent::OnEquip, false);
        return;
    }

    if (!HookDef->bEnabled) return;

    EKhaaosSpecies Species = (CurrentSpecies != EKhaaosSpecies::NONE) ? CurrentSpecies : OwnerSpecies;
    if (!IsHookCompatibleWithSpecies(*HookDef, Species)) return;

    // Se já está ativo e não permite múltiplas instâncias, parar anterior
    if (FKhaaosActiveVFXHook* Existing = ActiveHooksFiring.Find(HookName))
    {
        if (Existing->bIsActive && Existing->NiagaraComponent.IsValid())
        {
            Existing->NiagaraComponent->DeactivateImmediate();
        }
    }

    // Spawn do Niagara component
    UNiagaraComponent* NiagaraComp = SpawnVFXForHook(*HookDef);
    bool bSuccess = (NiagaraComp != nullptr);

    // Registrar hook ativo
    FKhaaosActiveVFXHook ActiveHook;
    ActiveHook.Hook = *HookDef;
    ActiveHook.NiagaraComponent = NiagaraComp;
    ActiveHook.bIsActive = bSuccess;
    ActiveHook.TimeActivated = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f;
    ActiveHooksFiring.Add(HookName, ActiveHook);

    if (bSuccess)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("[VFXHook] Disparado: %s (evento=%s)"),
            *HookName.ToString(), *UEnum::GetDisplayValueAsText(HookDef->HookEvent).ToString());
    }
    else
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[VFXHook] Falha ao disparar: %s"), *HookName.ToString());
    }

    OnVFXHookTriggered.Broadcast(HookName, HookDef->HookEvent, bSuccess);
}

// ─── Hook Control ────────────────────────────────────────────────────────────

void UKhaaosVFXHookSystem::StopHook(FName HookName, bool bGraceful)
{
    FKhaaosActiveVFXHook* Active = ActiveHooksFiring.Find(HookName);
    if (!Active) return;

    if (Active->NiagaraComponent.IsValid())
    {
        if (bGraceful)
        {
            Active->NiagaraComponent->Deactivate();
        }
        else
        {
            Active->NiagaraComponent->DestroyComponent();
        }
    }

    Active->bIsActive = false;
    ActiveHooksFiring.Remove(HookName);

    OnVFXHookStopped.Broadcast(HookName, bGraceful);
}

void UKhaaosVFXHookSystem::StopAllHooks(bool bGraceful)
{
    TArray<FName> HookNames;
    ActiveHooksFiring.GetKeys(HookNames);

    for (const FName& HookName : HookNames)
    {
        StopHook(HookName, bGraceful);
    }
}

void UKhaaosVFXHookSystem::SetHookEnabled(FName HookName, bool bEnabled)
{
    FKhaaosVFXHook* Hook = RegisteredHooks.Find(HookName);
    if (Hook)
    {
        Hook->bEnabled = bEnabled;

        // Se desabilitando e hook está ativo, parar
        if (!bEnabled)
        {
            StopHook(HookName, true);
        }
    }
}

// ─── Query ───────────────────────────────────────────────────────────────────

TArray<FKhaaosActiveVFXHook> UKhaaosVFXHookSystem::GetActiveHooks() const
{
    TArray<FKhaaosActiveVFXHook> Result;
    for (const auto& Pair : ActiveHooksFiring)
    {
        if (Pair.Value.bIsActive)
        {
            Result.Add(Pair.Value);
        }
    }
    return Result;
}

TArray<FKhaaosVFXHook> UKhaaosVFXHookSystem::GetHooksForEvent(EKhaaosVFXHookEvent Event) const
{
    TArray<FKhaaosVFXHook> Result;
    for (const auto& Pair : RegisteredHooks)
    {
        if (Pair.Value.HookEvent == Event)
        {
            Result.Add(Pair.Value);
        }
    }
    return Result;
}

// ─── Internal ────────────────────────────────────────────────────────────────

void UKhaaosVFXHookSystem::RegisterSpeciesHooks()
{
    // ── HURAN ──
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_HUR_WaterSplash");
        H.HookEvent = EKhaaosVFXHookEvent::OnMove;
        H.AttachPoint = FName("Feet");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 8;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::HURAN };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_HUR_GillGlow");
        H.HookEvent = EKhaaosVFXHookEvent::OnEquip;
        H.AttachPoint = FName("Chest");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 2;
        H.LifetimeOverride = 0.0f; // Persistente enquanto equipado
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::HURAN };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_HUR_BubbleTrail");
        H.HookEvent = EKhaaosVFXHookEvent::OnMove;
        H.AttachPoint = FName("Back");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 6;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::HURAN };
        RegisterHook(H);
    }

    // ── KHAEL ──
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_KHA_CrystalResonance");
        H.HookEvent = EKhaaosVFXHookEvent::OnAbility;
        H.AttachPoint = FName("Chest");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 4;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::KHAEL };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_KHA_RuneGlow");
        H.HookEvent = EKhaaosVFXHookEvent::OnIdle;
        H.AttachPoint = FName("Shoulders");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 2;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::KHAEL };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_KHA_ArcaneBurst");
        H.HookEvent = EKhaaosVFXHookEvent::OnKill;
        H.AttachPoint = FName("Weapon_R");
        H.bFollowOwner = false; // Spawn no mundo
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 4;
        H.LifetimeOverride = 2.0f;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::KHAEL };
        RegisterHook(H);
    }

    // ── VENEX ──
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_VEN_CyberPulse");
        H.HookEvent = EKhaaosVFXHookEvent::OnAbility;
        H.AttachPoint = FName("Chest");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 4;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::VENEX };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_VEN_HologramFlicker");
        H.HookEvent = EKhaaosVFXHookEvent::OnDamage;
        H.AttachPoint = FName("Body");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 4;
        H.LifetimeOverride = 1.5f;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::VENEX };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_VEN_ShieldBreak");
        H.HookEvent = EKhaaosVFXHookEvent::OnDamage;
        H.AttachPoint = FName("Chest");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 2;
        H.LifetimeOverride = 3.0f;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::VENEX };
        RegisterHook(H);
    }

    // ── ONITH ──
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_ONI_TailWhip");
        H.HookEvent = EKhaaosVFXHookEvent::OnAbility;
        H.AttachPoint = FName("Waist");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 4;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::ONITH };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_ONI_ThermalVent");
        H.HookEvent = EKhaaosVFXHookEvent::OnIdle;
        H.AttachPoint = FName("Back");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 2;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::ONITH };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_ONI_ChitinShed");
        H.HookEvent = EKhaaosVFXHookEvent::OnDamage;
        H.AttachPoint = FName("Chest");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 4;
        H.LifetimeOverride = 2.0f;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::ONITH };
        RegisterHook(H);
    }

    // ── ZHEERS ──
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_ZHE_FogCloak");
        H.HookEvent = EKhaaosVFXHookEvent::OnAbility;
        H.AttachPoint = FName("Body");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 2;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::ZHEERS };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_ZHE_TattooGlow");
        H.HookEvent = EKhaaosVFXHookEvent::OnKill;
        H.AttachPoint = FName("Body");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 2;
        H.LifetimeOverride = 3.0f;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::ZHEERS };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_ZHE_EarRadar");
        H.HookEvent = EKhaaosVFXHookEvent::OnIdle;
        H.AttachPoint = FName("Head");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 2;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::ZHEERS };
        RegisterHook(H);
    }

    // ── SKEETW ──
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_SKW_WingGust");
        H.HookEvent = EKhaaosVFXHookEvent::OnMove;
        H.AttachPoint = FName("Back");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 6;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::SKEETW };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_SKW_FeatherBurst");
        H.HookEvent = EKhaaosVFXHookEvent::OnDamage;
        H.AttachPoint = FName("Body");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 4;
        H.LifetimeOverride = 1.5f;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::SKEETW };
        RegisterHook(H);
    }
    {
        FKhaaosVFXHook H;
        H.HookName = FName("VFXHook_SKW_WindSense");
        H.HookEvent = EKhaaosVFXHookEvent::OnIdle;
        H.AttachPoint = FName("Head");
        H.bFollowOwner = true;
        H.bPoolAutomatically = true;
        H.PoolEfectiveSize = 2;
        H.bSpeciesSpecific = true;
        H.AllowedSpecies = { EKhaaosSpecies::SKEETW };
        RegisterHook(H);
    }
}

bool UKhaaosVFXHookSystem::IsHookCompatibleWithSpecies(const FKhaaosVFXHook& Hook, EKhaaosSpecies Species) const
{
    // Se não é espécie-específico, compatível com todos
    if (!Hook.bSpeciesSpecific) return true;

    // NONE é compatível com tudo
    if (Species == EKhaaosSpecies::NONE) return true;

    // Verificar se espécie está na lista permitida
    return Hook.AllowedSpecies.Contains(Species);
}

UNiagaraComponent* UKhaaosVFXHookSystem::SpawnVFXForHook(const FKhaaosVFXHook& Hook)
{
    // Carregar Niagara system
    if (!Hook.VFXSystem.IsValid())
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[VFXHook] VFX system não carregado para hook: %s"), *Hook.HookName.ToString());
        return nullptr;
    }

    UNiagaraSystem* VFXSystem = Hook.VFXSystem.LoadSynchronous();
    if (!VFXSystem)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[VFXHook] Falha ao carregar VFX system: %s"), *Hook.HookName.ToString());
        return nullptr;
    }

    AActor* Owner = GetOwner();
    if (!Owner) return nullptr;

    UNiagaraComponent* NiagaraComp = nullptr;

    if (Hook.bFollowOwner)
    {
        // Spawn attached ao owner
        USceneComponent* AttachTarget = Owner->GetRootComponent();

        // Tentar encontrar skeletal mesh para attachment por socket
        ACharacter* OwnerChar = Cast<ACharacter>(Owner);
        if (OwnerChar && OwnerChar->GetMesh())
        {
            AttachTarget = OwnerChar->GetMesh();
        }

        if (AttachTarget)
        {
            NiagaraComp = UNiagaraFunctionLibrary::SpawnSystemAttached(
                VFXSystem,
                AttachTarget,
                Hook.AttachPoint,
                FVector::ZeroVector,
                FRotator::ZeroRotator,
                EAttachLocation::KeepRelativeOffset,
                Hook.bPoolAutomatically
            );
        }
    }
    else
    {
        // Spawn no mundo na posição do owner
        FVector SpawnLocation = Owner->GetActorLocation();
        FRotator SpawnRotation = Owner->GetActorRotation();

        NiagaraComp = UNiagaraFunctionLibrary::SpawnSystemAtLocation(
            GetWorld(),
            VFXSystem,
            SpawnLocation,
            SpawnRotation,
            FVector(1.0f),
            Hook.bPoolAutomatically
        );
    }

    // Aplicar lifetime override
    if (NiagaraComp && Hook.LifetimeOverride > 0.0f)
    {
        NiagaraComp->SetDuration(Hook.LifetimeOverride);
    }

    return NiagaraComp;
}

void UKhaaosVFXHookSystem::CleanupExpiredHooks()
{
    TArray<FName> ToRemove;

    for (const auto& Pair : ActiveHooksFiring)
    {
        const FKhaaosActiveVFXHook& Active = Pair.Value;

        // Verificar se componente Niagara já terminou
        if (!Active.bIsActive) continue;

        if (!Active.NiagaraComponent.IsValid() || Active.NiagaraComponent->IsPendingKillOrUnreachable())
        {
            ToRemove.Add(Pair.Key);
            continue;
        }

        // Verificar se Niagara component foi desativado (sinal de que terminou)
        if (!Active.NiagaraComponent->IsActive())
        {
            ToRemove.Add(Pair.Key);
        }
    }

    for (const FName& HookName : ToRemove)
    {
        FKhaaosActiveVFXHook* Active = ActiveHooksFiring.Find(HookName);
        if (Active)
        {
            Active->bIsActive = false;
        }
        ActiveHooksFiring.Remove(HookName);
    }
}
