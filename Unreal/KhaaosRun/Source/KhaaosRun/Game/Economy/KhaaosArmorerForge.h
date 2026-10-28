// Copyright Nexus-HUB57. All Rights Reserved.
// Forja do Armeiro – Marketplace de equipamentos pagos em KRC

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "Components/PointLightComponent.h"
#include "Game/Economy/KhaaosForgeItem.h"
#include "Game/Economy/KhaaosEconomyBridge2PC.h"
#include "NiagaraSystem.h"
#include "Sound/SoundCue.h"
#include "KhaaosArmorerForge.generated.h"

class UKhaaosBankhaoosComponent;
class UDataTable;
class UUserWidget;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnForgePurchase, FName, ItemId, int32, PricePaid);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnForgeOpened, APawn*, Player);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnForgeClosed, APawn*, Player);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnForgePurchaseFailed, FName, ItemId, FString, Reason);

/**
 * Forja do Armeiro – loja de equipamentos do CIGKV / mundos.
 *
 * - Catálogo via DataTable (FKhaaosForgeItemRow)
 * - Compra debita KRC via Two-Phase Commit (UKhaaosEconomyBridge2PC)
 *   quando habilitado: PREPARE trava o saldo no servidor (escrow),
 *   COMMIT finaliza e só então o item é entregue; falha → ABORT reembolsa.
 *   Fallback local (Bankhaoos) permanece para modo offline/sem API.
 * - No CIGKV não há restrição de patente (MinRankLevel ignorado ou = 0)
 * - UI aberta por overlap ou Interact
 */
UCLASS(Blueprintable, BlueprintType)
class KHAAOSRUN_API AKhaaosArmorerForge : public AActor
{
        GENERATED_BODY()

public:
        AKhaaosArmorerForge();

protected:
        virtual void BeginPlay() override;
        virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

public:
        // ============================================================
        // CONFIGURAÇÃO
        // ============================================================

        /** DataTable do catálogo (rows = FKhaaosForgeItemRow) */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Forge")
        UDataTable* CatalogDataTable;

        /** Widget de UI da loja */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Forge|UI")
        TSubclassOf<UUserWidget> ShopWidgetClass;

        /** No CIGKV: ignora MinRankLevel (qualquer um pode comprar) */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Forge")
        bool bIgnoreRankRestriction = true;

        /** Compra via Two-Phase Commit server-side (escrow). Fallback local quando false/indisponível */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Forge|Economy")
        bool bUseTwoPhaseCommit = true;

        /** Niagara de idle (forja / fogo / faíscas) */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Forge|FX")
        UNiagaraSystem* IdleFX;

        /** Niagara de compra bem-sucedida */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Forge|FX")
        UNiagaraSystem* PurchaseFX;

        /** Som de compra */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Forge|Audio")
        USoundCue* PurchaseSound;

        /** Som de erro (saldo insuficiente) */
        UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Forge|Audio")
        USoundCue* ErrorSound;

        // ============================================================
        // COMPONENTES
        // ============================================================

        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
        UStaticMeshComponent* ForgeMesh;

        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
        UBoxComponent* InteractionVolume;

        UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
        UPointLightComponent* ForgeLight;

        // ============================================================
        // EVENTOS
        // ============================================================

        UPROPERTY(BlueprintAssignable, Category = "Forge|Events")
        FOnForgeOpened OnShopOpened;

        UPROPERTY(BlueprintAssignable, Category = "Forge|Events")
        FOnForgeClosed OnShopClosed;

        UPROPERTY(BlueprintAssignable, Category = "Forge|Events")
        FOnForgePurchase OnPurchaseSuccess;

        UPROPERTY(BlueprintAssignable, Category = "Forge|Events")
        FOnForgePurchaseFailed OnPurchaseFailed;

        // ============================================================
        // API
        // ============================================================

        /** Abre a UI da loja para o jogador */
        UFUNCTION(BlueprintCallable, Category = "Forge")
        void OpenShop(APawn* Player);

        /** Fecha a UI */
        UFUNCTION(BlueprintCallable, Category = "Forge")
        void CloseShop();

        /** Tenta comprar um item pelo ItemId */
        UFUNCTION(BlueprintCallable, Category = "Forge")
        bool TryPurchase(APawn* Player, FName ItemId);

        /** True quando a compra está roteada pelo 2PC (bridge disponível e habilitado) */
        UFUNCTION(BlueprintPure, Category = "Forge|Economy")
        bool IsTwoPhaseCommitActive() const;

        /** Número de compras 2PC em andamento (escrow aberto, aguardando commit/abort) */
        UFUNCTION(BlueprintPure, Category = "Forge|Economy")
        int32 GetPendingTwoPhaseCommitCount() const { return Pending2PC.Num(); }

        /** Retorna todas as rows do catálogo (para UI) */
        UFUNCTION(BlueprintCallable, Category = "Forge")
        TArray<FKhaaosForgeItemRow> GetCatalogItems() const;

        /** Busca uma row específica */
        UFUNCTION(BlueprintCallable, Category = "Forge")
        bool GetItemById(FName ItemId, FKhaaosForgeItemRow& OutRow) const;

protected:
        UFUNCTION()
        void OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
                UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

        // ── Handlers 2PC (bound via BindUFunction nos delegates do bridge) ──────

        /** Commit confirmado no servidor: entrega o item e sincroniza o Bankhaoos local */
        UFUNCTION()
        void Handle2PCPurchaseCompleted(const FString& TransactionID, int32 AmountKRC);

        /** Transação falhou/abortada: notifica e limpa */
        UFUNCTION()
        void Handle2PCPurchaseFailed(const FString& TransactionID, EKhaaos2PCStatus FinalStatus, const FString& Reason);

        void GiveItemToPlayer(APawn* Player, const FKhaaosForgeItemRow& Item);
        void PlayPurchaseFeedback();
        void PlayErrorFeedback();

private:
        // ── Integração Two-Phase Commit ─────────────────────────────────────────

        struct FPendingForgePurchase2PC
        {
                TWeakObjectPtr<APawn> Player;
                FName ItemId;
                FKhaaosForgeItemRow Item;
                int32 PriceKRC = 0;
                FString IdempotencyKey;
        };

        UKhaaosEconomyBridge2PC* Get2PCBridge() const;

        /** Abre o fluxo 2PC (BeginTransaction + PreparePhase). Retorna true se aceito. */
        bool TryStartTwoPhasePurchase(APawn* Player, const FKhaaosForgeItemRow& Item, FString& OutFailureReason);

        /** Idempotency key determinística por compra: forge.<item>.<guid32> (charset server-safe) */
        static FString MakeIdempotencyKey(const FName& ItemId);

        /** ID numérico do jogador para o payload do bridge (PlayerState→PlayerId, fallback 0) */
        static int32 GetPlayerNumericId(const APawn* Player);

        void AbandonAllPendingTwoPhasePurchases(const FString& Reason);

        UPROPERTY()
        UUserWidget* ActiveShopWidget = nullptr;

        UPROPERTY()
        TWeakObjectPtr<APawn> CurrentCustomer = nullptr;

        /** Compras 2PC em andamento (TransactionID → dados de retomada nos callbacks) */
        TMap<FString, FPendingForgePurchase2PC> Pending2PC;
};
