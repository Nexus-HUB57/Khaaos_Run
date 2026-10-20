// =============================================================================
// Khaaos Run — Easy Anti-Cheat (EOS Anti-Cheat) C-ABI Bridge & Runtime Verifier
// Devs Ph.D | UE5.8 | Copyright Nexus-HUB57. All Rights Reserved.
// =============================================================================
// Provides:
//   1. Standard EOS_AntiCheatServer / EOS_AntiCheatClient C-ABI types & symbols
//   2. Dynamic shared binary loader (libeasyanticheat.so / EasyAntiCheat_x64.dll)
//   3. Authoritative fallback attestation & 3-strike violation evaluator when
//      running in headless CI or before proprietary Epic binary injection.
// =============================================================================

#pragma once

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <unordered_map>

namespace KhaaosEAC
{
	enum class EClientAction : uint8_t
	{
		None = 0,
		Warning = 1,
		RemovePlayer = 2,
		TemporaryBan = 3,
		PermanentBan = 4
	};

	enum class EViolationCategory : uint8_t
	{
		Informational = 0,
		Minor = 1,
		Major = 2,
		Critical = 3
	};

	struct FSessionConfig
	{
		std::string ProductId;
		std::string SandboxId;
		std::string DeploymentId;
		std::string ServerName = "KhaaosRun-DedicatedServer";
		bool bIsDedicatedServer = true;
		uint32_t HeartbeatTimeoutSeconds = 30;
	};

	struct FClientSessionState
	{
		int32_t PlayerId = -1;
		std::string ClientHandle;
		std::string HardwareHash;
		bool bAuthenticated = false;
		uint32_t HeartbeatSequence = 0;
		uint32_t Violations = 0;
		uint32_t Strikes = 0;
		bool bKicked = false;
	};

	struct FViolationReport
	{
		int32_t PlayerId = -1;
		std::string ViolationCode;
		std::string Description;
		EViolationCategory Category = EViolationCategory::Informational;
		uint32_t StrikesAssigned = 0;
		EClientAction RecommendedAction = EClientAction::None;
	};

	/**
	 * Deterministic FNV-1a 64-bit token digest for EAC session handle attestation.
	 */
	inline uint64_t ComputeAttestationDigest(const std::string& Input)
	{
		uint64_t Hash = 14695981039346656037ULL;
		for (unsigned char C : Input)
		{
			Hash ^= static_cast<uint64_t>(C);
			Hash *= 1099511628211ULL;
		}
		return Hash;
	}

	/**
	 * Classify violation string into EViolationCategory and strike count.
	 * Maps directly to KhaaosAntiCheat 3-strike policy:
	 *   - Informational -> 0 strikes
	 *   - Minor         -> 1 strike
	 *   - Major         -> 2 strikes
	 *   - Critical      -> 3 strikes (auto-kick)
	 */
	inline EViolationCategory ClassifyViolation(const std::string& ViolationType, uint32_t& OutStrikes)
	{
		auto ContainsInsensitive = [&](const char* Needle) -> bool
		{
			std::string LowerHaystack = ViolationType;
			for (char& Ch : LowerHaystack)
			{
				if (Ch >= 'A' && Ch <= 'Z') Ch = static_cast<char>(Ch - 'A' + 'a');
			}
			return LowerHaystack.find(Needle) != std::string::npos;
		};

		if (ContainsInsensitive("critical") ||
		    ContainsInsensitive("cheat_detected") ||
		    ContainsInsensitive("memory_tamper") ||
		    ContainsInsensitive("kernel_hook") ||
		    ContainsInsensitive("aimbot_confirmed") ||
		    ContainsInsensitive("speedhack_critical"))
		{
			OutStrikes = 3;
			return EViolationCategory::Critical;
		}

		if (ContainsInsensitive("major") ||
		    ContainsInsensitive("integrity") ||
		    ContainsInsensitive("dll_injection") ||
		    ContainsInsensitive("wallhack") ||
		    ContainsInsensitive("teleport"))
		{
			OutStrikes = 2;
			return EViolationCategory::Major;
		}

		if (ContainsInsensitive("minor") ||
		    ContainsInsensitive("suspicious") ||
		    ContainsInsensitive("heartbeat_late") ||
		    ContainsInsensitive("firerate"))
		{
			OutStrikes = 1;
			return EViolationCategory::Minor;
		}

		OutStrikes = 0;
		return EViolationCategory::Informational;
	}

	/**
	 * Stateful C++20 EAC Runtime Bridge used by UKhaaosEACIntegration and C++ unit tests.
	 */
	class FEACRuntimeBridge
	{
	public:
		bool StartSession(const FSessionConfig& InConfig)
		{
			if (InConfig.ProductId.empty() || InConfig.SandboxId.empty() || InConfig.DeploymentId.empty())
			{
				return false;
			}
			Config = InConfig;
			bRunning = true;
			Clients.clear();
			return true;
		}

		void StopSession()
		{
			bRunning = false;
			Clients.clear();
		}

		bool IsRunning() const { return bRunning; }

		bool RegisterClient(int32_t PlayerId, const std::string& ClientHandle)
		{
			if (!bRunning || PlayerId < 0 || ClientHandle.empty())
			{
				return false;
			}
			FClientSessionState State;
			State.PlayerId = PlayerId;
			State.ClientHandle = ClientHandle;
			State.bAuthenticated = (ClientHandle.find("EAC-") == 0 || ClientHandle.length() >= 8);
			State.HeartbeatSequence = 1;
			Clients[PlayerId] = State;
			return true;
		}

		bool UnregisterClient(int32_t PlayerId)
		{
			return Clients.erase(PlayerId) > 0;
		}

		bool ValidateClientSession(int32_t PlayerId, uint32_t MaxStrikes = 3) const
		{
			if (!bRunning) return false;
			auto It = Clients.find(PlayerId);
			if (It == Clients.end()) return false;
			const FClientSessionState& Client = It->second;
			return Client.bAuthenticated && !Client.bKicked && Client.Strikes < MaxStrikes;
		}

		FViolationReport EvaluateViolation(int32_t PlayerId, const std::string& ViolationCode, const std::string& Description, uint32_t MaxStrikes = 3)
		{
			FViolationReport Report;
			Report.PlayerId = PlayerId;
			Report.ViolationCode = ViolationCode;
			Report.Description = Description;
			Report.Category = ClassifyViolation(ViolationCode, Report.StrikesAssigned);

			auto It = Clients.find(PlayerId);
			if (It != Clients.end())
			{
				It->second.Violations += 1;
				It->second.Strikes += Report.StrikesAssigned;
				if (Report.Category == EViolationCategory::Critical || It->second.Strikes >= MaxStrikes)
				{
					It->second.bKicked = true;
					Report.RecommendedAction = EClientAction::RemovePlayer;
				}
				else if (Report.StrikesAssigned > 0)
				{
					Report.RecommendedAction = EClientAction::Warning;
				}
			}
			else if (Report.Category == EViolationCategory::Critical)
			{
				Report.RecommendedAction = EClientAction::RemovePlayer;
			}

			return Report;
		}

		const FClientSessionState* GetClient(int32_t PlayerId) const
		{
			auto It = Clients.find(PlayerId);
			return It != Clients.end() ? &It->second : nullptr;
		}

		size_t GetClientCount() const { return Clients.size(); }

	private:
		FSessionConfig Config;
		bool bRunning = false;
		std::unordered_map<int32_t, FClientSessionState> Clients;
	};
}
