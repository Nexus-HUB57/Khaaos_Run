// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"

/**
 * KhaaosEAC — camada de build do Easy Anti-Cheat SDK.
 *
 * Contrato: o build do projeto NUNCA quebra pela ausência dos binários oficiais
 * do EAC (distribuídos pela Epic via dev portal, não-redistribuíveis). O módulo
 * detecta o SDK em tempo de BUILD:
 *
 *   - KHAAOS_EAC_SDK=1  → SDK presente (env KHAAOS_EAC_SDK_DIR ou
 *     Source/KhaaosEAC/EACSDK com Sdk/anticheat/sdkdefines.h); include paths e
 *     libs declaradas no Build.cs — integração C real mora no
 *     KhaaosEACIntegration (Game/AntiCheat), já preparado para receber as
 *     chamadas quando os binários existirem;
 *   - KHAAOS_EAC_SDK=0  → modo stub: módulo compila sem SDK e o runtime opera
 *     apenas com a validação local (KhaaosMovementValidator/KhaaosAntiCheat).
 *
 * Namespace puro em C (sem UHT/UCLASS de propósito — nada aqui precisa de
 * reflexão e headers gerados dependem da engine).
 */
namespace KhaaosEACSupport
{
	/** true quando compilado com o SDK real presente (KHAAOS_EAC_SDK=1). */
	KHAOOSEAC_API bool IsSDKAvailable();

	/** Status legível: "stub" (sem binários) ou "sdk" (binários vinculados). */
	KHAOOSEAC_API FString SdkStatus();
}
