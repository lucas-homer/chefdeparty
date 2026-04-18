#!/usr/bin/env bash
# lint.sh — programmatic lint for the docs/ knowledge layer.
# Run from repo root. Deterministic checks only — no LLM calls.
#
# Checks:
#   1. Broken relative links
#   2. Orphan docs (no incoming links from CLAUDE.md or docs/)
#   3. Stale runbooks (last_verified > 90 days old)
#   4. ADRs missing required frontmatter
#   5. Substantive notes (>200 words) missing a **Summary** line

set -u
EXIT=0
DOCS_DIR="${DOCS_DIR:-docs}"
ROOT_MAP="${ROOT_MAP:-CLAUDE.md}"
STALE_DAYS="${STALE_DAYS:-90}"

if [[ ! -d "$DOCS_DIR" ]]; then
  echo "no $DOCS_DIR/ found — run from repo root" >&2
  exit 2
fi

say() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; EXIT=1; }

# ------------------------------------------------------------------
# 1. Broken relative links
# ------------------------------------------------------------------
say "→ checking relative links..."
while IFS= read -r -d '' md; do
  # extract markdown links of the form [text](relative/path.md[#anchor])
  grep -oE '\]\([^)#]+\.md(#[^)]+)?\)' "$md" 2>/dev/null | \
    sed -E 's/^\]\(|\)$//g; s/#.*$//' | \
    while IFS= read -r rel; do
      [[ -z "$rel" ]] && continue
      # resolve relative to the file's directory
      dir="$(dirname "$md")"
      target="$dir/$rel"
      if [[ ! -f "$target" ]]; then
        warn "broken link: $md → $rel"
      fi
    done
done < <(
  [[ -f "$ROOT_MAP" ]] && printf '%s\0' "$ROOT_MAP"
  find "$DOCS_DIR" -type f -name '*.md' -print0
)

# ------------------------------------------------------------------
# 2. Orphan docs
# ------------------------------------------------------------------
say "→ checking for orphan docs..."
# build a set of referenced docs as $DOCS_DIR-relative paths (collision-free across folders)
REFS="$(mktemp)"
trap 'rm -f "$REFS"' EXIT
repo_root="$(pwd -P)"

{
  [[ -f "$ROOT_MAP" ]] && printf '%s\0' "$ROOT_MAP"
  find "$DOCS_DIR" -type f -name '*.md' -print0
} | while IFS= read -r -d '' src; do
  dir="$(dirname "$src")"
  grep -oE '\]\([^)#]+\.md(#[^)]+)?\)' "$src" 2>/dev/null | \
    sed -E 's/^\]\(|\)$//g; s/#.*$//' | \
    while IFS= read -r rel; do
      [[ -z "$rel" ]] && continue
      target="$dir/$rel"
      [[ -f "$target" ]] || continue
      # normalize to repo-root-relative (collapses ../) then strip $DOCS_DIR/ prefix
      canonical="$(cd "$(dirname "$target")" 2>/dev/null && pwd -P)/$(basename "$target")"
      canonical="${canonical#$repo_root/}"
      case "$canonical" in
        "$DOCS_DIR"/*) printf '%s\n' "${canonical#$DOCS_DIR/}" ;;
      esac
    done
done | sort -u > "$REFS"

while IFS= read -r -d '' md; do
  base="$(basename "$md")"
  # skip docs/README.md and per-folder README.md — these are index pages
  [[ "$base" == "README.md" ]] && continue
  subpath="${md#$DOCS_DIR/}"
  if ! grep -qxF "$subpath" "$REFS"; then
    warn "orphan doc (no incoming link): $md"
  fi
done < <(find "$DOCS_DIR" -type f -name '*.md' -print0)

# ------------------------------------------------------------------
# 3. Stale runbooks
# ------------------------------------------------------------------
say "→ checking runbook freshness (${STALE_DAYS}d)..."
if [[ -d "$DOCS_DIR/runbooks" ]]; then
  today_s=$(date +%s)
  while IFS= read -r -d '' rb; do
    base="$(basename "$rb")"
    [[ "$base" == "README.md" ]] && continue
    verified=$(awk '/^last_verified:/ { print $2; exit }' "$rb" | tr -d '"')
    if [[ -z "$verified" ]]; then
      warn "runbook missing last_verified: $rb"
      continue
    fi
    # macOS vs GNU date
    if date -j -f "%Y-%m-%d" "$verified" +%s >/dev/null 2>&1; then
      verified_s=$(date -j -f "%Y-%m-%d" "$verified" +%s)
    elif date -d "$verified" +%s >/dev/null 2>&1; then
      verified_s=$(date -d "$verified" +%s)
    else
      warn "runbook has invalid last_verified: $rb ($verified)"
      continue
    fi
    age_days=$(( (today_s - verified_s) / 86400 ))
    if [[ "$age_days" -gt "$STALE_DAYS" ]]; then
      warn "stale runbook (${age_days}d): $rb"
    fi
  done < <(find "$DOCS_DIR/runbooks" -type f -name '*.md' -print0)
fi

# ------------------------------------------------------------------
# 4. ADRs missing required frontmatter
# ------------------------------------------------------------------
say "→ checking ADR frontmatter..."
if [[ -d "$DOCS_DIR/decisions" ]]; then
  while IFS= read -r -d '' adr; do
    base="$(basename "$adr")"
    [[ "$base" == "README.md" ]] && continue
    for field in adr title status date; do
      if ! grep -qE "^${field}:" "$adr"; then
        warn "ADR missing '$field': $adr"
      fi
    done
  done < <(find "$DOCS_DIR/decisions" -type f -name '*.md' -print0)
fi

# ------------------------------------------------------------------
# 5. Substantive notes missing summary line
# ------------------------------------------------------------------
say "→ checking summary lines on substantive notes..."
while IFS= read -r -d '' md; do
  words=$(wc -w < "$md")
  if [[ "$words" -gt 200 ]]; then
    if ! grep -qE '^\*\*Summary\*\*:' "$md"; then
      warn "missing **Summary** line: $md ($words words)"
    fi
  fi
done < <(find "$DOCS_DIR" -type f -name '*.md' -print0)

if [[ "$EXIT" -eq 0 ]]; then
  say "✓ docs lint clean"
else
  say "✗ docs lint found issues (see warnings above)"
fi
exit "$EXIT"
