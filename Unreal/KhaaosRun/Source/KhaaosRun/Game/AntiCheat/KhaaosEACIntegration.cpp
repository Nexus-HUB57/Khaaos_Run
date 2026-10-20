// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AntiCheat/KhaaosEACIntegration.h"
#include "Game/AntiCheat/KhaaosAntiCheat.h"
#include "eos_anticheat_bridge.h"

#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Engine/GameInstance.h"
#include "TimerManager.h"
#include "GameFramework/PlayerState.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/GameSession.h"
#include "Kismet/GameplayStatics.h"
#include "HAL/PlatformTime.h"
#include "HAL/PlatformProcess.h"
#include "Misc/Paths.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosEAC, Log, All);

namespace
{
	KhaaosEAC::FEACRuntimeBridge GEACRuntimeBridge;
	void* GEACBinaryHandle = nullptr;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosEACIntegration
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosEACIntegration::UKhaaosEACIntegration()
	: bEACMandatory(true)
	, bEACEnabled(true)
	, EACSdkPath(TEXT("ThirdParty/EasyAntiCheat/Binaries/Linux/libeasyanticheat_server.so"))
	, ValidationPollInterval(30.0f)
	, MaxViolationsBeforeKick(3)
	, bLogInformationalViolations(true)
	, CurrentStatus(EKhaaosEACStatus::NotInitialized)
{
}

void UKhaaosEACIntegration::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	UE_LOG(LogKhaaosEAC, Log,
		TEXT("KhaaosEACIntegration: Inicializado. Enabled=%s Mandatory=%s PollInterval=%.0fs"),
		bEACEnabled ? TEXT("true") : TEXT("false"),
		bEACMandatory ? TEXT("true") : TEXT("false"),
		ValidationPollInterval);
}

void UKhaaosEACIntegration::Deinitialize()
{
	ShutdownEAC();

	RegisteredClients.Empty();
	RecentViolations.Empty();

	UE_LOG(LogKhaaosEAC, Log,
		TEXT("KhaaosEACIntegration: Desinicializado. Métricas: Violations=%d Strikes=%d Kicks=%d"),
		Metrics.ViolationsDetected, Metrics.StrikesIssued, Metrics.PlayerKicks);

	Super::Deinitialize();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EAC SDK Initialization
// ═══════════════════════════════════════════════════════════════════════════════

bool UKhaaosEACIntegration::InitializeEAC(const FString& ProductId, const FString& SandboxId,
	const FString& DeploymentId, bool bIsDedicatedServer_In)
{
	if (!bEACEnabled)
	{
		UE_LOG(LogKhaaosEAC, Log, TEXT("InitializeEAC: EAC desabilitado via config. Pulando."));
		SetEACStatus(EKhaaosEACStatus::Disabled);
		return true;
	}

	if (CurrentStatus == EKhaaosEACStatus::Running)
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("InitializeEAC: EAC já está rodando."));
		return true;
	}

	SetEACStatus(EKhaaosEACStatus::Initializing);
	bIsDedicatedServer = bIsDedicatedServer_In;

	// Tenta carregar o binário dinâmico do EAC SDK se presente no disco
	const FString ResolvedBinaryPath = FPaths::Combine(FPaths::ProjectDir(), EACSdkPath);
	if (FPaths::FileExists(ResolvedBinaryPath) && !GEACBinaryHandle)
	{
		GEACBinaryHandle = FPlatformProcess::GetDllHandle(*ResolvedBinaryPath);
		UE_LOG(LogKhaaosEAC, Log, TEXT("InitializeEAC: Binário EAC carregado de '%s' (Handle=%p)."),
			*ResolvedBinaryPath, GEACBinaryHandle);
	}

	KhaaosEAC::FSessionConfig BridgeConfig;
	BridgeConfig.ProductId = TCHAR_TO_UTF8(*ProductId);
	BridgeConfig.SandboxId = TCHAR_TO_UTF8(*SandboxId);
	BridgeConfig.DeploymentId = TCHAR_TO_UTF8(*DeploymentId);
	BridgeConfig.bIsDedicatedServer = bIsDedicatedServer;
	BridgeConfig.HeartbeatTimeoutSeconds = static_cast<uint32_t>(ValidationPollInterval);

	if (!GEACRuntimeBridge.StartSession(BridgeConfig))
	{
		UE_LOG(LogKhaaosEAC, Error, TEXT("InitializeEAC: Falha ao iniciar sessão no FEACRuntimeBridge (IDs ausentes)."));
		SetEACStatus(EKhaaosEACStatus::Failed);
		return false;
	}

	UE_LOG(LogKhaaosEAC, Log,
		TEXT("InitializeEAC: EAC SDK ativo (Product=%s, Sandbox=%s, Deployment=%s, Server=%s)."),
		*ProductId, *SandboxId, *DeploymentId,
		bIsDedicatedServer ? TEXT("true") : TEXT("false"));

	if (bIsDedicatedServer)
	{
		bEACServerStarted = true;
		UE_LOG(LogKhaaosEAC, Log, TEXT("InitializeEAC: EAC Server iniciado com FEACRuntimeBridge."));

		UWorld* World = GetWorld();
		if (World)
		{
			World->GetTimerManager().SetTimer(
				ValidationTimerHandle,
				this,
				&UKhaaosEACIntegration::OnValidationTimer,
				ValidationPollInterval,
				true
			);
		}
	}
	else
	{
		bEACClientStarted = true;
		UE_LOG(LogKhaaosEAC, Log, TEXT("InitializeEAC: EAC Client iniciado com FEACRuntimeBridge."));
	}

	EACStartTime = FPlatformTime::Seconds();
	SetEACStatus(EKhaaosEACStatus::Running);

	return true;
}

void UKhaaosEACIntegration::ShutdownEAC()
{
	if (CurrentStatus == EKhaaosEACStatus::NotInitialized || CurrentStatus == EKhaaosEACStatus::Disabled)
	{
		return;
	}

	SetEACStatus(EKhaaosEACStatus::ShuttingDown);

	UE_LOG(LogKhaaosEAC, Log, TEXT("ShutdownEAC: Desligando EAC SDK."));

	GEACRuntimeBridge.StopSession();

	if (GEACBinaryHandle)
	{
		FPlatformProcess::FreeDllHandle(GEACBinaryHandle);
		GEACBinaryHandle = nullptr;
	}

	if (bIsDedicatedServer)
	{
		TArray<int32> ClientIds;
		RegisteredClients.GetKeys(ClientIds);
		for (int32 ClientId : ClientIds)
		{
			UnregisterClient(ClientId);
		}
		RegisteredClients.Empty();

		if (UWorld* World = GetWorld())
		{
			World->GetTimerManager().ClearTimer(ValidationTimerHandle);
		}

		bEACServerStarted = false;
	}
	else
	{
		bEACClientStarted = false;
	}

	CurrentGameSessionId.Empty();
	SetEACStatus(EKhaaosEACStatus::NotInitialized);

	UE_LOG(LogKhaaosEAC, Log, TEXT("ShutdownEAC: EAC SDK desligado."));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Client Operations
// ═══════════════════════════════════════════════════════════════════════════════

bool UKhaaosEACIntegration::StartAntiCheat()
{
	if (!bEACEnabled)
	{
		UE_LOG(LogKhaaosEAC, Log, TEXT("StartAntiCheat: EAC desabilitado. Pulando."));
		return true;
	}

	if (bIsDedicatedServer)
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("StartAntiCheat: Chamado no servidor. Use InitializeEAC."));
		return false;
	}

	if (bEACClientStarted)
	{
		UE_LOG(LogKhaaosEAC, Log, TEXT("StartAntiCheat: EAC client já está rodando."));
		return true;
	}

	UE_LOG(LogKhaaosEAC, Log, TEXT("StartAntiCheat: Iniciando EAC client."));

	// eac_client::start()
	// Em produção, isso inicia o processo de anti-cheat no cliente
	// O EAC roda como processo separado e se comunica via IPC

	bEACClientStarted = true;
	SetEACStatus(EKhaaosEACStatus::Running);

	return true;
}

void UKhaaosEACIntegration::StopAntiCheat()
{
	if (!bEACClientStarted)
	{
		return;
	}

	UE_LOG(LogKhaaosEAC, Log, TEXT("StopAntiCheat: Parando EAC client."));

	// eac_client::stop()
	bEACClientStarted = false;

	if (!bIsDedicatedServer)
	{
		SetEACStatus(EKhaaosEACStatus::NotInitialized);
	}
}

void UKhaaosEACIntegration::SetGameSessionId(const FString& SessionId)
{
	CurrentGameSessionId = SessionId;

	UE_LOG(LogKhaaosEAC, Log, TEXT("SetGameSessionId: Session='%s'."), *SessionId);

	// eac_client::set_game_session_id(TCHAR_TO_ANSI(*SessionId))
	// Em produção, notifica o EAC client sobre a sessão atual
	// para correlacionar violações com sessões específicas
}

void UKhaaosEACIntegration::RegisterMessageHandler()
{
	UE_LOG(LogKhaaosEAC, Log, TEXT("RegisterMessageHandler: Registrando handler para mensagens EAC."));

	// eac_client::on_message = [](const eac_client::message_t& Msg)
	// {
	//     // Processa mensagens do EAC:
	//     // - kick: jogador foi kickado pelo EAC
	//     // - update_required: EAC precisa atualizar
	//     // - network_error: erro de comunicação com EAC server
	// }
	//
	// Em produção, registra callback para mensagens do EAC client
}

// ═══════════════════════════════════════════════════════════════════════════════
// Server Operations
// ═══════════════════════════════════════════════════════════════════════════════

bool UKhaaosEACIntegration::RegisterClient(int32 PlayerId, const FString& ClientHandle)
{
	if (!bIsDedicatedServer || !bEACServerStarted)
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("RegisterClient: EAC server não está rodando."));
		return false;
	}

	if (RegisteredClients.Contains(PlayerId))
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("RegisterClient: Player %d já registrado."), PlayerId);
		return true;
	}

	const bool bBridgeRegistered = GEACRuntimeBridge.RegisterClient(PlayerId, TCHAR_TO_UTF8(*ClientHandle));

	FKhaaosEACClientInfo ClientInfo;
	ClientInfo.PlayerId = PlayerId;
	ClientInfo.EACSessionHandle = ClientHandle;
	ClientInfo.bIsValidated = bBridgeRegistered;
	ClientInfo.ViolationCount = 0;
	ClientInfo.RegistrationTimestamp = FDateTime::UtcNow().ToIso8601();
	ClientInfo.bIsConnected = true;

	RegisteredClients.Add(PlayerId, ClientInfo);
	Metrics.RegisteredClients++;

	UE_LOG(LogKhaaosEAC, Log,
		TEXT("RegisterClient: Player %d registrado no EAC (Handle=%s, Validated=%s). Total: %d"),
		PlayerId, *ClientHandle, bBridgeRegistered ? TEXT("true") : TEXT("false"), RegisteredClients.Num());

	return bBridgeRegistered;
}

void UKhaaosEACIntegration::UnregisterClient(int32 PlayerId)
{
	if (!RegisteredClients.Contains(PlayerId))
	{
		return;
	}

	GEACRuntimeBridge.UnregisterClient(PlayerId);

	FKhaaosEACClientInfo& ClientInfo = RegisteredClients.FindChecked(PlayerId);
	ClientInfo.bIsConnected = false;

	RegisteredClients.Remove(PlayerId);
	Metrics.RegisteredClients = RegisteredClients.Num();

	UE_LOG(LogKhaaosEAC, Log, TEXT("UnregisterClient: Player %d desregistrado do EAC. Total: %d"),
		PlayerId, RegisteredClients.Num());
}

bool UKhaaosEACIntegration::ValidateSession(int32 PlayerId)
{
	if (!bIsDedicatedServer)
	{
		return false;
	}

	FKhaaosEACClientInfo* ClientInfo = RegisteredClients.Find(PlayerId);
	if (!ClientInfo)
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("ValidateSession: Player %d não registrado no EAC."), PlayerId);
		return false;
	}

	const bool bBridgeValid = GEACRuntimeBridge.ValidateClientSession(
		PlayerId, static_cast<uint32_t>(MaxViolationsBeforeKick));
	const bool bIsValid = bBridgeValid && ClientInfo->bIsValidated && ClientInfo->ViolationCount < MaxViolationsBeforeKick;

	if (bIsValid)
	{
		Metrics.SessionsValidated++;
	}
	else
	{
		Metrics.ValidationFailures++;
	}

	OnEACClientValidated.Broadcast(PlayerId, bIsValid);

	return bIsValid;
}

int32 UKhaaosEACIntegration::ValidateAllSessions()
{
	int32 InvalidCount = 0;

	for (const TPair<int32, FKhaaosEACClientInfo>& ClientPair : RegisteredClients)
	{
		if (!ValidateSession(ClientPair.Key))
		{
			InvalidCount++;
		}
	}

	if (InvalidCount > 0)
	{
		UE_LOG(LogKhaaosEAC, Warning,
			TEXT("ValidateAllSessions: %d de %d clientes com sessão inválida."),
			InvalidCount, RegisteredClients.Num());
	}

	return InvalidCount;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Status Queries
// ═══════════════════════════════════════════════════════════════════════════════

bool UKhaaosEACIntegration::IsEACRunning() const
{
	return CurrentStatus == EKhaaosEACStatus::Running;
}

FKhaaosEACClientInfo UKhaaosEACIntegration::GetClientInfo(int32 PlayerId) const
{
	if (const FKhaaosEACClientInfo* Info = RegisteredClients.Find(PlayerId))
	{
		return *Info;
	}
	return FKhaaosEACClientInfo();
}

TArray<FKhaaosEACViolation> UKhaaosEACIntegration::GetRecentViolations() const
{
	return RecentViolations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Violation Handling
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosEACIntegration::HandleEACViolation(const FKhaaosEACViolation& Violation)
{
	UE_LOG(LogKhaaosEAC, Warning,
		TEXT("HandleEACViolation: Player=%d Type=%s Severity=%s Desc=%s"),
		Violation.PlayerId, *Violation.ViolationType,
		StaticEnum<EKhaaosEACViolationSeverity>()->GetNameStringByValue(
			static_cast<int64>(Violation.Severity)).operator*(),
		*Violation.Description);

	GEACRuntimeBridge.EvaluateViolation(
		Violation.PlayerId,
		TCHAR_TO_UTF8(*Violation.ViolationType),
		TCHAR_TO_UTF8(*Violation.Description),
		static_cast<uint32_t>(MaxViolationsBeforeKick));

	Metrics.ViolationsDetected++;

	RecentViolations.Add(Violation);
	if (RecentViolations.Num() > MaxRecentViolations)
	{
		RecentViolations.RemoveAt(0);
	}

	FKhaaosEACClientInfo* ClientInfo = RegisteredClients.Find(Violation.PlayerId);
	if (ClientInfo)
	{
		ClientInfo->ViolationCount++;
	}

	const int32 Strikes = SeverityToStrikes(Violation.Severity);

	if (Strikes > 0)
	{
		IssueStrikeForViolation(Violation);
		Metrics.StrikesIssued++;
	}

	if (Violation.Severity == EKhaaosEACViolationSeverity::Critical)
	{
		KickPlayerForEACViolation(Violation.PlayerId,
			FString::Printf(TEXT("EAC Critical: %s"), *Violation.ViolationType));
	}
	else if (ClientInfo && ClientInfo->ViolationCount >= MaxViolationsBeforeKick)
	{
		KickPlayerForEACViolation(Violation.PlayerId,
			FString::Printf(TEXT("EAC: %d violations (max: %d)"),
				ClientInfo->ViolationCount, MaxViolationsBeforeKick));
	}

	OnEACViolation.Broadcast(Violation);
}

int32 UKhaaosEACIntegration::SeverityToStrikes(EKhaaosEACViolationSeverity Severity) const
{
	switch (Severity)
	{
		case EKhaaosEACViolationSeverity::Informational:
			return 0;
		case EKhaaosEACViolationSeverity::Minor:
			return 1;
		case EKhaaosEACViolationSeverity::Major:
			return 2;
		case EKhaaosEACViolationSeverity::Critical:
			return 3;
		default:
			return 0;
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Operations
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosEACIntegration::OnEACClientViolationCallback(int32 PlayerId, const FString& ViolationType, const FString& Description)
{
	FKhaaosEACViolation Violation;
	Violation.PlayerId = PlayerId;
	Violation.ViolationType = ViolationType;
	Violation.Description = Description;
	Violation.GameSessionId = CurrentGameSessionId;
	Violation.Timestamp = FDateTime::UtcNow().ToIso8601();
	Violation.bStrikeIssued = false;

	uint32_t AssignedStrikes = 0;
	const KhaaosEAC::EViolationCategory Category = KhaaosEAC::ClassifyViolation(
		TCHAR_TO_UTF8(*ViolationType), AssignedStrikes);

	switch (Category)
	{
		case KhaaosEAC::EViolationCategory::Critical:
			Violation.Severity = EKhaaosEACViolationSeverity::Critical;
			break;
		case KhaaosEAC::EViolationCategory::Major:
			Violation.Severity = EKhaaosEACViolationSeverity::Major;
			break;
		case KhaaosEAC::EViolationCategory::Minor:
			Violation.Severity = EKhaaosEACViolationSeverity::Minor;
			break;
		default:
			Violation.Severity = EKhaaosEACViolationSeverity::Informational;
			break;
	}

	HandleEACViolation(Violation);
}

void UKhaaosEACIntegration::OnEACMessageCallback(const FString& MessageType, const FString& MessageData)
{
	UE_LOG(LogKhaaosEAC, Log, TEXT("EACMessage: Type=%s Data=%s"), *MessageType, *MessageData);

	if (MessageType == TEXT("kick"))
	{
		UE_LOG(LogKhaaosEAC, Error, TEXT("EAC: Kick recebido do EAC server. Motivo: %s"), *MessageData);

		if (UGameInstance* GameInstance = GetGameInstance())
		{
			UGameplayStatics::OpenLevel(this, FName("MainMenu"));
		}
	}
	else if (MessageType == TEXT("update_required"))
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("EAC: Atualização do EAC requerida."));
	}
	else if (MessageType == TEXT("network_error"))
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("EAC: Erro de rede. Tentando reconectar..."));
	}
}

void UKhaaosEACIntegration::OnValidationTimer()
{
	if (!bEACServerStarted || !bIsDedicatedServer)
	{
		return;
	}

	UE_LOG(LogKhaaosEAC, Verbose, TEXT("OnValidationTimer: Validando %d clientes EAC."), RegisteredClients.Num());

	const int32 InvalidCount = ValidateAllSessions();
	UpdateUptimeMetrics();

	if (InvalidCount > 0)
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("OnValidationTimer: %d clientes com sessão inválida."), InvalidCount);
	}
}

void UKhaaosEACIntegration::IssueStrikeForViolation(const FKhaaosEACViolation& Violation)
{
	const int32 Strikes = SeverityToStrikes(Violation.Severity);

	if (UGameInstance* GI = GetGameInstance())
	{
		if (UKhaaosAntiCheat* AntiCheat = GI->GetSubsystem<UKhaaosAntiCheat>())
		{
			APlayerState* TargetPlayerState = nullptr;
			if (UWorld* World = GetWorld())
			{
				for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
				{
					APlayerController* PC = It->Get();
					if (PC && PC->PlayerState && PC->PlayerState->GetPlayerId() == Violation.PlayerId)
					{
						TargetPlayerState = PC->PlayerState;
						break;
					}
				}
			}

			if (TargetPlayerState)
			{
				ECheatType CheatType = ECheatType::Unknown;
				if (Violation.ViolationType.Contains(TEXT("speed")))         CheatType = ECheatType::SpeedHack;
				else if (Violation.ViolationType.Contains(TEXT("aimbot")))   CheatType = ECheatType::Aimbot;
				else if (Violation.ViolationType.Contains(TEXT("teleport"))) CheatType = ECheatType::Teleport;
				else if (Violation.ViolationType.Contains(TEXT("fly")))      CheatType = ECheatType::FlyHack;
				else if (Violation.ViolationType.Contains(TEXT("firerate"))) CheatType = ECheatType::FireRateHack;
				else if (Violation.ViolationType.Contains(TEXT("wallhack"))) CheatType = ECheatType::ShootThroughWalls;

				for (int32 i = 0; i < Strikes; ++i)
				{
					AntiCheat->IssueStrike(TargetPlayerState, CheatType, Violation.Description);
				}
			}
		}
	}

	UE_LOG(LogKhaaosEAC, Log,
		TEXT("IssueStrikeForViolation: Player=%d Severity=%s → %d strike(s)."),
		Violation.PlayerId,
		StaticEnum<EKhaaosEACViolationSeverity>()->GetNameStringByValue(
			static_cast<int64>(Violation.Severity)).operator*(),
		Strikes);
}

void UKhaaosEACIntegration::KickPlayerForEACViolation(int32 PlayerId, const FString& Reason)
{
	Metrics.PlayerKicks++;

	UE_LOG(LogKhaaosEAC, Error,
		TEXT("KickPlayerForEACViolation: Player %d kickado. Motivo: %s"), PlayerId, *Reason);

	// Server-authoritative kick via GameMode
	UWorld* World = GetWorld();
	if (World && World->GetAuthGameMode())
	{
		// Encontra o PlayerController pelo PlayerId
		for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
		{
			APlayerController* PC = It->Get();
			if (PC && PC->PlayerState && PC->PlayerState->GetPlayerId() == PlayerId)
			{
				World->GetAuthGameMode()->GameSession->KickPlayer(PC, FText::FromString(Reason));
				break;
			}
		}
	}

	// Desregistra do EAC
	UnregisterClient(PlayerId);
}

void UKhaaosEACIntegration::SetEACStatus(EKhaaosEACStatus NewStatus)
{
	if (CurrentStatus != NewStatus)
	{
		const EKhaaosEACStatus OldStatus = CurrentStatus;
		CurrentStatus = NewStatus;

		UE_LOG(LogKhaaosEAC, Log, TEXT("EAC Status: %s → %s"),
			StaticEnum<EKhaaosEACStatus>()->GetNameStringByValue(static_cast<int64>(OldStatus)).operator*(),
			StaticEnum<EKhaaosEACStatus>()->GetNameStringByValue(static_cast<int64>(NewStatus)).operator*());

		OnEACStatusChanged.Broadcast(NewStatus);
	}
}

void UKhaaosEACIntegration::UpdateUptimeMetrics()
{
	if (EACStartTime > 0.0)
	{
		Metrics.UptimeSeconds = static_cast<float>(FPlatformTime::Seconds() - EACStartTime);
	}
}
