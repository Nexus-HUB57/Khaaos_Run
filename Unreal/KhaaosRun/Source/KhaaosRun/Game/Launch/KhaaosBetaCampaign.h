// ============================================================================
// Khaaos Run — Beta Campaign Infrastructure (Fase 5)
// ============================================================================
// Beta campaign management: Announcement → Enrollment → Early Access
// → Open Beta → Launch. EXCO milestone tracking (1M enlistments).
// Invite codes, NDA management, referral system, streamer program.
// ============================================================================
// Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
// ============================================================================

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KhaaosBetaCampaign.generated.h"

// ─── Campaign Phase ───────────────────────────────────────────────────────────

/**
 * EKhaaosCampaignPhase
 *
 * Phases of the beta → launch campaign.
 * Each phase has specific NDA rules, access levels, and communication rules.
 */
UENUM(BlueprintType)
enum class EKhaaosCampaignPhase : uint8
{
	/** Pre-announcement: internal only. */
	Internal       UMETA(DisplayName = "Internal"),

	/** Public announcement: registration opens. */
	Announcement   UMETA(DisplayName = "Announcement"),

	/** Enrollment period: players sign up for beta. */
	Enrollment     UMETA(DisplayName = "Enrollment"),

	/** Early access: NDA-covered, invite-only. */
	EarlyAccess    UMETA(DisplayName = "Early Access"),

	/** Open beta: NDA lifted, all enrolled players. */
	OpenBeta       UMETA(DisplayName = "Open Beta"),

	/** Full launch: public release. */
	Launch         UMETA(DisplayName = "Launch"),
};

// ─── Invite Code ──────────────────────────────────────────────────────────────

/**
 * FKhaaosInviteCode
 *
 * A beta invite code with metadata about its origin and usage.
 */
USTRUCT(BlueprintType)
struct FKhaaosInviteCode
{
	GENERATED_BODY()

	/** The invite code string (format: KR-XXXX-XXXX-XXXX). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Invite")
	FString Code;

	/** Which phase this code grants access to. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Invite")
	EKhaaosCampaignPhase GrantsAccessTo = EKhaaosCampaignPhase::EarlyAccess;

	/** Number of times this code can be used (0 = unlimited). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Invite")
	int32 MaxUses = 1;

	/** Number of times this code has been used. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Invite")
	int32 UsesRemaining = 1;

	/** Whether this is a priority code (alpha testers, press). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Invite")
	uint8 bPriority : 1 = false;

	/** Who generated this code (e.g., "alpha_tester", "press", "streamer"). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Invite")
	FString Source;

	/** Timestamp when this code was created. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Invite")
	FString CreatedAt;

	/** Check if this code is still valid and has remaining uses. */
	bool IsValid() const
	{
		return !Code.IsEmpty() && (MaxUses == 0 || UsesRemaining > 0);
	}
};

// ─── Enrollment Record ────────────────────────────────────────────────────────

/**
 * FKhaaosEnrollmentRecord
 *
 * A player's enrollment in the beta program.
 */
USTRUCT(BlueprintType)
struct FKhaaosEnrollmentRecord
{
	GENERATED_BODY()

	/** Player's EOS Product User ID. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Enrollment")
	FString PlayerId;

	/** Timestamp of enrollment. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Enrollment")
	FString EnrolledAt;

	/** Which phase the player enrolled during. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Enrollment")
	EKhaaosCampaignPhase EnrolledPhase = EKhaaosCampaignPhase::Enrollment;

	/** Player's region (for regional breakdown). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Enrollment")
	FString Region;

	/** Invite code used (empty if open enrollment). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Enrollment")
	FString InviteCodeUsed;

	/** Referring player ID (if referred). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Enrollment")
	FString ReferrerPlayerId;

	/** Whether NDA has been accepted. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Enrollment")
	uint8 bNdaAccepted : 1 = false;

	/** Whether the player is currently active (logged in within 7 days). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Enrollment")
	uint8 bIsActive : 1 = true;
};

// ─── Regional Enrollment Stats ────────────────────────────────────────────────

/**
 * FKhaaosRegionalEnrollment
 *
 * Enrollment statistics for a specific region.
 */
USTRUCT(BlueprintType)
struct FKhaaosRegionalEnrollment
{
	GENERATED_BODY()

	/** Region identifier (sa1, na1, eu1). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Regional")
	FString RegionId;

	/** Total enlistments in this region. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Regional")
	int32 TotalEnlistments = 0;

	/** Active players in this region (last 7 days). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Regional")
	int32 ActivePlayers = 0;

	/** Daily enrollment rate (last 24h). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Regional")
	float DailyRate = 0.0f;

	/** Percentage of total enrollment. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Regional")
	float PercentageOfTotal = 0.0f;
};

// ─── NDA Management ───────────────────────────────────────────────────────────

/**
 * FKhaaosNDAStatus
 *
 * NDA management state, phase-aware.
 */
USTRUCT(BlueprintType)
struct FKhaaosNDAStatus
{
	GENERATED_BODY()

	/** Whether NDA is currently in effect. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|NDA")
	uint8 bNdaActive : 1 = true;

	/** Phase when NDA was first applied. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|NDA")
	EKhaaosCampaignPhase NdaAppliedPhase = EKhaaosCampaignPhase::EarlyAccess;

	/** Phase when NDA will be lifted. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|NDA")
	EKhaaosCampaignPhase NdaLiftPhase = EKhaaosCampaignPhase::OpenBeta;

	/** Number of NDA violations detected. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|NDA")
	int32 ViolationCount = 0;

	/** Whether to enforce NDA (auto-kick on violation). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|NDA")
	uint8 bEnforce : 1 = true;

	/** Determine if NDA is in effect for a given phase. */
	static bool IsNdaActiveForPhase(EKhaaosCampaignPhase Phase)
	{
		return Phase == EKhaaosCampaignPhase::Internal ||
		       Phase == EKhaaosCampaignPhase::EarlyAccess;
	}
};

// ─── Communication Template ───────────────────────────────────────────────────

/**
 * EKhaaosCommTemplate
 *
 * Types of communication templates.
 */
UENUM(BlueprintType)
enum class EKhaaosCommTemplate : uint8
{
	Announcement   UMETA(DisplayName = "Announcement"),
	InviteEmail    UMETA(DisplayName = "Invite Email"),
	WelcomeEmail   UMETA(DisplayName = "Welcome Email"),
	NDAReminder    UMETA(DisplayName = "NDA Reminder"),
	LaunchAnnounce UMETA(DisplayName = "Launch Announcement"),
	ReferralInvite UMETA(DisplayName = "Referral Invite"),
};

// ─── Referral System ──────────────────────────────────────────────────────────

/**
 * FKhaaosReferralRecord
 *
 * A referral from one player to another.
 */
USTRUCT(BlueprintType)
struct FKhaaosReferralRecord
{
	GENERATED_BODY()

	/** The referring player. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Referral")
	FString ReferrerId;

	/** The referred player. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Referral")
	FString ReferredId;

	/** Timestamp of referral. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Referral")
	FString ReferredAt;

	/** Whether the referred player has enrolled. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Referral")
	uint8 bEnrolled : 1 = false;

	/** KRC bonus awarded to referrer (in Khaaos Run Coin). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Referral")
	int32 BonusKRC = 0;
};

// ─── Streamer Program ─────────────────────────────────────────────────────────

/**
 * FKhaaosStreamerEntry
 *
 * Entry in the streamer/content creator program.
 */
USTRUCT(BlueprintType)
struct FKhaaosStreamerEntry
{
	GENERATED_BODY()

	/** Player ID of the streamer. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Streamer")
	FString PlayerId;

	/** Streamer display name. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Streamer")
	FString DisplayName;

	/** Platform (Twitch, YouTube, Kick). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Streamer")
	FString Platform;

	/** Average concurrent viewers. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Streamer")
	int32 AvgViewers = 0;

	/** Priority access level (1=highest, 5=lowest). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Streamer")
	int32 PriorityLevel = 3;

	/** Whether NDA exemption is granted (verified partners only). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Streamer")
	uint8 bNdaExempt : 1 = false;

	/** Custom referral code for the streamer. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Streamer")
	FString ReferralCode;

	/** Whether this streamer is currently active. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Streamer")
	uint8 bActive : 1 = true;
};

// ─── Campaign Analytics ───────────────────────────────────────────────────────

/**
 * FKhaaosCampaignAnalytics
 *
 * Campaign performance analytics.
 */
USTRUCT(BlueprintType)
struct FKhaaosCampaignAnalytics
{
	GENERATED_BODY()

	/** Total enlistments across all regions. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	int64 TotalEnlistments = 0;

	/** EXCO milestone target (1,000,000). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	int64 ExcoMilestoneTarget = 1000000;

	/** Daily enrollment rate (global). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	float DailyEnrollmentRate = 0.0f;

	/** Conversion rate: enrollment → active play (%). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	float ConversionRate = 0.0f;

	/** Day-1 retention (%). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	float RetentionDay1 = 0.0f;

	/** Day-7 retention (%). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	float RetentionDay7 = 0.0f;

	/** Day-30 retention (%). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	float RetentionDay30 = 0.0f;

	/** Churn rate (%). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	float ChurnRate = 0.0f;

	/** Total referral signups. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	int32 ReferralSignups = 0;

	/** Referral conversion rate (%). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	float ReferralConversionRate = 0.0f;

	/** Regional breakdown. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta|Analytics")
	TArray<FKhaaosRegionalEnrollment> RegionalBreakdown;

	/** EXCO milestone progress (0-100%). */
	float GetExcoProgress() const
	{
		if (ExcoMilestoneTarget <= 0) return 0.0f;
		return FMath::Min(100.0f, (static_cast<float>(TotalEnlistments) /
		                           static_cast<float>(ExcoMilestoneTarget)) * 100.0f);
	}

	/** Whether EXCO milestone is reached. */
	bool IsExcoMilestoneReached() const
	{
		return TotalEnlistments >= ExcoMilestoneTarget;
	}
};

// ─── Delegates ────────────────────────────────────────────────────────────────

/** Broadcast when campaign phase changes. */
DECLARE_DELEGATE_TwoParams(FOnCampaignPhaseChanged, EKhaaosCampaignPhase /*Old*/, EKhaaosCampaignPhase /*New*/);

/** Broadcast when EXCO milestone is reached. */
DECLARE_DELEGATE(FOnExcoMilestoneReached);

/** Broadcast when a player enrolls. */
DECLARE_DELEGATE_OneParam(FOnPlayerEnrolled, const FString& /*PlayerId*/);

// ── Beta Campaign Subsystem ───────────────────────────────────────────────────

/**
 * UKhaaosBetaCampaign
 *
 * Beta campaign management subsystem for Khaaos Run.
 *
 * Manages the entire beta → launch campaign lifecycle:
 *   - Campaign phases: Internal → Announcement → Enrollment → Early Access → Open Beta → Launch
 *   - Enrollment tracking: total, daily rate, regional breakdown
 *   - EXCO milestone tracking (1,000,000 enlistments target)
 *   - Invite code system (alpha testers get priority codes)
 *   - NDA management (phase-aware: NDA during early, lifted during open)
 *   - Communication templates (announcement, invite, welcome, launch)
 *   - Referral system (enlist friends, bonus KRC)
 *   - Streamer/content creator program
 *   - Campaign analytics (conversion, retention, churn)
 *
 * Usage:
 *   auto* Campaign = GetGameInstance()->GetSubsystem<UKhaaosBetaCampaign>();
 *   Campaign->AdvancePhase(EKhaaosCampaignPhase::OpenBeta);
 *   Campaign->EnrollPlayer(PlayerId, Region, InviteCode);
 *
 * Thread safety: All state is game-thread only.
 */
UCLASS(meta=(DisplayName="Khaaos Beta Campaign"))
class KHAAOSRUN_API UKhaaosBetaCampaign : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:

	UKhaaosBetaCampaign();

	// ─── Lifecycle ──────────────────────────────────────────────────────────

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ─── Campaign Phase Management ──────────────────────────────────────────

	/** Get the current campaign phase. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	EKhaaosCampaignPhase GetCurrentPhase() const;

	/**
	 * Advance the campaign to a new phase.
	 * Validates the transition and updates NDA status automatically.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	bool AdvancePhase(EKhaaosCampaignPhase NewPhase);

	/** Check if a phase transition is valid. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	bool CanAdvanceTo(EKhaaosCampaignPhase NewPhase) const;

	/** Get human-readable phase name. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	static FString GetPhaseName(EKhaaosCampaignPhase Phase);

	// ─── Enrollment ─────────────────────────────────────────────────────────

	/**
	 * Enroll a player in the beta program.
	 * Validates invite code if provided, checks enrollment eligibility.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	bool EnrollPlayer(const FString& PlayerId, const FString& Region,
	                  const FString& InviteCode = TEXT(""),
	                  const FString& ReferrerId = TEXT(""));

	/** Check if a player is enrolled. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	bool IsPlayerEnrolled(const FString& PlayerId) const;

	/** Get total enrollment count. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	int64 GetTotalEnrollments() const;

	/** Get daily enrollment rate (last 24h). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	float GetDailyEnrollmentRate() const;

	// ─── EXCO Milestone ─────────────────────────────────────────────────────

	/** Get EXCO milestone progress (0-100%). */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	float GetExcoProgress() const;

	/** Check if EXCO milestone (1M enlistments) is reached. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	bool IsExcoMilestoneReached() const;

	// ─── Invite Code System ─────────────────────────────────────────────────

	/**
	 * Generate invite codes for distribution.
	 * @param Count Number of codes to generate.
	 * @param Phase Phase the codes grant access to.
	 * @param Source Source label (e.g., "alpha_tester", "press").
	 * @param bPriority Whether these are priority codes.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	TArray<FString> GenerateInviteCodes(int32 Count, EKhaaosCampaignPhase Phase,
	                                     const FString& Source, bool bPriority = false);

	/** Validate an invite code and return its data. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	bool ValidateInviteCode(const FString& Code, FKhaaosInviteCode& OutCodeData);

	/** Redeem an invite code (decrements remaining uses). */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	bool RedeemInviteCode(const FString& Code);

	// ─── NDA Management ─────────────────────────────────────────────────────

	/** Check if NDA is currently in effect. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	bool IsNdaActive() const;

	/** Accept NDA for a player. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	bool AcceptNda(const FString& PlayerId);

	/** Record an NDA violation. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	void RecordNdaViolation();

	/** Get NDA violation count. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	int32 GetNdaViolationCount() const;

	// ─── Referral System ────────────────────────────────────────────────────

	/**
	 * Create a referral from one player to another.
	 * Awards bonus KRC to the referrer when the referred player enrolls.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	bool CreateReferral(const FString& ReferrerId, const FString& ReferredId);

	/** Get referral count for a player. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	int32 GetReferralCount(const FString& PlayerId) const;

	/** Get total KRC bonus earned from referrals. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	int32 GetReferralBonusKRC(const FString& PlayerId) const;

	// ─── Streamer Program ───────────────────────────────────────────────────

	/** Add a streamer to the content creator program. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	bool AddStreamer(const FString& PlayerId, const FString& DisplayName,
	                 const FString& Platform, int32 AvgViewers);

	/** Check if a player is in the streamer program. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	bool IsStreamer(const FString& PlayerId) const;

	/** Get all active streamers. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	TArray<FKhaaosStreamerEntry> GetActiveStreamers() const;

	// ─── Campaign Analytics ─────────────────────────────────────────────────

	/** Get current campaign analytics. */
	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Khaaos|Beta")
	FKhaaosCampaignAnalytics GetAnalytics() const;

	/** Update regional enrollment stats. */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	void UpdateRegionalStats();

	// ─── Communication ─────────────────────────────────────────────────────

	/**
	 * Generate a communication template with campaign data filled in.
	 * Returns the template text with placeholders replaced.
	 */
	UFUNCTION(BlueprintCallable, Category = "Khaaos|Beta")
	FString GenerateCommTemplate(EKhaaosCommTemplate Template,
	                              const FString& RecipientName = TEXT(""),
	                              const FString& InviteCode = TEXT(""));

	// ─── State ──────────────────────────────────────────────────────────────

	/** Current campaign phase. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta")
	EKhaaosCampaignPhase CurrentPhase = EKhaaosCampaignPhase::Internal;

	/** NDA status. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta")
	FKhaaosNDAStatus NdaStatus;

	/** Campaign analytics. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta")
	FKhaaosCampaignAnalytics Analytics;

	// ─── Configuration ──────────────────────────────────────────────────────

	/** EXCO milestone target (default: 1,000,000). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta")
	int64 ExcoMilestoneTarget = 1000000;

	/** Referral bonus KRC per successful referral. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta")
	int32 ReferralBonusKRC = 500;

	/** Maximum referrals per player. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta")
	int32 MaxReferralsPerPlayer = 10;

	/** Minimum viewers for streamer program eligibility. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Khaaos|Beta")
	int32 StreamerMinViewers = 500;

	// ─── Delegates ──────────────────────────────────────────────────────────

	/** Broadcast when campaign phase changes. */
	FOnCampaignPhaseChanged OnCampaignPhaseChanged;

	/** Broadcast when EXCO milestone is reached. */
	FOnExcoMilestoneReached OnExcoMilestoneReached;

	/** Broadcast when a player enrolls. */
	FOnPlayerEnrolled OnPlayerEnrolled;

private:

	/** Enrolled players (PlayerId → EnrollmentRecord). */
	UPROPERTY()
	TMap<FString, FKhaaosEnrollmentRecord> Enrollments;

	/** Active invite codes (Code → InviteCode). */
	UPROPERTY()
	TMap<FString, FKhaaosInviteCode> InviteCodes;

	/** Referral records. */
	UPROPERTY()
	TArray<FKhaaosReferralRecord> Referrals;

	/** Referral count per player (PlayerId → count). */
	TMap<FString, int32> PlayerReferralCounts;

	/** Referral bonus per player (PlayerId → KRC total). */
	TMap<FString, int32> PlayerReferralBonuses;

	/** Streamer program entries (PlayerId → entry). */
	UPROPERTY()
	TMap<FString, FKhaaosStreamerEntry> Streamers;

	/** Enrollment timestamps for daily rate calculation. */
	TArray<FString> DailyEnrollmentTimestamps;

	/** Whether EXCO milestone has already been broadcast. */
	uint8 bExcoMilestoneBroadcast : 1 = false;

	// ─── Internal Methods ───────────────────────────────────────────────────

	/** Generate a single random invite code in KR-XXXX-XXXX-XXXX format. */
	FString GenerateSingleCode() const;

	/** Update NDA status based on current phase. */
	void UpdateNdaStatus();

	/** Calculate daily enrollment rate from timestamps. */
	void CalculateDailyRate();

	/** Check and broadcast EXCO milestone if reached. */
	void CheckExcoMilestone();

	/** Get current ISO 8601 timestamp. */
	FString GetIsoTimestamp() const;

	/** Validate that a phase transition follows the expected sequence. */
	bool ValidatePhaseTransition(EKhaaosCampaignPhase From, EKhaaosCampaignPhase To) const;
};
