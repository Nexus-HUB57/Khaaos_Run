// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Save/KhaaosSaveGame.h"
#include "Game/Save/KhaaosCloudSaveProduction.generated.h"

// ─── Forward Declarations ─────────────────────────────────────────────────────

class UKhaaosCloudSave;

// ─── Merge Strategy Enum ─────────────────────────────────────────────────────

/**
 * EKhaaosMergeStrategy
 *
 * Estratégia de resolução de conflitos quando dados local e cloud divergem.
 * - ServerWins: dado do servidor (cloud) prevalece (usado para stats/KRC)
 * - ClientWins: dado do cliente local prevalece (usado para cosméticos/Zu)
 * - MergeBoth: tenta mesclar ambos usando lógica por-campo
 */
UENUM(BlueprintType)
enum class EKhaaosMergeStrategy : uint8
{
	ServerWins   UMETA(DisplayName = "Server Wins"),
	ClientWins   UMETA(DisplayName = "Client Wins"),
	MergeBoth    UMETA(DisplayName = "Merge Both")
};

// ─── Save Metadata ───────────────────────────────────────────────────────────

/**
 * FKhaaosSaveMetadata
 *
 * Metadados estendidos para um save de produção.
 * Inclui versionamento para migração de schema e flag de compressão LZ4.
 */
USTRUCT(BlueprintType)
struct FKhaaosSaveMetadata
{
	GENERATED_BODY()

	/** Identificador único do save (GUID). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	FGuid SaveId;

	/** Versão do schema do save (para migração). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	int32 Version = 1;

	/** Timestamp da última modificação (ISO 8601). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	FString Timestamp;

	/** Tamanho dos dados em bytes (descomprimido). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	int64 SizeBytes = 0;

	/** Se o dado está comprimido com LZ4 no cloud. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	uint8 bIsCompressed : 1;

	/** Nome do slot associado. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	FString SlotName;

	/** Checksum SHA256 do payload (para integridade). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	FString Checksum;

	/** Gera timestamp atual em ISO 8601. */
	void UpdateTimestamp()
	{
		Timestamp = FDateTime::UtcNow().ToIso8601();
	}

	/** Verifica se o metadata é válido. */
	bool IsValid() const
	{
		return SaveId.IsValid() && !SlotName.IsEmpty() && Version > 0;
	}
};

// ─── Merge Result ────────────────────────────────────────────────────────────

/**
 * FKhaaosMergeResult
 *
 * Resultado de uma operação de merge entre save local e cloud.
 * Contém o save mesclado, contagem de conflitos e estratégia usada.
 */
USTRUCT(BlueprintType)
struct FKhaaosMergeResult
{
	GENERATED_BODY()

	/** Save resultante após merge. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	TObjectPtr<UKhaaosSaveGame> MergedSave;

	/** Número de conflitos resolvidos durante o merge. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	int32 ConflictsResolved = 0;

	/** Estratégia de merge utilizada. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	EKhaaosMergeStrategy Strategy = EKhaaosMergeStrategy::MergeBoth;

	/** Se o merge foi bem-sucedido. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	uint8 bSuccess : 1;

	/** Lista de campos que tiveram conflito (para logging). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	TArray<FString> ConflictedFields;
};

// ─── Production Metrics ──────────────────────────────────────────────────────

/**
 * FKhaaosCloudSaveMetrics
 *
 * Métricas de produção para monitoramento do cloud save.
 * Rastreamento de operações, conflitos e falhas para dashboard Grafana.
 */
USTRUCT(BlueprintType)
struct FKhaaosCloudSaveMetrics
{
	GENERATED_BODY()

	/** Total de saves realizados. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	int64 SaveCount = 0;

	/** Total de loads realizados. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	int64 LoadCount = 0;

	/** Total de conflitos de merge resolvidos. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	int64 MergeConflicts = 0;

	/** Total de falhas de rede. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	int64 NetworkFailures = 0;

	/** Total de retries executados. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	int64 RetryCount = 0;

	/** Total de compressões LZ4 realizadas. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	int64 CompressionsPerformed = 0;

	/** Bytes economizados por compressão. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	int64 BytesSavedByCompression = 0;

	/** Tempo médio de save em ms. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	float AverageSaveTimeMs = 0.0f;

	/** Tempo médio de load em ms. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	float AverageLoadTimeMs = 0.0f;

	/** Timestamp do último save bem-sucedido. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	FString LastSaveTimestamp;

	/** Timestamp do último load bem-sucedido. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Metrics")
	FString LastLoadTimestamp;

	/** Reset all counters. */
	void Reset()
	{
		SaveCount = LoadCount = MergeConflicts = NetworkFailures = 0;
		RetryCount = CompressionsPerformed = BytesSavedByCompression = 0;
		AverageSaveTimeMs = AverageLoadTimeMs = 0.0f;
		LastSaveTimestamp.Empty();
		LastLoadTimestamp.Empty();
	}
};

// ─── Schema Migration Info ───────────────────────────────────────────────────

/**
 * FKhaaosSchemaMigration
 *
 * Informação sobre uma migração de schema de save.
 * Usado para migrar saves de versões antigas para novas.
 */
USTRUCT(BlueprintType)
struct FKhaaosSchemaMigration
{
	GENERATED_BODY()

	/** Versão de origem. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	int32 FromVersion = 0;

	/** Versão de destino. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	int32 ToVersion = 0;

	/** Descrição da migração. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave")
	FString Description;
};

// ─── Delegates ───────────────────────────────────────────────────────────────

/** Broadcast quando save de produção completa. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnProdSaveComplete, const FString&, SlotName, bool, bSuccess, const FString&, ErrorMessage);

/** Broadcast quando load de produção completa. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnProdLoadComplete, const FString&, SlotName, UKhaaosSaveGame*, LoadedData, bool, bSuccess);

/** Broadcast quando merge de conflito ocorre. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnMergeConflict, const FString&, SlotName, int32, ConflictsResolved);

/** Broadcast quando métricas são atualizadas. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnMetricsUpdated, const FKhaaosCloudSaveMetrics&, Metrics);

// ─── Production Cloud Save Subsystem ─────────────────────────────────────────

/**
 * UKhaaosCloudSaveProduction
 *
 * Extensão de produção do UKhaaosCloudSave com recursos enterprise:
 *
 *   - Auto-save a cada 120s (configurável via ini)
 *   - Resolução de conflitos de merge:
 *       * ServerWins para stats (KRC, Rating, XP, Kills)
 *       * ClientWins para cosméticos (Zu, skins, equipped items)
 *       * MergeBoth para progressão (combina ambos)
 *   - Versionamento de save para migração de schema
 *   - Retry com exponential backoff em falha de rede
 *   - Compressão LZ4 para reduzir payload do cloud save
 *   - Métricas de produção (save count, load count, merge conflicts, failures)
 *
 * Subsystem do GameInstance — inicializa automaticamente com o game.
 * Integra com UKhaaosCloudSave existente (não substitui, complementa).
 *
 * Padrões EOS SDK:
 *   - EOS_HCloudStorage para upload/download
 *   - EOS_CloudStorage_QueryFileList para enumerar slots
 *   - Retry com EOS_EResult::EOS_NetworkError
 */
UCLASS(Config = Game, defaultconfig, meta = (DisplayName = "Khaaos Cloud Save Production"))
class UKhaaosCloudSaveProduction : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UKhaaosCloudSaveProduction();

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Production Save Operations ───────────────────────────────────────────

	/**
	 * Save com compressão LZ4, versionamento e retry automático.
	 * Serializa UKhaaosSaveGame → JSON → LZ4 compress → EOS upload.
	 * Fire OnProdSaveComplete quando completo.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	void SaveToCloudProduction(const FString& SlotName, UKhaaosSaveGame* SaveData);

	/**
	 * Load com descompressão, migração de schema e merge de conflito.
	 * EOS download → LZ4 decompress → JSON → SchemaMigrate → Merge → callback.
	 * Fire OnProdLoadComplete quando completo.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	void LoadFromCloudProduction(const FString& SlotName);

	/**
	 * Força sync completo: baixa cloud, compara com local, merge se necessário.
	 * Usado no login e resume de sessão.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	void ForceFullSync(const FString& SlotName);

	// ─── Auto-Save Production ─────────────────────────────────────────────────

	/** Habilita/desabilita auto-save de produção. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	void SetAutoSaveEnabled(bool bEnabled);

	/** Configura intervalo de auto-save em segundos (mín 30s). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	void SetAutoSaveInterval(float IntervalSeconds);

	/** Trigger manual de auto-save (se dirty). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	void TriggerAutoSave();

	// ─── Merge Conflict Resolution ────────────────────────────────────────────

	/**
	 * Resolve conflito entre save local e cloud.
	 * Estratégia padrão: ServerWins para stats, ClientWins para cosméticos.
	 * Retorna FKhaaosMergeResult com save mesclado.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	FKhaaosMergeResult ResolveMergeConflict(
		UKhaaosSaveGame* LocalSave,
		UKhaaosSaveGame* CloudSave,
		EKhaaosMergeStrategy OverrideStrategy = EKhaaosMergeStrategy::MergeBoth
	);

	/** Configura estratégia padrão de merge. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	void SetDefaultMergeStrategy(EKhaaosMergeStrategy Strategy);

	// ─── Save Versioning & Schema Migration ───────────────────────────────────

	/** Retorna a versão atual do schema de save. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CloudSave|Production")
	int32 GetCurrentSaveVersion() const { return CurrentSaveVersion; }

	/**
	 * Migra um save de uma versão antiga para a versão atual.
	 * Aplica migrações sequenciais: V1→V2→V3→...→CurrentVersion.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	UKhaaosSaveGame* MigrateSave(UKhaaosSaveGame* SaveData, int32 FromVersion);

	/** Registra uma migração de schema. */
	void RegisterSchemaMigration(int32 FromVersion, int32 ToVersion, const FString& Description);

	// ─── Compression ──────────────────────────────────────────────────────────

	/**
	 * Comprime dados com LZ4.
	 * Retorna array comprimido. Se bIsCompressed já true, retorna input.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	TArray<uint8> CompressSaveData(const TArray<uint8>& RawData);

	/**
	 * Descomprime dados LZ4.
	 * Retorna array descomprimido. Se dados não estão comprimidos, retorna input.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	TArray<uint8> DecompressSaveData(const TArray<uint8>& CompressedData, int32 ExpectedDecompressedSize);

	// ─── Retry with Exponential Backoff ───────────────────────────────────────

	/** Configura parâmetros de retry. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	void SetRetryConfig(int32 MaxRetries, float BaseDelaySeconds, float MaxDelaySeconds);

	// ─── Metrics ──────────────────────────────────────────────────────────────

	/** Retorna métricas atuais de produção. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CloudSave|Production")
	FKhaaosCloudSaveMetrics GetMetrics() const { return Metrics; }

	/** Reseta contadores de métricas. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|CloudSave|Production")
	void ResetMetrics();

	/** Retorna metadata de todos os saves conhecidos. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|CloudSave|Production")
	TArray<FKhaaosSaveMetadata> GetAllSaveMetadata() const;

	// ─── State ────────────────────────────────────────────────────────────────

	/** Se uma operação cloud está em progresso. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|CloudSave|Production")
	uint8 bIsSyncing : 1;

	/** Se auto-save está habilitado. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave|Production")
	uint8 bAutoSaveEnabled : 1;

	/** Intervalo de auto-save em segundos (default 120). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave|Production")
	float AutoSaveInterval;

	/** Se compressão LZ4 está habilitada. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave|Production")
	uint8 bCompressionEnabled : 1;

	/** Estratégia padrão de merge. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave|Production")
	EKhaaosMergeStrategy DefaultMergeStrategy;

	/** Máximo de retries em falha de rede. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave|Production")
	int32 MaxRetryCount;

	/** Delay base para exponential backoff (segundos). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave|Production")
	float RetryBaseDelaySeconds;

	/** Delay máximo para retry (segundos). */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave|Production")
	float RetryMaxDelaySeconds;

	/** Versão atual do schema de save. */
	UPROPERTY(Config, BlueprintReadOnly, Category = "Khaaos|CloudSave|Production")
	int32 CurrentSaveVersion;

	// ─── Delegates ────────────────────────────────────────────────────────────

	/** Broadcast quando save de produção completa. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|CloudSave|Production")
	FOnProdSaveComplete OnProdSaveComplete;

	/** Broadcast quando load de produção completa. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|CloudSave|Production")
	FOnProdLoadComplete OnProdLoadComplete;

	/** Broadcast quando conflito de merge é resolvido. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|CloudSave|Production")
	FOnMergeConflict OnMergeConflict;

	/** Broadcast quando métricas são atualizadas. */
	UPROPERTY(BlueprintAssignable, Category = "Khaaos|CloudSave|Production")
	FOnMetricsUpdated OnMetricsUpdated;

private:

	/** Cache de metadata de saves. */
	UPROPERTY()
	TArray<FKhaaosSaveMetadata> SaveMetadataCache;

	/** Métricas de produção. */
	FKhaaosCloudSaveMetrics Metrics;

	/** Handle do timer de auto-save. */
	FTimerHandle AutoSaveTimerHandle;

	/** Dados do save atualmente carregado (para auto-save). */
	UPROPERTY()
	TObjectPtr<UKhaaosSaveGame> CurrentSaveData;

	/** Nome do slot de auto-save atual. */
	FString CurrentAutoSaveSlot;

	/** Contador de retry atual. */
	int32 CurrentRetryCount = 0;

	/** Tipo de operação em retry. */
	enum class ERetryOperation : uint8 { None, Save, Load };
	ERetryOperation ActiveRetryOperation = ERetryOperation::None;

	/** Slot name da operação em retry. */
	FString RetrySlotName;

	/** Migrações de schema registradas (FromVersion → Migration). */
	TMap<int32, FKhaaosSchemaMigration> RegisteredMigrations;

	// ─── Internal Operations ──────────────────────────────────────────────────

	/** Realiza upload EOS com compressão e metadata. */
	void EOSUploadProduction(const FString& SlotName, const TArray<uint8>& Data, const FKhaaosSaveMetadata& Meta);

	/** Realiza download EOS com descompressão e validação. */
	void EOSDownloadProduction(const FString& SlotName);

	/** Query EOS CloudStorage file list e atualiza cache. */
	void EOSQueryFileListProduction();

	/** Callback do timer de auto-save. */
	void OnAutoSaveTimer();

	/** Handle upload completion. */
	void HandleUploadComplete(const FString& SlotName, bool bSuccess, const FString& Error);

	/** Handle download completion. */
	void HandleDownloadComplete(const FString& SlotName, const TArray<uint8>& Data, bool bSuccess);

	/** Inicia retry com exponential backoff. */
	void StartRetry(ERetryOperation Operation, const FString& SlotName);

	/** Callback do timer de retry. */
	void OnRetryTimer();

	/** Calcula delay para retry atual (exponential backoff + jitter). */
	float CalculateRetryDelay() const;

	/** Atualiza metadata no cache. */
	void UpdateMetadataCache(const FString& SlotName, const FKhaaosSaveMetadata& Meta);

	/** Calcula checksum SHA256 para integridade. */
	FString ComputeChecksum(const TArray<uint8>& Data) const;

	/** Incrementa métrica de save e atualiza tempo médio. */
	void RecordSaveMetric(float DurationMs);

	/** Incrementa métrica de load e atualiza tempo médio. */
	void RecordLoadMetric(float DurationMs);

	/** Merge campo-a-campo para MergeBoth strategy. */
	FKhaaosMergeResult MergeFieldByField(UKhaaosSaveGame* LocalSave, UKhaaosSaveGame* CloudSave);
};
