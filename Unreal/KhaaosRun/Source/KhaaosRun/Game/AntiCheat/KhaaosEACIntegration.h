// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "GameplayTagContainer.h"
#include "Game/AntiCheat/KhaaosEACIntegration.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class APlayerState;
class UKhaaosAntiCheat;

// ─── EAC Status Enum ─────────────────────────────────────────────────────────

/**
 * EKhaaosEACStatus
 *
 * Status do Easy Anti-Cheat SDK no cliente/servidor.
 */
UENUM(BlueprintType)
enum class EKhaaosEACStatus : uint8
{
	NotInitialized   UMETA(DisplayName = "Not Initialized"),
	Initializing     UMETA(DisplayName = "Initializing"),
	Running          UMETA(DisplayName = "Running"),
	Failed           UMETA(DisplayName = "Failed"),
	ShuttingDown     UMETA(DisplayName = "Shutting Down"),
	Disabled         UMETA(DisplayName = "Disabled")
};

// ─── EAC Violation Severity ──────────────────────────────────────────────────

/**
 * EKhaaosEACViolationSeverity
 *
 * Severidade de uma violação do EAC.
 * Mapeia para o sistema de 3 strikes do KhaaosAntiCheat.
 */
UENUM(BlueprintType)
enum class EKhaaosEACViolationSeverity : uint8
{
	Informational  UMETA(DisplayName = "Informational"),
	Minor          UMETA(DisplayName = "Minor"),
	Major          UMETA(DisplayName = "Major"),
	Critical       UMETA(DisplayName = "Critical")
};

// ─── EAC Violation Event ─────────────────────────────────────────────────────

/**
 * FKhaaosEACViolation
 *
 * Registro de uma violação detectada pelo EAC.
 * Integrado com o sistema de 3 strikes do KhaaosAntiCheat.
 */
USTRUCT(BlueprintType)
struct FKhaaosEACViolation
{
	GENERATED_BODY()

	/** ID do jogador que violou. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	int32 PlayerId = -1;

	/** Tipo de violação (string do EAC SDK). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	FString ViolationType;

	/** Severidade da violação. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	EKhaaosEACViolationSeverity Severity = EKhaaosEACViolationSeverity::Minor;

	/** Descrição detalhada da violação. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	FString Description;

	/** Timestamp da violação. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	FString Timestamp;

	/** ID da sessão de jogo quando a violação ocorreu. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	FString GameSessionId;

	/** Se a violação resultou em strike. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	uint8 bStrikeIssued : 1;
};

// ─── EAC Client Info ─────────────────────────────────────────────────────────

/**
 * FKhaaosEACClientInfo
 *
 * Informação de um cliente registrado no EAC (servidor).
 */
USTRUCT(BlueprintType)
struct FKhaaosEACClientInfo
{
	GENERATED_BODY()

	/** ID do jogador. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	int32 PlayerId = -1;

	/** EAC Session Handle (server-side). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	FString EACSessionHandle;

	/** Se o cliente está validado pelo EAC. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	uint8 bIsValidated : 1;

	/** Número de violações do cliente. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	int32 ViolationCount = 0;

	/** Timestamp do registro. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	FString RegistrationTimestamp;

	/** Se o cliente está conectado. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	uint8 bIsConnected : 1;
};

// ─── EAC Production Metrics ──────────────────────────────────────────────────

/**
 * FKhaaosEACMetrics
 *
 * Métricas de produção do EAC para monitoramento.
 */
USTRUCT(BlueprintType)
struct FKhaaosEACMetrics
{
	GENERATED_BODY()

	/** Total de clientes registrados. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC|Metrics")
	int32 RegisteredClients = 0;

	/** Total de violações detectadas. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC|Metrics")
	int32 ViolationsDetected = 0;

	/** Total de strikes emitidos via integração. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC|Metrics")
	int32 StrikesIssued = 0;

	/** Total de kicks por EAC. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC|Metrics")
	int32 PlayerKicks = 0;

	/** Total de sessões validadas. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC|Metrics")
	int32 SessionsValidated = 0;

	/** Total de falhas de validação. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC|Metrics")
	int32 ValidationFailures = 0;

	/** Uptime do EAC em segundos. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC|Metrics")
	float UptimeSeconds = 0.0f;
};

// ─── Delegates ───────────────────────────────────────────────────────────────

/** Broadcast quando violação EAC é detectada. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnEACViolation, const FKhaaosEACViolation&, Violation);

/** Broadcast quando status EAC muda. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnEACStatusChanged, EKhaaosEACStatus, NewStatus);

/** Broadcast quando cliente EAC é validado. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnEACClientValidated, int32, PlayerId, bool, bIsValid);

// ─── EAC Integration Subsystem ───────────────────────────────────────────────

/**
 * UKhaaosEACIntegration
 *
 * Integração do Easy Anti-Cheat SDK para produção.
 *
 * Funcionalidades:
 *   - Inicialização/Shutdown do EAC SDK
 *   - Cliente: StartAntiCheat, SetGameSessionId, RegisterMessageHandler
 *   - Servidor: RegisterClient, UnregisterClient, ValidateSession
 *   - Callbacks de violação EAC → sistema de 3 strikes do KhaaosAntiCheat
 *   - Queries de status (IsEACRunning, GetEACStatus)
 *   - Métricas de produção
 *
 * Integração com KhaaosAntiCheat:
 *   - EAC violation severity → strike mapping:
 *     * Informational → log only
 *     * Minor → 1 strike
 *     * Major → 2 strikes
 *     * Critical → 3 strikes (auto-kick)
 *   - OnEACViolation delegate → OnCheatDetected do KhaaosAntiCheat
 *
 * Padrões EAC SDK:
 *   - eac_server::start() / eac_server::stop()
 *   - eac_client::start() / eac_client::stop()
 *   - eac_server::register_client() / eac_server::unregister_client()
 *   - eac_server::validate_session()
 *   - eac_client::set_game_session_id()
 *   - Callbacks: on_message, on_client_violation
 */
UCLASS(Config = Game, defaultconfig, meta = (DisplayName = "Khaaos EAC Integration"))
class UKhaaosEACIntegration : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosEACIntegration();

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── EAC SDK Initialization ───────────────────────────────────────────────

	/**
	 * Inicializa o EAC SDK.
	 * No servidor: inicia eac_server.
	 * No cliente: inicia eac_client.
	 *
	 * @param ProductId    EOS Product ID (EAC usa o mesmo)
	 * @param SandboxId    EOS Sandbox ID
	 * @param DeploymentId EOS Deployment ID
	 * @param bIsDedicatedServer  Se é servidor dedicado
	 * @return true se inicialização foi iniciada com sucesso
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	bool InitializeEAC(const FString& ProductId, const FString& SandboxId,
		const FString& DeploymentId, bool bIsDedicatedServer);

	/** Shutdown do EAC SDK. Libera todos os handles. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	void ShutdownEAC();

	// ─── Client Operations ────────────────────────────────────────────────────

	/**
	 * Inicia o anti-cheat no cliente.
	 * Deve ser chamado após EOS login e antes de entrar em partida.
	 * @return true se EAC client foi iniciado com sucesso
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	bool StartAntiCheat();

	/** Para o anti-cheat no cliente. Chamado ao sair da partida. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	void StopAntiCheat();

	/**
	 * Define o ID da sessão de jogo atual no EAC client.
	 * O EAC usa isso para correlacionar violações com sessões.
	 * @param SessionId  ID da sessão (do EOS Session)
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	void SetGameSessionId(const FString& SessionId);

	/**
	 * Registra handler para mensagens do EAC (client-side).
	 * Mensagens incluem: kick, update required, etc.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	void RegisterMessageHandler();

	// ─── Server Operations ────────────────────────────────────────────────────

	/**
	 * Registra um cliente no EAC server.
	 * Chamado quando um jogador entra na partida.
	 * @param PlayerId  ID do jogador
	 * @param ClientHandle  Handle do cliente (do EAC SDK)
	 * @return true se registro foi bem-sucedido
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	bool RegisterClient(int32 PlayerId, const FString& ClientHandle);

	/**
	 * Desregistra um cliente do EAC server.
	 * Chamado quando um jogador sai da partida.
	 * @param PlayerId  ID do jogador
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	void UnregisterClient(int32 PlayerId);

	/**
	 * Valida a sessão EAC de um cliente.
	 * Verifica se o cliente está rodando EAC e é legítimo.
	 * @param PlayerId  ID do jogador para validar
	 * @return true se a sessão é válida
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	bool ValidateSession(int32 PlayerId);

	/**
	 * Valida todos os clientes registrados.
	 * Usado periodicamente pelo servidor.
	 * @return Número de clientes com sessão inválida
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	int32 ValidateAllSessions();

	// ─── Status Queries ───────────────────────────────────────────────────────

	/** Verifica se o EAC está rodando. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EAC")
	bool IsEACRunning() const;

	/** Retorna o status atual do EAC. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EAC")
	EKhaaosEACStatus GetEACStatus() const { return CurrentStatus; }

	/** Verifica se EAC é obrigatório para jogar. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EAC")
	bool IsEACMandatory() const { return bEACMandatory; }

	/** Retorna métricas de produção do EAC. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EAC")
	FKhaaosEACMetrics GetMetrics() const { return Metrics; }

	/** Retorna informações de um cliente registrado. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EAC")
	FKhaaosEACClientInfo GetClientInfo(int32 PlayerId) const;

	/** Retorna todas as violações recentes. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EAC")
	TArray<FKhaaosEACViolation> GetRecentViolations() const;

	// ─── Violation Handling ───────────────────────────────────────────────────

	/**
	 * Processa uma violação EAC.
	 * Mapeia severidade para strikes no KhaaosAntiCheat.
	 * Violations críticas resultam em kick imediato.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|EAC")
	void HandleEACViolation(const FKhaaosEACViolation& Violation);

	/**
	 * Mapeia severidade EAC para número de strikes.
	 * Informational: 0, Minor: 1, Major: 2, Critical: 3
	 */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|EAC")
	int32 SeverityToStrikes(EKhaaosEACViolationSeverity Severity) const;

	// ─── Configuration ────────────────────────────────────────────────────────

	/** Se EAC é obrigatório (kick jogadores sem EAC). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EAC")
	uint8 bEACMandatory : 1;

	/** Se EAC está habilitado nesta build. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EAC")
	uint8 bEACEnabled : 1;

	/** Caminho para o EAC SDK. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EAC")
	FString EACSdkPath;

	/** Intervalo de polling para validação de sessão (segundos). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EAC")
	float ValidationPollInterval;

	/** Máximo de violações antes de kick automático. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EAC")
	int32 MaxViolationsBeforeKick;

	/** Se deve logar violations informativas. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|EAC")
	uint8 bLogInformationalViolations : 1;

	// ─── State ────────────────────────────────────────────────────────────────

	/** Status atual do EAC. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	EKhaaosEACStatus CurrentStatus;

	/** ID da sessão de jogo atual (client). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|EAC")
	FString CurrentGameSessionId;

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast quando violação EAC é detectada. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EAC")
	FOnEACViolation OnEACViolation;

	/** Broadcast quando status EAC muda. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EAC")
	FOnEACStatusChanged OnEACStatusChanged;

	/** Broadcast quando cliente é validado. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|EAC")
	FOnEACClientValidated OnEACClientValidated;

private:

	/** Clientes registrados no EAC (server-side). */
	TMap<int32, FKhaaosEACClientInfo> RegisteredClients;

	/** Violações recentes (últimas N). */
	TArray<FKhaaosEACViolation> RecentViolations;

	/** Métricas de produção. */
	FKhaaosEACMetrics Metrics;

	/** Timer handle para validação periódica. */
	FTimerHandle ValidationTimerHandle;

	/** Timestamp de inicialização do EAC. */
	double EACStartTime = 0.0;

	/** Se é servidor dedicado. */
	bool bIsDedicatedServer = false;

	/** Se o EAC client foi iniciado. */
	bool bEACClientStarted = false;

	/** Se o EAC server foi iniciado. */
	bool bEACServerStarted = false;

	/** Máximo de violações recentes para manter. */
	static constexpr int32 MaxRecentViolations = 100;

	// ─── Internal Operations ──────────────────────────────────────────────────

	/** Callback de violação do EAC (server-side). */
	void OnEACClientViolationCallback(int32 PlayerId, const FString& ViolationType, const FString& Description);

	/** Callback de mensagem do EAC (client-side). */
	void OnEACMessageCallback(const FString& MessageType, const FString& MessageData);

	/** Timer callback para validação periódica de sessões. */
	void OnValidationTimer();

	/** Emite strike via KhaaosAntiCheat para uma violação. */
	void IssueStrikeForViolation(const FKhaaosEACViolation& Violation);

	/** Kick jogador por violação EAC. */
	void KickPlayerForEACViolation(int32 PlayerId, const FString& Reason);

	/** Atualiza status do EAC e broadcast. */
	void SetEACStatus(EKhaaosEACStatus NewStatus);

	/** Atualiza métricas de uptime. */
	void UpdateUptimeMetrics();
};
