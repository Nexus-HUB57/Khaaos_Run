// Copyright Nexus-HUB57. All Rights Reserved.
// Item da Forja do Armeiro

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "KhaaosForgeItem.generated.h"

UENUM(BlueprintType)
enum class EForgeItemCategory : uint8
{
	Weapon		UMETA(DisplayName = "Arma"),
	Armor		UMETA(DisplayName = "Colete / Armadura"),
	Medical		UMETA(DisplayName = "Médico"),
	Throwable	UMETA(DisplayName = "Granada / Mina"),
	Tool		UMETA(DisplayName = "Ferramenta"),
	Upgrade		UMETA(DisplayName = "Upgrade")
};

/**
 * Linha de DataTable para o catálogo da Forja.
 * Crie um DataTable com esta struct e preencha os itens.
 */
USTRUCT(BlueprintType)
struct FKhaaosForgeItemRow : public FTableRowBase
{
	GENERATED_BODY()

	/** ID único do item (ex: "Pistol_9mm") */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FName ItemId;

	/** Nome exibido */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FText DisplayName;

	/** Descrição curta */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FText Description;

	/** Categoria */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	EForgeItemCategory Category = EForgeItemCategory::Weapon;

	/** Preço em KRC */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, meta = (ClampMin = "1"))
	int32 PriceKRC = 50;

	/** Nível mínimo de patente (0 = qualquer um no CIGKV) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	int32 MinRankLevel = 0;

	/** Quantidade entregue por compra */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, meta = (ClampMin = "1"))
	int32 QuantityPerPurchase = 1;

	/** Classe do Actor/Item a spawnar ou adicionar ao inventário (opcional) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	TSubclassOf<AActor> ItemActorClass;

	/** Ícone (para UI) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	TSoftObjectPtr<UTexture2D> Icon;
};
