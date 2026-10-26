// Copyright Khaaos Run. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KhaaosRingVisualComponent.generated.h"

/**
 * UKhaaosRingVisualComponent - Componente visual que renderiza
 * o ring no mundo UE5. Estilo FreeFire Live Action:
 * bordas eletricas pulsantes, particulas Niagara, gradientes de cor.
 *
 * Responsabilidades:
 * - Renderizar borda do ring (Niagara particles + material)
 * - Atualizar cor/intensidade baseado em fase
 * - Mostrar preview do proximo ring no minimap
 * - Ativar efeitos de electrical storm no ring final
 */
UCLASS(ClassGroup=(Khaaos), meta=(BlueprintSpawnableComponent))
class KHAAOSRUN_API UKhaaosRingVisualComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UKhaaosRingVisualComponent();

    /** Atualiza a visualizacao do ring */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring|Visual")
    void UpdateRingVisual(float InCurrentRadius, float InTargetRadius);

    /** Muda o visual para a fase especificada */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring|Visual")
    void SetRingPhaseVisual(int32 Phase);

    /** Mostra preview do proximo ring (no minimap e no mundo) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring|Visual")
    void ShowNextRingPreview(float PreviewRadius);

    /** Esconde o preview do proximo ring */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring|Visual")
    void HideNextRingPreview();

    /** Ativa electrical storm (ring final) */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring|Visual")
    void ActivateElectricalStorm();

    /** Desativa electrical storm */
    UFUNCTION(BlueprintCallable, Category = "Khaaos|Ring|Visual")
    void DeactivateElectricalStorm();

    // --- Properties ---

    /** Niagara system para a borda do ring (safe/shrinking) */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
    class UNiagaraSystem* RingBorderParticles;

    /** Niagara system para a electrical storm (ring final) */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
    class UNiagaraSystem* ElectricalStormParticles;

    /** Material do ring (spline circle no chao) */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
    class UMaterialInterface* RingMaterial;

    /** Cor da zona segura */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
    FLinearColor SafeColor = FLinearColor(0.f, 1.f, 0.53f, 0.6f); // #00FF88

    /** Cor do ring encolhendo */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
    FLinearColor ShrinkingColor = FLinearColor(1.f, 0.84f, 0.f, 0.8f); // #FFD700

    /** Cor da zona de perigo */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
    FLinearColor DangerColor = FLinearColor(1.f, 0.27f, 0.27f, 0.3f); // #FF4444

    /** Cor da zona mortal */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
    FLinearColor DeadlyColor = FLinearColor(1.f, 0.f, 0.f, 0.5f); // #FF0000

    /** Intensidade emissiva do material do ring */
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
    float EmissiveIntensity = 2.f;

    /** Raio atual (atualizado pelo RingManager) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
    float VisualCurrentRadius = 800.f;

    /** Raio alvo (atualizado pelo RingManager) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Ring|Visual")
    float VisualTargetRadius = 600.f;

private:
    /** Niagara component instancia para borda */
    UPROPERTY()
    class UNiagaraComponent* RingBorderNiagara;

    /** Niagara component instancia para storm */
    UPROPERTY()
    class UNiagaraComponent* StormNiagara;

    /** Dynamic material instance para o ring */
    UPROPERTY()
    class UMaterialInstanceDynamic* RingMaterialInstance;

    /** Preview ativo? */
    bool bPreviewActive = false;

    /** Electrical storm ativo? */
    bool bStormActive = false;
};
