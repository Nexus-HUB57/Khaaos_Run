// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57

#include "Game/WorldGen/KhaaosWorldCanon.h"

namespace KhaaosWorldCanon
{
    namespace
    {
        // Presets canônicos — parâmetros alinhados às descrições oficiais de
        // cada mundo (README "Arquitetura dos Mundos"; biomas = shared/worlds.ts).
        // CIGKV e Barburhen compartilham UrbanRuins: são os dois mundos urbanos
        // do cânon F58 (cidade-treino e cidade pós-guerra, respectivamente).
        constexpr WorldPreset CIGKVPreset = {
            WorldBiome::UrbanRuins,
            /* HeightScale */ 200.0f,           // cidade plana
            /* NoiseFrequency */ 0.0005f,
            /* VegetationDensity */ 0.1f,       // urbano: vegetação esparsa
            /* ObstacleDensity */ 0.6f,         // construções/cobertura
            /* WaterCoverage */ 0.05f,
            /* LootDensityMultiplier */ 1.5f,   // loot alto na cidade
            /* POICount */ 20,                  // muitos prédios
            /* WorldSize */ 1000000.0f          // 10 km
        };

        constexpr WorldPreset BarburhenPreset = {
            WorldBiome::UrbanRuins,
            /* HeightScale */ 250.0f,           // urbano pós-guerra, terreno plano degradado
            /* NoiseFrequency */ 0.0005f,
            /* VegetationDensity */ 0.15f,      // urbano: mato ralo em lotes abandonados
            /* ObstacleDensity */ 0.6f,         // construções inacabadas, escombros
            /* WaterCoverage */ 0.05f,          // sem rios descritos; chuva ácida é clima
            /* LootDensityMultiplier */ 1.4f,   // saqueio urbano (comercial + industrial)
            /* POICount */ 18,                  // setores urbano/industrial/parque/extracao
            /* WorldSize */ 2000000.0f          // 20 km
        };

        constexpr WorldPreset PriadusPreset = {
            WorldBiome::TropicalForest,
            /* HeightScale */ 800.0f,           // colinas de selva
            /* NoiseFrequency */ 0.0015f,
            /* VegetationDensity */ 0.85f,      // selva DENSA (Floresta da Escuridão)
            /* ObstacleDensity */ 0.3f,         // troncos, ruínas de templo, mata fechada
            /* WaterCoverage */ 0.3f,           // pântanos e áreas alagadas (jacarés)
            /* LootDensityMultiplier */ 0.9f,
            /* POICount */ 12,                  // bosque/templo/matadouro/clareiras
            /* WorldSize */ 1800000.0f          // 18 km
        };

        constexpr WorldPreset CkesalthPreset = {
            WorldBiome::DesertCanyon,
            /* HeightScale */ 400.0f,           // bacia de dunas (desert_basin)
            /* NoiseFrequency */ 0.001f,
            /* VegetationDensity */ 0.05f,      // deserto árido: quase nenhuma flora
            /* ObstacleDensity */ 0.3f,         // dunas, rochas, resort/refinaria
            /* WaterCoverage */ 0.04f,          // só lagoas de petróleo em chamas
            /* LootDensityMultiplier */ 0.8f,
            /* POICount */ 10,                  // resort/vilarejo/refinaria
            /* WorldSize */ 1500000.0f          // 15 km
        };

        constexpr WorldPreset ArukheeaPreset = {
            WorldBiome::OceanArchipel,
            /* HeightScale */ 500.0f,           // ilha costeira com falésias moderadas
            /* NoiseFrequency */ 0.002f,
            /* VegetationDensity */ 0.45f,      // Bosque dos Perdidos ocupa 4/8 da ilha
            /* ObstacleDensity */ 0.35f,        // prisão, fábrica, rochas costeiras
            /* WaterCoverage */ 0.5f,           // oceano em volta da ilha (tsunami, tubarões)
            /* LootDensityMultiplier */ 0.9f,
            /* POICount */ 12,                  // bosque/prisão/fábrica/heliporto
            /* WorldSize */ 1800000.0f          // 18 km
        };

        struct WorldEntry
        {
            const char* Name;
            const WorldPreset* Preset;
            bool CanonicalRoads; // cânon F58
        };

        // Tabela canônica — a ÚNICA lista de mundos com vias é aqui (CIGKV + Barburhen).
        constexpr WorldEntry WorldTable[5] = {
            { "CIGKV",     &CIGKVPreset,     true  },
            { "Barburhen", &BarburhenPreset, true  },
            { "Priadus",   &PriadusPreset,   false },
            { "Ckesalth",  &CkesalthPreset,  false },
            { "Arukheea",  &ArukheeaPreset,  false }
        };

        const WorldEntry* FindEntry(const char* WorldName)
        {
            if (!WorldName || !WorldName[0])
            {
                return nullptr;
            }
            for (const WorldEntry& Entry : WorldTable)
            {
                bool Equal = true;
                const char* A = WorldName;
                const char* B = Entry.Name;
                while (*A && *B)
                {
                    if (*A != *B)
                    {
                        Equal = false;
                        break;
                    }
                    ++A;
                    ++B;
                }
                if (Equal && *A == '\0' && *B == '\0')
                {
                    return &Entry;
                }
            }
            return nullptr;
        }
    }

    bool IsKnownWorld(const char* WorldName)
    {
        return FindEntry(WorldName) != nullptr;
    }

    bool TryGetPreset(const char* WorldName, WorldPreset& OutPreset)
    {
        const WorldEntry* Entry = FindEntry(WorldName);
        if (!Entry)
        {
            return false;
        }
        OutPreset = *Entry->Preset;
        return true;
    }

    bool HasCanonicalRoads(const char* WorldName)
    {
        const WorldEntry* Entry = FindEntry(WorldName);
        return Entry ? Entry->CanonicalRoads : false;
    }

    bool IsUrbanBiome(WorldBiome Biome)
    {
        return Biome == WorldBiome::UrbanRuins;
    }
}
