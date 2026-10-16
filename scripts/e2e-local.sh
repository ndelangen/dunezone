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
BUILD_LOG="$ROOT_DIR/.playwright/build.log"
BUILD_PID_FILE="$ROOT_DIR/.playwright/build.pid"
BUILD_EXIT_FILE="$ROOT_DIR/.playwright/build.exit"

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
  stop_background_build
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
  tail -n 40 "$BUILD_LOG" || true
}

load_app_pid() {
  if [[ -z "$APP_PID" && -f "$APP_PID_FILE" ]]; then
    APP_PID="$(<"$APP_PID_FILE")"
  fi
}

# E2E runs against the production build, served statically: vite dev's
# on-demand transforms dominated slow-spec wall clock. VITE_* env is baked
# at build time, so it must be set on the build, not the server. Sourcemaps
# let e2e/coverage.ts map V8 coverage of chunks back to src/; minify off
# keeps that mapping near-exact (validated on prototype/e2e-coverage-build-serve).
build_app() {
  VITE_E2E_LOCAL_AUTH="$VITE_E2E_LOCAL_AUTH" VITE_CONVEX_URL="$VITE_CONVEX_URL" \
    bun run vp build . --sourcemap --minify false >"$BUILD_LOG" 2>&1
}

# The build needs only the VITE_* values from the env file, not a running
# backend, so `up` starts it before booting and `serve` waits for it.
# The build (about 37 s on CI) then overlaps the boot and provision steps.
# Provision regenerates convex/_generated, but the Convex CLI leaves an
# unchanged file alone and swaps a changed one in whole, so the build never
# reads a half-written binding; a changed one fails the CI drift check anyway.
# The child outlives this phase: in CI each phase is its own step, and the
# runner reaps leftover processes only when the job ends. Its status crosses
# the step boundary as a file, because a later shell cannot `wait` on it.
start_background_build() {
  echo "Building app in the background (vp build --sourcemap --minify false)..."
  (
    status=0
    build_app || status=$?
    printf '%s' "$status" >"$BUILD_EXIT_FILE"
  ) </dev/null >/dev/null 2>&1 &
  printf '%s' "$!" >"$BUILD_PID_FILE"
}

stop_background_build() {
  if [[ -f "$BUILD_PID_FILE" && ! -f "$BUILD_EXIT_FILE" ]]; then
    local build_pid
    build_pid="$(<"$BUILD_PID_FILE")"
    pkill -P "$build_pid" >/dev/null 2>&1 || true
    kill "$build_pid" >/dev/null 2>&1 || true
  fi
}

# Bounded at about 300 s (the hosted-play launcher gives its build the same), so a hung build fails
# the step with its log instead of holding the job until its timeout.
wait_for_background_build() {
  local build_pid
  build_pid="$(<"$BUILD_PID_FILE")"
  echo "Waiting for the background app build..."
  for _ in {1..300}; do
    if [[ -f "$BUILD_EXIT_FILE" ]]; then
      break
    fi
    if ! kill -0 "$build_pid" >/dev/null 2>&1; then
      # The subshell writes the exit file just before it exits; look once more.
      sleep 1
      break
    fi
    sleep 1
  done
  if [[ ! -f "$BUILD_EXIT_FILE" ]]; then
    stop_background_build
    echo "vp build did not report a status."
    tail -n 60 "$BUILD_LOG" || true
    exit 1
  fi
  if [[ "$(<"$BUILD_EXIT_FILE")" != "0" ]]; then
    echo "vp build failed."
    tail -n 60 "$BUILD_LOG" || true
    exit 1
  fi
}

phase_up() {
  # A previous phased run that never reached `down` leaves the app server
  # holding the port, and the rm -rf below deletes its pid file. Reap it now.
  # Only kill a pid that is still our server; pids get recycled.
  load_app_pid
  if [[ -n "$APP_PID" ]] && ps -p "$APP_PID" -o command= 2>/dev/null | grep -Eq 'e2e-serve-dist|vite'; then
    kill "$APP_PID" >/dev/null 2>&1 || true
  fi
  APP_PID=""

  echo "Clearing previous Playwright artifacts..."
  rm -rf "$ROOT_DIR/test-results" "$ROOT_DIR/playwright-report" "$ROOT_DIR/.playwright"

  export_runtime_env
  mkdir -p "$ROOT_DIR/.playwright"
  start_background_build
  echo "Resetting and starting the local Convex backend..."
  bun run "$ROOT_DIR/scripts/provision.ts" e2e --stage backend
}

phase_provision() {
  export_runtime_env
  ensure_admin_key

  echo "Configuring and deploying the local Convex deployment..."
  bun run "$ROOT_DIR/scripts/provision.ts" e2e --stage configure --stage code

  if [[ "${E2E_RUN_MIGRATIONS:-0}" == "1" ]]; then
    echo "Running migration guards for local deployment..."
    bun run migrations:run-local-required
  else
    echo "Skipping migrations:run-local-required (fresh ephemeral DB path). Set E2E_RUN_MIGRATIONS=1 to enable."
  fi

  echo "Resetting fixture data..."
  bun run "$ROOT_DIR/scripts/provision.ts" e2e --stage data
}

phase_serve() {
  export_runtime_env

  mkdir -p "$ROOT_DIR/.playwright"
  if [[ -f "$BUILD_PID_FILE" ]]; then
    wait_for_background_build
  else
    # No `up` started a build in this checkout, e.g. `serve` run by hand.
    echo "Building app (vp build --sourcemap --minify false)..."
    build_app || {
      echo "vp build failed."
      tail -n 60 "$BUILD_LOG" || true
      exit 1
    }
  fi

  echo "Starting app server for Playwright..."
  E2E_APP_PORT="$E2E_APP_PORT" \
    node "$ROOT_DIR/scripts/e2e-serve-dist.ts" >"$ROOT_DIR/.playwright/app.log" 2>&1 &
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
  # The first probes miss while the server starts; those misses are expected and stay silent.
  # The last probe's own error is printed when the wait gives up, so a real refusal of the
  # port is still named, and each probe is bounded so a listener that accepts and never
  # answers cannot hold the wait past the loop's own count (#1055).
  local app_ready_url=""
  local probe_error=""
  for _ in {1..60}; do
    if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
      echo "App process exited while waiting for readiness."
      print_app_diagnostics
      exit 1
    fi
    if probe_error="$(curl -fsS --max-time 5 "$app_wait_url_primary" 2>&1 >/dev/null)"; then
      app_ready_url="$app_wait_url_primary"
      break
    fi
    if [[ -n "$app_wait_url_fallback" ]] && probe_error="$(curl -fsS --max-time 5 "$app_wait_url_fallback" 2>&1 >/dev/null)"; then
      app_ready_url="$app_wait_url_fallback"
      break
    fi
    sleep 1
  done

  if [[ -z "$app_ready_url" ]]; then
    echo "App server failed to become ready at ${app_wait_url_primary}${app_wait_url_fallback:+ or ${app_wait_url_fallback}}; last probe: ${probe_error:-no output}"
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

  # A CI shard runs only its files from e2e/shards.json (every spec is assigned to exactly one
  # shard, guarded by check:e2e-shards), the animation project's file included.
  # Without E2E_SHARD the whole suite runs, as it does locally.
  local -a targets=()
  if [[ -n "${E2E_SHARD:-}" ]]; then
    local shard_files
    shard_files="$(node -e 'const shards = require(require("node:path").resolve(process.argv[1])); const files = shards[process.argv[2]]; if (!files) { console.error("No shard " + process.argv[2] + " in e2e/shards.json"); process.exit(1); } console.log(files.join(" "));' "$ROOT_DIR/e2e/shards.json" "$E2E_SHARD")"
    IFS=' ' read -r -a targets <<<"$shard_files"
    echo "Running Playwright E2E shard $E2E_SHARD: ${targets[*]}"
  else
    echo "Running Playwright E2E suite..."
  fi
  if ! bun run playwright test ${targets[@]+"${targets[@]}"}; then
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
