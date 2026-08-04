#!/usr/bin/env bash
#
# Fly.io deploy for MoodRoll (demo, Kafka off). Staged and idempotent — safe to
# re-run. Run phases individually or all at once:
#
#   ./fly/deploy.sh apps       # create the 4 apps
#   ./fly/deploy.sh volumes    # create the pg + meili volumes
#   ./fly/deploy.sh secrets    # generate + push secrets (reused on re-run)
#   ./fly/deploy.sh data       # deploy postgres + meilisearch
#   ./fly/deploy.sh migrate    # run Flyway migrations via a proxy
#   ./fly/deploy.sh api        # deploy the API
#   ./fly/deploy.sh seed       # one-time: ingest/enrich/embed + index (needs home LLM up)
#   ./fly/deploy.sh web        # deploy the web app
#   ./fly/deploy.sh all        # everything EXCEPT seed (seed needs the LLM online)
#
# Prereqs: `fly auth login`, docker running, openssl. Set OLLAMA_TOKEN in your
# environment to the SAME value as home-ollama/Caddyfile before `secrets`.

set -euo pipefail

# ---------- config (edit app names here if you renamed any) ----------
REGION="lhr"
DB_APP="taste-db"
SEARCH_APP="taste-search-mr"
API_APP="taste-api"
WEB_APP="taste-web"
OLLAMA_HOST_URL="https://api884.tplinkdns.com"
SECRETS_FILE="fly/.secrets.env"     # generated; gitignored; keep it safe

cd "$(dirname "$0")/.."             # repo root

# ---------- helpers ----------
log()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

preflight() {
  command -v fly >/dev/null   || die "flyctl not found (curl -L https://fly.io/install.sh | sh)"
  fly auth whoami >/dev/null  || die "not logged in — run: fly auth login"
}

have_app() { fly apps list | awk 'NR>1{print $1}' | grep -qx "$1"; }

create_app() {
  local app="$1"
  if have_app "$app"; then log "app $app exists ✓"; return; fi
  log "creating app $app"
  fly apps create "$app" || true
  have_app "$app" || die "could not create '$app' — the name is likely taken globally. Pick another, update this script + the toml, and re-run."
}

create_vol() {
  local app="$1" name="$2" size="$3"
  if fly volumes list -a "$app" 2>/dev/null | grep -qw "$name"; then
    log "volume $name on $app exists ✓"; return
  fi
  log "creating volume $name ($size GB) on $app"
  fly volumes create "$name" -a "$app" -r "$REGION" -n 1 -s "$size" -y
}

gen_secrets() {
  if [[ -f "$SECRETS_FILE" ]]; then
    log "reusing $SECRETS_FILE"; return
  fi
  log "generating secrets -> $SECRETS_FILE (gitignored — back this up)"
  umask 077
  {
    echo "PGPASS=$(openssl rand -hex 32)"
    echo "MEILIKEY=$(openssl rand -hex 32)"
    echo "JWTSECRET=$(openssl rand -hex 32)"
  } > "$SECRETS_FILE"
}

# ---------- phases ----------
phase_apps() {
  preflight
  create_app "$DB_APP"; create_app "$SEARCH_APP"; create_app "$API_APP"; create_app "$WEB_APP"
}

phase_volumes() {
  preflight
  create_vol "$DB_APP"     pgdata     3
  create_vol "$SEARCH_APP" meili_data 1
}

phase_secrets() {
  preflight
  [[ -n "${OLLAMA_TOKEN:-}" ]] || die "set OLLAMA_TOKEN (same value as home-ollama/Caddyfile) before running 'secrets'"
  gen_secrets
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"

  log "db + search secrets"
  fly secrets set POSTGRES_PASSWORD="$PGPASS" -a "$DB_APP"
  fly secrets set MEILI_MASTER_KEY="$MEILIKEY" -a "$SEARCH_APP"

  log "api secrets"
  fly secrets set -a "$API_APP" \
    DATABASE_URL="postgres://taste:$PGPASS@$DB_APP.internal:5432/taste" \
    JWT_SECRET="$JWTSECRET" \
    MEILI_HOST="http://$SEARCH_APP.internal:7700" \
    MEILI_KEY="$MEILIKEY" \
    OLLAMA_HOST="$OLLAMA_HOST_URL" \
    OLLAMA_TOKEN="$OLLAMA_TOKEN"

  log "web secrets"
  fly secrets set -a "$WEB_APP" \
    API_BASE_URL="https://$API_APP.fly.dev" \
    SITE_URL="https://$WEB_APP.fly.dev"
}

phase_data() {
  preflight
  log "deploying postgres"; fly deploy -c fly/db.toml
  log "deploying meilisearch"; fly deploy -c fly/meili.toml
}

phase_migrate() {
  preflight
  command -v docker >/dev/null || die "docker not found (needed for Flyway)"
  [[ -f "$SECRETS_FILE" ]] || die "no $SECRETS_FILE — run 'secrets' first"
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"

  # Local side is 15432 to avoid clashing with a local Postgres on 5432. Bind the
  # proxy to 0.0.0.0 so the Flyway *container* can reach it via host.docker.internal
  # (Docker Desktop / WSL2 don't share the host loopback with --network host).
  local lport=15432
  fuser -k "$lport/tcp" 2>/dev/null || true   # clear any leftover proxy from a prior run
  log "opening proxy 0.0.0.0:$lport -> $DB_APP:5432"
  fly proxy "$lport:5432" -a "$DB_APP" --bind-addr 0.0.0.0 & local proxy_pid=$!
  trap 'kill "$proxy_pid" 2>/dev/null || true' RETURN

  local up=""
  for _ in {1..30}; do (exec 3<>"/dev/tcp/127.0.0.1/$lport") 2>/dev/null && { up=1; exec 3>&-; break; }; sleep 1; done
  [[ -n "$up" ]] || die "proxy did not come up on $lport (is something else on that port?)"

  log "running Flyway migrations"
  docker run --rm --add-host=host.docker.internal:host-gateway \
    -v "$PWD/migrations:/flyway/sql" flyway/flyway:11 \
    migrate -url="jdbc:postgresql://host.docker.internal:$lport/taste" -user=taste -password="$PGPASS"
}

phase_api() {
  preflight
  log "deploying api"; fly deploy . -c fly/api.toml --dockerfile fly/Dockerfile.api
}

phase_seed() {
  preflight
  log "seeding (this is long and needs your home LLM online at $OLLAMA_HOST_URL)"
  fly scale memory 2048 -a "$API_APP"
  # The api scales to zero; SSH can't start a stopped machine, so wake it with an
  # HTTP request (the Fly proxy auto-starts it) before we connect.
  log "waking the api machine ..."
  local code
  for _ in {1..20}; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$API_APP.fly.dev/media?limit=1" || echo 000)
    [[ "$code" != "000" ]] && { log "api is up (HTTP $code)"; break; }
    sleep 3
  done
  [[ "${code:-000}" != "000" ]] || die "api machine won't start — check: fly status -a $API_APP ; fly logs -a $API_APP"
  fly ssh console -a "$API_APP" -C "/bin/sh -lc 'npm run setup && npm run search:reindex'"
  fly scale memory 512 -a "$API_APP"
}

phase_web() {
  preflight
  log "deploying web"; fly deploy . -c fly/web.toml --dockerfile fly/Dockerfile.web
  log "done → https://$WEB_APP.fly.dev"
}

phase_all() {
  phase_apps; phase_volumes; phase_secrets; phase_data; phase_migrate; phase_api; phase_web
  log "infra deployed. NOW seed it (bring your home LLM online first):"
  echo "    ./fly/deploy.sh seed"
  echo "  (or run 'npm run setup && npm run search:reindex' from home — see fly/DEPLOY.md)"
}

case "${1:-}" in
  apps|volumes|secrets|data|migrate|api|seed|web|all) "phase_${1}" ;;
  *) awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next} {exit}' "$0"; exit 1 ;;
esac
