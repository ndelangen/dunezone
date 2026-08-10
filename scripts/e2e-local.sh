#!/usr/bin/env bash
set -euo pipefail

# Runs the whole flow by default (`e2e-local.sh` == `e2e-local.sh all`).
# CI runs each phase as its own workflow step so the Actions UI shows
# per-phase timing: up | provision | serve | test | down.
# Values that must cross phase boundaries (admin key, resolved app URL,
# app server pid, JWT material) live as files under .playwright/.
# Backend and provisioning stages delegate to the unified pipeline in
# scripts/provision.ts (e2e target: fixture data, never production).
PHASE="${1:-all}"
case "$PHASE" in
  all|up|provision|serve|test|down) ;;
  *)
    echo "Unknown phase: $PHASE"
    echo "Usage: $0 [up|provision|serve|test|down]"
    exit 1
    ;;
esac

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.convex-local.yml"
ENV_FILE="${E2E_ENV_FILE:-$ROOT_DIR/.env.e2e.local}"
APP_PID=""
ADMIN_KEY_FILE="$ROOT_DIR/.playwright/admin-key"
APP_URL_FILE="$ROOT_DIR/.playwright/app-url"
APP_PID_FILE="$ROOT_DIR/.playwright/app.pid"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ "$PHASE" == "down" ]]; then
    echo "Env file $ENV_FILE missing; tearing down with compose defaults."
  else
    echo "Missing env file: $ENV_FILE"
    echo "Copy $ROOT_DIR/.env.e2e.local.example to .env.e2e.local and fill required values."
    exit 1
  fi
else
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

export_runtime_env() {
  export CONVEX_SELF_HOSTED_URL="${CONVEX_SELF_HOSTED_URL:-http://127.0.0.1:3210}"
  export VITE_CONVEX_URL="${VITE_CONVEX_URL:-$CONVEX_SELF_HOSTED_URL}"
  export E2E_APP_PORT="${E2E_APP_PORT:-6001}"
  export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:${E2E_APP_PORT}}"
  export PLAYWRIGHT_HEADLESS="${PLAYWRIGHT_HEADLESS:-false}"
  export VITE_E2E_LOCAL_AUTH="${VITE_E2E_LOCAL_AUTH:-true}"
  export E2E_LOCAL_AUTH="${E2E_LOCAL_AUTH:-true}"
  export IS_TEST="${IS_TEST:-true}"
  export SITE_URL="${SITE_URL:-$PLAYWRIGHT_BASE_URL}"
  export CONVEX_SITE_URL="${CONVEX_SITE_URL:-http://127.0.0.1:3211}"

  # Ensure Convex CLI runs in self-hosted mode, even if the shell
  # inherited cloud deployment variables from prior sessions.
  unset CONVEX_DEPLOYMENT
  unset CONVEX_URL
  unset CONVEX_CLOUD_URL
}

ensure_admin_key() {
  if [[ -n "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" && "$CONVEX_SELF_HOSTED_ADMIN_KEY" != "replace-me" ]]; then
    export CONVEX_SELF_HOSTED_ADMIN_KEY
    return
  fi
  if [[ -f "$ADMIN_KEY_FILE" ]]; then
    CONVEX_SELF_HOSTED_ADMIN_KEY="$(<"$ADMIN_KEY_FILE")"
  fi
  if [[ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" || "$CONVEX_SELF_HOSTED_ADMIN_KEY" == "replace-me" ]]; then
    echo "Generating self-hosted admin key..."
    CONVEX_SELF_HOSTED_ADMIN_KEY="$(compose exec -T backend ./generate_admin_key.sh | tr -d '\r')"
    if [[ -z "$CONVEX_SELF_HOSTED_ADMIN_KEY" ]]; then
      echo "Failed to generate a self-hosted admin key."
      exit 1
    fi
    mkdir -p "$ROOT_DIR/.playwright"
    printf '%s' "$CONVEX_SELF_HOSTED_ADMIN_KEY" >"$ADMIN_KEY_FILE"
  fi
  export CONVEX_SELF_HOSTED_ADMIN_KEY
}

cleanup() {
  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" >/dev/null 2>&1 || true
  fi
  compose down -v
}

close_playwright_browsers() {
  # Playwright-managed browsers are launched from the ms-playwright cache.
  local pids
  pids="$(pgrep -f "ms-playwright" || true)"
  if [[ -z "$pids" ]]; then
    return
  fi
  echo "Closing Playwright browser processes..."
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" >/dev/null 2>&1 || true
  done <<<"$pids"
  sleep 1
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    kill -0 "$pid" >/dev/null 2>&1 && kill -9 "$pid" >/dev/null 2>&1 || true
  done <<<"$pids"
}

print_app_diagnostics() {
  echo "App diagnostics:"
  if [[ -n "$APP_PID" ]]; then
    if kill -0 "$APP_PID" >/dev/null 2>&1; then
      echo "  - app process is running (pid=$APP_PID)"
    else
      echo "  - app process is NOT running (pid=$APP_PID)"
    fi
  fi
  echo "  - recent app.log:"
  tail -n 120 "$ROOT_DIR/.playwright/app.log" || true
  echo "  - recent build.log:"
  tail -n 40 "$ROOT_DIR/.playwright/build.log" || true
}

load_app_pid() {
  if [[ -z "$APP_PID" && -f "$APP_PID_FILE" ]]; then
    APP_PID="$(<"$APP_PID_FILE")"
  fi
}

phase_up() {
  # A previous phased run that never reached `down` leaves the app server
  # holding the port, and the rm -rf below deletes its pid file — reap it now.
  # Only kill a pid that is still our server; pids get recycled.
  load_app_pid
  if [[ -n "$APP_PID" ]] && ps -p "$APP_PID" -o command= 2>/dev/null | grep -Eq 'e2e-serve-dist|vite'; then
    kill "$APP_PID" >/dev/null 2>&1 || true
  fi
  APP_PID=""

  echo "Clearing previous Playwright artifacts..."
  rm -rf "$ROOT_DIR/test-results" "$ROOT_DIR/playwright-report" "$ROOT_DIR/.playwright"

  export_runtime_env
  echo "Resetting and starting the local Convex backend..."
  bun run "$ROOT_DIR/scripts/provision.ts" e2e --stage backend
}

phase_provision() {
  export_runtime_env
  ensure_admin_key

  echo "Configuring the local Convex deployment..."
  bun run "$ROOT_DIR/scripts/provision.ts" e2e --stage configure

  if [[ "${E2E_RUN_MIGRATIONS:-0}" == "1" ]]; then
    echo "Running migration guards for local deployment..."
    bun run migrations:run-local-required
  else
    echo "Skipping migrations:run-local-required (fresh ephemeral DB path). Set E2E_RUN_MIGRATIONS=1 to enable."
  fi

  echo "Deploying functions and resetting fixture data..."
  bun run "$ROOT_DIR/scripts/provision.ts" e2e --stage code --stage data
}

phase_serve() {
  export_runtime_env

  mkdir -p "$ROOT_DIR/.playwright"
  # E2E runs against the production build, served statically — vite dev's
  # on-demand transforms dominated slow-spec wall clock. VITE_* env is baked
  # at build time, so it must be set on the build, not the server. Sourcemaps
  # let e2e/coverage.ts map V8 coverage of chunks back to src/; minify off
  # keeps that mapping near-exact (validated on prototype/e2e-coverage-build-serve).
  echo "Building app (vite build --sourcemap --minify false)..."
  VITE_E2E_LOCAL_AUTH="$VITE_E2E_LOCAL_AUTH" VITE_CONVEX_URL="$VITE_CONVEX_URL" \
    npx vite build --sourcemap --minify false >"$ROOT_DIR/.playwright/build.log" 2>&1 || {
      echo "vite build failed."
      tail -n 60 "$ROOT_DIR/.playwright/build.log" || true
      exit 1
    }

  echo "Starting app server for Playwright..."
  E2E_APP_PORT="$E2E_APP_PORT" \
    node "$ROOT_DIR/scripts/e2e-serve-dist.mjs" >"$ROOT_DIR/.playwright/app.log" 2>&1 &
  APP_PID=$!
  printf '%s' "$APP_PID" >"$APP_PID_FILE"

  local app_wait_url_primary="$PLAYWRIGHT_BASE_URL"
  local app_wait_url_fallback=""
  if [[ "$PLAYWRIGHT_BASE_URL" == *"127.0.0.1"* ]]; then
    app_wait_url_fallback="${PLAYWRIGHT_BASE_URL/127.0.0.1/localhost}"
  elif [[ "$PLAYWRIGHT_BASE_URL" == *"localhost"* ]]; then
    app_wait_url_fallback="${PLAYWRIGHT_BASE_URL/localhost/127.0.0.1}"
  fi

  echo "Waiting for app server on ${app_wait_url_primary}${app_wait_url_fallback:+ (fallback ${app_wait_url_fallback})}..."
  local app_ready_url=""
  for _ in {1..60}; do
    if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
      echo "App process exited while waiting for readiness."
      print_app_diagnostics
      exit 1
    fi
    if curl -fsS "$app_wait_url_primary" >/dev/null; then
      app_ready_url="$app_wait_url_primary"
      break
    fi
    if [[ -n "$app_wait_url_fallback" ]] && curl -fsS "$app_wait_url_fallback" >/dev/null; then
      app_ready_url="$app_wait_url_fallback"
      break
    fi
    sleep 1
  done

  if [[ -z "$app_ready_url" ]]; then
    echo "App server failed to become ready."
    print_app_diagnostics
    exit 1
  fi

  if [[ "$app_ready_url" != "$PLAYWRIGHT_BASE_URL" ]]; then
    echo "Using reachable app URL: $app_ready_url"
    export PLAYWRIGHT_BASE_URL="$app_ready_url"
  fi
  printf '%s' "$PLAYWRIGHT_BASE_URL" >"$APP_URL_FILE"
}

phase_test() {
  export_runtime_env
  ensure_admin_key
  load_app_pid
  if [[ -f "$APP_URL_FILE" ]]; then
    PLAYWRIGHT_BASE_URL="$(<"$APP_URL_FILE")"
    export PLAYWRIGHT_BASE_URL
  fi

  echo "Running Playwright E2E suite..."
  if ! npx playwright test; then
    echo "Playwright failed."
    print_app_diagnostics
    close_playwright_browsers
    exit 1
  fi

  close_playwright_browsers
}

phase_down() {
  load_app_pid
  cleanup
}

case "$PHASE" in
  all)
    trap cleanup EXIT
    phase_up
    phase_provision
    phase_serve
    phase_test
    ;;
  up) phase_up ;;
  provision) phase_provision ;;
  serve) phase_serve ;;
  test) phase_test ;;
  down) phase_down ;;
esac
