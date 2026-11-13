// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
#pragma once

#include "CoreMinimal.h"

// ─── Cânon portável de mundos (Fase 59) ─────────────────────────────────────────
//
// Fonte única de verdade PORTÁVEL para biomas e vias por mundo — consumida pelo
// KhaaosWorldGenerator (UE5) e testada nativamente pelo gate
// (tests/ue5/worldgen_vias_canon_test.cpp via scripts/test_ue5_logic.sh).
//
// Descrições oficiais (README "Arquitetura dos Mundos" + shared/worlds.ts):
//   CIGKV    → Vila Militar Murada (fortified_rectangle) — urbano militar
//   Barburhen → Urbano Pós-Guerra (urban_gridiron) — "carros abandonados",
//              "Estradas com Rachaduras" (Plus−) — vias CANÔNICAS
//   Priadus  → Selva Densa, Pântanos, Flora Carnívora, Neblina com Esporos
//              Tóxicos e Jacarés (organic_blob) — SEM vias
//   Ckesalth → Deserto Árido, Lagoas de Petróleo em Chamas, Fumaça Tóxica e
//              Areia Movediça (desert_basin) — SEM vias
//   Arukheea → Ilha Isolada, Prisão do Sol da Noite, Tsunami Iminente,
//              Tubarões e Cemitério das Baleias (coastal_island) — SEM vias
//
// Cânon F58 (README L502-508 + docs/FASE58_VIAS_CANONICAS_MUNDOS.md):
// estradas/ruas asfaltadas existem APENAS nos mundos urbanos CIGKV e Barburhen.
//
// Política pura (inline/constexpr, zero UCLASS) — sem deps de Unreal para
// testes nativos determinísticos (mesmo padrão de KhaaosBarburhenRules).
namespace KhaaosWorldCanon
{
    /** Biomas canônicos (subconjunto usado pelas descrições oficiais dos 5 mundos). */
    enum class WorldBiome : uint8
    {
        UrbanRuins,     // CIGKV e Barburhen — cidade (treino / pós-guerra)
        TropicalForest, // Priadus — selva densa com pântanos
        DesertCanyon,   // Ckesalth — bacia de dunas (desert_basin)
        OceanArchipel   // Arukheea — ilha costeira com enseadas
    };

    /** Preset canônico de geração (parâmetros alinhados às descrições oficiais). */
    struct WorldPreset
    {
        WorldBiome Biome;
        float HeightScale;           // cm — amplitude de terreno
        float NoiseFrequency;        // frequência do ruído de altura
        float VegetationDensity;     // 0-1 — densidade de vegetação
        float ObstacleDensity;       // 0-1 — densidade de obstáculos/estruturas
        float WaterCoverage;         // 0-1 — cobertura de água/lava/óleo
        float LootDensityMultiplier; // multiplicador de loot
        int32 POICount;              // pontos de interesse
        float WorldSize;             // cm × cm (partição do mundo)
    };

    /** O mundo é reconhecido pelo cânon? (CIGKV, Barburhen, Priadus, Ckesalth, Arukheea) */
    bool IsKnownWorld(const char* WorldName);

    /** Bioma canônico por mundo (falha fechada: mundo desconhecido → false). */
    bool TryGetPreset(const char* WorldName, WorldPreset& OutPreset);

    /**
     * Cânon F58 de vias: apenas CIGKV e Barburhen descrevem estradas/ruas
     * nas descrições oficiais. Priadus (selva), Ckesalth (deserto) e
     * Arukheea (ilha) NÃO possuem vias — qualquer geração de estrada neles
     * é divergência de cenário.
     */
    bool HasCanonicalRoads(const char* WorldName);

    /** O bioma implica rede viária urbana canônica? */
    bool IsUrbanBiome(WorldBiome Biome);
}
