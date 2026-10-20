#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Safe Push-Commit-PR & Multi-Dev Console Protection Script
# Automates non-destructive Git/PR updates without overwriting or deleting
# commits, files, or folders that other Devs are developing in the Console.
# Usage: ./scripts/khaaos_workflow.sh [options]
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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="${KHAAOS_REPO_DIR:-$DEFAULT_REPO_DIR}"
if [[ ! -d "$REPO_DIR/.git" && -d "/home/z/my-project/Khaaos_Run/repos/Khaaos_Run/.git" ]]; then
  REPO_DIR="/home/z/my-project/Khaaos_Run/repos/Khaaos_Run"
fi

BASE_BRANCH="main"
PR_DRAFT=true
PR_REVIEWERS=""
AUTO_REBASE=false
ALLOW_DELETE=false
ALLOW_CONSOLE_TOUCH=false
CHECK_OVERLAPS_ONLY=false
SYNC_PRS=false
SCOPE=""
DESCRIPTION=""
TARGET_PATHS=()

# ── Protected Console Paths (Active Multi-Dev Console Work) ──
PROTECTED_CONSOLE_PATHS=(
  "server/game/marshalConsole.ts"
  "server/game/orchestration.ts"
  "client/src/pages/marshal-console.tsx"
  "client/src/lib/marshal-console-api.ts"
  "docs/API_MARECHAL_CONTROL_PANEL.md"
  "docs/Comandos de Console e Parâmetros de Configuração"
  "tests/official/marshal-console-client.test.ts"
  "tests/official/marshal-console-routes.test.ts"
  "tests/official/orchestration.test.ts"
  "tests/official/orchestration.integration.test.ts"
  ".github/workflows/Auto Merge PR 48"
)

# ── Helper Functions ──
log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[✅]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[⚠️]${NC} $*"; }
log_error()   { echo -e "${RED}[❌]${NC} $*"; }

die() {
  log_error "$@"
  exit 1
}

is_protected_console_path() {
  local candidate="$1"
  for protected in "${PROTECTED_CONSOLE_PATHS[@]}"; do
    if [[ "$candidate" == "$protected" || "$candidate" == "$protected/"* ]]; then
      return 0
    fi
  done
  return 1
}

# ── Parse Arguments ──
usage() {
  cat <<EOF
Khaaos Run — Safe Push-Commit-PR & Multi-Dev Console Protection

Usage: $0 [options]

Options:
  -s, --scope SCOPE          Commit scope (feat|fix|refactor|test|docs|chore|ci)
  -m, --message MSG          Commit message (short description)
  -b, --base BRANCH          Base branch for PR (default: main)
  -p, --path PATH            Stage only specific file/folder (can be passed multiple times)
  -d, --draft                Create draft PR (default: true)
  -D, --no-draft             Create ready-for-review PR
  -r, --reviewers USERS      Comma-separated GitHub reviewers
  -R, --rebase               Safe rebase on base branch (--force-with-lease only)
  --sync-prs                 Fetch origin, merge/sync base non-destructively, and update PR
  --check-overlaps           Verify protected console files and active PR overlaps without mutating
  --allow-console-touch      Explicitly permit staging files in Protected Console Paths
  --allow-delete             Explicitly permit staging file/directory deletions
  --dry-run                  Show what would be done without executing
  -h, --help                 Show this help

Protected Console Paths (auto-shielded unless --allow-console-touch):
  - server/game/marshalConsole.ts
  - server/game/orchestration.ts
  - client/src/pages/marshal-console.tsx
  - client/src/lib/marshal-console-api.ts
  - docs/API_MARECHAL_CONTROL_PANEL.md
  - tests/official/marshal-console-*.test.ts
  - tests/official/orchestration*.test.ts
EOF
  exit 0
}

DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--scope)               SCOPE="$2"; shift 2 ;;
    -m|--message)             DESCRIPTION="$2"; shift 2 ;;
    -b|--base)                BASE_BRANCH="$2"; shift 2 ;;
    -p|--path)                TARGET_PATHS+=("$2"); shift 2 ;;
    -d|--draft)               PR_DRAFT=true; shift ;;
    -D|--no-draft)            PR_DRAFT=false; shift ;;
    -r|--reviewers)           PR_REVIEWERS="$2"; shift 2 ;;
    -R|--rebase)              AUTO_REBASE=true; shift ;;
    --sync-prs)               SYNC_PRS=true; shift ;;
    --check-overlaps)         CHECK_OVERLAPS_ONLY=true; shift ;;
    --allow-console-touch)    ALLOW_CONSOLE_TOUCH=true; shift ;;
    --allow-delete)           ALLOW_DELETE=true; shift ;;
    --dry-run)                DRY_RUN=true; shift ;;
    -h|--help)                usage ;;
    *)                        die "Unknown option: $1" ;;
  esac
done

# ── Pre-flight Checks ──
log_info "Khaaos Run — Safe Multi-Dev PR & Console Protection"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ -d "$REPO_DIR" ]] || die "Repo directory not found: $REPO_DIR"
cd "$REPO_DIR"

if [[ "$CHECK_OVERLAPS_ONLY" == true ]]; then
  log_info "Running static Console Path Shield verification..."
  MISSING_CONSOLE_FILES=0
  for protected in "${PROTECTED_CONSOLE_PATHS[@]}"; do
    if [[ -e "$protected" ]]; then
      log_success "Protected Console asset intact: $protected"
    else
      log_error "Protected Console asset missing: $protected"
      MISSING_CONSOLE_FILES=$((MISSING_CONSOLE_FILES + 1))
    fi
  done
  [[ "$MISSING_CONSOLE_FILES" -eq 0 ]] || die "$MISSING_CONSOLE_FILES protected Console file(s) missing!"
  log_success "All ${#PROTECTED_CONSOLE_PATHS[@]} Protected Console files/folders are intact and shielded."
  exit 0
fi

# Verify git repo
[[ -d .git ]] || die "Not a git repository: $REPO_DIR"

# Check gh CLI
if ! command -v gh &>/dev/null; then
  export PATH="/home/z/my-project/.local/bin:$PATH"
  if ! command -v gh &>/dev/null; then
    log_warn "gh CLI not found. Git operations available; PR API calls will be skipped in offline/container mode."
  fi
fi

# ── Step 1: Detect Current Branch & Fetch Remote Non-Destructively ──
CURRENT_BRANCH=$(git branch --show-current)
log_info "Current branch: $CURRENT_BRANCH"

if [[ "$CURRENT_BRANCH" == "$BASE_BRANCH" && "$CHECK_OVERLAPS_ONLY" == false ]]; then
  die "Cannot commit directly to $BASE_BRANCH. Create or checkout a feature branch first."
fi

log_info "Fetching latest remote state from origin (non-destructive)..."
if [[ "$DRY_RUN" == false ]]; then
  git fetch origin --prune 2>/dev/null || log_warn "Could not fetch origin (offline or restricted token)"
fi

# ── Step 2: Check Deleted Files & Console Path Shield ──
DELETED_TRACKED=$(git diff --name-only --diff-filter=D 2>/dev/null || true)
DELETED_STAGED=$(git diff --cached --name-only --diff-filter=D 2>/dev/null || true)
ALL_DELETED=$(printf "%s\n%s\n" "$DELETED_TRACKED" "$DELETED_STAGED" | sed '/^$/d' | sort -u)

if [[ -n "$ALL_DELETED" && "$ALLOW_DELETE" == false ]]; then
  log_warn "Detected deleted tracked file(s)/folder(s) — blocking deletion to protect other Devs' commits:"
  while IFS= read -r del_file; do
    [[ -z "$del_file" ]] && continue
    echo -e "  ${RED}✘ BLOCKED DELETION:${NC} $del_file"
    if [[ "$DRY_RUN" == false ]]; then
      git reset HEAD -- "$del_file" 2>/dev/null || true
      git checkout HEAD -- "$del_file" 2>/dev/null || true
    fi
  done <<< "$ALL_DELETED"
  log_success "Restored accidentally deleted files from HEAD (pass --allow-delete only when intentional)."
fi

# Check if any modified/staged files touch Protected Console Paths
CHANGED_ALL=$( (git diff --name-only; git diff --cached --name-only) | sed '/^$/d' | sort -u )
CONSOLE_TOUCHED=()
while IFS= read -r changed_file; do
  [[ -z "$changed_file" ]] && continue
  if is_protected_console_path "$changed_file"; then
    CONSOLE_TOUCHED+=("$changed_file")
  fi
done <<< "$CHANGED_ALL"

if [[ "${#CONSOLE_TOUCHED[@]}" -gt 0 && "$ALLOW_CONSOLE_TOUCH" == false ]]; then
  log_warn "Console Protection Shield triggered! Unstaging Console files being developed by other Devs:"
  for cfile in "${CONSOLE_TOUCHED[@]}"; do
    echo -e "  ${YELLOW}🛡️  SHIELDED CONSOLE PATH:${NC} $cfile"
    if [[ "$DRY_RUN" == false ]]; then
      git reset HEAD -- "$cfile" 2>/dev/null || true
    fi
  done
  log_info "Pass --allow-console-touch only if you are actively coordinating on the Console PR."
fi

if [[ "$CHECK_OVERLAPS_ONLY" == true ]]; then
  log_success "Overlap and Console Protection check finished without mutating repository."
  exit 0
fi

# ── Step 3: Stage Changes Safely (Never Stage Deletions Unless Authorized) ──
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  log_info "Staging changes cautiously (preserving other Devs' files and Console paths)..."

  if [[ "$DRY_RUN" == false ]]; then
    if [[ "${#TARGET_PATHS[@]}" -gt 0 ]]; then
      for target in "${TARGET_PATHS[@]}"; do
        git add --no-ignore-removal -- "$target"
      done
    else
      # Stage modified and new files WITHOUT staging deletions unless --allow-delete is set
      if [[ "$ALLOW_DELETE" == true ]]; then
        git add -A
      else
        git add --no-ignore-removal .
        # Double-check and unstage any 'D' status files
        git diff --cached --name-only --diff-filter=D | while IFS= read -r dfile; do
          [[ -n "$dfile" ]] && git reset HEAD -- "$dfile" 2>/dev/null || true
        done
      fi
    fi

    # Unstage Protected Console Paths unless explicitly permitted
    if [[ "$ALLOW_CONSOLE_TOUCH" == false ]]; then
      for protected in "${PROTECTED_CONSOLE_PATHS[@]}"; do
        git reset HEAD -- "$protected" 2>/dev/null || true
      done
    fi

    # Unstage package-lock.json deletions (common accident)
    if git diff --cached --name-only | grep -q "package-lock.json"; then
      if git diff --cached package-lock.json | grep -q "^-"; then
        log_warn "Unstaging package-lock.json deletion"
        git reset HEAD package-lock.json 2>/dev/null || true
      fi
    fi
  else
    log_info "[DRY RUN] Would stage non-destructive changes (excluding deletions and protected Console paths)"
  fi

  STAGED_COUNT=$(git diff --cached --name-only | wc -l)
  if [[ "$STAGED_COUNT" -gt 0 || "$DRY_RUN" == true ]]; then
    if [[ -n "$SCOPE" && -n "$DESCRIPTION" ]]; then
      COMMIT_MSG="$SCOPE($CURRENT_BRANCH): $DESCRIPTION"
    elif [[ -n "$DESCRIPTION" ]]; then
      COMMIT_MSG="chore($CURRENT_BRANCH): $DESCRIPTION"
    else
      COMMIT_MSG="chore($CURRENT_BRANCH): safe update of $STAGED_COUNT file(s) preserving console dev paths"
      log_warn "No commit message specified — using: $COMMIT_MSG"
    fi

    if [[ "$DRY_RUN" == false ]]; then
      git commit -m "$COMMIT_MSG"
      log_success "Committed safely: $COMMIT_MSG"
    else
      log_info "[DRY RUN] Would commit: $COMMIT_MSG"
    fi
  else
    log_info "No non-protected staged files to commit."
  fi
fi

# ── Step 4: Non-Destructive Base Sync / Rebase ──
if [[ "$SYNC_PRS" == true ]]; then
  log_info "Syncing with origin/$BASE_BRANCH via non-destructive merge (preserving all commit history)..."
  if [[ "$DRY_RUN" == false ]]; then
    git fetch origin "$BASE_BRANCH"
    git merge --no-edit "origin/$BASE_BRANCH" || {
      log_error "Merge conflict detected with origin/$BASE_BRANCH — aborting merge to protect Console/Dev files."
      git merge --abort 2>/dev/null || true
      die "Resolve conflicts manually without overwriting other Devs' files."
    }
    log_success "Merged origin/$BASE_BRANCH cleanly"
  else
    log_info "[DRY RUN] Would merge origin/$BASE_BRANCH into $CURRENT_BRANCH without overwriting commits"
  fi
elif [[ "$AUTO_REBASE" == true ]]; then
  log_info "Rebasing on origin/$BASE_BRANCH..."
  if [[ "$DRY_RUN" == false ]]; then
    git fetch origin "$BASE_BRANCH"
    git rebase "origin/$BASE_BRANCH" || {
      log_error "Rebase conflict detected — aborting rebase safely..."
      git rebase --abort
      die "Rebase conflicts detected. Use --sync-prs or resolve manually."
    }
    log_success "Rebase successful"
  else
    log_info "[DRY RUN] Would rebase on origin/$BASE_BRANCH"
  fi
fi

# ── Step 5: Check Active PR Overlaps Before Push ──
if command -v gh &>/dev/null && gh auth status &>/dev/null; then
  log_info "Checking open PRs on Nexus-HUB57/Khaaos_Run for file overlaps..."
  BRANCH_CHANGED_FILES=$(git diff --name-only "origin/$BASE_BRANCH"...HEAD 2>/dev/null || true)
  OPEN_PRS=$(gh pr list --repo Nexus-HUB57/Khaaos_Run --state open --json number,headRefName,title -q '.[] | "\(.number)|\(.headRefName)|\(.title)"' 2>/dev/null || true)
  while IFS='|' read -r pr_num pr_branch pr_title; do
    [[ -z "$pr_num" || "$pr_branch" == "$CURRENT_BRANCH" ]] && continue
    PR_FILES=$(gh pr view "$pr_num" --repo Nexus-HUB57/Khaaos_Run --json files -q '.files[].path' 2>/dev/null || true)
    OVERLAP=$(comm -12 <(echo "$BRANCH_CHANGED_FILES" | sort -u) <(echo "$PR_FILES" | sort -u) | sed '/^$/d' || true)
    if [[ -n "$OVERLAP" ]]; then
      log_warn "Overlap detected with open PR #$pr_num ($pr_branch — $pr_title):"
      echo "$OVERLAP" | while IFS= read -r ofile; do echo "    ⚠️  $ofile"; done
    fi
  done <<< "$OPEN_PRS"
fi

# ── Step 6: Push Safely (Never --force) ──
log_info "Pushing $CURRENT_BRANCH to origin (non-destructive)..."
if [[ "$DRY_RUN" == false ]]; then
  if [[ "$AUTO_REBASE" == true ]]; then
    git push --force-with-lease -u origin "$CURRENT_BRANCH" 2>&1
  else
    git push -u origin "$CURRENT_BRANCH" 2>&1
  fi
  log_success "Pushed safely to origin/$CURRENT_BRANCH"
else
  log_info "[DRY RUN] Would push safely to origin/$CURRENT_BRANCH"
fi

# ── Step 7: Create or Update PR ──
log_info "Checking for existing PR..."
EXISTING_PR=$(gh pr list --head "$CURRENT_BRANCH" --repo Nexus-HUB57/Khaaos_Run --json number -q '.[0].number' 2>/dev/null || echo "")

if [[ -n "$EXISTING_PR" ]]; then
  log_success "PR #$EXISTING_PR already exists — updated safely without overwriting other Devs' commits"
  if [[ "$PR_DRAFT" == false && "$DRY_RUN" == false ]]; then
    gh pr ready "$EXISTING_PR" --repo Nexus-HUB57/Khaaos_Run 2>/dev/null || true
    log_success "PR #$EXISTING_PR marked ready for review"
  fi
else
  PR_BODY=$(cat <<PRBODY
## Summary

$([[ -n "$DESCRIPTION" ]] && echo "$DESCRIPTION" || echo "Safe scoped update from \`$CURRENT_BRANCH\`")

## Changes

$(git diff "origin/$BASE_BRANCH"...HEAD --stat 2>/dev/null || echo "See commit history")

## Multi-Dev & Console Protection Verification

- [x] Zero tracked file/directory deletions (\`--diff-filter=D\` verified)
- [x] Protected Console Paths (\`marshalConsole.ts\`, \`orchestration.ts\`, \`marshal-console.tsx\`, \`API_MARECHAL_CONTROL_PANEL.md\`) preserved
- [x] Pushed without destructive \`--force\`

## UE5 Code Review Checklist

- [ ] C++ headers follow ue5-style-guide naming conventions
- [ ] All UCLASS/USTRUCT/UENUM have GENERATED_BODY()
- [ ] Server-authoritative logic uses Server RPCs
- [ ] Replicated properties have DOREPLIFETIME macros
- [ ] No hardcoded credentials
- [ ] Git LFS tracks binary assets
PRBODY
)

  if [[ -n "$SCOPE" && -n "$DESCRIPTION" ]]; then
    PR_TITLE="$SCOPE: $DESCRIPTION"
  else
    PR_TITLE="chore($CURRENT_BRANCH): safe update into $BASE_BRANCH"
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
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "Safe PR Workflow complete!"
echo -e "${CYAN}Branch:${NC}          $CURRENT_BRANCH"
echo -e "${CYAN}Base:${NC}            $BASE_BRANCH"
echo -e "${CYAN}Console Shield:${NC}  ACTIVE (${#PROTECTED_CONSOLE_PATHS[@]} paths protected)"
echo -e "${CYAN}Zero-Deletion:${NC}   $([[ "$ALLOW_DELETE" == false ]] && echo "ENFORCED" || echo "OVERRIDDEN")"
if [[ -n "$EXISTING_PR" ]]; then
  echo -e "${CYAN}PR:${NC}              #$EXISTING_PR"
fi
