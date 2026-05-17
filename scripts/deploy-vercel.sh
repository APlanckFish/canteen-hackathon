#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Canteen Hackathon · One-shot Vercel Deploy Script
#
# Usage:
#   ./scripts/deploy-vercel.sh           # interactive: link + sync env + preview
#   ./scripts/deploy-vercel.sh --prod    # promote to production
#   ./scripts/deploy-vercel.sh --env-only  # only push env vars, no deploy
#
# Prerequisites:
#   - vercel CLI installed (`npm i -g vercel`) and logged in (`vercel login`)
#   - apps/web/.env.local filled in
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/apps/web/.env.local"

# ── colors ────────────────────────────────────────────────────────────────────
c_reset=$'\e[0m'; c_dim=$'\e[2m'; c_red=$'\e[31m'; c_grn=$'\e[32m'; c_ylw=$'\e[33m'; c_blu=$'\e[34m'
say()   { printf "%s▸%s %s\n" "$c_blu" "$c_reset" "$*"; }
ok()    { printf "%s✓%s %s\n" "$c_grn" "$c_reset" "$*"; }
warn()  { printf "%s!%s %s\n" "$c_ylw" "$c_reset" "$*"; }
die()   { printf "%s✗%s %s\n" "$c_red" "$c_reset" "$*" >&2; exit 1; }

# ── arg parsing ───────────────────────────────────────────────────────────────
PROD=0
ENV_ONLY=0
for a in "$@"; do
  case "$a" in
    --prod)     PROD=1 ;;
    --env-only) ENV_ONLY=1 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $a" ;;
  esac
done

cd "$ROOT"

# ── pre-flight ────────────────────────────────────────────────────────────────
command -v vercel >/dev/null || die "vercel CLI not found. Install: npm i -g vercel"
vercel whoami >/dev/null 2>&1 || die "not logged in. Run: vercel login"
[[ -f "$ENV_FILE" ]] || die "missing $ENV_FILE"

ok "vercel CLI ready (user: $(vercel whoami 2>/dev/null))"

# ── link project (idempotent) ─────────────────────────────────────────────────
if [[ ! -f "$ROOT/.vercel/project.json" ]]; then
  say "linking project (first time only)..."
  vercel link --yes
  ok "linked"
else
  ok "project already linked ($(jq -r '.projectId' .vercel/project.json 2>/dev/null || echo 'unknown'))"
fi

# ── sync env vars from .env.local ─────────────────────────────────────────────
say "syncing env vars from $ENV_FILE → Vercel ..."

# Vercel "target" choices: production, preview, development.
# We push every key to all three so preview deployments also work.
TARGETS=(production preview development)

# Read line by line; skip comments / blank.
# IMPORTANT: redirect stdin via FD 3, otherwise vercel CLI inside the loop
# will consume the rest of .env.local and we silently process only line 1.
pushed=0; skipped=0
while IFS= read -r line <&3 || [[ -n "$line" ]]; do
  # strip CR + leading/trailing whitespace
  line="${line%$'\r'}"
  [[ -z "${line// }" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue

  key="${BASH_REMATCH[1]}"
  val="${BASH_REMATCH[2]}"

  # strip surrounding quotes
  if [[ ( "${val:0:1}" == "\"" && "${val: -1}" == "\"" ) || \
        ( "${val:0:1}" == "'"  && "${val: -1}" == "'"  ) ]]; then
    val="${val:1:${#val}-2}"
  fi

  if [[ -z "$val" ]]; then
    printf "  %s· skip%s %-45s (empty)\n" "$c_dim" "$c_reset" "$key"
    ((skipped++)) || true
    continue
  fi

  for t in "${TARGETS[@]}"; do
    # remove first (ignore "not found" errors), then add fresh
    vercel env rm  "$key" "$t" --yes >/dev/null 2>&1 || true
    # IMPORTANT: use --value (not stdin). For Preview, the CLI also requires
    # an explicit git-branch positional arg or it falls back to an
    # interactive prompt that never returns under stdin piping. Empty branch
    # = "all preview branches".
    if [[ "$t" == "preview" ]]; then
      add_out=$(vercel env add "$key" "$t" "" --value "$val" --force 2>&1) \
        || warn "env add failed for $key/$t: $(echo "$add_out" | tail -1)"
    else
      add_out=$(vercel env add "$key" "$t" --value "$val" --force 2>&1) \
        || warn "env add failed for $key/$t: $(echo "$add_out" | tail -1)"
    fi
  done
  printf "  %s+ set%s  %-45s → [%s]\n" "$c_grn" "$c_reset" "$key" "${TARGETS[*]}"
  ((pushed++)) || true
done 3< "$ENV_FILE"

ok "env sync done: $pushed pushed, $skipped skipped (empty)"

# Verify env presence per target — catches silent failures.
say "verifying env coverage on Vercel ..."
ENV_LS=$(vercel env ls 2>/dev/null || echo "")
for t in "${TARGETS[@]}"; do
  # Vercel CLI capitalizes the target column (Production / Preview / Development).
  cap=$(echo "$t" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')
  count=$(echo "$ENV_LS" | grep -c -E "[[:space:]]+${cap}[[:space:]]+[0-9]" || true)
  printf "  %s· %-12s%s : %d vars\n" "$c_dim" "$cap" "$c_reset" "$count"
done

if (( ENV_ONLY )); then
  ok "--env-only: skipping deploy. Done."
  exit 0
fi

# ── deploy ────────────────────────────────────────────────────────────────────
if (( PROD )); then
  warn "deploying to PRODUCTION (will use Production env vars)"
  vercel deploy --prod --yes
else
  say "building & deploying to PREVIEW (will use Preview env vars)"
  vercel deploy --yes
fi

ok "done. Check the URL printed above."
