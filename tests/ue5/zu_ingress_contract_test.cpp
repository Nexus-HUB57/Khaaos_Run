// Canonical contract test for all five worlds' Zu ingress variants.
// Narrative entries intentionally match README.md § Protocolos de Ingresso (Zu).

#include "Game/World/Zu/ZuIngressRules.h"

#include <cmath>
#include <iostream>
#include <string>

namespace
{

struct FCanonicalEntry
{
    const char* World;
    const char* Place;
    const char* Situation;
    KhaaosZuIngress::EAction Action;
};

constexpr FCanonicalEntry Canonical[5][3] = {
    {
        {"CIGKV", "Khaaos Ville", "Caminhão atropela bois", KhaaosZuIngress::EAction::Seatbelt},
        {"CIGKV", "Khaaos Ville", "Capota com rocha", KhaaosZuIngress::EAction::Egress},
        {"CIGKV", "Khaaos Ville", "Cai da ponte", KhaaosZuIngress::EAction::Mask},
    },
    {
        {"Barburhen", "Barburhen", "Trem descarrila", KhaaosZuIngress::EAction::Seatbelt},
        {"Barburhen", "Barburhen", "Colisão frontal", KhaaosZuIngress::EAction::Egress},
        {"Barburhen", "Barburhen", "Incêndio elétrico", KhaaosZuIngress::EAction::Mask},
    },
    {
        {"Priadus", "Priadus", "Fim de trilho", KhaaosZuIngress::EAction::Seatbelt},
        {"Priadus", "Priadus", "Homens-bomba", KhaaosZuIngress::EAction::Egress},
        {"Priadus", "Priadus", "Neblina tóxica", KhaaosZuIngress::EAction::Mask},
    },
    {
        {"Ckesalth", "Ckesalth", "Tempestade de areia", KhaaosZuIngress::EAction::Seatbelt},
        {"Ckesalth", "Ckesalth", "Explosão no túnel", KhaaosZuIngress::EAction::Egress},
        {"Ckesalth", "Ckesalth", "Caminhão-tanque em chamas", KhaaosZuIngress::EAction::Mask},
    },
    {
        {"Arukheea", "Arukheea", "Trilho desmorona", KhaaosZuIngress::EAction::Seatbelt},
        {"Arukheea", "Arukheea", "Colisão com tanque", KhaaosZuIngress::EAction::Egress},
        {"Arukheea", "Arukheea", "Bombas de gás por drones", KhaaosZuIngress::EAction::Mask},
    },
};

bool Check(bool Condition, const std::string& Message)
{
    if (!Condition)
    {
        std::cerr << "FAIL: " << Message << '\n';
        return false;
    }
    return true;
}

} // namespace

int main()
{
    using namespace KhaaosZuIngress;
    const ERing Rings[] = {ERing::CIGKV, ERing::Barburhen, ERing::Priadus, ERing::Ckesalth, ERing::Arukheea};
    bool Passed = true;
    int Checked = 0;

    for (int RingIndex = 0; RingIndex < 5; ++RingIndex)
    {
        for (int Variant = 1; Variant <= 3; ++Variant)
        {
            const FCanonicalEntry& Expected = Canonical[RingIndex][Variant - 1];
            FSpec Spec;
            const std::string Label = std::string(Expected.World) + " Zu " + std::to_string(Variant);
            Passed &= Check(FindSpec(Rings[RingIndex], Variant, Spec), Label + " exists");
            if (!FindSpec(Rings[RingIndex], Variant, Spec))
            {
                continue;
            }

            Passed &= Check(std::string(Spec.Situation) == Expected.Situation, Label + " narrative matches README");
            Passed &= Check(Spec.Action == Expected.Action, Label + " action matches README");
            Passed &= Check(std::string(Spec.Popup).find(Expected.Situation) != std::string::npos, Label + " popup identifies canonical event");
            Passed &= Check(std::string(Spec.Place) == Expected.Place, Label + " world label matches");
            Passed &= Check(std::fabs(Spec.RefuseLoss - MaxRefuseLoss) < 0.0001f, Label + " uses canonical maximum-loss cap");

            const FOutcome Correct = Resolve(Spec, EDecision::Accept, 1.0f, 0.0f);
            Passed &= Check(std::fabs(Correct.VitalityRemaining - 1.0f) < 0.0001f, Label + " correct decision causes zero damage");
            const float AcceptedEffect = Spec.Action == EAction::Mask ? Correct.BlurSeconds : Correct.ControlLockSeconds;
            Passed &= Check(AcceptedEffect >= 5.0f && AcceptedEffect <= 7.0f, Label + " accepted effect is within 5-7 seconds");

            const FOutcome Incorrect = Resolve(Spec, EDecision::Refuse, 1.0f, 1.0f);
            Passed &= Check(Incorrect.VitalityRemaining >= 0.70f && Incorrect.VitalityRemaining <= 1.0f, Label + " incorrect decision stays within 30 percent damage");
            ++Checked;
        }
    }

    FSpec Invalid;
    Passed &= Check(!FindSpec(ERing::CIGKV, 0, Invalid), "variant 0 is rejected");
    Passed &= Check(!FindSpec(ERing::CIGKV, 4, Invalid), "variant 4 is rejected");
    Passed &= Check(!FindSpec(static_cast<ERing>(99), 1, Invalid), "unknown ring is rejected");

    if (!Passed)
    {
        return 1;
    }
    std::cout << "PASS: " << Checked << " canonical Zu variants; narrative, action, world, and decision bounds verified.\n";
    return 0;
}
