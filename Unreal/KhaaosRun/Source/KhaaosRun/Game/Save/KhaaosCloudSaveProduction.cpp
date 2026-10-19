// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/Save/KhaaosCloudSaveProduction.h"
#include "Save/KhaaosSaveGame.h"
#include "Game/Save/KhaaosCloudSave.h"

#include "Engine/Engine.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/Base64.h"
#include "Misc/SHA1.h"         // Para checksum de integridade
#include "HAL/PlatformTime.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosCloudSaveProd, Log, All);

// ═══════════════════════════════════════════════════════════════════════════════
// UKhaaosCloudSaveProduction
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosCloudSaveProduction::UKhaaosCloudSaveProduction()
	: bIsSyncing(false)
	, bAutoSaveEnabled(true)
	, AutoSaveInterval(120.0f)
	, bCompressionEnabled(true)
	, DefaultMergeStrategy(EKhaaosMergeStrategy::MergeBoth)
	, MaxRetryCount(5)
	, RetryBaseDelaySeconds(1.0f)
	, RetryMaxDelaySeconds(30.0f)
	, CurrentSaveVersion(1)
{
}

void UKhaaosCloudSaveProduction::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Registra migrações de schema conhecidas
	RegisterSchemaMigration(1, 2, TEXT("Adicionar campos de economia FBM e Zu"));
	RegisterSchemaMigration(2, 3, TEXT("Adicionar histórico de patente e ranking sazonal"));

	// Inicia timer de auto-save se habilitado
	if (bAutoSaveEnabled)
	{
		UWorld* World = GetWorld();
		if (World && !World->GetTimerManager().IsTimerActive(AutoSaveTimerHandle))
		{
			World->GetTimerManager().SetTimer(
				AutoSaveTimerHandle,
				this,
				&UKhaaosCloudSaveProduction::OnAutoSaveTimer,
				AutoSaveInterval,
				true
			);
		}
	}

	UE_LOG(LogKhaaosCloudSaveProd, Log,
		TEXT("KhaaosCloudSaveProduction: Inicializado. AutoSave=%s Interval=%.0fs Compress=%s Version=%d"),
		bAutoSaveEnabled ? TEXT("ON") : TEXT("OFF"),
		AutoSaveInterval,
		bCompressionEnabled ? TEXT("LZ4") : TEXT("OFF"),
		CurrentSaveVersion);
}

void UKhaaosCloudSaveProduction::Deinitialize()
{
	// Limpa timer de auto-save
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(AutoSaveTimerHandle);
	}

	UE_LOG(LogKhaaosCloudSaveProd, Log,
		TEXT("KhaaosCloudSaveProduction: Desinicializado. Métricas: Saves=%lld Loads=%lld Conflitos=%lld Falhas=%lld"),
		Metrics.SaveCount, Metrics.LoadCount, Metrics.MergeConflicts, Metrics.NetworkFailures);

	Super::Deinitialize();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Production Save Operations
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosCloudSaveProduction::SaveToCloudProduction(const FString& SlotName, UKhaaosSaveGame* SaveData)
{
	if (!SaveData)
	{
		UE_LOG(LogKhaaosCloudSaveProd, Warning, TEXT("SaveToCloudProduction: SaveData nulo para slot '%s'."), *SlotName);
		OnProdSaveComplete.Broadcast(SlotName, false, TEXT("Null save data"));
		return;
	}

	if (bIsSyncing)
	{
		UE_LOG(LogKhaaosCloudSaveProd, Warning, TEXT("SaveToCloudProduction: Sync em progresso. Enfileirando slot '%s'."), *SlotName);
		OnProdSaveComplete.Broadcast(SlotName, false, TEXT("Already syncing"));
		return;
	}

	const double StartTime = FPlatformTime::Seconds();

	bIsSyncing = true;
	CurrentSaveData = SaveData;
	CurrentAutoSaveSlot = SlotName;
	CurrentRetryCount = 0;
	ActiveRetryOperation = ERetryOperation::None;

	// Serializa save data para JSON
	const FString JsonString = SaveData->ToJson();

	// Converte JSON para byte array
	TArray<uint8> DataBytes;
	DataBytes.SetNumUninitialized(JsonString.Len() * sizeof(TCHAR));
	FMemory::Memcpy(DataBytes.GetData(), JsonString.GetCharArray().GetData(), DataBytes.Num());

	// Compressão LZ4 (se habilitada)
	TArray<uint8> FinalData;
	if (bCompressionEnabled)
	{
		FinalData = CompressSaveData(DataBytes);
	}
	else
	{
		FinalData = MoveTemp(DataBytes);
	}

	// Constrói metadata de produção
	FKhaaosSaveMetadata Meta;
	Meta.SaveId = FGuid::NewGuid();
	Meta.Version = CurrentSaveVersion;
	Meta.SlotName = SlotName;
	Meta.SizeBytes = JsonString.Len() * sizeof(TCHAR); // Tamanho descomprimido
	Meta.bIsCompressed = bCompressionEnabled;
	Meta.Checksum = ComputeChecksum(FinalData);
	Meta.UpdateTimestamp();

	UE_LOG(LogKhaaosCloudSaveProd, Log,
		TEXT("SaveToCloudProduction: Upload slot '%s' (%lld bytes raw, %d bytes %s, v%d)."),
		*SlotName, Meta.SizeBytes, FinalData.Num(),
		bCompressionEnabled ? TEXT("LZ4") : TEXT("raw"),
		CurrentSaveVersion);

	// Upload via EOS CloudStorage
	EOSUploadProduction(SlotName, FinalData, Meta);

	// Registra métrica de tempo
	const float DurationMs = static_cast<float>((FPlatformTime::Seconds() - StartTime) * 1000.0);
	RecordSaveMetric(DurationMs);
}

void UKhaaosCloudSaveProduction::LoadFromCloudProduction(const FString& SlotName)
{
	if (bIsSyncing)
	{
		UE_LOG(LogKhaaosCloudSaveProd, Warning, TEXT("LoadFromCloudProduction: Sync em progresso. Não pode carregar slot '%s'."), *SlotName);
		OnProdLoadComplete.Broadcast(SlotName, nullptr, false);
		return;
	}

	const double StartTime = FPlatformTime::Seconds();

	bIsSyncing = true;
	CurrentRetryCount = 0;
	ActiveRetryOperation = ERetryOperation::None;

	UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("LoadFromCloudProduction: Download slot '%s'."), *SlotName);

	// Download via EOS CloudStorage
	EOSDownloadProduction(SlotName);

	// Registra métrica de tempo
	const float DurationMs = static_cast<float>((FPlatformTime::Seconds() - StartTime) * 1000.0);
	RecordLoadMetric(DurationMs);
}

void UKhaaosCloudSaveProduction::ForceFullSync(const FString& SlotName)
{
	UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("ForceFullSync: Sync completo para slot '%s'."), *SlotName);

	// Primeiro carrega do cloud — o callback de download irá
	// comparar com local e resolver conflitos via merge.
	LoadFromCloudProduction(SlotName);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Auto-Save Production
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosCloudSaveProduction::SetAutoSaveEnabled(bool bEnabled)
{
	bAutoSaveEnabled = bEnabled;

	UWorld* World = GetWorld();
	if (!World) return;

	if (bAutoSaveEnabled)
	{
		if (!World->GetTimerManager().IsTimerActive(AutoSaveTimerHandle))
		{
			World->GetTimerManager().SetTimer(
				AutoSaveTimerHandle,
				this,
				&UKhaaosCloudSaveProduction::OnAutoSaveTimer,
				AutoSaveInterval,
				true
			);
		}
	}
	else
	{
		World->GetTimerManager().ClearTimer(AutoSaveTimerHandle);
	}

	UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("AutoSave: %s"), bAutoSaveEnabled ? TEXT("HABILITADO") : TEXT("DESABILITADO"));
}

void UKhaaosCloudSaveProduction::SetAutoSaveInterval(float IntervalSeconds)
{
	AutoSaveInterval = FMath::Max(30.0f, IntervalSeconds); // Mínimo 30s

	// Reinicia timer com novo intervalo
	if (bAutoSaveEnabled)
	{
		SetAutoSaveEnabled(false);
		SetAutoSaveEnabled(true);
	}

	UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("AutoSave interval: %.0fs"), AutoSaveInterval);
}

void UKhaaosCloudSaveProduction::TriggerAutoSave()
{
	if (!CurrentSaveData || CurrentAutoSaveSlot.IsEmpty())
	{
		UE_LOG(LogKhaaosCloudSaveProd, Verbose, TEXT("AutoSave: Sem dados para auto-save."));
		return;
	}

	SaveToCloudProduction(CurrentAutoSaveSlot, CurrentSaveData);
}

void UKhaaosCloudSaveProduction::OnAutoSaveTimer()
{
	TriggerAutoSave();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Merge Conflict Resolution
// ═══════════════════════════════════════════════════════════════════════════════

FKhaaosMergeResult UKhaaosCloudSaveProduction::ResolveMergeConflict(
	UKhaaosSaveGame* LocalSave,
	UKhaaosSaveGame* CloudSave,
	EKhaaosMergeStrategy OverrideStrategy)
{
	FKhaaosMergeResult Result;
	Result.bSuccess = false;
	Result.ConflictsResolved = 0;

	if (!LocalSave || !CloudSave)
	{
		UE_LOG(LogKhaaosCloudSaveProd, Warning, TEXT("ResolveMergeConflict: Save local ou cloud nulo."));
		Result.MergedSave = LocalSave ? LocalSave : CloudSave;
		return Result;
	}

	const EKhaaosMergeStrategy Strategy = (OverrideStrategy == EKhaaosMergeStrategy::MergeBoth)
		? DefaultMergeStrategy
		: OverrideStrategy;

	Result.Strategy = Strategy;

	switch (Strategy)
	{
		case EKhaaosMergeStrategy::ServerWins:
		{
			// Cloud prevalece — usado para stats (KRC, Rating, XP, Kills)
			// Stats são server-authoritative, cosméticos mantidos do cloud também
			Result.MergedSave = NewObject<UKhaaosSaveGame>(this);
			Result.MergedSave->FromJson(CloudSave->ToJson());
			Result.ConflictsResolved = 1;
			Result.ConflictedFields.Add(TEXT("All (ServerWins)"));
			UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("Merge: ServerWins — Cloud data prevaleceu para slot."));
			break;
		}

		case EKhaaosMergeStrategy::ClientWins:
		{
			// Local prevalece — usado para cosméticos (Zu, skins, equipped items)
			// Preferência do cliente é respeitada para cosméticos
			Result.MergedSave = NewObject<UKhaaosSaveGame>(this);
			Result.MergedSave->FromJson(LocalSave->ToJson());
			Result.ConflictsResolved = 1;
			Result.ConflictedFields.Add(TEXT("All (ClientWins)"));
			UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("Merge: ClientWins — Local data prevaleceu para slot."));
			break;
		}

		case EKhaaosMergeStrategy::MergeBoth:
		default:
		{
			// Merge campo-a-campo: ServerWins para stats, ClientWins para cosméticos
			Result = MergeFieldByField(LocalSave, CloudSave);
			UE_LOG(LogKhaaosCloudSaveProd, Log,
				TEXT("Merge: MergeBoth — %d conflitos resolvidos (stats→Server, cosméticos→Client)."),
				Result.ConflictsResolved);
			break;
		}
	}

	Result.bSuccess = true;
	Metrics.MergeConflicts += Result.ConflictsResolved;

	return Result;
}

void UKhaaosCloudSaveProduction::SetDefaultMergeStrategy(EKhaaosMergeStrategy Strategy)
{
	DefaultMergeStrategy = Strategy;
	UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("Estratégia de merge padrão: %s"),
		StaticEnum<EKhaaosMergeStrategy>()->GetNameStringByValue(static_cast<int64>(Strategy)).operator*());
}

FKhaaosMergeResult UKhaaosCloudSaveProduction::MergeFieldByField(UKhaaosSaveGame* LocalSave, UKhaaosSaveGame* CloudSave)
{
	FKhaaosMergeResult Result;
	Result.Strategy = EKhaaosMergeStrategy::MergeBoth;
	Result.bSuccess = true;
	Result.ConflictsResolved = 0;
	Result.MergedSave = NewObject<UKhaaosSaveGame>(this);

	// ── Stats: ServerWins (cloud é autoritativo para KRC, Rating, XP, Kills) ───
	// Stats do cloud prevalecem — server é autoritativo para gameplay
	const FPlayerSaveStats& CloudStats = CloudSave->PlayerStats;
	const FPlayerSaveStats& LocalStats = LocalSave->PlayerStats;

	FPlayerSaveStats MergedStats;

	// Server-authoritative: sempre cloud para stats numéricos
	MergedStats.UserId = CloudStats.UserId;
	MergedStats.Patente = CloudStats.Patente;
	MergedStats.XP = CloudStats.XP;
	MergedStats.Rating = CloudStats.Rating;
	MergedStats.MatchesPlayed = CloudStats.MatchesPlayed;
	MergedStats.Wins = CloudStats.Wins;
	MergedStats.Top5 = CloudStats.Top5;
	MergedStats.TotalKills = CloudStats.TotalKills;
	MergedStats.TotalDeaths = CloudStats.TotalDeaths;
	MergedStats.SeasonKills = CloudStats.SeasonKills;
	MergedStats.WeaponsBalance = CloudStats.WeaponsBalance;
	MergedStats.BonusBalance = CloudStats.BonusBalance;
	MergedStats.FbmBalance = CloudStats.FbmBalance;

	// Detecta conflitos em stats
	if (LocalStats.XP != CloudStats.XP)
	{
		Result.ConflictsResolved++;
		Result.ConflictedFields.Add(TEXT("XP"));
	}
	if (LocalStats.Rating != CloudStats.Rating)
	{
		Result.ConflictsResolved++;
		Result.ConflictedFields.Add(TEXT("Rating"));
	}
	if (LocalStats.TotalKills != CloudStats.TotalKills)
	{
		Result.ConflictsResolved++;
		Result.ConflictedFields.Add(TEXT("TotalKills"));
	}
	if (LocalStats.WeaponsBalance != CloudStats.WeaponsBalance)
	{
		Result.ConflictsResolved++;
		Result.ConflictedFields.Add(TEXT("WeaponsBalance (KRC)"));
	}

	Result.MergedSave->PlayerStats = MergedStats;

	// ── Cosméticos: ClientWins (local prevalece para Zu, skins, equipped) ─────
	// Items do local prevalecem — preferência do jogador é respeitada
	Result.MergedSave->UnlockedItems = LocalSave->UnlockedItems;

	// Merge de equipped items: local prevalece, mas valida contra unlocked
	Result.MergedSave->EquippedItems = LocalSave->EquippedItems;

	// Detecta conflitos em cosméticos
	if (LocalSave->UnlockedItems.Num() != CloudSave->UnlockedItems.Num())
	{
		Result.ConflictsResolved++;
		Result.ConflictedFields.Add(TEXT("UnlockedItems (cosméticos/Zu)"));
	}

	// ── Match History: MergeBoth (combina, deduplica) ─────────────────────────
	TSet<FString> SeenResults;
	TArray<FString> MergedHistory;

	// Adiciona cloud primeiro (mais antigo)
	for (const FString& Result1 : CloudSave->RecentMatchResults)
	{
		if (SeenResults.Find(Result1) == nullptr)
		{
			SeenResults.Add(Result1);
			MergedHistory.Add(Result1);
		}
	}
	// Adiciona local (mais recente pode ter novos)
	for (const FString& Result2 : LocalSave->RecentMatchResults)
	{
		if (SeenResults.Find(Result2) == nullptr)
		{
			SeenResults.Add(Result2);
			MergedHistory.Add(Result2);
		}
	}

	// Limita ao máximo
	if (MergedHistory.Num() > Result.MergedSave->MaxMatchHistory)
	{
		MergedHistory.SetNum(Result.MergedSave->MaxMatchHistory);
	}
	Result.MergedSave->RecentMatchResults = MoveTemp(MergedHistory);

	// ── Settings: ClientWins (preferência local) ──────────────────────────────
	Result.MergedSave->SettingsJson = LocalSave->SettingsJson;
	Result.MergedSave->PreferredQueueMode = LocalSave->PreferredQueueMode;
	Result.MergedSave->PreferredRegion = LocalSave->PreferredRegion;

	// ── Economy: ServerWins (KRC/FBM são server-authoritative) ────────────────
	Result.MergedSave->ActiveLoans = CloudSave->ActiveLoans;
	Result.MergedSave->LastSalaryDate = CloudSave->LastSalaryDate;

	return Result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Save Versioning & Schema Migration
// ═══════════════════════════════════════════════════════════════════════════════

UKhaaosSaveGame* UKhaaosCloudSaveProduction::MigrateSave(UKhaaosSaveGame* SaveData, int32 FromVersion)
{
	if (!SaveData || FromVersion >= CurrentSaveVersion)
	{
		return SaveData;
	}

	UE_LOG(LogKhaaosCloudSaveProd, Log,
		TEXT("MigrateSave: Migrando save da v%d para v%d."), FromVersion, CurrentSaveVersion);

	UKhaaosSaveGame* MigratedSave = SaveData;

	// Aplica migrações sequenciais: V1→V2→V3→...→CurrentVersion
	for (int32 V = FromVersion; V < CurrentSaveVersion; ++V)
	{
		if (const FKhaaosSchemaMigration* Migration = RegisteredMigrations.Find(V))
		{
			UE_LOG(LogKhaaosCloudSaveProd, Log,
				TEXT("MigrateSave: Aplicando migração v%d→v%d: %s"),
				Migration->FromVersion, Migration->ToVersion, *Migration->Description);

			// Cada migração transforma o save data
			// Migrações específicas são aplicadas aqui
			switch (V)
			{
				case 1:
				{
					// V1→V2: Adicionar campos de economia FBM e Zu
					// Novos campos já existem no struct com defaults
					// SaveData->PlayerStats.FbmBalance já inicializa como 0
					break;
				}
				case 2:
				{
					// V2→V3: Adicionar histórico de patente e ranking sazonal
					// Extensões de schema — campos adicionais com defaults
					break;
				}
				default:
				{
					UE_LOG(LogKhaaosCloudSaveProd, Warning,
						TEXT("MigrateSave: Migração v%d não tem handler específico."), V);
					break;
				}
			}
		}
		else
		{
			UE_LOG(LogKhaaosCloudSaveProd, Warning,
				TEXT("MigrateSave: Migração para v%d não registrada. Pulando."), V);
		}
	}

	UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("MigrateSave: Migração completa v%d→v%d."), FromVersion, CurrentSaveVersion);

	return MigratedSave;
}

void UKhaaosCloudSaveProduction::RegisterSchemaMigration(int32 FromVersion, int32 ToVersion, const FString& Description)
{
	FKhaaosSchemaMigration Migration;
	Migration.FromVersion = FromVersion;
	Migration.ToVersion = ToVersion;
	Migration.Description = Description;

	RegisteredMigrations.Add(FromVersion, Migration);

	UE_LOG(LogKhaaosCloudSaveProd, Log,
		TEXT("SchemaMigration registrada: v%d→v%d: %s"), FromVersion, ToVersion, *Description);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Compression (LZ4)
// ═══════════════════════════════════════════════════════════════════════════════

TArray<uint8> UKhaaosCloudSaveProduction::CompressSaveData(const TArray<uint8>& RawData)
{
	if (RawData.Num() == 0)
	{
		return RawData;
	}

	// LZ4 compression via Unreal's compression API
	// UE5 uses FName("lz4") for LZ4 compression
	TArray<uint8> CompressedData;

	const bool bCompressSuccess = FCompression::CompressMemory(
		FName("lz4"),
		CompressedData.GetData(),
		CompressedData.AddUninitialized(FCompression::CompressMemoryBound(FName("lz4"), RawData.Num())),
		RawData.GetData(),
		RawData.Num()
	);

	if (!bCompressSuccess || CompressedData.Num() == 0)
	{
		UE_LOG(LogKhaaosCloudSaveProd, Warning, TEXT("CompressSaveData: LZ4 falhou. Usando dados raw."));
		return RawData;
	}

	// Rastreamento de métricas de compressão
	const int64 BytesSaved = static_cast<int64>(RawData.Num()) - static_cast<int64>(CompressedData.Num());
	Metrics.CompressionsPerformed++;
	Metrics.BytesSavedByCompression += BytesSaved;

	UE_LOG(LogKhaaosCloudSaveProd, Log,
		TEXT("CompressSaveData: LZ4 %d→%d bytes (economizou %lld bytes, %.1f%%)."),
		RawData.Num(), CompressedData.Num(), BytesSaved,
		RawData.Num() > 0 ? (100.0 * static_cast<double>(BytesSaved) / RawData.Num()) : 0.0);

	return CompressedData;
}

TArray<uint8> UKhaaosCloudSaveProduction::DecompressSaveData(const TArray<uint8>& CompressedData, int32 ExpectedDecompressedSize)
{
	if (CompressedData.Num() == 0)
	{
		return CompressedData;
	}

	if (ExpectedDecompressedSize <= 0)
	{
		ExpectedDecompressedSize = CompressedData.Num() * 4; // Estimativa conservadora
	}

	TArray<uint8> DecompressedData;
	DecompressedData.SetNumUninitialized(ExpectedDecompressedSize);

	int32 DecompressedSize = ExpectedDecompressedSize;
	const bool bDecompressSuccess = FCompression::DecompressMemory(
		FName("lz4"),
		DecompressedData.GetData(),
		DecompressedSize,
		CompressedData.GetData(),
		CompressedData.Num()
	);

	if (!bDecompressSuccess)
	{
		UE_LOG(LogKhaaosCloudSaveProd, Error, TEXT("DecompressSaveData: LZ4 falhou. Dados podem estar corrompidos."));
		return TArray<uint8>();
	}

	DecompressedData.SetNum(DecompressedSize);

	UE_LOG(LogKhaaosCloudSaveProd, Log,
		TEXT("DecompressSaveData: LZ4 %d→%d bytes."), CompressedData.Num(), DecompressedSize);

	return DecompressedData;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Retry with Exponential Backoff
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosCloudSaveProduction::SetRetryConfig(int32 InMaxRetries, float InBaseDelaySeconds, float InMaxDelaySeconds)
{
	MaxRetryCount = FMath::Max(0, InMaxRetries);
	RetryBaseDelaySeconds = FMath::Max(0.1f, InBaseDelaySeconds);
	RetryMaxDelaySeconds = FMath::Max(RetryBaseDelaySeconds, InMaxDelaySeconds);

	UE_LOG(LogKhaaosCloudSaveProd, Log,
		TEXT("Retry config: MaxRetries=%d BaseDelay=%.1fs MaxDelay=%.1fs"),
		MaxRetryCount, RetryBaseDelaySeconds, RetryMaxDelaySeconds);
}

void UKhaaosCloudSaveProduction::StartRetry(ERetryOperation Operation, const FString& SlotName)
{
	if (CurrentRetryCount >= MaxRetryCount)
	{
		UE_LOG(LogKhaaosCloudSaveProd, Error,
			TEXT("Retry: Máximo de retries atingido (%d) para slot '%s'. Desistindo."),
			MaxRetryCount, *SlotName);

		Metrics.NetworkFailures++;
		bIsSyncing = false;

		if (Operation == ERetryOperation::Save)
		{
			OnProdSaveComplete.Broadcast(SlotName, false, TEXT("Max retries exceeded"));
		}
		else if (Operation == ERetryOperation::Load)
		{
			OnProdLoadComplete.Broadcast(SlotName, nullptr, false);
		}

		ActiveRetryOperation = ERetryOperation::None;
		return;
	}

	CurrentRetryCount++;
	ActiveRetryOperation = Operation;
	RetrySlotName = SlotName;

	const float Delay = CalculateRetryDelay();

	UE_LOG(LogKhaaosCloudSaveProd, Warning,
		TEXT("Retry: Tentativa %d/%d para slot '%s' em %.1fs (backoff exponencial)."),
		CurrentRetryCount, MaxRetryCount, *SlotName, Delay);

	Metrics.RetryCount++;

	// Agenda retry via timer
	UWorld* World = GetWorld();
	if (World)
	{
		FTimerHandle RetryTimerHandle;
		World->GetTimerManager().SetTimer(
			RetryTimerHandle,
			this,
			&UKhaaosCloudSaveProduction::OnRetryTimer,
			Delay,
			false
		);
	}
}

void UKhaaosCloudSaveProduction::OnRetryTimer()
{
	UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("Retry: Executando retry para slot '%s'."), *RetrySlotName);

	switch (ActiveRetryOperation)
	{
		case ERetryOperation::Save:
		{
			if (CurrentSaveData)
			{
				SaveToCloudProduction(RetrySlotName, CurrentSaveData);
			}
			break;
		}
		case ERetryOperation::Load:
		{
			LoadFromCloudProduction(RetrySlotName);
			break;
		}
		default:
		{
			break;
		}
	}

	ActiveRetryOperation = ERetryOperation::None;
}

float UKhaaosCloudSaveProduction::CalculateRetryDelay() const
{
	// Exponential backoff: base * 2^attempt + jitter
	const float ExponentialDelay = RetryBaseDelaySeconds * FMath::Pow(2.0f, static_cast<float>(CurrentRetryCount - 1));

	// Jitter aleatório entre 0-1s para evitar thundering herd
	const float Jitter = FMath::FRand() * 1.0f;

	// Clamp ao máximo
	return FMath::Min(ExponentialDelay + Jitter, RetryMaxDelaySeconds);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Metrics
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosCloudSaveProduction::ResetMetrics()
{
	Metrics.Reset();
	UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("Métricas resetadas."));
	OnMetricsUpdated.Broadcast(Metrics);
}

TArray<FKhaaosSaveMetadata> UKhaaosCloudSaveProduction::GetAllSaveMetadata() const
{
	return SaveMetadataCache;
}

void UKhaaosCloudSaveProduction::RecordSaveMetric(float DurationMs)
{
	Metrics.SaveCount++;
	Metrics.AverageSaveTimeMs = (Metrics.AverageSaveTimeMs * (Metrics.SaveCount - 1) + DurationMs) / Metrics.SaveCount;
	Metrics.LastSaveTimestamp = FDateTime::UtcNow().ToIso8601();
	OnMetricsUpdated.Broadcast(Metrics);
}

void UKhaaosCloudSaveProduction::RecordLoadMetric(float DurationMs)
{
	Metrics.LoadCount++;
	Metrics.AverageLoadTimeMs = (Metrics.AverageLoadTimeMs * (Metrics.LoadCount - 1) + DurationMs) / Metrics.LoadCount;
	Metrics.LastLoadTimestamp = FDateTime::UtcNow().ToIso8601();
	OnMetricsUpdated.Broadcast(Metrics);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EOS Internal Operations
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosCloudSaveProduction::EOSUploadProduction(const FString& SlotName, const TArray<uint8>& Data, const FKhaaosSaveMetadata& Meta)
{
	// EOS CloudStorage Upload com metadata de produção
	//
	// EOS_HCloudStorage CloudStorage = EOS_Platform_GetCloudStorageInterface(EOSPlatform);
	//
	// EOS_CloudStorage_FileTransferRequest UploadRequest = {};
	// UploadRequest.ApiVersion = EOS_CLOUDSTORAGE_FILETRANSFERREQUEST_API_LATEST;
	// UploadRequest.FileName = TCHAR_TO_ANSI(*SlotName);
	// UploadRequest.FileLengthData = Data.Num();
	//
	// auto ReadCallback = [](void* InData, uint32_t InDataLengthBytes, void* InClientData) -> int32_t
	// {
	//     FMemory::Memcpy(InData, DataPtr, InDataLengthBytes);
	//     return 0; // Success
	// };
	//
	// EOS_CloudStorage_WriteFile(CloudStorage, &UploadRequest, nullptr,
	//     [](const EOS_CloudStorage_WriteFileCallbackInfo* Info) { ... });

	// Atualiza metadata cache
	UpdateMetadataCache(SlotName, Meta);

	// Simula completion imediato (produção usa callback real do EOS SDK)
	HandleUploadComplete(SlotName, true, TEXT(""));
}

void UKhaaosCloudSaveProduction::EOSDownloadProduction(const FString& SlotName)
{
	// EOS CloudStorage Download com validação de metadata
	//
	// EOS_HCloudStorage CloudStorage = EOS_Platform_GetCloudStorageInterface(EOSPlatform);
	//
	// EOS_CloudStorage_FileMetadata FileMeta;
	// EOS_CloudStorage_QueryFile(CloudStorage, &QueryOptions, nullptr, Callback);
	// EOS_CloudStorage_ReadFile(CloudStorage, &ReadRequest, nullptr, Callback);

	// Simula download vazio (produção usa callback real do EOS SDK)
	TArray<uint8> EmptyData;
	HandleDownloadComplete(SlotName, EmptyData, false);
}

void UKhaaosCloudSaveProduction::EOSQueryFileListProduction()
{
	// EOS_CloudStorage_QueryFileListOptions QueryOptions = {};
	// QueryOptions.ApiVersion = EOS_CLOUDSTORAGE_QUERYFILELIST_API_LATEST;
	// EOS_CloudStorage_QueryFileList(CloudStorage, &QueryOptions, nullptr, Callback);

	UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("EOSQueryFileListProduction: Query file list."));
}

void UKhaaosCloudSaveProduction::HandleUploadComplete(const FString& SlotName, bool bSuccess, const FString& Error)
{
	bIsSyncing = false;

	if (bSuccess)
	{
		UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("SaveToCloudProduction: Slot '%s' upload sucesso."), *SlotName);
	}
	else
	{
		UE_LOG(LogKhaaosCloudSaveProd, Error, TEXT("SaveToCloudProduction: Slot '%s' upload FALHOU: %s"), *SlotName, *Error);

		// Inicia retry com exponential backoff em falha de rede
		StartRetry(ERetryOperation::Save, SlotName);
		return;
	}

	OnProdSaveComplete.Broadcast(SlotName, bSuccess, Error);
}

void UKhaaosCloudSaveProduction::HandleDownloadComplete(const FString& SlotName, const TArray<uint8>& Data, bool bSuccess)
{
	bIsSyncing = false;

	UKhaaosSaveGame* LoadedSave = nullptr;

	if (bSuccess && Data.Num() > 0)
	{
		// Descompressão LZ4 se necessário
		TArray<uint8> DecompressedData;
		bool bWasCompressed = false;

		// Verifica metadata para saber se está comprimido
		for (const FKhaaosSaveMetadata& Meta : SaveMetadataCache)
		{
			if (Meta.SlotName == SlotName && Meta.bIsCompressed)
			{
				bWasCompressed = true;
				DecompressedData = DecompressSaveData(Data, static_cast<int32>(Meta.SizeBytes));
				break;
			}
		}

		if (!bWasCompressed)
		{
			DecompressedData = Data;
		}

		// Valida checksum
		const FString ReceivedChecksum = ComputeChecksum(Data);
		for (const FKhaaosSaveMetadata& Meta : SaveMetadataCache)
		{
			if (Meta.SlotName == SlotName && Meta.Checksum != ReceivedChecksum)
			{
				UE_LOG(LogKhaaosCloudSaveProd, Error,
					TEXT("LoadFromCloudProduction: Checksum inválido para slot '%s'. Dados corrompidos?"),
					*SlotName);
			}
		}

		// Converte bytes para JSON string
		FString JsonString;
		JsonString.AppendChars(reinterpret_cast<const TCHAR*>(DecompressedData.GetData()),
			DecompressedData.Num() / sizeof(TCHAR));

		// Desserializa em UKhaaosSaveGame
		LoadedSave = NewObject<UKhaaosSaveGame>(this);
		if (!LoadedSave->FromJson(JsonString))
		{
			UE_LOG(LogKhaaosCloudSaveProd, Error, TEXT("LoadFromCloudProduction: Falha ao desserializar slot '%s'."), *SlotName);
			LoadedSave = nullptr;
		}
		else
		{
			// Verifica versão do schema e migra se necessário
			for (const FKhaaosSaveMetadata& Meta : SaveMetadataCache)
			{
				if (Meta.SlotName == SlotName && Meta.Version < CurrentSaveVersion)
				{
					UE_LOG(LogKhaaosCloudSaveProd, Log,
						TEXT("LoadFromCloudProduction: Migração necessária v%d→v%d para slot '%s'."),
						Meta.Version, CurrentSaveVersion, *SlotName);
					LoadedSave = MigrateSave(LoadedSave, Meta.Version);
				}
			}

			// Merge com save local se existir
			if (CurrentSaveData)
			{
				FKhaaosMergeResult MergeResult = ResolveMergeConflict(CurrentSaveData, LoadedSave);
				if (MergeResult.bSuccess)
				{
					LoadedSave = MergeResult.MergedSave;
					if (MergeResult.ConflictsResolved > 0)
					{
						OnMergeConflict.Broadcast(SlotName, MergeResult.ConflictsResolved);
					}
				}
			}

			UE_LOG(LogKhaaosCloudSaveProd, Log, TEXT("LoadFromCloudProduction: Slot '%s' download sucesso."), *SlotName);
		}
	}
	else if (!bSuccess)
	{
		UE_LOG(LogKhaaosCloudSaveProd, Error, TEXT("LoadFromCloudProduction: Slot '%s' download FALHOU."), *SlotName);

		// Inicia retry com exponential backoff em falha de rede
		StartRetry(ERetryOperation::Load, SlotName);
		return;
	}
	else
	{
		UE_LOG(LogKhaaosCloudSaveProd, Warning, TEXT("LoadFromCloudProduction: Slot '%s' download vazio."), *SlotName);
	}

	OnProdLoadComplete.Broadcast(SlotName, LoadedSave, bSuccess && (LoadedSave != nullptr));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════════

void UKhaaosCloudSaveProduction::UpdateMetadataCache(const FString& SlotName, const FKhaaosSaveMetadata& Meta)
{
	bool bFound = false;
	for (FKhaaosSaveMetadata& CachedMeta : SaveMetadataCache)
	{
		if (CachedMeta.SlotName == SlotName)
		{
			CachedMeta = Meta;
			bFound = true;
			break;
		}
	}

	if (!bFound)
	{
		SaveMetadataCache.Add(Meta);
	}
}

FString UKhaaosCloudSaveProduction::ComputeChecksum(const TArray<uint8>& Data) const
{
	// SHA1 hash para checksum de integridade (UE5 não tem SHA256 built-in sem plugin)
	// Produção pode migrar para SHA256 via OpenSSL
	FSHA1 Sha1Gen;
	Sha1Gen.Update(Data.GetData(), Data.Num());
	Sha1Gen.Final();

	// Converte hash para string hex
	const uint8* HashBytes = Sha1Gen.GetHash();
	FString HexString;
	for (int32 i = 0; i < 20; ++i) // SHA1 = 20 bytes
	{
		HexString += FString::Printf(TEXT("%02x"), HashBytes[i]);
	}

	return HexString;
}
