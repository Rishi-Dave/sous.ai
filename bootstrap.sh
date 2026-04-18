#!/usr/bin/env bash
# Sous Chef bootstrap. Run once after cloning.
# Gets the repo from "I have source" to "I can run the smoke test."

set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

say() { printf "\n==> %s\n" "$*"; }
ok()  { printf "    \033[32m✓\033[0m %s\n" "$*"; }
bad() { printf "    \033[31m✗\033[0m %s\n" "$*" >&2; }

missing=()

# --- 1. Version checks -------------------------------------------------------
say "Checking required tools"

check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    ok "$1 — $($1 $2 2>&1 | head -1)"
  else
    bad "$1 not found"
    missing+=("$1")
  fi
}

check_cmd node --version
check_cmd python3 --version
check_cmd uv --version
check_cmd eas --version
check_cmd supabase --version
check_cmd git --version

if [ ${#missing[@]} -ne 0 ]; then
  bad "Missing: ${missing[*]}"
  bad "Install them before continuing. See README or design doc §13."
  exit 1
fi

# --- 2. .env -----------------------------------------------------------------
say "Setting up .env"

if [ -f .env ]; then
  ok ".env already exists (not overwriting)"
else
  cp .env.example .env
  ok "Copied .env.example → .env"
  echo
  echo "    EDIT .env NOW to fill in your API keys, then re-run this script."
  echo "    Service URLs are in the .env.example comments."
  exit 0
fi

# --- 3. Backend deps ---------------------------------------------------------
if [ -d backend ]; then
  say "Installing backend deps (uv sync)"
  (cd backend && uv sync)
  ok "Backend deps installed"
else
  echo "    (backend/ not yet created — skipping uv sync)"
fi

# --- 4. Mobile deps ----------------------------------------------------------
if [ -d mobile ]; then
  say "Installing mobile deps (npm ci)"
  (cd mobile && npm ci)
  ok "Mobile deps installed"
else
  echo "    (mobile/ not yet created — skipping npm ci)"
fi

# --- 5. Supabase migrations --------------------------------------------------
if [ -d supabase/migrations ]; then
  say "Applying Supabase migrations (supabase db reset)"
  (cd supabase && supabase db reset)
  ok "Schema applied"
else
  echo "    (supabase/migrations/ not yet created — skipping)"
fi

# --- 6. Smoke test -----------------------------------------------------------
if [ -d backend/tests/smoke ]; then
  say "Running smoke test"
  (cd backend && uv run pytest tests/smoke/ -x --tb=short) && ok "Smoke passed" || bad "Smoke failed"
else
  echo "    (backend/tests/smoke/ not yet created — skipping)"
fi

# --- 7. Summary --------------------------------------------------------------
say "Ready"
echo "    Start the backend:   cd backend && uv run uvicorn app.main:app --reload"
echo "    Start the mobile UI: cd mobile && npx expo start"
echo "    Swagger:             http://localhost:8000/docs"
