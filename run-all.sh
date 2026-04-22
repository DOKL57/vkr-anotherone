#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

print_help() {
  cat <<'EOF'
WSL development helper

Usage: ./run-all.sh [command]

Commands:
  start     Build and start docker stack
  stop      Stop docker stack
  restart   Restart docker stack
  logs      Tail docker logs
  dev       Run postgres in docker, api+web locally
  clean     Remove containers, volumes, orphans
  reset     Recreate postgres volume
  help      Show this help
EOF
}

ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "[run-all] .env missing -> copy from .env.example"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "[run-all][error] docker not found in WSL."
    echo "Install Docker Desktop with WSL integration, or docker engine inside WSL."
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "[run-all][error] docker daemon not running."
    echo "Start Docker Desktop or run: sudo service docker start"
    exit 1
  fi
}

require_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  echo "[run-all][error] node/npm not found in WSL."
  echo "Install via nvm:"
  echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
  echo "  nvm install --lts"
  exit 1
}

wait_for_postgres() {
  local tries=0
  until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 30 ]; then
      echo "[run-all][error] postgres not ready after 30s."
      exit 1
    fi
    sleep 1
  done
}

cmd_start() {
  ensure_env
  require_docker
  echo "[run-all] starting docker stack..."
  docker compose up -d --build
  echo "[run-all] ready:"
  echo "  Web:    http://localhost:5173"
  echo "  API:    http://localhost:3001"
  echo "  Health: http://localhost:3001/health"
}

cmd_stop() {
  require_docker
  echo "[run-all] stopping docker stack..."
  docker compose down
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_logs() {
  require_docker
  docker compose logs -f
}

cmd_clean() {
  require_docker
  echo "[run-all] removing docker resources..."
  docker compose down -v --remove-orphans
}

cmd_reset() {
  read -r -p "This deletes postgres volume. Continue? (y/N) " response
  if [[ ! "$response" =~ ^([yY])$ ]]; then
    echo "[run-all] reset cancelled"
    return
  fi

  require_docker
  docker compose down -v
  docker volume rm "$(basename "$ROOT_DIR")_postgres_data" 2>/dev/null || true
  docker compose up -d postgres
  wait_for_postgres
  echo "[run-all] postgres volume recreated"
}

cmd_dev() {
  ensure_env
  require_node
  require_docker

  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a

  export PORT="${PORT:-3001}"
  export HOST="${HOST:-0.0.0.0}"
  export API_URL="${API_URL:-http://localhost:3001}"
  export VITE_API_URL="${VITE_API_URL:-http://localhost:3001}"
  export VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://localhost:3001}"
  export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:5173}"
  export LOCAL_LLM_MODEL="${LOCAL_LLM_MODEL:-auto}"
  export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@postgres:5432/sound_rental?schema=public}"
  export DATABASE_URL="${DATABASE_URL//@postgres:/@localhost:}"

  echo "[run-all] node $(node -v), npm $(npm -v)"
  echo "[run-all] starting postgres..."
  docker compose up -d postgres
  wait_for_postgres

  if [ ! -d "$ROOT_DIR/node_modules" ]; then
    echo "[run-all] installing dependencies..."
    npm install
  fi

  echo "[run-all] init db..."
  npm run db:init -w @sound/api
  echo "[run-all] seed db..."
  npm run db:seed -w @sound/api

  echo "[run-all] start api..."
  npm run dev:api &
  API_PID=$!

  echo "[run-all] start web..."
  npm run dev:web &
  WEB_PID=$!

  cleanup() {
    echo
    echo "[run-all] shutting down..."
    kill "$API_PID" 2>/dev/null || true
    kill "$WEB_PID" 2>/dev/null || true
    docker compose stop postgres 2>/dev/null || true
  }

  trap cleanup EXIT INT TERM

  echo "[run-all] ready:"
  echo "  Web:    http://localhost:5173"
  echo "  API:    http://localhost:3001"
  echo "  Health: http://localhost:3001/health"
  echo "  LLM:    ${LOCAL_LLM_URL:-http://localhost:1234/v1}"

  wait
}

case "${1:-start}" in
  start) cmd_start ;;
  stop|kill) cmd_stop ;;
  restart) cmd_restart ;;
  logs) cmd_logs ;;
  clean) cmd_clean ;;
  reset) cmd_reset ;;
  dev) cmd_dev ;;
  help|*) print_help ;;
esac
