// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// Implementação do Sistema de Materiais Estilizados por Espécie

#include "Game/Graphics/KhaaosStylizedMaterialSystem.h"
#include "KhaaosRun.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

// ─── Inicialização do Subsistema ───────────────────────────────────────────────

void UKhaaosStylizedMaterialSystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Constrói perfis estilizados para todas as 6 espécies alienígenas
	BuildSpeciesStylizedProfiles();

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Subsistema inicializado — %d perfis de espécie construídos"), SpeciesProfiles.Num());
}

void UKhaaosStylizedMaterialSystem::Deinitialize(FSubsystemCollectionBase& Collection)
{
	// Limpa todos os registros e perfis
	RegisteredMeshes.Empty();
	SpeciesProfiles.Empty();
	CurrentWeather = FKhaaosWeatherMaterialState();
	EmissivePulseTime = 0.0f;

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Subsistema desinicializado"));

	Super::Deinitialize(Collection);
}

// ─── Construção dos Perfis por Espécie ─────────────────────────────────────────

void UKhaaosStylizedMaterialSystem::BuildSpeciesStylizedProfiles()
{
	SpeciesProfiles.Empty();

	// ── HURAN: Espécie aquática, brânquias pulsantes, resposta à umidade ──
	{
		FKhaaosStylizedProfile& Profile = SpeciesProfiles.Add(EKhaaosSpecies::HURAN);
		Profile.Species = EKhaaosSpecies::HURAN;
		Profile.ShadingModel = EKhaaosShadingModel::SubsurfaceProfile;
		Profile.IridescenceIntensity = 0.0f;
		Profile.IridescenceAngle = 0.0f;
		Profile.AnisotropyStrength = 0.0f;
		Profile.AnisotropyAngle = 0.0f;
		Profile.RimLightIntensity = 1.2f;
		Profile.RimLightColor = FLinearColor(0.0f, 0.9f, 1.0f, 1.0f); // Ciano — brilho aquático
		Profile.ShadowColorShift = FLinearColor(0.0f, -0.05f, -0.1f, 0.0f); // Sombras levemente azuladas
		Profile.AmbientBoost = 0.2f;
		Profile.SubsurfaceProfileName = FName("SP_HuranSkin");
		Profile.EmissivePulseSpeed = 0.8f; // Pulso das brânquias
		Profile.EmissivePulseIntensity = 0.3f;
		Profile.WetnessResponse = 1.0f; // Resposta máxima à umidade (espécie aquática)
		Profile.DustResponse = 0.1f;
		Profile.HeatDistortionStrength = 0.0f;
		Profile.FrostOpacity = 0.0f;
		Profile.StyleMode = EKhaaosMaterialStyle::STYLIZED_PBR;
		Profile.BaseRoughness = 0.45f;
		Profile.BaseMetallic = 0.0f;
		Profile.CustomMaterialOverride = FSoftObjectPath();
	}

	// ── KHAEL: Espécie cristalina, runas emissivas, iridescência cristal ──
	{
		FKhaaosStylizedProfile& Profile = SpeciesProfiles.Add(EKhaaosSpecies::KHAEL);
		Profile.Species = EKhaaosSpecies::KHAEL;
		Profile.ShadingModel = EKhaaosShadingModel::Crystal;
		Profile.IridescenceIntensity = 0.5f;
		Profile.IridescenceAngle = 45.0f; // Ângulo de refração cristalina
		Profile.AnisotropyStrength = 0.0f;
		Profile.AnisotropyAngle = 0.0f;
		Profile.RimLightIntensity = 1.5f;
		Profile.RimLightColor = FLinearColor(0.6f, 0.2f, 1.0f, 1.0f); // Roxo — brilho cristalino
		Profile.ShadowColorShift = FLinearColor(0.05f, 0.0f, 0.1f, 0.0f); // Sombras arroxeadas
		Profile.AmbientBoost = 0.15f;
		Profile.SubsurfaceProfileName = NAME_None;
		Profile.EmissivePulseSpeed = 2.0f; // Pulso das runas Khael (rápido)
		Profile.EmissivePulseIntensity = 0.6f;
		Profile.WetnessResponse = 0.2f;
		Profile.DustResponse = 0.3f;
		Profile.HeatDistortionStrength = 0.0f;
		Profile.FrostOpacity = 0.2f; // Cristais acumulam geada
		Profile.StyleMode = EKhaaosMaterialStyle::STYLIZED_PBR;
		Profile.BaseRoughness = 0.15f; // Superfície cristalina lisa
		Profile.BaseMetallic = 0.7f;
		Profile.CustomMaterialOverride = FSoftObjectPath();
	}

	// ── VENEX: Espécie holográfica, aparência etérea, alta metalicidade ──
	{
		FKhaaosStylizedProfile& Profile = SpeciesProfiles.Add(EKhaaosSpecies::VENEX);
		Profile.Species = EKhaaosSpecies::VENEX;
		Profile.ShadingModel = EKhaaosShadingModel::Holographic;
		Profile.IridescenceIntensity = 0.3f;
		Profile.IridescenceAngle = 90.0f; // Deslocamento holográfico
		Profile.AnisotropyStrength = 0.2f;
		Profile.AnisotropyAngle = 0.0f;
		Profile.RimLightIntensity = 1.3f;
		Profile.RimLightColor = FLinearColor(0.0f, 1.0f, 0.9f, 1.0f); // Ciano — brilho holográfico
		Profile.ShadowColorShift = FLinearColor(-0.05f, 0.05f, 0.05f, 0.0f); // Sombras esverdeadas
		Profile.AmbientBoost = 0.3f; // Brilho mesmo nas sombras (holograma)
		Profile.SubsurfaceProfileName = NAME_None;
		Profile.EmissivePulseSpeed = 0.0f; // Sem pulso — brilho constante
		Profile.EmissivePulseIntensity = 0.0f;
		Profile.WetnessResponse = 0.0f; // Holograma não é afetado por água
		Profile.DustResponse = 0.0f;
		Profile.HeatDistortionStrength = 0.0f;
		Profile.FrostOpacity = 0.0f;
		Profile.StyleMode = EKhaaosMaterialStyle::STYLIZED_PBR;
		Profile.BaseRoughness = 0.05f; // Superfície holográfica ultra-lisa
		Profile.BaseMetallic = 0.9f;
		Profile.CustomMaterialOverride = FSoftObjectPath();
	}

	// ── ONITH: Espécie termal, distorção de calor, brilho vulcânico ──
	{
		FKhaaosStylizedProfile& Profile = SpeciesProfiles.Add(EKhaaosSpecies::ONITH);
		Profile.Species = EKhaaosSpecies::ONITH;
		Profile.ShadingModel = EKhaaosShadingModel::ThermalVent;
		Profile.IridescenceIntensity = 0.0f;
		Profile.IridescenceAngle = 0.0f;
		Profile.AnisotropyStrength = 0.0f;
		Profile.AnisotropyAngle = 0.0f;
		Profile.RimLightIntensity = 1.4f;
		Profile.RimLightColor = FLinearColor(1.0f, 0.5f, 0.0f, 1.0f); // Laranja — brilho vulcânico
		Profile.ShadowColorShift = FLinearColor(0.1f, 0.02f, -0.05f, 0.0f); // Sombras avermelhadas
		Profile.AmbientBoost = 0.25f;
		Profile.SubsurfaceProfileName = NAME_None;
		Profile.EmissivePulseSpeed = 0.0f;
		Profile.EmissivePulseIntensity = 0.0f;
		Profile.WetnessResponse = 0.3f;
		Profile.DustResponse = 0.5f; // Superfície vulcânica acumula poeira
		Profile.HeatDistortionStrength = 0.5f; // Distorção térmica significativa
		Profile.FrostOpacity = 0.0f;
		Profile.StyleMode = EKhaaosMaterialStyle::STYLIZED_PBR;
		Profile.BaseRoughness = 0.5f; // Superfície vulcânica irregular
		Profile.BaseMetallic = 0.4f;
		Profile.CustomMaterialOverride = FSoftObjectPath();
	}

	// ── ZHEERS: Espécie orgânica, tatuagens emissivas, subsurface ──
	{
		FKhaaosStylizedProfile& Profile = SpeciesProfiles.Add(EKhaaosSpecies::ZHEERS);
		Profile.Species = EKhaaosSpecies::ZHEERS;
		Profile.ShadingModel = EKhaaosShadingModel::SubsurfaceProfile;
		Profile.IridescenceIntensity = 0.0f;
		Profile.IridescenceAngle = 0.0f;
		Profile.AnisotropyStrength = 0.0f;
		Profile.AnisotropyAngle = 0.0f;
		Profile.RimLightIntensity = 1.1f;
		Profile.RimLightColor = FLinearColor(1.0f, 0.7f, 0.3f, 1.0f); // Laranja quente — pele orgânica
		Profile.ShadowColorShift = FLinearColor(0.03f, 0.0f, -0.02f, 0.0f); // Sombras levemente quentes
		Profile.AmbientBoost = 0.15f;
		Profile.SubsurfaceProfileName = FName("SP_ZheersSkin");
		Profile.EmissivePulseSpeed = 1.0f; // Pulso das tatuagens bioluminescentes
		Profile.EmissivePulseIntensity = 0.4f;
		Profile.WetnessResponse = 0.5f;
		Profile.DustResponse = 0.4f;
		Profile.HeatDistortionStrength = 0.0f;
		Profile.FrostOpacity = 0.0f;
		Profile.StyleMode = EKhaaosMaterialStyle::STYLIZED_PBR;
		Profile.BaseRoughness = 0.6f; // Pele orgânica com rugosidade
		Profile.BaseMetallic = 0.0f;
		Profile.CustomMaterialOverride = FSoftObjectPath();
	}

	// ── SKEETW: Espécie aviária, penas anisotrópicas, iridescência ──
	{
		FKhaaosStylizedProfile& Profile = SpeciesProfiles.Add(EKhaaosSpecies::SKEETW);
		Profile.Species = EKhaaosSpecies::SKEETW;
		Profile.ShadingModel = EKhaaosShadingModel::Iridescent;
		Profile.IridescenceIntensity = 0.8f; // Iridescência forte nas penas
		Profile.IridescenceAngle = 120.0f; // Ângulo de visualização para shift
		Profile.AnisotropyStrength = 0.7f; // Anisotropia forte — direção das penas
		Profile.AnisotropyAngle = 0.0f; // Tangente ao longo das penas
		Profile.RimLightIntensity = 1.0f;
		Profile.RimLightColor = FLinearColor(0.2f, 1.0f, 0.3f, 1.0f); // Verde — brilho aviário
		Profile.ShadowColorShift = FLinearColor(-0.03f, 0.05f, -0.02f, 0.0f); // Sombras esverdeadas
		Profile.AmbientBoost = 0.1f;
		Profile.SubsurfaceProfileName = NAME_None;
		Profile.EmissivePulseSpeed = 0.0f;
		Profile.EmissivePulseIntensity = 0.0f;
		Profile.WetnessResponse = 0.4f;
		Profile.DustResponse = 0.2f;
		Profile.HeatDistortionStrength = 0.0f;
		Profile.FrostOpacity = 0.0f;
		Profile.StyleMode = EKhaaosMaterialStyle::STYLIZED_PBR;
		Profile.BaseRoughness = 0.4f; // Penas com rugosidade moderada
		Profile.BaseMetallic = 0.0f;
		Profile.CustomMaterialOverride = FSoftObjectPath();
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Perfis construídos: Huran(Subsurface), Khael(Crystal), Venex(Holographic), Onith(ThermalVent), Zheers(Subsurface), Skeetw(Iridescent)"));
}

// ─── Aplicação de Perfil Estilizado ────────────────────────────────────────────

void UKhaaosStylizedMaterialSystem::ApplyStylizedProfile(USkeletalMeshComponent* MeshComp, EKhaaosSpecies Species)
{
	if (!MeshComp)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] ApplyStylizedProfile: MeshComp nulo para espécie %d"), static_cast<int32>(Species));
		return;
	}

	const FKhaaosStylizedProfile* ProfilePtr = SpeciesProfiles.Find(Species);
	if (!ProfilePtr)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] ApplyStylizedProfile: Perfil não encontrado para espécie %d"), static_cast<int32>(Species));
		return;
	}

	const FKhaaosStylizedProfile& Profile = *ProfilePtr;

	// Obtém o número de materiais no skeletal mesh
	const int32 NumMaterials = MeshComp->GetNumMaterials();
	if (NumMaterials == 0)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] ApplyStylizedProfile: MeshComp '%s' sem materiais"), *MeshComp->GetName());
		return;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Aplicando perfil %d em '%s' (%d materiais)"), static_cast<int32>(Species), *MeshComp->GetName(), NumMaterials);

	// Itera sobre todos os slots de material e cria MIDs com parâmetros estilizados
	for (int32 MatIdx = 0; MatIdx < NumMaterials; ++MatIdx)
	{
		UMaterialInterface* BaseMaterial = MeshComp->GetMaterial(MatIdx);
		if (!BaseMaterial)
		{
			continue;
		}

		// Cria Material Instance Dynamic para este slot
		UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(BaseMaterial, MeshComp);
		if (!MID)
		{
			UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] Falha ao criar MID no slot %d de '%s'"), MatIdx, *MeshComp->GetName());
			continue;
		}

		// ── Parâmetros de Iridescência ──
		MID->SetScalarParameterValue(FName("IridescenceIntensity"), Profile.IridescenceIntensity);
		MID->SetScalarParameterValue(FName("IridescenceAngle"), Profile.IridescenceAngle);

		// ── Parâmetros de Anisotropia ──
		MID->SetScalarParameterValue(FName("AnisotropyStrength"), Profile.AnisotropyStrength);
		MID->SetScalarParameterValue(FName("AnisotropyAngle"), Profile.AnisotropyAngle);

		// ── Parâmetros de Rim Light ──
		MID->SetScalarParameterValue(FName("RimLightIntensity"), Profile.RimLightIntensity);
		MID->SetVectorParameterValue(FName("RimLightColor"), Profile.RimLightColor);

		// ── Parâmetros de Sombra Estilizada ──
		MID->SetVectorParameterValue(FName("ShadowColorShift"), Profile.ShadowColorShift);
		MID->SetScalarParameterValue(FName("AmbientBoost"), Profile.AmbientBoost);

		// ── Parâmetros de Pulso Emissivo ──
		MID->SetScalarParameterValue(FName("EmissivePulseSpeed"), Profile.EmissivePulseSpeed);
		MID->SetScalarParameterValue(FName("EmissivePulseIntensity"), Profile.EmissivePulseIntensity);

		// ── Parâmetros de Resposta Climática ──
		MID->SetScalarParameterValue(FName("WetnessResponse"), Profile.WetnessResponse);
		MID->SetScalarParameterValue(FName("DustResponse"), Profile.DustResponse);
		MID->SetScalarParameterValue(FName("HeatDistortionStrength"), Profile.HeatDistortionStrength);
		MID->SetScalarParameterValue(FName("FrostOpacity"), Profile.FrostOpacity);

		// ── Override de Roughness/Metallic ──
		MID->SetScalarParameterValue(FName("RoughnessOverride"), Profile.BaseRoughness);
		MID->SetScalarParameterValue(FName("MetallicOverride"), Profile.BaseMetallic);

		// ── IDs de Shading Model e Espécie (float cast) ──
		MID->SetScalarParameterValue(FName("ShadingModelID"), static_cast<float>(Profile.ShadingModel));
		MID->SetScalarParameterValue(FName("SpeciesID"), static_cast<float>(Profile.Species));

		// ── Estado Climático Atual ──
		MID->SetScalarParameterValue(FName("WeatherWetness"), CurrentWeather.WetnessLevel);
		MID->SetScalarParameterValue(FName("WeatherDust"), CurrentWeather.DustLevel);
		MID->SetScalarParameterValue(FName("WeatherFrost"), CurrentWeather.FrostLevel);
		MID->SetScalarParameterValue(FName("WeatherHeat"), CurrentWeather.HeatLevel);

		// ── Valor Inicial do Pulso Emissivo ──
		MID->SetScalarParameterValue(FName("EmissivePulseValue"), 0.0f);

		// Atribui o MID ao slot
		MeshComp->SetMaterial(MatIdx, MID);
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Perfil aplicado com sucesso — Espécie %d, Mesh '%s'"), static_cast<int32>(Species), *MeshComp->GetName());
}

// ─── Atualização do Estado Climático ───────────────────────────────────────────

void UKhaaosStylizedMaterialSystem::UpdateWeatherState(const FKhaaosWeatherMaterialState& WeatherState)
{
	CurrentWeather = WeatherState;

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Estado climático atualizado — Efeito: %d, Intensidade: %.2f, Umidade: %.2f, Poeira: %.2f, Geada: %.2f, Calor: %.2f"),
		static_cast<int32>(CurrentWeather.ActiveWeather),
		CurrentWeather.WeatherIntensity,
		CurrentWeather.WetnessLevel,
		CurrentWeather.DustLevel,
		CurrentWeather.FrostLevel,
		CurrentWeather.HeatLevel);

	// Aplica os parâmetros climáticos em todos os MIDs registrados
	for (const TPair<USkeletalMeshComponent*, EKhaaosSpecies>& MeshPair : RegisteredMeshes)
	{
		USkeletalMeshComponent* MeshComp = MeshPair.Key;
		if (!MeshComp || !IsValid(MeshComp))
		{
			continue;
		}

		const int32 NumMaterials = MeshComp->GetNumMaterials();
		for (int32 MatIdx = 0; MatIdx < NumMaterials; ++MatIdx)
		{
			UMaterialInstanceDynamic* MID = Cast<UMaterialInstanceDynamic>(MeshComp->GetMaterial(MatIdx));
			if (!MID)
			{
				continue;
			}

			MID->SetScalarParameterValue(FName("WeatherWetness"), CurrentWeather.WetnessLevel);
			MID->SetScalarParameterValue(FName("WeatherDust"), CurrentWeather.DustLevel);
			MID->SetScalarParameterValue(FName("WeatherFrost"), CurrentWeather.FrostLevel);
			MID->SetScalarParameterValue(FName("WeatherHeat"), CurrentWeather.HeatLevel);
		}
	}
}

// ─── Registro de Meshes ────────────────────────────────────────────────────────

void UKhaaosStylizedMaterialSystem::RegisterSpeciesMesh(USkeletalMeshComponent* MeshComp, EKhaaosSpecies Species)
{
	if (!MeshComp)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] RegisterSpeciesMesh: MeshComp nulo"));
		return;
	}

	if (Species == EKhaaosSpecies::NONE)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] RegisterSpeciesMesh: Espécie NONE não é válida para registro"));
		return;
	}

	RegisteredMeshes.Add(MeshComp, Species);

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Mesh '%s' registrada com espécie %d"), *MeshComp->GetName(), static_cast<int32>(Species));
}

void UKhaaosStylizedMaterialSystem::UnregisterSpeciesMesh(USkeletalMeshComponent* MeshComp)
{
	if (!MeshComp)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] UnregisterSpeciesMesh: MeshComp nulo"));
		return;
	}

	if (RegisteredMeshes.Remove(MeshComp) > 0)
	{
		UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Mesh '%s' removida do registro"), *MeshComp->GetName());
	}
	else
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] UnregisterSpeciesMesh: Mesh '%s' não estava registrada"), *MeshComp->GetName());
	}
}

// ─── Consulta de Perfil ────────────────────────────────────────────────────────

const FKhaaosStylizedProfile& UKhaaosStylizedMaterialSystem::GetSpeciesProfile(EKhaaosSpecies Species) const
{
	static const FKhaaosStylizedProfile EmptyProfile;

	const FKhaaosStylizedProfile* Found = SpeciesProfiles.Find(Species);
	if (Found)
	{
		return *Found;
	}

	UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] GetSpeciesProfile: Perfil não encontrado para espécie %d"), static_cast<int32>(Species));
	return EmptyProfile;
}

// ─── Ajustes Dinâmicos ─────────────────────────────────────────────────────────

void UKhaaosStylizedMaterialSystem::SetIridescence(EKhaaosSpecies Species, float Intensity, float Angle)
{
	FKhaaosStylizedProfile* Profile = SpeciesProfiles.Find(Species);
	if (!Profile)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] SetIridescence: Perfil não encontrado para espécie %d"), static_cast<int32>(Species));
		return;
	}

	// Clamp aos ranges válidos
	Profile->IridescenceIntensity = FMath::Clamp(Intensity, 0.0f, 1.0f);
	Profile->IridescenceAngle = FMath::Clamp(Angle, 0.0f, 360.0f);

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Iridescência definida — Espécie %d: Intensidade=%.2f, Ângulo=%.1f"),
		static_cast<int32>(Species), Profile->IridescenceIntensity, Profile->IridescenceAngle);

	// Reaplica nos meshes registrados desta espécie
	for (const TPair<USkeletalMeshComponent*, EKhaaosSpecies>& MeshPair : RegisteredMeshes)
	{
		if (MeshPair.Value != Species)
		{
			continue;
		}

		USkeletalMeshComponent* MeshComp = MeshPair.Key;
		if (!MeshComp || !IsValid(MeshComp))
		{
			continue;
		}

		const int32 NumMaterials = MeshComp->GetNumMaterials();
		for (int32 MatIdx = 0; MatIdx < NumMaterials; ++MatIdx)
		{
			UMaterialInstanceDynamic* MID = Cast<UMaterialInstanceDynamic>(MeshComp->GetMaterial(MatIdx));
			if (MID)
			{
				MID->SetScalarParameterValue(FName("IridescenceIntensity"), Profile->IridescenceIntensity);
				MID->SetScalarParameterValue(FName("IridescenceAngle"), Profile->IridescenceAngle);
			}
		}
	}
}

void UKhaaosStylizedMaterialSystem::SetRimLight(EKhaaosSpecies Species, float Intensity, FLinearColor Color)
{
	FKhaaosStylizedProfile* Profile = SpeciesProfiles.Find(Species);
	if (!Profile)
	{
		UE_LOG(LogKhaaosRun, Warning, TEXT("[StylizedMaterial] SetRimLight: Perfil não encontrado para espécie %d"), static_cast<int32>(Species));
		return;
	}

	// Clamp ao range válido
	Profile->RimLightIntensity = FMath::Clamp(Intensity, 0.0f, 3.0f);
	Profile->RimLightColor = Color;

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Rim Light definido — Espécie %d: Intensidade=%.2f, Cor=(%.2f,%.2f,%.2f,%.2f)"),
		static_cast<int32>(Species), Profile->RimLightIntensity, Color.R, Color.G, Color.B, Color.A);

	// Reaplica nos meshes registrados desta espécie
	for (const TPair<USkeletalMeshComponent*, EKhaaosSpecies>& MeshPair : RegisteredMeshes)
	{
		if (MeshPair.Value != Species)
		{
			continue;
		}

		USkeletalMeshComponent* MeshComp = MeshPair.Key;
		if (!MeshComp || !IsValid(MeshComp))
		{
			continue;
		}

		const int32 NumMaterials = MeshComp->GetNumMaterials();
		for (int32 MatIdx = 0; MatIdx < NumMaterials; ++MatIdx)
		{
			UMaterialInstanceDynamic* MID = Cast<UMaterialInstanceDynamic>(MeshComp->GetMaterial(MatIdx));
			if (MID)
			{
				MID->SetScalarParameterValue(FName("RimLightIntensity"), Profile->RimLightIntensity);
				MID->SetVectorParameterValue(FName("RimLightColor"), Profile->RimLightColor);
			}
		}
	}
}

void UKhaaosStylizedMaterialSystem::SetWeatherEffect(EKhaaosWeatherEffect Effect, float Intensity)
{
	// Atualiza o estado climático com base no efeito solicitado
	CurrentWeather.ActiveWeather = Effect;
	CurrentWeather.WeatherIntensity = FMath::Clamp(Intensity, 0.0f, 1.0f);

	// Mapeia o efeito climático para os níveis individuais
	switch (Effect)
	{
	case EKhaaosWeatherEffect::NONE:
		CurrentWeather.WetnessLevel = 0.0f;
		CurrentWeather.DustLevel = 0.0f;
		CurrentWeather.FrostLevel = 0.0f;
		CurrentWeather.HeatLevel = 0.0f;
		break;

	case EKhaaosWeatherEffect::RAIN:
		CurrentWeather.WetnessLevel = CurrentWeather.WeatherIntensity;
		CurrentWeather.DustLevel = 0.0f;
		CurrentWeather.FrostLevel = 0.0f;
		CurrentWeather.HeatLevel = 0.0f;
		break;

	case EKhaaosWeatherEffect::DUST:
		CurrentWeather.WetnessLevel = 0.0f;
		CurrentWeather.DustLevel = CurrentWeather.WeatherIntensity;
		CurrentWeather.FrostLevel = 0.0f;
		CurrentWeather.HeatLevel = 0.0f;
		break;

	case EKhaaosWeatherEffect::HEAT_HAZE:
		CurrentWeather.WetnessLevel = 0.0f;
		CurrentWeather.DustLevel = 0.0f;
		CurrentWeather.FrostLevel = 0.0f;
		CurrentWeather.HeatLevel = CurrentWeather.WeatherIntensity;
		break;

	case EKhaaosWeatherEffect::FROST:
		CurrentWeather.WetnessLevel = 0.0f;
		CurrentWeather.DustLevel = 0.0f;
		CurrentWeather.FrostLevel = CurrentWeather.WeatherIntensity;
		CurrentWeather.HeatLevel = 0.0f;
		break;

	case EKhaaosWeatherEffect::TOXIC:
		// Tóxico afeta umidade (neblina tóxica) e poeira levemente
		CurrentWeather.WetnessLevel = CurrentWeather.WeatherIntensity * 0.3f;
		CurrentWeather.DustLevel = CurrentWeather.WeatherIntensity * 0.5f;
		CurrentWeather.FrostLevel = 0.0f;
		CurrentWeather.HeatLevel = 0.0f;
		break;

	default:
		break;
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Efeito climático definido — %d, Intensidade=%.2f"), static_cast<int32>(Effect), CurrentWeather.WeatherIntensity);

	// Aplica nos MIDs de todos os meshes registrados
	for (const TPair<USkeletalMeshComponent*, EKhaaosSpecies>& MeshPair : RegisteredMeshes)
	{
		USkeletalMeshComponent* MeshComp = MeshPair.Key;
		if (!MeshComp || !IsValid(MeshComp))
		{
			continue;
		}

		const int32 NumMaterials = MeshComp->GetNumMaterials();
		for (int32 MatIdx = 0; MatIdx < NumMaterials; ++MatIdx)
		{
			UMaterialInstanceDynamic* MID = Cast<UMaterialInstanceDynamic>(MeshComp->GetMaterial(MatIdx));
			if (!MID)
			{
				continue;
			}

			MID->SetScalarParameterValue(FName("WeatherWetness"), CurrentWeather.WetnessLevel);
			MID->SetScalarParameterValue(FName("WeatherDust"), CurrentWeather.DustLevel);
			MID->SetScalarParameterValue(FName("WeatherFrost"), CurrentWeather.FrostLevel);
			MID->SetScalarParameterValue(FName("WeatherHeat"), CurrentWeather.HeatLevel);
		}
	}
}

// ─── Pulso Emissivo por Frame ──────────────────────────────────────────────────

void UKhaaosStylizedMaterialSystem::UpdateEmissivePulse(float DeltaTime)
{
	// Acumula tempo para cálculo do pulso
	EmissivePulseTime += DeltaTime;

	// Itera sobre todos os meshes registrados
	for (const TPair<USkeletalMeshComponent*, EKhaaosSpecies>& MeshPair : RegisteredMeshes)
	{
		USkeletalMeshComponent* MeshComp = MeshPair.Key;
		if (!MeshComp || !IsValid(MeshComp))
		{
			continue;
		}

		const EKhaaosSpecies Species = MeshPair.Value;
		const FKhaaosStylizedProfile* Profile = SpeciesProfiles.Find(Species);
		if (!Profile)
		{
			continue;
		}

		// Espécies sem pulso emissivo podem ser puladas
		if (Profile->EmissivePulseSpeed <= 0.0f || Profile->EmissivePulseIntensity <= 0.0f)
		{
			continue;
		}

		// Calcula o valor do pulso: sin(tempo * velocidade * 2π) * intensidade
		// Resultado varia entre -intensidade e +intensidade
		const float PulseValue = FMath::Sin(EmissivePulseTime * Profile->EmissivePulseSpeed * 2.0f * PI) * Profile->EmissivePulseIntensity;

		// Aplica em todos os MIDs deste mesh
		const int32 NumMaterials = MeshComp->GetNumMaterials();
		for (int32 MatIdx = 0; MatIdx < NumMaterials; ++MatIdx)
		{
			UMaterialInstanceDynamic* MID = Cast<UMaterialInstanceDynamic>(MeshComp->GetMaterial(MatIdx));
			if (MID)
			{
				MID->SetScalarParameterValue(FName("EmissivePulseValue"), PulseValue);
			}
		}
	}
}

// ─── Dump de Debug ─────────────────────────────────────────────────────────────

void UKhaaosStylizedMaterialSystem::DumpProfiles() const
{
	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] ═══════════ DUMP DE PERFIS ESTILIZADOS ═══════════"));
	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Meshes registrados: %d"), RegisteredMeshes.Num());
	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Clima ativo: Efeito=%d, Intensidade=%.2f, Umidade=%.2f, Poeira=%.2f, Geada=%.2f, Calor=%.2f"),
		static_cast<int32>(CurrentWeather.ActiveWeather),
		CurrentWeather.WeatherIntensity,
		CurrentWeather.WetnessLevel,
		CurrentWeather.DustLevel,
		CurrentWeather.FrostLevel,
		CurrentWeather.HeatLevel);
	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] Tempo acumulado emissivo: %.3f"), EmissivePulseTime);

	for (const TPair<EKhaaosSpecies, FKhaaosStylizedProfile>& Pair : SpeciesProfiles)
	{
		const FKhaaosStylizedProfile& P = Pair.Value;

		UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] ── Espécie %d ──"), static_cast<int32>(P.Species));
		UE_LOG(LogKhaaosRun, Log, TEXT("   ShadingModel=%d | StyleMode=%d"), static_cast<int32>(P.ShadingModel), static_cast<int32>(P.StyleMode));
		UE_LOG(LogKhaaosRun, Log, TEXT("   Iridescência: Intensidade=%.2f, Ângulo=%.1f"), P.IridescenceIntensity, P.IridescenceAngle);
		UE_LOG(LogKhaaosRun, Log, TEXT("   Anisotropia: Força=%.2f, Ângulo=%.1f"), P.AnisotropyStrength, P.AnisotropyAngle);
		UE_LOG(LogKhaaosRun, Log, TEXT("   RimLight: Intensidade=%.2f, Cor=(%.2f,%.2f,%.2f,%.2f)"), P.RimLightIntensity, P.RimLightColor.R, P.RimLightColor.G, P.RimLightColor.B, P.RimLightColor.A);
		UE_LOG(LogKhaaosRun, Log, TEXT("   Sombra: Shift=(%.2f,%.2f,%.2f,%.2f), AmbientBoost=%.2f"), P.ShadowColorShift.R, P.ShadowColorShift.G, P.ShadowColorShift.B, P.ShadowColorShift.A, P.AmbientBoost);
		UE_LOG(LogKhaaosRun, Log, TEXT("   SubsurfaceProfile: %s"), *P.SubsurfaceProfileName.ToString());
		UE_LOG(LogKhaaosRun, Log, TEXT("   Emissivo: PulseSpeed=%.2f Hz, PulseIntensity=%.2f"), P.EmissivePulseSpeed, P.EmissivePulseIntensity);
		UE_LOG(LogKhaaosRun, Log, TEXT("   Clima: Wetness=%.2f, Dust=%.2f, Heat=%.2f, Frost=%.2f"), P.WetnessResponse, P.DustResponse, P.HeatDistortionStrength, P.FrostOpacity);
		UE_LOG(LogKhaaosRun, Log, TEXT("   PBR Base: Roughness=%.2f, Metallic=%.2f"), P.BaseRoughness, P.BaseMetallic);
		UE_LOG(LogKhaaosRun, Log, TEXT("   Override: %s"), *P.CustomMaterialOverride.ToString());
	}

	UE_LOG(LogKhaaosRun, Log, TEXT("[StylizedMaterial] ═══════════ FIM DO DUMP ═══════════"));
}
