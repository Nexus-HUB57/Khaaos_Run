// Khaaos Run - Devs Ph.D | Fase 59 | Copyright Nexus-HUB57
//
// Cânon de biomas e vias por mundo (F58/F59) — teste portável do gate.
// Compila KhaaosWorldCanon.cpp com stubs CoreMinimal (sem UE) via
// scripts/test_ue5_logic.sh e pina as características validadas das
// descrições oficiais (README "Arquitetura dos Mundos" + shared/worlds.ts):
//
//   CIGKV    → UrbanRuins   (vila militar murada)      → vias CANÔNICAS
//   Barburhen → UrbanRuins  (urbano pós-guerra)        → vias CANÔNICAS
//   Priadus  → TropicalForest (selva densa/pântanos)    → SEM vias
//   Ckesalth → DesertCanyon   (bacia de dunas)          → SEM vias
//   Arukheea → OceanArchipel  (ilha costeira)           → SEM vias
//
// Regressão pinada: antes da F59 o worldgen UE5 declarava Barburhen como
// TropicalForest, Ckesalth como FrozenTundra, Arukheea como DesertCanyon e
// rodava o estágio de estradas incondicionalmente para TODOS os mundos.
#include "Game/WorldGen/KhaaosWorldCanon.h"

#include <iostream>
#include <cstring>

namespace
{
    int Failures = 0;

    void Expect(bool Condition, const char* Description)
    {
        if (Condition) std::cout << "PASS: " << Description << '\n';
        else { std::cerr << "FAIL: " << Description << '\n'; ++Failures; }
    }

    KhaaosWorldCanon::WorldBiome BiomeOf(const char* WorldName, bool& Found)
    {
        KhaaosWorldCanon::WorldPreset Preset;
        Found = KhaaosWorldCanon::TryGetPreset(WorldName, Preset);
        return Preset.Biome;
    }
}

int main()
{
    using namespace KhaaosWorldCanon;

    // ─── Biomas canônicos por mundo ──────────────────────────────────────────
    bool Found = false;
    const WorldBiome Cigkv = BiomeOf("CIGKV", Found);
    Expect(Found && Cigkv == WorldBiome::UrbanRuins, "CIGKV é urbano (vila militar murada)");

    const WorldBiome Barburhen = BiomeOf("Barburhen", Found);
    Expect(Found && Barburhen == WorldBiome::UrbanRuins,
        "Barburhen é urbano pós-guerra (não selva — regressão F59)");

    const WorldBiome Priadus = BiomeOf("Priadus", Found);
    Expect(Found && Priadus == WorldBiome::TropicalForest,
        "Priadus é selva densa/pântanos (não vulcânico — regressão F59)");

    const WorldBiome Ckesalth = BiomeOf("Ckesalth", Found);
    Expect(Found && Ckesalth == WorldBiome::DesertCanyon,
        "Ckesalth é deserto árido/bacia de dunas (não tundra — regressão F59)");

    const WorldBiome Arukheea = BiomeOf("Arukheea", Found);
    Expect(Found && Arukheea == WorldBiome::OceanArchipel,
        "Arukheea é ilha costeira (não deserto de cânions — regressão F59)");

    // ─── Vias canônicas (F58): apenas CIGKV e Barburhen ──────────────────────
    Expect(HasCanonicalRoads("CIGKV"), "CIGKV possui vias canônicas (cidade-treino)");
    Expect(HasCanonicalRoads("Barburhen"), "Barburhen possui vias canônicas (Estradas com Rachaduras)");
    Expect(!HasCanonicalRoads("Priadus"), "Priadus NÃO possui vias (selva — divergência F58)");
    Expect(!HasCanonicalRoads("Ckesalth"), "Ckesalth NÃO possui vias (deserto)");
    Expect(!HasCanonicalRoads("Arukheea"), "Arukheea NÃO possui vias (ilha)");
    Expect(!HasCanonicalRoads("MundoInexistente"), "mundo desconhecido não possui vias (falha fechado)");
    Expect(!HasCanonicalRoads(""), "nome vazio não possui vias (falha fechado)");
    Expect(!HasCanonicalRoads(nullptr), "nome nulo não possui vias (falha fechado)");

    // ─── Gate urbano coerente com a tabela de vias ───────────────────────────
    Expect(IsUrbanBiome(WorldBiome::UrbanRuins), "bioma urbano implica rede viária");
    Expect(!IsUrbanBiome(WorldBiome::TropicalForest), "selva não implica rede viária");
    Expect(!IsUrbanBiome(WorldBiome::DesertCanyon), "deserto não implica rede viária");
    Expect(!IsUrbanBiome(WorldBiome::OceanArchipel), "ilha não implica rede viária");

    // ─── Parâmetros alinhados às descrições oficiais ─────────────────────────
    WorldPreset P;
    Expect(TryGetPreset("Priadus", P) && P.VegetationDensity > 0.5f,
        "Priadus tem vegetação densa (selva hostil)");
    Expect(TryGetPreset("Priadus", P) && P.WaterCoverage >= 0.25f,
        "Priadus tem pântanos relevantes (jacarés)");
    Expect(TryGetPreset("Ckesalth", P) && P.VegetationDensity < 0.1f,
        "Ckesalth é árido (deserto)");
    Expect(TryGetPreset("Ckesalth", P) && P.WaterCoverage < 0.1f,
        "Ckesalth não tem água doce relevante (só lagoas de petróleo)");
    Expect(TryGetPreset("Arukheea", P) && P.WaterCoverage >= 0.45f,
        "Arukheea é dominada pelo oceano (ilha, tsunami, tubarões)");
    Expect(TryGetPreset("Arukheea", P) && P.VegetationDensity > 0.3f,
        "Arukheea tem Bosque dos Perdidos (4/8 da ilha)");
    Expect(TryGetPreset("Barburhen", P) && P.VegetationDensity < 0.3f && P.ObstacleDensity >= 0.5f,
        "Barburhen é urbano degradado (mato ralo, construções/escombros)");
    Expect(TryGetPreset("CIGKV", P) && P.LootDensityMultiplier > 1.2f,
        "CIGKV tem loot alto (cidade-treino)");

    // ─── Tamanho de mundo preservado (partição — comportamento anterior) ─────
    Expect(TryGetPreset("CIGKV", P) && P.WorldSize == 1000000.0f, "CIGKV mantém partição 10 km");
    Expect(TryGetPreset("Barburhen", P) && P.WorldSize == 2000000.0f, "Barburhen mantém partição 20 km");
    Expect(TryGetPreset("Priadus", P) && P.WorldSize == 1800000.0f, "Priadus mantém partição 18 km");
    Expect(TryGetPreset("Ckesalth", P) && P.WorldSize == 1500000.0f, "Ckesalth mantém partição 15 km");
    Expect(TryGetPreset("Arukheea", P) && P.WorldSize == 1800000.0f, "Arukheea mantém partição 18 km");

    // ─── Mundo desconhecido falha fechado ────────────────────────────────────
    Expect(!TryGetPreset("Atlantis", P), "preset de mundo desconhecido falha fechado");
    Expect(!IsKnownWorld("Atlantis"), "mundo fora do cânon não é reconhecido");
    Expect(IsKnownWorld("CIGKV") && IsKnownWorld("Barburhen") && IsKnownWorld("Priadus")
        && IsKnownWorld("Ckesalth") && IsKnownWorld("Arukheea"), "os 5 mundos oficiais são reconhecidos");

    if (Failures > 0) return 1;
    std::cout << "All worldgen vias-canon tests passed.\n";
    return 0;
}
