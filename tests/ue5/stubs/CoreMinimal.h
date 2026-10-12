#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <initializer_list>
#include <random>
#include <string>
#include <utility>
#include <vector>

using int32 = std::int32_t;
using uint8 = std::uint8_t;
using FString = std::string;

#define UCLASS(...)
#define USTRUCT(...)
#define UENUM(...)
#define UPROPERTY(...)
#define UFUNCTION(...)
#define UMETA(...)
#define GENERATED_BODY()
#define KHAAOSRUN_API
#define TEXT(Value) Value

struct FVector
{
    float X = 0.0f;
    float Y = 0.0f;
    float Z = 0.0f;

    constexpr FVector() = default;
    constexpr FVector(float InX, float InY, float InZ) : X(InX), Y(InY), Z(InZ) {}

    static const FVector ZeroVector;

    static float DistSquared2D(const FVector& Left, const FVector& Right)
    {
        const float DeltaX = Left.X - Right.X;
        const float DeltaY = Left.Y - Right.Y;
        return DeltaX * DeltaX + DeltaY * DeltaY;
    }

    constexpr FVector operator+(const FVector& Other) const
    {
        return FVector(X + Other.X, Y + Other.Y, Z + Other.Z);
    }
};

struct FRotator
{
    float Pitch = 0.0f;
    float Yaw = 0.0f;
    float Roll = 0.0f;

    constexpr FRotator() = default;
    constexpr FRotator(float InPitch, float InYaw, float InRoll)
        : Pitch(InPitch), Yaw(InYaw), Roll(InRoll)
    {
    }

    static const FRotator ZeroRotator;
};

template <typename T>
class TArray
{
public:
    TArray() = default;
    TArray(std::initializer_list<T> Values) : Items(Values) {}

    TArray& operator=(std::initializer_list<T> Values)
    {
        Items = Values;
        return *this;
    }

    int32 Num() const { return static_cast<int32>(Items.size()); }
    void Empty() { Items.clear(); }
    void Reserve(int32 Capacity) { Items.reserve(static_cast<std::size_t>(Capacity)); }
    void Add(const T& Value) { Items.push_back(Value); }
    void Add(T&& Value) { Items.push_back(std::move(Value)); }
    void Swap(int32 Left, int32 Right) { std::swap(Items[Left], Items[Right]); }

    T& operator[](int32 Index) { return Items[static_cast<std::size_t>(Index)]; }
    const T& operator[](int32 Index) const { return Items[static_cast<std::size_t>(Index)]; }

    auto begin() { return Items.begin(); }
    auto end() { return Items.end(); }
    auto begin() const { return Items.begin(); }
    auto end() const { return Items.end(); }

private:
    std::vector<T> Items;
};

class FMath
{
public:
    static int32 Min(int32 Left, int32 Right) { return std::min(Left, Right); }

    static int32 RandRange(int32 Minimum, int32 Maximum)
    {
        return std::uniform_int_distribution<int32>(Minimum, Maximum)(Generator);
    }

    static float RandRange(float Minimum, float Maximum)
    {
        return std::uniform_real_distribution<float>(Minimum, Maximum)(Generator);
    }

    static float FRandRange(float Minimum, float Maximum)
    {
        return RandRange(Minimum, Maximum);
    }

    static bool RandBool() { return RandRange(0, 1) != 0; }
    static void SeedRandom(std::uint32_t Seed) { Generator.seed(Seed); }

private:
    inline static std::mt19937 Generator{1337u};
};
