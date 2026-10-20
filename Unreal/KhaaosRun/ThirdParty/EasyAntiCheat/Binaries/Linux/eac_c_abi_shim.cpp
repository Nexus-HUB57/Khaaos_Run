#include "eos_anticheat_bridge.h"

static KhaaosEAC::FEACRuntimeBridge GServerBridge;
static KhaaosEAC::FEACRuntimeBridge GClientBridge;

extern "C" {

int32_t Khaaos_EAC_Server_Start(const char* ProductId, const char* SandboxId, const char* DeploymentId)
{
    KhaaosEAC::FSessionConfig Cfg;
    Cfg.ProductId = ProductId ? ProductId : "";
    Cfg.SandboxId = SandboxId ? SandboxId : "";
    Cfg.DeploymentId = DeploymentId ? DeploymentId : "";
    Cfg.bIsDedicatedServer = true;
    return GServerBridge.StartSession(Cfg) ? 1 : 0;
}

void Khaaos_EAC_Server_Stop()
{
    GServerBridge.StopSession();
}

int32_t Khaaos_EAC_Server_RegisterClient(int32_t PlayerId, const char* ClientHandle)
{
    return GServerBridge.RegisterClient(PlayerId, ClientHandle ? ClientHandle : "") ? 1 : 0;
}

int32_t Khaaos_EAC_Server_UnregisterClient(int32_t PlayerId)
{
    return GServerBridge.UnregisterClient(PlayerId) ? 1 : 0;
}

int32_t Khaaos_EAC_Server_ValidateSession(int32_t PlayerId, uint32_t MaxStrikes)
{
    return GServerBridge.ValidateClientSession(PlayerId, MaxStrikes) ? 1 : 0;
}

int32_t Khaaos_EAC_Client_Start(const char* ProductId, const char* SandboxId, const char* DeploymentId)
{
    KhaaosEAC::FSessionConfig Cfg;
    Cfg.ProductId = ProductId ? ProductId : "";
    Cfg.SandboxId = SandboxId ? SandboxId : "";
    Cfg.DeploymentId = DeploymentId ? DeploymentId : "";
    Cfg.bIsDedicatedServer = false;
    return GClientBridge.StartSession(Cfg) ? 1 : 0;
}

void Khaaos_EAC_Client_Stop()
{
    GClientBridge.StopSession();
}

}
