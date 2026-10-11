#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Push-Commit-PR Automation Script
# Automates the full Git workflow: stage → commit → push → PR
# Usage: ./khaaos_workflow.sh [options]
# =============================================================================
set -euo pipefail

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Defaults ──
REPO_DIR="/home/z/my-project/Khaaos_Run/repos/Khaaos_Run"
BASE_BRANCH="main"
PR_DRAFT=true
PR_REVIEWERS=""
AUTO_REBASE=false
SCOPE=""
DESCRIPTION=""

# ── Helper Functions ──
log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[✅]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[⚠️]${NC} $*"; }
log_error()   { echo -e "${RED}[❌]${NC} $*"; }

die() {
  log_error "$@"
  exit 1
}

# ── Parse Arguments ──
usage() {
  cat <<EOF
Khaaos Run — Push-Commit-PR Automation

Usage: $0 [options]

Options:
  -s, --scope SCOPE        Commit scope (feat|fix|refactor|test|docs|chore|ci)
  -m, --message MSG        Commit message (short description)
  -b, --base BRANCH        Base branch for PR (default: main)
  -d, --draft              Create draft PR (default: true)
  -D, --no-draft           Create ready-for-review PR
  -r, --reviewers USERS    Comma-separated GitHub reviewers
  -R, --rebase             Auto-rebase on base branch before push
  --dry-run                Show what would be done without executing
  -h, --help               Show this help

Examples:
  $0 -s feat -m "add safe zone system"
  $0 -s fix -m "replication bug in GameState" -D -R
  $0 -s ci -m "add UE5 CI workflow" --dry-run
EOF
  exit 0
}

DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--scope)     SCOPE="$2"; shift 2 ;;
    -m|--message)   DESCRIPTION="$2"; shift 2 ;;
    -b|--base)      BASE_BRANCH="$2"; shift 2 ;;
    -d|--draft)     PR_DRAFT=true; shift ;;
    -D|--no-draft)  PR_DRAFT=false; shift ;;
    -r|--reviewers) PR_REVIEWERS="$2"; shift 2 ;;
    -R|--rebase)    AUTO_REBASE=true; shift ;;
    --dry-run)      DRY_RUN=true; shift ;;
    -h|--help)      usage ;;
    *)              die "Unknown option: $1" ;;
  esac
done

# ── Pre-flight Checks ──
log_info "Khaaos Run — Push-Commit-PR Automation"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check repo directory
[[ -d "$REPO_DIR" ]] || die "Repo directory not found: $REPO_DIR"
cd "$REPO_DIR"

# Check gh CLI
if ! command -v gh &>/dev/null; then
  # Try local install
  export PATH="/home/z/my-project/.local/bin:$PATH"
  if ! command -v gh &>/dev/null; then
    die "gh CLI not found. Install: https://cli.github.com/"
  fi
fi

# Verify gh auth
if ! gh auth status &>/dev/null; then
  die "gh CLI not authenticated. Run: gh auth login"
fi

# Verify git repo
[[ -d .git ]] || die "Not a git repository"

# ── Step 1: Detect Current Branch ──
CURRENT_BRANCH=$(git branch --show-current)
log_info "Current branch: $CURRENT_BRANCH"

if [[ "$CURRENT_BRANCH" == "$BASE_BRANCH" ]]; then
  die "Cannot commit directly to $BASE_BRANCH. Create a feature branch first."
fi

# ── Step 2: Check Working Tree ──
if git diff --quiet && git diff --cached --quiet; then
  log_warn "No changes to commit. Checking if branch needs push..."
  
  # Check if branch is ahead of remote
  AHEAD=$(git log origin/"$CURRENT_BRANCH"..HEAD --oneline 2>/dev/null | wc -l || echo "0")
  if [[ "$AHEAD" -gt 0 ]]; then
    log_info "Branch is $AHEAD commit(s) ahead of remote — will push"
  else
    log_success "Everything up-to-date. Nothing to do."
    exit 0
  fi
else
  # ── Step 3: Stage Changes ──
  log_info "Staging changes..."
  
  # Show what changed
  CHANGED_FILES=$(git diff --name-only)
  STAGED_FILES=$(git diff --cached --name-only)
  UNTRACKED=$(git ls-files --others --exclude-standard)
  
  echo -e "${CYAN}Modified:${NC}"
  echo "$CHANGED_FILES" | sed '/^$/d' | while read -r f; do echo "  M $f"; done
  echo -e "${CYAN}Staged:${NC}"
  echo "$STAGED_FILES" | sed '/^$/d' | while read -r f; do echo "  S $f"; done
  echo -e "${CYAN}Untracked:${NC}"
  echo "$UNTRACKED" | sed '/^$/d' | while read -r f; do echo "  + $f"; done
  
  # Auto-stage, but protect against accidental deletions
  if [[ "$DRY_RUN" == false ]]; then
    git add -A
    
    # Unstage package-lock.json deletions (common accident)
    if git diff --cached --name-only | grep -q "package-lock.json"; then
      if git diff --cached package-lock.json | grep -q "^-"; then
        log_warn "Unstaging package-lock.json deletion"
        git reset HEAD package-lock.json 2>/dev/null || true
      fi
    fi
  else
    log_info "[DRY RUN] Would stage all changes"
  fi

  # ── Step 4: Commit ──
  if [[ -n "$SCOPE" && -n "$DESCRIPTION" ]]; then
    COMMIT_MSG="$SCOPE($CURRENT_BRANCH): $DESCRIPTION"
  elif [[ -n "$DESCRIPTION" ]]; then
    COMMIT_MSG="$DESCRIPTION"
  else
    # Auto-generate commit message from diff stats
    FILE_COUNT=$(git diff --cached --name-only | wc -l)
    COMMIT_MSG="chore($CURRENT_BRANCH): update $FILE_COUNT file(s)"
    log_warn "No commit message specified — using auto-generated: $COMMIT_MSG"
  fi
  
  if [[ "$DRY_RUN" == false ]]; then
    git commit -m "$COMMIT_MSG"
    log_success "Committed: $COMMIT_MSG"
  else
    log_info "[DRY RUN] Would commit: $COMMIT_MSG"
  fi
fi

# ── Step 5: Rebase on Base (optional) ──
if [[ "$AUTO_REBASE" == true ]]; then
  log_info "Rebasing on origin/$BASE_BRANCH..."
  if [[ "$DRY_RUN" == false ]]; then
    git fetch origin "$BASE_BRANCH"
    git rebase "origin/$BASE_BRANCH" || {
      log_error "Rebase failed — resolving manually..."
      git rebase --abort
      die "Rebase conflicts. Resolve manually and re-run."
    }
    log_success "Rebase successful"
  else
    log_info "[DRY RUN] Would rebase on origin/$BASE_BRANCH"
  fi
fi

# ── Step 6: Push ──
log_info "Pushing $CURRENT_BRANCH to origin..."
if [[ "$DRY_RUN" == false ]]; then
  git push -u origin "$CURRENT_BRANCH" 2>&1
  log_success "Pushed to origin/$CURRENT_BRANCH"
else
  log_info "[DRY RUN] Would push to origin/$CURRENT_BRANCH"
fi

# ── Step 7: Create or Update PR ──
log_info "Checking for existing PR..."
EXISTING_PR=$(gh pr list --head "$CURRENT_BRANCH" --repo Nexus-HUB57/Khaaos_Run --json number -q '.[0].number' 2>/dev/null || echo "")

if [[ -n "$EXISTING_PR" ]]; then
  log_success "PR #$EXISTING_PR already exists — updating"
  
  # Mark ready for review if --no-draft
  if [[ "$PR_DRAFT" == false ]]; then
    if [[ "$DRY_RUN" == false ]]; then
      gh pr ready "$EXISTING_PR" --repo Nexus-HUB57/Khaaos_Run 2>/dev/null || true
      log_success "PR #$EXISTING_PR marked ready for review"
    fi
  fi
else
  # Generate PR body
  PR_BODY=$(cat <<PRBODY
## Summary

$([[ -n "$DESCRIPTION" ]] && echo "$DESCRIPTION" || echo "Automated commit from \`$CURRENT_BRANCH\`")

## Changes

$(git diff "origin/$BASE_BRANCH"...HEAD --stat 2>/dev/null || echo "See commit history")

## UE5 Code Review Checklist

- [ ] C++ headers follow ue5-style-guide naming conventions
- [ ] All UCLASS/USTRUCT/UENUM have GENERATED_BODY()
- [ ] Server-authoritative logic uses Server RPCs
- [ ] Replicated properties have DOREPLIFETIME macros
- [ ] No hardcoded credentials
- [ ] Git LFS tracks binary assets

## Dev Coordination

⚠️ Other Devs are active on this repo. This PR should be reviewed before merge.
PRBODY
)

  # Build gh pr create command
  PR_CMD="gh pr create --repo Nexus-HUB57/Khaaos_Run --head $CURRENT_BRANCH --base $BASE_BRANCH"
  
  # Title
  if [[ -n "$SCOPE" && -n "$DESCRIPTION" ]]; then
    PR_TITLE="$SCOPE: $DESCRIPTION"
  else
    PR_TITLE="Merge $CURRENT_BRANCH into $BASE_BRANCH"
  fi
  PR_CMD="$PR_CMD --title \"$PR_TITLE\""
  PR_CMD="$PR_CMD --body \"$PR_BODY\""
  
  if [[ "$PR_DRAFT" == true ]]; then
    PR_CMD="$PR_CMD --draft"
  fi
  
  if [[ -n "$PR_REVIEWERS" ]]; then
    PR_CMD="$PR_CMD --reviewer $PR_REVIEWERS"
  fi

  if [[ "$DRY_RUN" == false ]]; then
    PR_URL=$(gh pr create \
      --repo Nexus-HUB57/Khaaos_Run \
      --head "$CURRENT_BRANCH" \
      --base "$BASE_BRANCH" \
      --title "$PR_TITLE" \
      --body "$PR_BODY" \
      $([[ "$PR_DRAFT" == true ]] && echo "--draft") \
      $([[ -n "$PR_REVIEWERS" ]] && echo "--reviewer $PR_REVIEWERS") \
      2>&1)
    log_success "PR created: $PR_URL"
  else
    log_info "[DRY RUN] Would create PR: $PR_TITLE"
  fi
fi

# ── Step 8: Summary ──
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "Workflow complete!"
echo -e "${CYAN}Branch:${NC}    $CURRENT_BRANCH"
echo -e "${CYAN}Base:${NC}      $BASE_BRANCH"
echo -e "${CYAN}Commit:${NC}   $(git rev-parse --short HEAD)"
echo -e "${CYAN}Files:${NC}    $(git diff --cached --name-only 2>/dev/null | wc -l || echo 0) changed"
if [[ -n "$EXISTING_PR" ]]; then
  echo -e "${CYAN}PR:${NC}       #$EXISTING_PR"
fi
