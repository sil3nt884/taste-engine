#!/usr/bin/env bash
#
# Teardown for the MoodRoll deployment.
#
#   ./fly/teardown.sh stop      # STOP all Fly machines — reversible, ~$1.5/mo, keeps data
#   ./fly/teardown.sh start     # start them again (undo 'stop')
#   ./fly/teardown.sh destroy   # DESTROY all Fly apps + volumes — IRREVERSIBLE, $0
#   ./fly/teardown.sh home      # stop the home-side Caddy + ngrok services (needs sudo)
#   ./fly/teardown.sh all       # destroy Fly apps AND stop home services
#
# 'stop' is what you want between demos. 'destroy' deletes the database, the
# Meili index, and the volumes — you'd have to redeploy + reseed from scratch.

set -euo pipefail

DB_APP="taste-db"
SEARCH_APP="taste-search-mr"
API_APP="taste-api"
WEB_APP="taste-web"
APPS=("$WEB_APP" "$API_APP" "$SEARCH_APP" "$DB_APP")

cd "$(dirname "$0")/.."

log()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

preflight() {
  command -v fly >/dev/null  || die "flyctl not found"
  fly auth whoami >/dev/null  || die "not logged in — run: fly auth login"
}

# Machine IDs for an app (first column of `fly machine list`, hex).
machine_ids() { fly machine list -a "$1" 2>/dev/null | awk 'NR>1{print $1}' | grep -E '^[0-9a-f]{6,}$' || true; }

set_machines() {   # $1 = start|stop
  preflight
  for app in "${APPS[@]}"; do
    log "$1 machines for $app"
    for id in $(machine_ids "$app"); do
      fly machine "$1" "$id" -a "$app" || true
    done
  done
}

phase_stop() {
  set_machines stop
  log "All machines stopped. You still pay volume storage (~\$0.60/mo)."
  echo "  Bring it back with:  ./fly/teardown.sh start"
}

phase_start() {
  set_machines start
  log "Machines started. (Home LLM must also be up for mood search.)"
}

phase_destroy() {
  preflight
  echo
  echo "This PERMANENTLY DESTROYS these apps, their machines, and ALL data + volumes:"
  for app in "${APPS[@]}"; do echo "    - $app"; done
  echo
  read -r -p "Type 'destroy' to confirm (anything else aborts): " ans
  [ "$ans" = "destroy" ] || die "aborted — nothing was deleted"
  for app in "${APPS[@]}"; do
    log "destroying $app"
    fly apps destroy "$app" -y || true
  done
  log "Fly resources removed — billing for these apps stops."
  echo "  fly/.secrets.env is kept locally; delete it if you're fully done."
}

phase_home() {
  log "stopping home-side services (Caddy + ngrok) — needs sudo"
  sudo systemctl disable --now caddy ngrok 2>/dev/null || true
  echo "  Caddy + ngrok stopped and disabled. Ollama left running — stop it yourself if you want."
}

case "${1:-}" in
  stop)    phase_stop ;;
  start)   phase_start ;;
  destroy) phase_destroy ;;
  home)    phase_home ;;
  all)     phase_destroy; phase_home ;;
  *) awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next} {exit}' "$0"; exit 1 ;;
esac
