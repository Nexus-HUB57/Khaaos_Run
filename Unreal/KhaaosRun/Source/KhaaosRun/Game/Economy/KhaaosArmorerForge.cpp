// Copyright Nexus-HUB57. All Rights Reserved.

#include "Game/Economy/KhaaosArmorerForge.h"
#include "Game/Economy/KhaaosBankhaoosComponent.h"
#include "Game/Economy/KhaaosForgeItem.h"
#include "Game/Economy/KhaaosEconomyBridge2PC.h"
#include "NiagaraFunctionLibrary.h"
#include "Kismet/GameplayStatics.h"
#include "Blueprint/UserWidget.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerState.h"
#include "Engine/DataTable.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "KhaaosRun.h"
#include "Misc/Char.h"
#include "Misc/Guid.h"

AKhaaosArmorerForge::AKhaaosArmorerForge()
{
        PrimaryActorTick.bCanEverTick = false;

        ForgeMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ForgeMesh"));
        RootComponent = ForgeMesh;
        ForgeMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
        ForgeMesh->SetCollisionResponseToAllChannels(ECR_Block);

        InteractionVolume = CreateDefaultSubobject<UBoxComponent>(TEXT("InteractionVolume"));
        InteractionVolume->SetupAttachment(RootComponent);
        InteractionVolume->SetBoxExtent(FVector(150.f, 150.f, 180.f));
        InteractionVolume->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
        InteractionVolume->SetCollisionResponseToAllChannels(ECR_Ignore);
        InteractionVolume->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
        InteractionVolume->SetGenerateOverlapEvents(true);

        ForgeLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("ForgeLight"));
        ForgeLight->SetupAttachment(RootComponent);
        ForgeLight->SetRelativeLocation(FVector(0.f, 0.f, 100.f));
        ForgeLight->SetLightColor(FLinearColor(1.0f, 0.45f, 0.1f)); // laranja de forja
        ForgeLight->SetIntensity(2500.f);
        ForgeLight->SetAttenuationRadius(500.f);
        ForgeLight->SetCastShadows(false);
}

void AKhaaosArmorerForge::BeginPlay()
{
        Super::BeginPlay();

        if (InteractionVolume)
        {
                InteractionVolume->OnComponentBeginOverlap.AddDynamic(this, &AKhaaosArmorerForge::OnOverlapBegin);
        }

        if (IdleFX)
        {
                UNiagaraFunctionLibrary::SpawnSystemAttached(
                        IdleFX, RootComponent, NAME_None,
                        FVector(0.f, 0.f, 40.f), FRotator::ZeroRotator,
                        EAttachLocation::KeepRelativeOffset, true
                );
        }

        UE_LOG(LogKhaaosRun, Log, TEXT("[Forja] Inicializada | 2PC=%s"),
                IsTwoPhaseCommitActive() ? TEXT("server-side (escrow)") : TEXT("local (fallback)"));
}

void AKhaaosArmorerForge::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
        // Compras em andamento são abortadas (refund server-side). Órfãos que
        // escapem ao TTL são reembolsados pelo GC do Node.js (recoverExpired).
        AbandonAllPendingTwoPhasePurchases(TEXT("forge-destroyed"));

        Super::EndPlay(EndPlayReason);
}

void AKhaaosArmorerForge::OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
        UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
        APawn* Pawn = Cast<APawn>(OtherActor);
        if (!Pawn || !Pawn->IsPlayerControlled()) return;

        OpenShop(Pawn);
}

void AKhaaosArmorerForge::OpenShop(APawn* Player)
{
        if (!Player || !ShopWidgetClass) return;

        // Fecha UI anterior se houver
        CloseShop();

        APlayerController* PC = Cast<APlayerController>(Player->GetController());
        if (!PC) return;

        ActiveShopWidget = CreateWidget<UUserWidget>(PC, ShopWidgetClass);
        if (ActiveShopWidget)
        {
                ActiveShopWidget->AddToViewport(50);
                CurrentCustomer = Player;
                OnShopOpened.Broadcast(Player);

                // Input mode UI (opcional – o Widget pode gerenciar)
                // FInputModeUIOnly Mode;
                // Mode.SetWidgetToFocus(ActiveShopWidget->TakeWidget());
                // PC->SetInputMode(Mode);
                // PC->bShowMouseCursor = true;

                UE_LOG(LogTemp, Log, TEXT("[Forja] Loja aberta para %s"), *Player->GetName());
        }
}

void AKhaaosArmorerForge::CloseShop()
{
        if (ActiveShopWidget)
        {
                ActiveShopWidget->RemoveFromParent();
                ActiveShopWidget = nullptr;
        }

        if (CurrentCustomer.IsValid())
        {
                OnShopClosed.Broadcast(CurrentCustomer.Get());

                // Restaura input
                // if (APlayerController* PC = Cast<APlayerController>(CurrentCustomer->GetController()))
                // {
                //     PC->SetInputMode(FInputModeGameOnly());
                //     PC->bShowMouseCursor = false;
                // }
        }

        CurrentCustomer = nullptr;
}

bool AKhaaosArmorerForge::TryPurchase(APawn* Player, FName ItemId)
{
        if (!Player || ItemId.IsNone()) return false;

        FKhaaosForgeItemRow Item;
        if (!GetItemById(ItemId, Item))
        {
                OnPurchaseFailed.Broadcast(ItemId, TEXT("Item não encontrado no catálogo"));
                PlayErrorFeedback();
                return false;
        }

        // Restrição de patente (ignorada no CIGKV)
        if (!bIgnoreRankRestriction && Item.MinRankLevel > 0)
        {
                // Em produção: ler patente do PlayerState / RankingService
                // if (PlayerRank < Item.MinRankLevel) { fail... }
        }

        UKhaaosBankhaoosComponent* Bank = Player->FindComponentByClass<UKhaaosBankhaoosComponent>();
        if (!Bank)
        {
                OnPurchaseFailed.Broadcast(ItemId, TEXT("Bankhaoos não encontrado"));
                PlayErrorFeedback();
                return false;
        }

        if (!Bank->HasAccount())
        {
                OnPurchaseFailed.Broadcast(ItemId, TEXT("Conta Bankhaoos não criada – entre no Zu 1 primeiro"));
                PlayErrorFeedback();
                return false;
        }

        if (Bank->GetBalance() < Item.PriceKRC)
        {
                OnPurchaseFailed.Broadcast(ItemId, FString::Printf(TEXT("Saldo insuficiente (%d KRC necessários)"), Item.PriceKRC));
                PlayErrorFeedback();
                UE_LOG(LogTemp, Warning, TEXT("[Forja] Saldo insuficiente: tem %d, precisa %d"), Bank->GetBalance(), Item.PriceKRC);
                return false;
        }

        // ── Rota Two-Phase Commit (servidor autoritativo: escrow → commit → entrega) ──
        if (bUseTwoPhaseCommit)
        {
                FString FailureReason;
                if (TryStartTwoPhasePurchase(Player, Item, FailureReason))
                {
                        // Aceita: resultado chega async via OnPurchaseSuccess/OnPurchaseFailed.
                        return true;
                }

                OnPurchaseFailed.Broadcast(ItemId, FailureReason);
                PlayErrorFeedback();
                return false;
        }

        // ── Fallback legado: débito local (modo offline / sem Economy API) ──
        // Debita KRC
        if (!Bank->DebitKRC(Item.PriceKRC, FString::Printf(TEXT("Forja – %s"), *Item.ItemId.ToString())))
        {
                OnPurchaseFailed.Broadcast(ItemId, TEXT("Falha ao debitar KRC"));
                PlayErrorFeedback();
                return false;
        }

        // Entrega o item
        GiveItemToPlayer(Player, Item);
        PlayPurchaseFeedback();
        OnPurchaseSuccess.Broadcast(ItemId, Item.PriceKRC);

        UE_LOG(LogTemp, Log, TEXT("[Forja] Compra OK | %s por %d KRC | Saldo restante %d"),
                *Item.ItemId.ToString(), Item.PriceKRC, Bank->GetBalance());

        return true;
}

void AKhaaosArmorerForge::GiveItemToPlayer(APawn* Player, const FKhaaosForgeItemRow& Item)
{
        if (!Player) return;

        // 1) Se tiver classe de Actor, spawna perto do player
        if (Item.ItemActorClass)
        {
                const FVector SpawnLoc = Player->GetActorLocation() + Player->GetActorForwardVector() * 80.f + FVector(0, 0, 30.f);
                FActorSpawnParameters Params;
                Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
                GetWorld()->SpawnActor<AActor>(Item.ItemActorClass, SpawnLoc, FRotator::ZeroRotator, Params);
        }

        // 2) Em produção: chamar o InventoryComponent do projeto
        // if (UKhaaosInventoryComponent* Inv = Player->FindComponentByClass<UKhaaosInventoryComponent>())
        // {
        //     Inv->AddItem(Item.ItemId, Item.QuantityPerPurchase);
        // }

        UE_LOG(LogTemp, Log, TEXT("[Forja] Item entregue: %s x%d"), *Item.ItemId.ToString(), Item.QuantityPerPurchase);
}

TArray<FKhaaosForgeItemRow> AKhaaosArmorerForge::GetCatalogItems() const
{
        TArray<FKhaaosForgeItemRow> Result;
        if (!CatalogDataTable) return Result;

        CatalogDataTable->ForeachRow<FKhaaosForgeItemRow>(TEXT("GetCatalogItems"),
                [&Result](const FName& Key, const FKhaaosForgeItemRow& Value)
                {
                        Result.Add(Value);
                });

        return Result;
}

bool AKhaaosArmorerForge::GetItemById(FName ItemId, FKhaaosForgeItemRow& OutRow) const
{
        if (!CatalogDataTable || ItemId.IsNone()) return false;

        const FString Context = TEXT("GetItemById");
        FKhaaosForgeItemRow* Found = CatalogDataTable->FindRow<FKhaaosForgeItemRow>(ItemId, Context, false);
        if (Found)
        {
                OutRow = *Found;
                return true;
        }

        // Fallback: procura por ItemId dentro das rows (caso a row key seja diferente)
        bool bFound = false;
        CatalogDataTable->ForeachRow<FKhaaosForgeItemRow>(Context,
                [&](const FName& Key, const FKhaaosForgeItemRow& Value)
                {
                        if (!bFound && Value.ItemId == ItemId)
                        {
                                OutRow = Value;
                                bFound = true;
                        }
                });

        return bFound;
}

void AKhaaosArmorerForge::PlayPurchaseFeedback()
{
        const FVector Loc = GetActorLocation() + FVector(0.f, 0.f, 50.f);

        if (PurchaseFX)
        {
                UNiagaraFunctionLibrary::SpawnSystemAtLocation(
                        GetWorld(), PurchaseFX, Loc, FRotator::ZeroRotator,
                        FVector(1.0f), true, true, ENCPoolMethod::AutoRelease
                );
        }

        if (PurchaseSound)
        {
                UGameplayStatics::PlaySoundAtLocation(this, PurchaseSound, Loc);
        }
}

void AKhaaosArmorerForge::PlayErrorFeedback()
{
        if (ErrorSound)
        {
                UGameplayStatics::PlaySound2D(this, ErrorSound);
        }
}

// ─── Two-Phase Commit (server autoritativo) ─────────────────────────────────

bool AKhaaosArmorerForge::IsTwoPhaseCommitActive() const
{
        return bUseTwoPhaseCommit && Get2PCBridge() != nullptr;
}

UKhaaosEconomyBridge2PC* AKhaaosArmorerForge::Get2PCBridge() const
{
        return GEngine ? GEngine->GetEngineSubsystem<UKhaaosEconomyBridge2PC>() : nullptr;
}

FString AKhaaosArmorerForge::MakeIdempotencyKey(const FName& ItemId)
{
        // Charset aceito pelo servidor: [A-Za-z0-9._~-], tamanho 16..128.
        // Formato: forge.<itemId sanitizado>.<guid32> — único por tentativa de compra.
        FString Sanitized = ItemId.ToString();
        for (TCHAR& Ch : Sanitized)
        {
                if (!FChar::IsAlnum(Ch) && Ch != TEXT('_') && Ch != TEXT('.') && Ch != TEXT('-') && Ch != TEXT('~'))
                {
                        Ch = TEXT('_');
                }
        }
        return FString::Printf(TEXT("forge.%s.%s"), *Sanitized.Left(60), *FGuid::NewGuid().ToString(EGuidFormats::Digits));
}

int32 AKhaaosArmorerForge::GetPlayerNumericId(const APawn* Player)
{
        const APlayerState* PlayerState = Player ? Player->GetPlayerState() : nullptr;
        return PlayerState ? PlayerState->GetPlayerId() : 0;
}

bool AKhaaosArmorerForge::TryStartTwoPhasePurchase(APawn* Player, const FKhaaosForgeItemRow& Item, FString& OutFailureReason)
{
        UKhaaosEconomyBridge2PC* Bridge = Get2PCBridge();
        if (!Bridge)
        {
                OutFailureReason = TEXT("EconomyBridge2PC indisponível");
                return false;
        }

        // Uma compra em andamento por jogador — evita dupla retenção de saldo
        for (const auto& Pair : Pending2PC)
        {
                if (Pair.Value.Player.Get() == Player)
                {
                        OutFailureReason = TEXT("Já existe uma compra em andamento");
                        return false;
                }
        }

        const FString IdempotencyKey = MakeIdempotencyKey(Item.ItemId);
        const int32 PlayerID = GetPlayerNumericId(Player);
        const FString Description = FString::Printf(TEXT("Forja do Armeiro – %s"), *Item.ItemId.ToString());

        const FString TransactionID = Bridge->BeginTransaction(PlayerID, Item.PriceKRC, Item.ItemId.ToString(), IdempotencyKey, Description);
        if (TransactionID.IsEmpty())
        {
                OutFailureReason = TEXT("Transação 2PC recusada (limite concorrente ou chave duplicada)");
                return false;
        }

        FPendingForgePurchase2PC Pending;
        Pending.Player = Player;
        Pending.ItemId = Item.ItemId;
        Pending.Item = Item;
        Pending.PriceKRC = Item.PriceKRC;
        Pending.IdempotencyKey = IdempotencyKey;
        Pending2PC.Add(TransactionID, MoveTemp(Pending));

        FOn2PCCompleted OnCompleted;
        OnCompleted.BindUFunction(this, GET_FUNCTION_NAME_CHECKED(AKhaaosArmorerForge, Handle2PCPurchaseCompleted));

        FOn2PCFailed OnFailed;
        OnFailed.BindUFunction(this, GET_FUNCTION_NAME_CHECKED(AKhaaosArmorerForge, Handle2PCPurchaseFailed));

        UE_LOG(LogKhaaosRun, Log, TEXT("[Forja] Compra 2PC aberta | tx=%s | item=%s | %d KRC | player=%d"),
                *TransactionID, *Item.ItemId.ToString(), Item.PriceKRC, PlayerID);

        // PREPARE trava o saldo no servidor; bridge auto-commita no ACK e dispara
        // Handle2PCPurchaseCompleted (entrega) ou Handle2PCPurchaseFailed (abort).
        Bridge->PreparePhase(TransactionID, OnCompleted, OnFailed);
        return true;
}

void AKhaaosArmorerForge::Handle2PCPurchaseCompleted(const FString& TransactionID, int32 AmountKRC)
{
        const FPendingForgePurchase2PC* PendingPtr = Pending2PC.Find(TransactionID);
        if (!PendingPtr)
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("[Forja] 2PC commit sem compra pendente: %s"), *TransactionID);
                return;
        }

        const FPendingForgePurchase2PC Pending = *PendingPtr;
        Pending2PC.Remove(TransactionID);

        APawn* Player = Pending.Player.Get();
        if (!Player)
        {
                // Commit confirmado, mas jogador saiu antes da entrega. O débito é
                // permanente no servidor; a entrega do item é perdida (aceito:
                // server GC não devolve COMMITTED).
                UE_LOG(LogKhaaosRun, Error, TEXT("[Forja] 2PC commit de %s após jogador sair — item não entregue (%d KRC)"),
                        *TransactionID, AmountKRC);
                return;
        }

        // Sincroniza o espelho local — o débito autoritativo já ocorreu no servidor
        if (UKhaaosBankhaoosComponent* Bank = Player->FindComponentByClass<UKhaaosBankhaoosComponent>())
        {
                if (!Bank->DebitKRC(Pending.PriceKRC, FString::Printf(TEXT("Forja 2PC – %s"), *Pending.ItemId.ToString())))
                {
                        UE_LOG(LogKhaaosRun, Error, TEXT("[Forja] Espelho local dessincronizado: débito de %d KRC falhou (servidor é autoritativo)"), Pending.PriceKRC);
                }
        }

        GiveItemToPlayer(Player, Pending.Item);
        PlayPurchaseFeedback();
        OnPurchaseSuccess.Broadcast(Pending.ItemId, Pending.PriceKRC);

        UE_LOG(LogKhaaosRun, Log, TEXT("[Forja] Compra 2PC OK | tx=%s | %s por %d KRC"),
                *TransactionID, *Pending.ItemId.ToString(), Pending.PriceKRC);
}

void AKhaaosArmorerForge::Handle2PCPurchaseFailed(const FString& TransactionID, EKhaaos2PCStatus FinalStatus, const FString& Reason)
{
        const FPendingForgePurchase2PC* PendingPtr = Pending2PC.Find(TransactionID);
        if (!PendingPtr)
        {
                return;
        }

        const FPendingForgePurchase2PC Pending = *PendingPtr;
        Pending2PC.Remove(TransactionID);

        if (FinalStatus == EKhaaos2PCStatus::Committing)
        {
                // Crítico: prepare confirmado e commit em estado indeterminado —
                // reconciliado pelo recovery do bridge/server (nunca abortar aqui).
                UE_LOG(LogKhaaosRun, Error, TEXT("[Forja] 2PC COMMIT falhou: %s — requer recuperação manual (%s)"), *TransactionID, *Reason);
        }
        else
        {
                UE_LOG(LogKhaaosRun, Warning, TEXT("[Forja] Compra 2PC falhou: %s (status=%s, motivo=%s)"),
                        *TransactionID, *UEnum::GetDisplayValueAsText(FinalStatus).ToString(), *Reason);
        }

        OnPurchaseFailed.Broadcast(Pending.ItemId, Reason);
        PlayErrorFeedback();
}

void AKhaaosArmorerForge::AbandonAllPendingTwoPhasePurchases(const FString& Reason)
{
        if (Pending2PC.Num() == 0) return;

        UKhaaosEconomyBridge2PC* Bridge = Get2PCBridge();
        TArray<FString> TransactionIDs;
        Pending2PC.GetKeys(TransactionIDs);

        for (const FString& TransactionID : TransactionIDs)
        {
                if (Bridge)
                {
                        Bridge->AbortPhase(TransactionID, Reason, FOn2PCFailed());
                }
                Pending2PC.Remove(TransactionID);
        }

        UE_LOG(LogKhaaosRun, Warning, TEXT("[Forja] %d compra(s) 2PC abandonada(s) (%s) — GC do servidor reembolsa órfãos"),
                TransactionIDs.Num(), *Reason);
}
