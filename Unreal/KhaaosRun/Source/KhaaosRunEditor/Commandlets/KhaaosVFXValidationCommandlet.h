// ==============================================================================
// KHAAOS RUN - PLATAFORMA BATTLE ROYALE (MUNDO DEVS PH.D)
// COMMANDLET: UKhaaosVFXValidationCommandlet
// PROPÓSITO: Execução Headless via Linha de Comando Linux para teste das 48
//            habilidades e 27 VFX Niagara sem interface gráfica (RHI Nulo).
// ==============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"
#include "KhaaosVFXValidationCommandlet.generated.h"

UCLASS()
class KHAAOSRUNEDITOR_API UKhaaosVFXValidationCommandlet : public UCommandlet
{
    GENERATED_BODY()

public:
    UKhaaosVFXValidationCommandlet();

    // Ponto de entrada nativo do loop de execução do terminal
    virtual int32 Main(const FString& Params) override;
};
