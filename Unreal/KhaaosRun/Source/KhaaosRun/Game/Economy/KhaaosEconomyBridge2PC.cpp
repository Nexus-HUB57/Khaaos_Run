// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ==============================================================================
// IMPLEMENTAÇÃO: UKhaaosEconomyBridge2PC
// Two-Phase Commit para transações atômicas de KRC.
// Protocolo: Prepare (lock) → Commit (finalize) ou Abort (release + refund).
// HTTP integration via FHttpModule, idempotency key validation, timeout recovery.
// ==============================================================================

#include "Game/Character/KhaaosEconomyBridge2PC.h"
#include "KhaaosRun.h"

#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonSerializer.h"
#include "Engine/Engine.h"
#include "Misc/Guid.h"
#include "Misc/DateTime.h"

// ─── Constructor ─────────────────────────────────────────────────────────────

UKhaaosEconomyBridge2PC::UKhaaosEconomyBridge2PC()
{
    TransactionTimeoutSec       = 30.0f;
    MaxConcurrentTransactions   = 50;
    CoordinatorNodeID           = TEXT("ue5-client-001");
    ApiBaseUrl                  = TEXT("http://localhost:3001");
    RequestTimeout              = 15.0f;
    HttpModule                  = nullptr;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

void UKhaaosEconomyBridge2PC::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    HttpModule = &FHttpModule::Get();

    // Iniciar timer de recovery periódico (a cada 10s)
    StartRecoveryTimer();

    UE_LOG(LogKhaaosRun, Log, TEXT("[2PC] EconomyBridge2PC inicializado (coordinator=%s, timeout=%.1fs, max=%d, API=%s)"),
        *CoordinatorNodeID, TransactionTimeoutSec, MaxConcurrentTransactions, *ApiBaseUrl);
}

void UKhaaosEconomyBridge2PC::Deinitialize()
{
    StopRecoveryTimer();

    // Abortar todas as transações ativas ao desinicializar
    TArray<FString> ActiveKeys;
    ActiveTransactions.GetKeys(ActiveKeys);

    for (const FString& TxID : ActiveKeys)
    {
        FKhaaos2PCTransaction* Tx = ActiveTransactions.Find(TxID);
        if (Tx && Tx->Status != EKhaaos2PCStatus::Committed && Tx->Status != EKhaaos2PCStatus::Aborted)
        {
            UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Abortando transação órfã no deinit: %s"), *TxID);
            UpdateTransactionStatus(TxID, EKhaaos2PCPhase::Abort, EKhaaos2PCStatus::Aborted);
        }
    }

    ActiveTransactions.Empty();
    UsedIdempotencyKeys.Empty();
    TransactionCreatedTimes.Empty();

    Super::Deinitialize();

    UE_LOG(LogKhaaosRun, Log, TEXT("[2PC] EconomyBridge2PC desinicializado"));
}

// ─── Transaction Lifecycle ───────────────────────────────────────────────────

FString UKhaaosEconomyBridge2PC::BeginTransaction(int32 PlayerID, int32 AmountKRC, const FString& ItemID, const FString& IdempotencyKey, const FString& Description)
{
    // Validar idempotency key — prevenir double-spend
    if (!ValidateIdempotencyKey(IdempotencyKey))
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Idempotency key já usada: %s (possível double-spend)"), *IdempotencyKey);
        return TEXT("");
    }

    // Verificar limite de transações concorrentes
    if (ActiveTransactions.Num() >= MaxConcurrentTransactions)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Máximo de transações concorrentes atingido (%d)"), MaxConcurrentTransactions);
        return TEXT("");
    }

    // Validar amount
    if (AmountKRC <= 0)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Amount KRC inválido: %d"), AmountKRC);
        return TEXT("");
    }

    // Gerar Transaction ID (GUID)
    FString TransactionID = GenerateTransactionGUID();

    // Criar transação
    FKhaaos2PCTransaction Tx;
    Tx.TransactionID    = TransactionID;
    Tx.Phase            = EKhaaos2PCPhase::None;
    Tx.Status           = EKhaaos2PCStatus::Idle;
    Tx.IdempotencyKey   = IdempotencyKey;
    Tx.AmountKRC        = AmountKRC;
    Tx.Description      = Description;
    Tx.PlayerID         = PlayerID;
    Tx.ItemID           = ItemID;
    Tx.CreatedTimestamp  = GenerateTimestampISO8601();
    Tx.CoordinatorNodeID = CoordinatorNodeID;

    // Calcular expiry timestamp
    FDateTime Now = FDateTime::UtcNow();
    FDateTime Expiry = Now + FTimespan(0, 0, static_cast<int32>(TransactionTimeoutSec));
    Tx.ExpiryTimestamp = Expiry.ToIso8601();

    // Registrar
    ActiveTransactions.Add(TransactionID, Tx);
    UsedIdempotencyKeys.Add(IdempotencyKey);
    TransactionCreatedTimes.Add(TransactionID, FPlatformTime::Seconds());

    UE_LOG(LogKhaaosRun, Log, TEXT("[2PC] Transação criada: %s (player=%d, amount=%d KRC, item=%s, idempotency=%s)"),
        *TransactionID, PlayerID, AmountKRC, *ItemID, *IdempotencyKey);

    return TransactionID;
}

void UKhaaosEconomyBridge2PC::PreparePhase(const FString& TransactionID, const FOn2PCCompleted& OnCompleted, const FOn2PCFailed& OnFailed)
{
    FKhaaos2PCTransaction* Tx = ActiveTransactions.Find(TransactionID);
    if (!Tx)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Prepare: transação não encontrada: %s"), *TransactionID);
        if (OnFailed.IsBound())
        {
            OnFailed.Execute(TransactionID, EKhaaos2PCStatus::Idle, TEXT("Transaction not found"));
        }
        return;
    }

    // Verificar se transação está em estado válido para prepare
    if (Tx->Status != EKhaaos2PCStatus::Idle && Tx->Status != EKhaaos2PCStatus::Preparing)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Prepare: status inválido (%s) para transação: %s"),
            *UEnum::GetDisplayValueAsText(Tx->Status).ToString(), *TransactionID);
        if (OnFailed.IsBound())
        {
            OnFailed.Execute(TransactionID, Tx->Status, TEXT("Invalid status for prepare"));
        }
        return;
    }

    // Atualizar status para Preparing
    UpdateTransactionStatus(TransactionID, EKhaaos2PCPhase::Prepare, EKhaaos2PCStatus::Preparing);

    // Construir JSON body para /api/economy/2pc/prepare
    FString JsonBody = FString::Printf(TEXT(
        "{\"transactionId\":\"%s\","
        "\"idempotencyKey\":\"%s\","
        "\"amountKrc\":%d,"
        "\"playerId\":%d,"
        "\"itemId\":\"%s\","
        "\"description\":\"%s\","
        "\"coordinatorNodeId\":\"%s\","
        "\"expiryTimestamp\":\"%s\"}"),
        *TransactionID,
        *Tx->IdempotencyKey,
        Tx->AmountKRC,
        Tx->PlayerID,
        *Tx->ItemID,
        *Tx->Description,
        *Tx->CoordinatorNodeID,
        *Tx->ExpiryTimestamp
    );

    // Enviar HTTP POST para prepare
    SendPostRequest(TEXT("/api/economy/2pc/prepare"), JsonBody,
        [this, TransactionID, OnCompleted, OnFailed](bool bSuccess, const FString& Response)
        {
            FKhaaos2PCTransaction* CurrentTx = ActiveTransactions.Find(TransactionID);
            if (!CurrentTx)
            {
                // Transação já foi removida (timeout recovery, etc.)
                return;
            }

            if (bSuccess)
            {
                // Parse resposta para verificar se todos participantes ACK
                TSharedPtr<FJsonObject> RootObject;
                TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response);

                bool bAllPrepared = false;
                if (FJsonSerializer::Deserialize(Reader, RootObject) && RootObject.IsValid())
                {
                    bAllPrepared = RootObject->GetBoolField(TEXT("prepared"));
                }

                if (bAllPrepared)
                {
                    // Todos participantes preparados — atualizar para Prepared
                    UpdateTransactionStatus(TransactionID, EKhaaos2PCPhase::Prepare, EKhaaos2PCStatus::Prepared);

                    UE_LOG(LogKhaaosRun, Log, TEXT("[2PC] Prepare sucesso: %s (KRC locked)"), *TransactionID);

                    // Auto-commit após prepare sucesso
                    CommitPhase(TransactionID, OnCompleted, OnFailed);
                }
                else
                {
                    // Prepare falhou no servidor — abort
                    FString Reason = TEXT("Prepare rejected by server");
                    if (RootObject.IsValid() && RootObject->HasField(TEXT("reason")))
                    {
                        Reason = RootObject->GetStringField(TEXT("reason"));
                    }

                    UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Prepare falhou: %s (reason: %s)"), *TransactionID, *Reason);
                    AbortPhase(TransactionID, Reason, OnFailed);
                }
            }
            else
            {
                // HTTP request falhou — abort
                UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Prepare HTTP falhou: %s"), *TransactionID);
                AbortPhase(TransactionID, TEXT("HTTP request failed"), OnFailed);
            }
        }
    );
}

void UKhaaosEconomyBridge2PC::CommitPhase(const FString& TransactionID, const FOn2PCCompleted& OnCompleted, const FOn2PCFailed& OnFailed)
{
    FKhaaos2PCTransaction* Tx = ActiveTransactions.Find(TransactionID);
    if (!Tx)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Commit: transação não encontrada: %s"), *TransactionID);
        if (OnFailed.IsBound())
        {
            OnFailed.Execute(TransactionID, EKhaaos2PCStatus::Idle, TEXT("Transaction not found"));
        }
        return;
    }

    // Verificar status — deve estar Prepared
    if (Tx->Status != EKhaaos2PCStatus::Prepared)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Commit: status inválido (%s) para transação: %s"),
            *UEnum::GetDisplayValueAsText(Tx->Status).ToString(), *TransactionID);
        if (OnFailed.IsBound())
        {
            OnFailed.Execute(TransactionID, Tx->Status, TEXT("Invalid status for commit"));
        }
        return;
    }

    // Atualizar status para Committing
    UpdateTransactionStatus(TransactionID, EKhaaos2PCPhase::Commit, EKhaaos2PCStatus::Committing);

    // Construir JSON body para /api/economy/2pc/commit
    FString JsonBody = FString::Printf(TEXT(
        "{\"transactionId\":\"%s\"}"),
        *TransactionID
    );

    // Enviar HTTP POST para commit
    SendPostRequest(TEXT("/api/economy/2pc/commit"), JsonBody,
        [this, TransactionID, OnCompleted, OnFailed](bool bSuccess, const FString& Response)
        {
            FKhaaos2PCTransaction* CurrentTx = ActiveTransactions.Find(TransactionID);
            if (!CurrentTx) return;

            if (bSuccess)
            {
                // Commit sucesso
                UpdateTransactionStatus(TransactionID, EKhaaos2PCPhase::Commit, EKhaaos2PCStatus::Committed);

                int32 Amount = CurrentTx->AmountKRC;

                UE_LOG(LogKhaaosRun, Log, TEXT("[2PC] Commit sucesso: %s (%d KRC debitado)"), *TransactionID, Amount);

                // Disparar callback de sucesso
                if (OnCompleted.IsBound())
                {
                    OnCompleted.Execute(TransactionID, Amount);
                }

                // Cleanup transação completada
                CleanupTransaction(TransactionID);
            }
            else
            {
                // Commit falhou — isso é crítico, transação está em estado inconsistente
                // Manter como Committing para recovery manual
                UE_LOG(LogKhaaosRun, Error, TEXT("[2PC] Commit FALHOU: %s — REQUER INTERVENÇÃO MANUAL"), *TransactionID);

                if (OnFailed.IsBound())
                {
                    OnFailed.Execute(TransactionID, EKhaaos2PCStatus::Committing, TEXT("Commit failed - requires manual recovery"));
                }
            }
        }
    );
}

void UKhaaosEconomyBridge2PC::AbortPhase(const FString& TransactionID, const FString& Reason, const FOn2PCFailed& OnFailed)
{
    FKhaaos2PCTransaction* Tx = ActiveTransactions.Find(TransactionID);
    if (!Tx)
    {
        UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Abort: transação não encontrada: %s"), *TransactionID);
        return;
    }

    // Verificar se já está committed (não pode abortar)
    if (Tx->Status == EKhaaos2PCStatus::Committed)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[2PC] Abort: transação já committed: %s"), *TransactionID);
        return;
    }

    // Atualizar status para Aborting
    UpdateTransactionStatus(TransactionID, EKhaaos2PCPhase::Abort, EKhaaos2PCStatus::Aborting);

    // Salvar razão do abort
    Tx->AbortReason = Reason.IsEmpty() ? TEXT("Client abort") : Reason;

    // Construir JSON body para /api/economy/2pc/abort
    FString JsonBody = FString::Printf(TEXT(
        "{\"transactionId\":\"%s\","
        "\"reason\":\"%s\"}"),
        *TransactionID,
        *Tx->AbortReason
    );

    // Enviar HTTP POST para abort
    SendPostRequest(TEXT("/api/economy/2pc/abort"), JsonBody,
        [this, TransactionID, OnFailed](bool bSuccess, const FString& Response)
        {
            FKhaaos2PCTransaction* CurrentTx = ActiveTransactions.Find(TransactionID);
            if (!CurrentTx) return;

            if (bSuccess)
            {
                // Abort sucesso — lock released, refund done
                UpdateTransactionStatus(TransactionID, EKhaaos2PCPhase::Abort, EKhaaos2PCStatus::Aborted);

                UE_LOG(LogKhaaosRun, Log, TEXT("[2PC] Abort sucesso: %s (lock released, refund done)"), *TransactionID);

                if (OnFailed.IsBound())
                {
                    OnFailed.Execute(TransactionID, EKhaaos2PCStatus::Aborted, CurrentTx->AbortReason);
                }

                // Cleanup
                CleanupTransaction(TransactionID);
            }
            else
            {
                // Abort falhou no servidor — situação crítica
                UE_LOG(LogKhaaosRun, Error, TEXT("[2PC] Abort FALHOU no servidor: %s — KRC pode estar locked"), *TransactionID);

                // Manter transação para recovery
                if (OnFailed.IsBound())
                {
                    OnFailed.Execute(TransactionID, EKhaaos2PCStatus::Aborting, TEXT("Abort failed on server - KRC may be locked"));
                }
            }
        }
    );
}

// ─── Query ───────────────────────────────────────────────────────────────────

EKhaaos2PCStatus UKhaaosEconomyBridge2PC::GetTransactionStatus(const FString& TransactionID) const
{
    const FKhaaos2PCTransaction* Tx = ActiveTransactions.Find(TransactionID);
    return Tx ? Tx->Status : EKhaaos2PCStatus::Idle;
}

bool UKhaaosEconomyBridge2PC::GetTransaction(const FString& TransactionID, FKhaaos2PCTransaction& OutTransaction) const
{
    const FKhaaos2PCTransaction* Tx = ActiveTransactions.Find(TransactionID);
    if (Tx)
    {
        OutTransaction = *Tx;
        return true;
    }
    return false;
}

// ─── Recovery ────────────────────────────────────────────────────────────────

void UKhaaosEconomyBridge2PC::RecoverStaleTransactions()
{
    double Now = FPlatformTime::Seconds();
    TArray<FString> StaleTransactionIDs;

    for (const auto& Pair : TransactionCreatedTimes)
    {
        double Elapsed = Now - Pair.Value;

        const FKhaaos2PCTransaction* Tx = ActiveTransactions.Find(Pair.Key);
        if (!Tx) continue;

        // Transações em PREPARED ou PREPARING state por mais de TransactionTimeoutSec
        if ((Tx->Status == EKhaaos2PCStatus::Prepared || Tx->Status == EKhaaos2PCStatus::Preparing) &&
            Elapsed > TransactionTimeoutSec)
        {
            StaleTransactionIDs.Add(Pair.Key);
        }
        // Transações em COMMITTING state por mais de 2x timeout (crítico)
        else if (Tx->Status == EKhaaos2PCStatus::Committing &&
                 Elapsed > (TransactionTimeoutSec * 2.0f))
        {
            StaleTransactionIDs.Add(Pair.Key);
        }
    }

    for (const FString& TxID : StaleTransactionIDs)
    {
        FKhaaos2PCTransaction* Tx = ActiveTransactions.Find(TxID);
        if (!Tx) continue;

        UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] Recovery: transação stale detectada: %s (status=%s, elapsed=%.1fs)"),
            *TxID, *UEnum::GetDisplayValueAsText(Tx->Status).ToString(),
            (Now - TransactionCreatedTimes.FindRef(TxID)));

        // Se em PREPARED/PREPARING, abortar (refund)
        if (Tx->Status == EKhaaos2PCStatus::Prepared || Tx->Status == EKhaaos2PCStatus::Preparing)
        {
            // Atualizar para timeout e abort
            UpdateTransactionStatus(TxID, EKhaaos2PCPhase::Abort, EKhaaos2PCStatus::Timeout);

            // Enviar abort para servidor
            FString JsonBody = FString::Printf(TEXT(
                "{\"transactionId\":\"%s\","
                "\"reason\":\"Timeout recovery (stale in %s state)\"}"),
                *TxID,
                *UEnum::GetDisplayValueAsText(Tx->Status).ToString()
            );

            SendPostRequest(TEXT("/api/economy/2pc/abort"), JsonBody,
                [this, TxID](bool bSuccess, const FString& Response)
                {
                    if (bSuccess)
                    {
                        UpdateTransactionStatus(TxID, EKhaaos2PCPhase::Abort, EKhaaos2PCStatus::Aborted);
                        CleanupTransaction(TxID);
                        UE_LOG(LogKhaaosRun, Log, TEXT("[2PC] Recovery: transação abortada com sucesso: %s"), *TxID);
                    }
                    else
                    {
                        UE_LOG(LogKhaaosRun, Error, TEXT("[2PC] Recovery: falha ao abortar transação stale: %s"), *TxID);
                    }
                }
            );
        }
        // Se em COMMITTING, marcar como timeout mas não abortar (pode ter commitado)
        else if (Tx->Status == EKhaaos2PCStatus::Committing)
        {
            UpdateTransactionStatus(TxID, EKhaaos2PCPhase::Commit, EKhaaos2PCStatus::Timeout);
            UE_LOG(LogKhaaosRun, Error, TEXT("[2PC] Recovery: transação COMMITTING timeout — REQUER VERIFICAÇÃO MANUAL: %s"), *TxID);
        }
    }

    if (StaleTransactionIDs.Num() > 0)
    {
        UE_LOG(LogKhaaosRun, Log, TEXT("[2PC] Recovery: %d transações stale processadas"), StaleTransactionIDs.Num());
    }
}

bool UKhaaosEconomyBridge2PC::ValidateIdempotencyKey(const FString& IdempotencyKey) const
{
    if (IdempotencyKey.IsEmpty()) return false;
    return !UsedIdempotencyKeys.Contains(IdempotencyKey);
}

// ─── Internal ────────────────────────────────────────────────────────────────

FString UKhaaosEconomyBridge2PC::GenerateTransactionGUID() const
{
    FGuid Guid = FGuid::NewGuid();
    return Guid.ToString(EGuidFormats::DigitsWithHyphensLower);
}

FString UKhaaosEconomyBridge2PC::GenerateTimestampISO8601() const
{
    return FDateTime::UtcNow().ToIso8601();
}

void UKhaaosEconomyBridge2PC::SendPostRequest(const FString& Endpoint, const FString& JsonBody, TFunction<void(bool, const FString&)> Callback)
{
    if (!HttpModule)
    {
        UE_LOG(LogKhaaosRun, Error, TEXT("[2PC] HttpModule não disponível"));
        Callback(false, TEXT(""));
        return;
    }

    FString Url = ApiBaseUrl + Endpoint;

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = HttpModule->CreateRequest();
    Request->SetURL(Url);
    Request->SetVerb(TEXT("POST"));
    Request->SetContentAsString(JsonBody);
    Request->SetTimeout(RequestTimeout);
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetHeader(TEXT("X-Coordinator-Node"), CoordinatorNodeID);

    Request->OnProcessRequestComplete().BindLambda(
        [Callback](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bWasSuccessful)
        {
            if (bWasSuccessful && Resp.IsValid() && Resp->GetResponseCode() == 200)
            {
                Callback(true, Resp->GetContentAsString());
            }
            else
            {
                int32 Code = Resp.IsValid() ? Resp->GetResponseCode() : 0;
                FString ErrorMsg = Resp.IsValid() ? Resp->GetContentAsString() : TEXT("");
                UE_LOG(LogKhaaosRun, Warning, TEXT("[2PC] HTTP POST falhou: %s (code=%d, error=%s)"),
                    *Req->GetURL(), Code, *ErrorMsg);
                Callback(false, ErrorMsg);
            }
        }
    );

    Request->ProcessRequest();
}

void UKhaaosEconomyBridge2PC::UpdateTransactionStatus(const FString& TransactionID, EKhaaos2PCPhase Phase, EKhaaos2PCStatus Status)
{
    FKhaaos2PCTransaction* Tx = ActiveTransactions.Find(TransactionID);
    if (Tx)
    {
        Tx->Phase = Phase;
        Tx->Status = Status;

        UE_LOG(LogKhaaosRun, Verbose, TEXT("[2PC] Status update: %s → phase=%s, status=%s"),
            *TransactionID,
            *UEnum::GetDisplayValueAsText(Phase).ToString(),
            *UEnum::GetDisplayValueAsText(Status).ToString());
    }
}

void UKhaaosEconomyBridge2PC::CleanupTransaction(const FString& TransactionID)
{
    ActiveTransactions.Remove(TransactionID);
    TransactionCreatedTimes.Remove(TransactionID);

    // Nota: NÃO removemos idempotency key — ela deve permanecer para prevenir double-spend
    // Em produção, as keys seriam periodicamente limpas após TTL
}

void UKhaaosEconomyBridge2PC::StartRecoveryTimer()
{
    if (!GEngine || !GEngine->GetWorldContexts().Num()) return;

    UWorld* World = GEngine->GetWorldContexts()[0].ThisWorldNotGameThread;
    if (!World) return;

    // Timer de recovery a cada 10 segundos
    World->GetTimerManager().SetTimer(
        RecoveryTimer,
        [this]()
        {
            RecoverStaleTransactions();
        },
        10.0f,  // Intervalo de 10s
        true    // Loop
    );
}

void UKhaaosEconomyBridge2PC::StopRecoveryTimer()
{
    if (!GEngine || !GEngine->GetWorldContexts().Num()) return;

    UWorld* World = GEngine->GetWorldContexts()[0].ThisWorldNotGameThread;
    if (!World) return;

    World->GetTimerManager().ClearTimer(RecoveryTimer);
}
