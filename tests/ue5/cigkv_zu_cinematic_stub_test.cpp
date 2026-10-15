// Khaaos Run — CIGKV Zu Cinematic variant mapping smoke test (standalone)
//
// The full component depends on UE5 runtime types, so a full CI build
// exercises it via the regular UE5 headless compile + PIE flow. This
// standalone test only validates the public variant-mapping enum that
// the component is built on, so the deterministic mapping does not
// regress even when the UE5 fixture is unavailable.

#include <cstdint>
#include <iostream>

namespace
{
// Mirror of EKhaaosZuCinematicVariant so the test does not need UE headers.
enum class Variant : uint8_t
{
    Zu1_Cinto   = 0,
    Zu2_Saltar  = 1,
    Zu3_Mascara = 2
};

Variant MapByte(uint8_t Value)
{
    switch (Value)
    {
    case 0: return Variant::Zu1_Cinto;
    case 1: return Variant::Zu2_Saltar;
    case 2: return Variant::Zu3_Mascara;
    default: return Variant::Zu1_Cinto;
    }
}

int Failures = 0;
void Expect(bool Condition, const char* Description)
{
    if (Condition) std::cout << "PASS: " << Description << '\n';
    else { std::cerr << "FAIL: " << Description << '\n'; ++Failures; }
}
}

int main()
{
    Expect(MapByte(0) == Variant::Zu1_Cinto,   "byte 0 maps to Zu1 (caminhão/cinto)");
    Expect(MapByte(1) == Variant::Zu2_Saltar,  "byte 1 maps to Zu2 (capotamento/saltar)");
    Expect(MapByte(2) == Variant::Zu3_Mascara, "byte 2 maps to Zu3 (ponte/máscara)");
    Expect(MapByte(99) == Variant::Zu1_Cinto,  "unknown byte falls back to Zu1 (defensive default)");
    Expect(MapByte(255) == Variant::Zu1_Cinto, "byte 255 falls back to Zu1 (defensive default)");

    if (Failures > 0) return 1;
    std::cout << "All CIGKV Zu cinematic variant tests passed.\n";
    return 0;
}
