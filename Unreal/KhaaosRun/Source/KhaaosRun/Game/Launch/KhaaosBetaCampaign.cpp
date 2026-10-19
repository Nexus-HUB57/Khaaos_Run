// ============================================================================
// Khaaos Run — Beta Campaign Infrastructure (Fase 5)
// ============================================================================
// Beta campaign management — full implementation.
// ============================================================================
// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ============================================================================

#include "Game/Launch/KhaaosBetaCampaign.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Misc/DateTime.h"
#include "Misc/Guid.h"

// ─── Log Category ─────────────────────────────────────────────────────────────

DEFINE_LOG_CATEGORY_STATIC(LogKhaaosBetaCampaign, Log, All);

// ─── Constructor ──────────────────────────────────────────────────────────────

UKhaaosBetaCampaign::UKhaaosBetaCampaign()
	: bExcoMilestoneBroadcast(false)
{
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void UKhaaosBetaCampaign::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	Analytics.ExcoMilestoneTarget = ExcoMilestoneTarget;
	NdaStatus.NdaAppliedPhase = EKhaaosCampaignPhase::EarlyAccess;
	NdaStatus.NdaLiftPhase = EKhaaosCampaignPhase::OpenBeta;
	NdaStatus.bNdaActive = true;
	NdaStatus.bEnforce = true;

	UE_LOG(LogKhaaosBetaCampaign, Log, TEXT("Beta Campaign initialized — Phase: %s"),
	       *GetPhaseName(CurrentPhase));
}

void UKhaaosBetaCampaign::Deinitialize()
{
	Super::Deinitialize();
	UE_LOG(LogKhaaosBetaCampaign, Log, TEXT("Beta Campaign deinitialized"));
}

// ─── Campaign Phase Management ────────────────────────────────────────────────

EKhaaosCampaignPhase UKhaaosBetaCampaign::GetCurrentPhase() const
{
	return CurrentPhase;
}

bool UKhaaosBetaCampaign::AdvancePhase(EKhaaosCampaignPhase NewPhase)
{
	if (!CanAdvanceTo(NewPhase))
	{
		UE_LOG(LogKhaaosBetaCampaign, Warning, TEXT("Cannot advance from %s to %s"),
		       *GetPhaseName(CurrentPhase), *GetPhaseName(NewPhase));
		return false;
	}

	const EKhaaosCampaignPhase OldPhase = CurrentPhase;
	CurrentPhase = NewPhase;

	// Update NDA status based on new phase
	UpdateNdaStatus();

	UE_LOG(LogKhaaosBetaCampaign, Log, TEXT("Campaign phase: %s → %s (NDA: %s)"),
	       *GetPhaseName(OldPhase), *GetPhaseName(NewPhase),
	       NdaStatus.bNdaActive ? TEXT("ACTIVE") : TEXT("LIFTED"));

	OnCampaignPhaseChanged.Broadcast(OldPhase, NewPhase);
	return true;
}

bool UKhaaosBetaCampaign::CanAdvanceTo(EKhaaosCampaignPhase NewPhase) const
{
	return ValidatePhaseTransition(CurrentPhase, NewPhase);
}

FString UKhaaosBetaCampaign::GetPhaseName(EKhaaosCampaignPhase Phase)
{
	switch (Phase)
	{
		case EKhaaosCampaignPhase::Internal:     return TEXT("Interno");
		case EKhaaosCampaignPhase::Announcement: return TEXT("Anúncio");
		case EKhaaosCampaignPhase::Enrollment:   return TEXT("Inscrição");
		case EKhaaosCampaignPhase::EarlyAccess:  return TEXT("Acesso Antecipado");
		case EKhaaosCampaignPhase::OpenBeta:     return TEXT("Beta Aberto");
		case EKhaaosCampaignPhase::Launch:       return TEXT("Lançamento");
		default:                                  return TEXT("Desconhecido");
	}
}

bool UKhaaosBetaCampaign::ValidatePhaseTransition(EKhaaosCampaignPhase From,
                                                   EKhaaosCampaignPhase To) const
{
	// Can only advance forward (or stay in same phase)
	if (static_cast<int32>(To) < static_cast<int32>(From))
	{
		return false;
	}

	// Can always stay in current phase
	if (From == To)
	{
		return true;
	}

	// Valid forward transitions:
	// Internal → Announcement → Enrollment → EarlyAccess → OpenBeta → Launch
	const int32 Diff = static_cast<int32>(To) - static_cast<int32>(From);

	// Allow skipping phases (e.g., internal → early access for fast-track)
	// But log a warning for non-sequential transitions
	if (Diff > 1)
	{
		UE_LOG(LogKhaaosBetaCampaign, Warning, TEXT("Non-sequential phase transition: %s → %s (skipped %d phases)"),
		       *GetPhaseName(From), *GetPhaseName(To), Diff - 1);
	}

	return true;
}

void UKhaaosBetaCampaign::UpdateNdaStatus()
{
	NdaStatus.bNdaActive = FKhaaosNDAStatus::IsNdaActiveForPhase(CurrentPhase);
}

// ─── Enrollment ───────────────────────────────────────────────────────────────

bool UKhaaosBetaCampaign::EnrollPlayer(const FString& PlayerId, const FString& Region,
                                        const FString& InviteCode, const FString& ReferrerId)
{
	// Check if already enrolled
	if (Enrollments.Contains(PlayerId))
	{
		UE_LOG(LogKhaaosBetaCampaign, Warning, TEXT("Player %s already enrolled"), *PlayerId);
		return false;
	}

	// Validate invite code if provided
	if (!InviteCode.IsEmpty())
	{
		FKhaaosInviteCode CodeData;
		if (!ValidateInviteCode(InviteCode, CodeData))
		{
			UE_LOG(LogKhaaosBetaCampaign, Warning, TEXT("Invalid invite code: %s"), *InviteCode);
			return false;
		}

		// Check if code grants access to current phase
		if (static_cast<int32>(CodeData.GrantsAccessTo) > static_cast<int32>(CurrentPhase))
		{
			UE_LOG(LogKhaaosBetaCampaign, Warning, TEXT("Invite code %s requires phase %s, current phase is %s"),
			       *InviteCode, *GetPhaseName(CodeData.GrantsAccessTo), *GetPhaseName(CurrentPhase));
			return false;
		}
	}
	else
	{
		// No invite code — only allowed in Open Beta and later phases
		if (CurrentPhase < EKhaaosCampaignPhase::OpenBeta)
		{
			UE_LOG(LogKhaaosBetaCampaign, Warning, TEXT("Invite code required for phase %s"), *GetPhaseName(CurrentPhase));
			return false;
		}
	}

	// Validate referrer
	if (!ReferrerId.IsEmpty())
	{
		if (!Enrollments.Contains(ReferrerId))
		{
			UE_LOG(LogKhaaosBetaCampaign, Warning, TEXT("Referrer %s not enrolled"), *ReferrerId);
			return false;
		}

		// Check referral limit
		if (GetReferralCount(ReferrerId) >= MaxReferralsPerPlayer)
		{
			UE_LOG(LogKhaaosBetaCampaign, Warning, TEXT("Referrer %s has reached max referrals (%d)"),
			       *ReferrerId, MaxReferralsPerPlayer);
			return false;
		}
	}

	// Create enrollment record
	FKhaaosEnrollmentRecord Record;
	Record.PlayerId = PlayerId;
	Record.EnrolledAt = GetIsoTimestamp();
	Record.EnrolledPhase = CurrentPhase;
	Record.Region = Region;
	Record.InviteCodeUsed = InviteCode;
	Record.ReferrerPlayerId = ReferrerId;
	Record.bNdaAccepted = !NdaStatus.bNdaActive; // Auto-accept if NDA not active
	Record.bIsActive = true;

	Enrollments.Add(PlayerId, Record);

	// Redeem invite code
	if (!InviteCode.IsEmpty())
	{
		RedeemInviteCode(InviteCode);
	}

	// Process referral
	if (!ReferrerId.IsEmpty())
	{
		CreateReferral(ReferrerId, PlayerId);
	}

	// Update analytics
	Analytics.TotalEnlistments = static_cast<int64>(Enrollments.Num());
	DailyEnrollmentTimestamps.Add(GetIsoTimestamp());
	CalculateDailyRate();
	CheckExcoMilestone();

	UE_LOG(LogKhaaosBetaCampaign, Log, TEXT("Player %s enrolled in %s (phase: %s, total: %lld)"),
	       *PlayerId, *Region, *GetPhaseName(CurrentPhase), Analytics.TotalEnlistments);

	OnPlayerEnrolled.Broadcast(PlayerId);
	return true;
}

bool UKhaaosBetaCampaign::IsPlayerEnrolled(const FString& PlayerId) const
{
	return Enrollments.Contains(PlayerId);
}

int64 UKhaaosBetaCampaign::GetTotalEnrollments() const
{
	return Analytics.TotalEnlistments;
}

float UKhaaosBetaCampaign::GetDailyEnrollmentRate() const
{
	return Analytics.DailyEnrollmentRate;
}

// ─── EXCO Milestone ───────────────────────────────────────────────────────────

float UKhaaosBetaCampaign::GetExcoProgress() const
{
	return Analytics.GetExcoProgress();
}

bool UKhaaosBetaCampaign::IsExcoMilestoneReached() const
{
	return Analytics.IsExcoMilestoneReached();
}

void UKhaaosBetaCampaign::CheckExcoMilestone()
{
	if (bExcoMilestoneBroadcast) return;

	if (Analytics.IsExcoMilestoneReached())
	{
		bExcoMilestoneBroadcast = true;
		UE_LOG(LogKhaaosBetaCampaign, Log, TEXT("=== EXCO MILESTONE REACHED: %lld enlistments ==="),
		       Analytics.TotalEnlistments);
		OnExcoMilestoneReached.Broadcast();
	}
}

// ─── Invite Code System ───────────────────────────────────────────────────────

TArray<FString> UKhaaosBetaCampaign::GenerateInviteCodes(int32 Count,
                                                          EKhaaosCampaignPhase Phase,
                                                          const FString& Source,
                                                          bool bPriority)
{
	TArray<FString> GeneratedCodes;
	GeneratedCodes.Reserve(Count);

	const FString Now = GetIsoTimestamp();

	for (int32 i = 0; i < Count; ++i)
	{
		const FString Code = GenerateSingleCode();

		FKhaaosInviteCode InviteCode;
		InviteCode.Code = Code;
		InviteCode.GrantsAccessTo = Phase;
		InviteCode.MaxUses = 1;
		InviteCode.UsesRemaining = 1;
		InviteCode.bPriority = bPriority;
		InviteCode.Source = Source;
		InviteCode.CreatedAt = Now;

		InviteCodes.Add(Code, InviteCode);
		GeneratedCodes.Add(Code);
	}

	UE_LOG(LogKhaaosBetaCampaign, Log, TEXT("Generated %d invite codes for phase %s (source: %s, priority: %s)"),
	       Count, *GetPhaseName(Phase), *Source, bPriority ? TEXT("yes") : TEXT("no"));

	return GeneratedCodes;
}

bool UKhaaosBetaCampaign::ValidateInviteCode(const FString& Code, FKhaaosInviteCode& OutCodeData)
{
	const FKhaaosInviteCode* Found = InviteCodes.Find(Code);
	if (!Found)
	{
		return false;
	}

	OutCodeData = *Found;
	return Found->IsValid();
}

bool UKhaaosBetaCampaign::RedeemInviteCode(const FString& Code)
{
	FKhaaosInviteCode* Found = InviteCodes.Find(Code);
	if (!Found || !Found->IsValid())
	{
		return false;
	}

	if (Found->MaxUses > 0)
	{
		Found->UsesRemaining--;
	}

	UE_LOG(LogKhaaosBetaCampaign, Log, TEXT("Invite code %s redeemed (remaining: %d)"),
	       *Code, Found->UsesRemaining);
	return true;
}

FString UKhaaosBetaCampaign::GenerateSingleCode() const
{
	// Format: KR-XXXX-XXXX-XXXX where X is alphanumeric
	auto RandomChunk = []() -> FString
	{
		const TCHAR Chars[] = TEXT("ABCDEFGHJKLMNPQRSTUVWXYZ23456789"); // No I,O,0,1 (ambiguous)
		constexpr int32 Len = 4;
		FString Chunk;
		Chunk.Reserve(Len);
		for (int32 i = 0; i < Len; ++i)
		{
			Chunk += Chars[FMath::RandRange(0, 30)]; // 31 valid chars
		}
		return Chunk;
	};

	return FString::Printf(TEXT("KR-%s-%s-%s"), *RandomChunk(), *RandomChunk(), *RandomChunk());
}

// ─── NDA Management ───────────────────────────────────────────────────────────

bool UKhaaosBetaCampaign::IsNdaActive() const
{
	return NdaStatus.bNdaActive;
}

bool UKhaaosBetaCampaign::AcceptNda(const FString& PlayerId)
{
	FKhaaosEnrollmentRecord* Record = Enrollments.Find(PlayerId);
	if (!Record)
	{
		return false;
	}

	Record->bNdaAccepted = true;
	UE_LOG(LogKhaaosBetaCampaign, Log, TEXT("Player %s accepted NDA"), *PlayerId);
	return true;
}

void UKhaaosBetaCampaign::RecordNdaViolation()
{
	NdaStatus.ViolationCount++;
	UE_LOG(LogKhaaosBetaCampaign, Error, TEXT("NDA violation detected (total: %d)"), NdaStatus.ViolationCount);

	if (NdaStatus.bEnforce && NdaStatus.ViolationCount >= 3)
	{
		UE_LOG(LogKhaaosBetaCampaign, Error, TEXT("NDA enforcement: 3+ violations — recommend account suspension"));
	}
}

int32 UKhaaosBetaCampaign::GetNdaViolationCount() const
{
	return NdaStatus.ViolationCount;
}

// ─── Referral System ──────────────────────────────────────────────────────────

bool UKhaaosBetaCampaign::CreateReferral(const FString& ReferrerId, const FString& ReferredId)
{
	// Check referral limit
	int32& RefCount = PlayerReferralCounts.FindOrAdd(ReferrerId, 0);
	if (RefCount >= MaxReferralsPerPlayer)
	{
		return false;
	}

	FKhaaosReferralRecord Referral;
	Referral.ReferrerId = ReferrerId;
	Referral.ReferredId = ReferredId;
	Referral.ReferredAt = GetIsoTimestamp();
	Referral.bEnrolled = true;
	Referral.BonusKRC = ReferralBonusKRC;

	Referrals.Add(Referral);
	RefCount++;

	// Track bonus KRC
	int32& Bonus = PlayerReferralBonuses.FindOrAdd(ReferrerId, 0);
	Bonus += ReferralBonusKRC;

	Analytics.ReferralSignups++;

	UE_LOG(LogKhaaosBetaCampaign, Log, TEXT("Referral: %s → %s (+%d KRC)"),
	       *ReferrerId, *ReferredId, ReferralBonusKRC);
	return true;
}

int32 UKhaaosBetaCampaign::GetReferralCount(const FString& PlayerId) const
{
	const int32* Count = PlayerReferralCounts.Find(PlayerId);
	return Count ? *Count : 0;
}

int32 UKhaaosBetaCampaign::GetReferralBonusKRC(const FString& PlayerId) const
{
	const int32* Bonus = PlayerReferralBonuses.Find(PlayerId);
	return Bonus ? *Bonus : 0;
}

// ─── Streamer Program ─────────────────────────────────────────────────────────

bool UKhaaosBetaCampaign::AddStreamer(const FString& PlayerId, const FString& DisplayName,
                                       const FString& Platform, int32 AvgViewers)
{
	if (AvgViewers < StreamerMinViewers)
	{
		UE_LOG(LogKhaaosBetaCampaign, Warning, TEXT("Streamer %s below min viewers (%d < %d)"),
		       *DisplayName, AvgViewers, StreamerMinViewers);
		return false;
	}

	FKhaaosStreamerEntry Entry;
	Entry.PlayerId = PlayerId;
	Entry.DisplayName = DisplayName;
	Entry.Platform = Platform;
	Entry.AvgViewers = AvgViewers;
	Entry.PriorityLevel = AvgViewers >= 10000 ? 1 : AvgViewers >= 5000 ? 2 : 3;
	Entry.bNdaExempt = AvgViewers >= 5000; // Verified partners with 5k+ viewers
	Entry.ReferralCode = GenerateSingleCode();
	Entry.bActive = true;

	Streamers.Add(PlayerId, Entry);

	UE_LOG(LogKhaaosBetaCampaign, Log, TEXT("Streamer added: %s (%s, %d viewers, priority %d)"),
	       *DisplayName, *Platform, AvgViewers, Entry.PriorityLevel);
	return true;
}

bool UKhaaosBetaCampaign::IsStreamer(const FString& PlayerId) const
{
	const FKhaaosStreamerEntry* Entry = Streamers.Find(PlayerId);
	return Entry && Entry->bActive;
}

TArray<FKhaaosStreamerEntry> UKhaaosBetaCampaign::GetActiveStreamers() const
{
	TArray<FKhaaosStreamerEntry> Active;
	for (const auto& Pair : Streamers)
	{
		if (Pair.Value.bActive)
		{
			Active.Add(Pair.Value);
		}
	}
	return Active;
}

// ─── Campaign Analytics ───────────────────────────────────────────────────────

FKhaaosCampaignAnalytics UKhaaosBetaCampaign::GetAnalytics() const
{
	return Analytics;
}

void UKhaaosBetaCampaign::UpdateRegionalStats()
{
	Analytics.RegionalBreakdown.Reset();

	TMap<FString, int32> RegionCounts;
	TMap<FString, int32> RegionActive;

	for (const auto& Pair : Enrollments)
	{
		const FString& Region = Pair.Value.Region;
		RegionCounts.FindOrAdd(Region, 0)++;
		if (Pair.Value.bIsActive)
		{
			RegionActive.FindOrAdd(Region, 0)++;
		}
	}

	const int64 Total = Analytics.TotalEnlistments;

	for (const auto& Pair : RegionCounts)
	{
		FKhaaosRegionalEnrollment Regional;
		Regional.RegionId = Pair.Key;
		Regional.TotalEnlistments = Pair.Value;
		Regional.ActivePlayers = RegionActive.FindOrAdd(Pair.Key, 0);
		Regional.PercentageOfTotal = Total > 0
			? (static_cast<float>(Pair.Value) / static_cast<float>(Total)) * 100.0f
			: 0.0f;

		Analytics.RegionalBreakdown.Add(Regional);
	}

	// Calculate retention metrics (estimated from active players)
	int32 ActiveCount = 0;
	for (const auto& Pair : Enrollments)
	{
		if (Pair.Value.bIsActive) ActiveCount++;
	}

	const int32 TotalCount = Enrollments.Num();
	if (TotalCount > 0)
	{
		Analytics.ConversionRate = (static_cast<float>(ActiveCount) / static_cast<float>(TotalCount)) * 100.0f;
		Analytics.RetentionDay7 = Analytics.ConversionRate * 0.85f; // Estimated decay
		Analytics.RetentionDay30 = Analytics.ConversionRate * 0.6f;
		Analytics.ChurnRate = 100.0f - Analytics.ConversionRate;
	}

	// Referral conversion
	if (Analytics.ReferralSignups > 0)
	{
		int32 EnrolledReferrals = 0;
		for (const FKhaaosReferralRecord& Ref : Referrals)
		{
			if (Ref.bEnrolled) EnrolledReferrals++;
		}
		Analytics.ReferralConversionRate = (static_cast<float>(EnrolledReferrals) /
		                                    static_cast<float>(Referrals.Num())) * 100.0f;
	}

	UE_LOG(LogKhaaosBetaCampaign, Verbose, TEXT("Regional stats updated: %d regions, %lld total, %.1f%% conversion"),
	       Analytics.RegionalBreakdown.Num(), Analytics.TotalEnlistments, Analytics.ConversionRate);
}

void UKhaaosBetaCampaign::CalculateDailyRate()
{
	// Count enrollments in the last 24 hours
	const FDateTime Now = FDateTime::UtcNow();
	const FDateTime DayAgo = Now - FTimespan(1, 0, 0, 0);
	const FString DayAgoStr = FString::Printf(TEXT("%04d-%02d-%02dT%02d:%02d:%02dZ"),
	                                           DayAgo.GetYear(), DayAgo.GetMonth(), DayAgo.GetDay(),
	                                           DayAgo.GetHour(), DayAgo.GetMinute(), DayAgo.GetSecond());

	int32 Count = 0;
	for (const FString& Ts : DailyEnrollmentTimestamps)
	{
		if (Ts >= DayAgoStr)
		{
			Count++;
		}
	}

	Analytics.DailyEnrollmentRate = static_cast<float>(Count);
}

// ─── Communication Templates ──────────────────────────────────────────────────

FString UKhaaosBetaCampaign::GenerateCommTemplate(EKhaaosCommTemplate Template,
                                                   const FString& RecipientName,
                                                   const FString& InviteCode)
{
	const FString Name = RecipientName.IsEmpty() ? TEXT("Corredor") : RecipientName;
	const FString EnrollCount = FString::Printf(TEXT("%lld"), Analytics.TotalEnlistments);
	const FString ExcoPct = FString::Printf(TEXT("%.1f%%"), GetExcoProgress());

	switch (Template)
	{
		case EKhaaosCommTemplate::Announcement:
			return FString::Printf(TEXT(
				"🎮 KHAOS RUN — BETA INSCRIÇÕES ABERTAS!\n\n"
				"Corredores, o momento chegou!\n"
				"O War'I está abrindo portas para o Beta.\n\n"
				"🔹 Fase atual: %s\n"
				"🔹 Inscrições: %s corredores\n"
				"🔹 Progresso EXCO: %s\n\n"
				"Inscreva-se em khaaos.run/beta\n"
				"#KhaaosRun #BetaAberto #WarI"),
				*GetPhaseName(CurrentPhase), *EnrollCount, *ExcoPct);

		case EKhaaosCommTemplate::InviteEmail:
			return FString::Printf(TEXT(
				"Olá %s,\n\n"
				"Você foi convidado para o Beta do Khaaos Run!\n\n"
				"Seu código de acesso: %s\n\n"
				"Acesse khaaos.run/beta e insira seu código para garantir sua vaga.\n\n"
				"%s\n\n"
				"Nos vemos no War'I!\n"
				"— Equipe Khaaos Run"),
				*Name, *InviteCode,
				NdaStatus.bNdaActive ? TEXT("⚠️ NDA: Este acesso está sob NDA. Não compartilhe conteúdo.") : TEXT(""));

		case EKhaaosCommTemplate::WelcomeEmail:
			return FString::Printf(TEXT(
				"Bem-vindo ao Khaaos Run, %s!\n\n"
				"Você está oficialmente no Beta.\n\n"
				"🔹 Download: khaaos.run/download\n"
				🔹 Discord: discord.gg/khaaosrun\n"
				"🔹 Status: khaaos.run/status\n\n"
				"%s\n\n"
				"Boa sorte no War'I!\n"
				"— Equipe Khaaos Run"),
				*Name,
				NdaStatus.bNdaActive ? TEXT("⚠️ Lembre-se: NDA ativo. Não compartilhe screenshots ou vídeos.") : TEXT(""));

		case EKhaaosCommTemplate::NDAReminder:
			return FString::Printf(TEXT(
				"⚠️ LEMBRETE DE NDA — Khaaos Run\n\n"
				"%s,\n\n"
				"O acesso ao Beta está sob NDA (Non-Disclosure Agreement).\n\n"
				"PROIBIDO:\n"
				"  ❌ Screenshots/Vídeos públicos\n"
				"  ❌ Streaming do gameplay\n"
				"  ❌ Discussão em fóruns públicos\n\n"
				"PERMITIDO:\n"
				"  ✅ Feedback no Discord privado\n"
				"  ✅ Bug reports no canal #bugs\n"
				"  ✅ Discussão com outros testadores\n\n"
				"Violações resultam em revogação de acesso.\n\n"
				"— Equipe Khaaos Run"),
				*Name);

		case EKhaaosCommTemplate::LaunchAnnounce:
			return FString::Printf(TEXT(
				"🚀 KHAOS RUN — LANÇAMENTO OFICIAL!\n\n"
				"Corredores, o War'I está AO VIVO!\n\n"
				"🔹 %s corredores inscritos\n"
				"🔹 3 regiões: SA, NA, EU\n"
				"🔹 Mundos: CIGKV, Barburhen, Priadus, Arukheea, Ckesalth\n\n"
				"Jogue agora: khaaos.run/play\n"
				"#KhaaosRun #Launch #WarI"),
				EnrollCount);

		case EKhaaosCommTemplate::ReferralInvite:
			return FString::Printf(TEXT(
				"%s está te convidando para o Khaaos Run!\n\n"
				"Junte-se ao War'I e descubra o Battle Royale dos Mundos.\n\n"
				"🔹 Inscreva-se: khaaos.run/beta?ref=%s\n"
				"🔹 Ambos ganham %d KRC ao inscrever!\n\n"
				"Nos vemos no Ring!\n"
				"— Equipe Khaaos Run"),
				*Name, *InviteCode, ReferralBonusKRC);

		default:
			return TEXT("Template não encontrado");
	}
}

// ─── ISO Timestamp ────────────────────────────────────────────────────────────

FString UKhaaosBetaCampaign::GetIsoTimestamp() const
{
	const FDateTime Now = FDateTime::UtcNow();
	return FString::Printf(TEXT("%04d-%02d-%02dT%02d:%02d:%02dZ"),
	                       Now.GetYear(), Now.GetMonth(), Now.GetDay(),
	                       Now.GetHour(), Now.GetMinute(), Now.GetSecond());
}
