// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/AntiCheat/KhaaosEACIntegration.h"
#include "Game/AntiCheat/KhaaosAntiCheat.h"

#include "Engine/Engine.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "GameFramework/PlayerState.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/GameSession.h"
#include "Kismet/GameplayStatics.h"
#include "HAL/PlatformTime.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosEAC, Log, All);

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosEACIntegration
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosEACIntegration::UKhaaosEACIntegration()
	: bEACMandatory(true)
	, bEACEnabled(true)
	, EACSdkPath(TEXT("EasyAntiCheat"))
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

	UE_LOG(LogKhaaosEAC, Log,
		TEXT("InitializeEAC: Inicializando EAC SDK (Product=%s, Sandbox=%s, Deployment=%s, Server=%s)."),
		*ProductId, *SandboxId, *DeploymentId,
		bIsDedicatedServer ? TEXT("true") : TEXT("false"));

	if (bIsDedicatedServer)
	{
		// ── Servidor: eac_server::start() ─────────────────────────────────────
		//
		// eac_server::start_config Config = {};
		// Config.product_id = TCHAR_TO_ANSI(*ProductId);
		// Config.sandbox_id = TCHAR_TO_ANSI(*SandboxId);
		// Config.deployment_id = TCHAR_TO_ANSI(*DeploymentId);
		// Config.on_client_violation = &UKhaaosEACIntegration::OnEACClientViolationCallback;
		// eac_server::start(Config);
		//
		// Em produção, o EAC SDK inicia e retorna status via callback.

		bEACServerStarted = true;

		UE_LOG(LogKhaaosEAC, Log, TEXT("InitializeEAC: EAC Server iniciado."));

		// Inicia timer de validação periódica
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
		// ── Cliente: eac_client::start() ──────────────────────────────────────
		//
		// eac_client::start_config Config = {};
		// Config.product_id = TCHAR_TO_ANSI(*ProductId);
		// Config.sandbox_id = TCHAR_TO_ANSI(*SandboxId);
		// Config.deployment_id = TCHAR_TO_ANSI(*DeploymentId);
		// Config.on_message = &UKhaaosEACIntegration::OnEACMessageCallback;
		// eac_client::start(Config);

		bEACClientStarted = true;

		UE_LOG(LogKhaaosEAC, Log, TEXT("InitializeEAC: EAC Client iniciado."));
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

	if (bIsDedicatedServer)
	{
		// eac_server::stop()
		// Em produção, desregistra todos os clientes primeiro

		for (const TPair<int32, FKhaaosEACClientInfo>& ClientPair : RegisteredClients)
		{
			UnregisterClient(ClientPair.Key);
		}
		RegisteredClients.Empty();

		// Limpa timer de validação
		if (UWorld* World = GetWorld())
		{
			World->GetTimerManager().ClearTimer(ValidationTimerHandle);
		}

		bEACServerStarted = false;
	}
	else
	{
		// eac_client::stop()
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

	// eac_server::register_client(PlayerId, ClientHandle)
	// Em produção, registra o cliente no EAC server-side
	// O EAC server passa a monitorar este cliente

	FKhaaosEACClientInfo ClientInfo;
	ClientInfo.PlayerId = PlayerId;
	ClientInfo.EACSessionHandle = ClientHandle;
	ClientInfo.bIsValidated = false;
	ClientInfo.ViolationCount = 0;
	ClientInfo.RegistrationTimestamp = FDateTime::UtcNow().ToIso8601();
	ClientInfo.bIsConnected = true;

	RegisteredClients.Add(PlayerId, ClientInfo);
	Metrics.RegisteredClients++;

	UE_LOG(LogKhaaosEAC, Log,
		TEXT("RegisterClient: Player %d registrado no EAC (Handle=%s). Total: %d"),
		PlayerId, *ClientHandle, RegisteredClients.Num());

	return true;
}

void UKhaaosEACIntegration::UnregisterClient(int32 PlayerId)
{
	if (!RegisteredClients.Contains(PlayerId))
	{
		return;
	}

	// eac_server::unregister_client(PlayerId)
	// Em produção, desregistra o cliente do EAC server-side

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

	// eac_server::validate_session(PlayerId)
	// Em produção, valida que:
	// 1. O cliente está rodando EAC
	// 2. A sessão EAC é legítima
	// 3. Não há violações pendentes
	//
	// eac_server::validate_session_result Result = eac_server::validate_session(PlayerId);
	// bool bIsValid = (Result == eac_server::validate_session_result::valid);

	const bool bIsValid = ClientInfo->bIsValidated && ClientInfo->ViolationCount < MaxViolationsBeforeKick;

	if (bIsValid)
	{
		Metrics.SessionsValidated++;
	}
	else
	{
		Metrics.ValidationFailures++;
	}

	// Broadcast resultado
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

	// Atualiza métricas
	Metrics.ViolationsDetected++;

	// Adiciona à lista de violações recentes
	RecentViolations.Add(Violation);
	if (RecentViolations.Num() > MaxRecentViolations)
	{
		RecentViolations.RemoveAt(0);
	}

	// Atualiza contagem no cliente (server-side)
	FKhaaosEACClientInfo* ClientInfo = RegisteredClients.Find(Violation.PlayerId);
	if (ClientInfo)
	{
		ClientInfo->ViolationCount++;
	}

	// Mapeia severidade para strikes
	const int32 Strikes = SeverityToStrikes(Violation.Severity);

	if (Strikes > 0)
	{
		// Emite strikes via KhaaosAntiCheat (sistema de 3 strikes existente)
		IssueStrikeForViolation(Violation);
		Metrics.StrikesIssued++;
	}

	// Verifica se deve kickar
	if (Violation.Severity == EKhaaosEACViolationSeverity::Critical)
	{
		// Violations críticas = kick imediato (3 strikes)
		KickPlayerForEACViolation(Violation.PlayerId,
			FString::Printf(TEXT("EAC Critical: %s"), *Violation.ViolationType));
	}
	else if (ClientInfo && ClientInfo->ViolationCount >= MaxViolationsBeforeKick)
	{
		// Acumulou violações demais
		KickPlayerForEACViolation(Violation.PlayerId,
			FString::Printf(TEXT("EAC: %d violations (max: %d)"),
				ClientInfo->ViolationCount, MaxViolationsBeforeKick));
	}

	// Broadcast violação
	OnEACViolation.Broadcast(Violation);
}

int32 UKhaaosEACIntegration::SeverityToStrikes(EKhaaosEACViolationSeverity Severity) const
{
	switch (Severity)
	{
		case EKhaaosEACViolationSeverity::Informational:
			return 0;  // Apenas log, sem strike
		case EKhaaosEACViolationSeverity::Minor:
			return 1;  // 1 strike (warning)
		case EKhaaosEACViolationSeverity::Major:
			return 2;  // 2 strikes (penúltimo)
		case EKhaaosEACViolationSeverity::Critical:
			return 3;  // 3 strikes = kick automático
		default:
			return 0;
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Operations
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosEACIntegration::OnEACClientViolationCallback(int32 PlayerId, const FString& ViolationType, const FString& Description)
{
	// Callback do EAC SDK quando uma violação é detectada server-side
	//
	// eac_server::on_client_violation_callback(PlayerId, ViolationType, Description)
	//
	// Em produção, este callback é chamado pelo EAC SDK quando:
	// - Cliente detectado com software de cheat
	// - Cliente modificou memória do jogo
	// - Cliente está usando injected DLLs
	// - Cliente falhou integrity check

	FKhaaosEACViolation Violation;
	Violation.PlayerId = PlayerId;
	Violation.ViolationType = ViolationType;
	Violation.Description = Description;
	Violation.GameSessionId = CurrentGameSessionId;
	Violation.Timestamp = FDateTime::UtcNow().ToIso8601();
	Violation.bStrikeIssued = false;

	// Mapeia tipo de violação para severidade
	if (ViolationType.Contains(TEXT("critical")) || ViolationType.Contains(TEXT("cheat_detected")))
	{
		Violation.Severity = EKhaaosEACViolationSeverity::Critical;
	}
	else if (ViolationType.Contains(TEXT("major")) || ViolationType.Contains(TEXT("integrity")))
	{
		Violation.Severity = EKhaaosEACViolationSeverity::Major;
	}
	else if (ViolationType.Contains(TEXT("minor")) || ViolationType.Contains(TEXT("suspicious")))
	{
		Violation.Severity = EKhaaosEACViolationSeverity::Minor;
	}
	else
	{
		Violation.Severity = EKhaaosEACViolationSeverity::Informational;
	}

	HandleEACViolation(Violation);
}

void UKhaaosEACIntegration::OnEACMessageCallback(const FString& MessageType, const FString& MessageData)
{
	// Callback do EAC SDK quando uma mensagem é recebida client-side
	//
	// Tipos de mensagem:
	// - "kick": jogador foi kickado pelo EAC server
	// - "update_required": EAC client precisa atualizar
	// - "network_error": erro de comunicação
	// - "integrity_check": resultado de integrity check

	UE_LOG(LogKhaaosEAC, Log, TEXT("EACMessage: Type=%s Data=%s"), *MessageType, *MessageData);

	if (MessageType == TEXT("kick"))
	{
		UE_LOG(LogKhaaosEAC, Error, TEXT("EAC: Kick recebido do EAC server. Motivo: %s"), *MessageData);

		// Em produção, desconecta o jogador local
		if (UGameInstance* GameInstance = GetGameInstance())
		{
			// Retorna ao menu principal
			UGameplayStatics::OpenLevel(this, FName("MainMenu"));
		}
	}
	else if (MessageType == TEXT("update_required"))
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("EAC: Atualização do EAC requerida."));
		// Em produção, mostra UI pedindo update
	}
	else if (MessageType == TEXT("network_error"))
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("EAC: Erro de rede. Tentando reconectar..."));
		// Em produção, tenta reconectar ao EAC server
	}
}

void UKhaaosEACIntegration::OnValidationTimer()
{
	if (!bEACServerStarted || !bIsDedicatedServer)
	{
		return;
	}

	UE_LOG(LogKhaaosEAC, Verbose, TEXT("OnValidationTimer: Validando %d clientes EAC."), RegisteredClients.Num());

	// Valida todas as sessões periodicamente
	const int32 InvalidCount = ValidateAllSessions();

	// Atualiza métricas de uptime
	UpdateUptimeMetrics();

	if (InvalidCount > 0)
	{
		UE_LOG(LogKhaaosEAC, Warning, TEXT("OnValidationTimer: %d clientes com sessão inválida."), InvalidCount);
	}
}

void UKhaaosEACIntegration::IssueStrikeForViolation(const FKhaaosEACViolation& Violation)
{
	// Integra com o sistema de 3 strikes do KhaaosAntiCheat existente
	//
	// UKhaaosAntiCheat* AntiCheat = GetGameInstance()->GetSubsystem<UKhaaosAntiCheat>();
	// if (AntiCheat)
	// {
	//     APlayerState* Player = /* find player state by Violation.PlayerId */;
	//     if (Player)
	//     {
	//         ECheatType CheatType = ECheatType::Unknown;
	//         if (Violation.ViolationType.Contains("speed"))     CheatType = ECheatType::SpeedHack;
	//         if (Violation.ViolationType.Contains("aimbot"))    CheatType = ECheatType::Aimbot;
	//         if (Violation.ViolationType.Contains("teleport"))  CheatType = ECheatType::Teleport;
	//         if (Violation.ViolationType.Contains("fly"))       CheatType = ECheatType::FlyHack;
	//         if (Violation.ViolationType.Contains("firerate"))  CheatType = ECheatType::FireRateHack;
	//         if (Violation.ViolationType.Contains("wallhack"))  CheatType = ECheatType::ShootThroughWalls;
	//
	//         const int32 Strikes = SeverityToStrikes(Violation.Severity);
	//         for (int32 i = 0; i < Strikes; ++i)
	//         {
	//             AntiCheat->IssueStrike(Player, CheatType, Violation.Description);
	//         }
	//     }
	// }

	UE_LOG(LogKhaaosEAC, Log,
		TEXT("IssueStrikeForViolation: Player=%d Severity=%s → %d strike(s)."),
		Violation.PlayerId,
		StaticEnum<EKhaaosEACViolationSeverity>()->GetNameStringByValue(
			static_cast<int64>(Violation.Severity)).operator*(),
		SeverityToStrikes(Violation.Severity));
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
