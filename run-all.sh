#!/bin/bash

# Development helper script for Звукосклад
# Works reliably in WSL, Linux, macOS

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
TUNNEL_ENV_FILE="$ROOT_DIR/.runtime/public-tunnel.env"

# ---------------------------------------------------------------------------

print_help() {
    cat <<'EOF'
Звукосклад — Development Helper

Usage: ./run-all.sh [command]

Commands:
  start     Start the full Docker stack (build + up)
  stop      Stop all Docker services
  logs      Tail docker-compose logs
  restart   Restart all services
  dev       Start only postgres in Docker, run api+web locally (requires node)
  clean     Remove containers and volumes
  reset     Reset Postgres volume (destructive)
  help      Show this help

Examples:
  ./run-all.sh              # same as start
  ./run-all.sh start        # build & start all in Docker
  ./run-all.sh dev          # postgres in Docker, api+web locally
  ./run-all.sh logs         # stream logs
  ./run-all.sh stop         # stop everything
EOF
}

ensure_env() {
    if [ ! -f "$ENV_FILE" ]; then
        echo "[run-all] .env missing -> copying from .env.example"
        cp "$ENV_EXAMPLE" "$ENV_FILE"
    fi
}

require_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        echo "[run-all][error] Docker is required but not found."
        echo ""
        echo "  Install Docker Desktop: https://docs.docker.com/desktop/"
        echo "  Or for WSL: https://docs.docker.com/desktop/wsl/"
        echo ""
        exit 1
    fi
    # Verify docker daemon is running
    if ! docker info >/dev/null 2>&1; then
        echo "[run-all][error] Docker daemon is not running."
        echo ""
        echo "  Start Docker Desktop or run: sudo service docker start"
        echo ""
        exit 1
    fi
}

find_node() {
    # Already in PATH?
    if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
        return 0
    fi

    # Check nvm (handles sudo dropping PATH)
    local nvm_dirs=()
    [ -n "${NVM_DIR:-}" ] && [ -d "${NVM_DIR:-}" ] && nvm_dirs+=("$NVM_DIR")
    [ -d "$HOME/.nvm" ] && nvm_dirs+=("$HOME/.nvm")
    if [ -n "${SUDO_USER:-}" ]; then
        local sudo_home
        sudo_home="$(getent passwd "$SUDO_USER" 2>/dev/null | cut -d: -f6)" || sudo_home="/home/$SUDO_USER"
        [ -d "$sudo_home/.nvm" ] && nvm_dirs+=("$sudo_home/.nvm")
    fi
    for d in /home/*/.nvm; do
        [ -d "$d" ] && nvm_dirs+=("$d")
    done

    for nvm_dir in "${nvm_dirs[@]}"; do
        if [ -s "$nvm_dir/nvm.sh" ]; then
            export NVM_DIR="$nvm_dir"
            # shellcheck disable=SC1091
            . "$nvm_dir/nvm.sh" 2>/dev/null || true
            if command -v node >/dev/null 2>&1; then return 0; fi
        fi
        # Direct binary search
        for node_bin in "$nvm_dir"/versions/node/v*/bin/node; do
            if [ -x "$node_bin" ]; then
                export PATH="$(dirname "$node_bin"):$PATH"
                if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
                    return 0
                fi
            fi
        done
    done

    return 1
}

ensure_node_modules() {
    mkdir -p "$ROOT_DIR/.npm-cache"
}

start_public_tunnel_if_needed() {
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a

    if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ "${TELEGRAM_BOT_TOKEN}" = "replace_me" ]; then
        return
    fi

    case "${TELEGRAM_WEBAPP_URL:-}" in
        https://*) return ;;
    esac

    if ! find_node; then
        echo "[run-all][error] Node.js required to create public HTTPS tunnel for Telegram Mini App."
        exit 1
    fi

    ensure_node_modules
    local runtime_dir="$ROOT_DIR/.runtime"
    local log_file="$runtime_dir/public-tunnel.log"
    local pid_file="$runtime_dir/public-tunnel.pid"
    mkdir -p "$runtime_dir"

    if [ -f "$pid_file" ]; then
        local existing_pid
        existing_pid="$(cat "$pid_file" 2>/dev/null || true)"
        if [ -n "$existing_pid" ] && kill -0 "$existing_pid" >/dev/null 2>&1; then
            if [ -f "$TUNNEL_ENV_FILE" ]; then
                # shellcheck disable=SC1090
                . "$TUNNEL_ENV_FILE"
                export TELEGRAM_WEBAPP_URL CORS_ORIGIN
                return
            fi
        fi
    fi

    rm -f "$log_file" "$pid_file" "$TUNNEL_ENV_FILE"
    echo "[run-all] Starting public HTTPS tunnel for Telegram Mini App..."
    nohup sh -lc "cd \"$ROOT_DIR\" && npm_config_cache=\"$ROOT_DIR/.npm-cache\" npx --yes localtunnel --port 3001 >> \"$log_file\" 2>&1" >/dev/null 2>&1 &
    echo $! > "$pid_file"

    local url=""
    local i
    for i in $(seq 1 90); do
        if [ -f "$log_file" ]; then
            url="$(grep -Eo 'https://[^[:space:]]+' "$log_file" | head -n 1 || true)"
            if [ -n "$url" ]; then
                break
            fi
        fi
        sleep 1
    done

    if [ -z "$url" ]; then
        echo "[run-all][error] public tunnel start failed."
        exit 1
    fi

    cat > "$TUNNEL_ENV_FILE" <<EOF
PUBLIC_TUNNEL_URL=$url
TELEGRAM_WEBAPP_URL=$url
CORS_ORIGIN=$url
EOF
    # shellcheck disable=SC1090
    . "$TUNNEL_ENV_FILE"
    export TELEGRAM_WEBAPP_URL CORS_ORIGIN PUBLIC_TUNNEL_URL
    echo "[run-all] Public Mini App URL: $TELEGRAM_WEBAPP_URL"
}

stop_public_tunnel() {
    local pid_file="$ROOT_DIR/.runtime/public-tunnel.pid"
    if [ -f "$pid_file" ]; then
        local existing_pid
        existing_pid="$(cat "$pid_file" 2>/dev/null || true)"
        if [ -n "$existing_pid" ]; then
            kill "$existing_pid" >/dev/null 2>&1 || true
        fi
    fi
    rm -f "$pid_file" "$TUNNEL_ENV_FILE"
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_start() {
    echo "🚀 Starting all services via Docker..."
    ensure_env
    start_public_tunnel_if_needed
    require_docker
    docker compose up -d --build
    echo ""
    echo "✅ Services started!"
    echo ""
    echo "🌍 URLs:"
    echo "  Web:    http://localhost:5173"
    echo "  API:    http://localhost:3001"
    echo "  Health: http://localhost:3001/health"
    case "${TELEGRAM_WEBAPP_URL:-}" in
        https://*) echo "  MiniApp: $TELEGRAM_WEBAPP_URL" ;;
    esac
    echo ""
    echo "ℹ️  Use './run-all.sh logs' to view logs"
}

cmd_stop() {
    echo "🛑 Stopping all services..."
    require_docker
    docker compose down
    stop_public_tunnel
    echo "✅ Services stopped!"
}

cmd_restart() {
    cmd_stop
    cmd_start
}

cmd_logs() {
    echo "📝 Streaming logs (Ctrl+C to exit)..."
    require_docker
    docker compose logs -f
}

cmd_clean() {
    echo "🧹 Cleaning Docker resources..."
    require_docker
    docker compose down -v --remove-orphans
    stop_public_tunnel
    echo "✅ Cleanup complete!"
}

cmd_reset() {
    read -r -p "⚠️  This will delete the database volume. Continue? (y/N) " response
    if [[ ! "$response" =~ ^([yY])$ ]]; then
        echo "✖ Reset cancelled"
        return
    fi
    echo "💣 Resetting database..."
    require_docker
    docker compose down -v
    docker volume rm "$(basename "$ROOT_DIR")_postgres_data" 2>/dev/null || true
    docker compose up -d postgres
    echo "✅ Database reset complete!"
}

cmd_dev() {
    echo "🚀 Starting in local dev mode..."
    ensure_env

    if ! find_node; then
        echo "[run-all][error] Node.js not found."
        echo ""
        echo "  Install via nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
        echo "  Then: nvm install --lts"
        echo ""
        echo "  Or use Docker mode instead: ./run-all.sh start"
        echo ""
        exit 1
    fi

    echo "[run-all] Using Node.js $(node -v), npm $(npm -v)"

    # Source .env
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a

    export LOCAL_LLM_MODEL="${LOCAL_LLM_MODEL:-auto}"
    export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:5173}"
    export PORT="${PORT:-3001}"
    export TELEGRAM_WEBAPP_URL="${TELEGRAM_WEBAPP_URL:-http://localhost:5173}"
    export API_URL="${API_URL:-http://localhost:3001}"
    export VITE_API_URL="${VITE_API_URL:-http://localhost:3001}"
    start_public_tunnel_if_needed

    # For local dev, point DATABASE_URL at localhost
    export DATABASE_URL="${DATABASE_URL//@postgres:/@localhost:}"
    if [ -z "${DATABASE_URL:-}" ]; then
        export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sound_rental?schema=public"
    fi

    # Start postgres via Docker
    require_docker
    echo "[run-all] Starting postgres via docker compose..."
    docker compose up -d postgres

    # Wait for postgres
    echo "[run-all] Waiting for Postgres on localhost:5432..."
    local count=0
    while ! docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
        count=$((count + 1))
        if [ "$count" -ge 30 ]; then
            echo "[run-all][error] Postgres not ready after 30s"
            exit 1
        fi
        sleep 1
    done
    echo "[run-all] Postgres is ready"

    # npm dependencies
    if [ ! -d "$ROOT_DIR/node_modules" ]; then
        echo "[run-all] Installing npm dependencies..."
        npm install
    fi

    # DB init + seed
    echo "[run-all] Initializing DB schema..."
    npm run db:init -w @sound/api

    echo "[run-all] Seeding test data..."
    npm run db:seed -w @sound/api

    # Start services
    echo "[run-all] Starting API..."
    npm run dev:api &
    local API_PID=$!

    echo "[run-all] Starting Web..."
    npm run dev:web &
    local WEB_PID=$!

    local BOT_PID=""
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ "${TELEGRAM_BOT_TOKEN}" != "replace_me" ]; then
        echo "[run-all] Starting Telegram bot..."
        npm run dev:bot &
        BOT_PID=$!
    else
        echo "[run-all] TELEGRAM_BOT_TOKEN missing -> bot skipped"
    fi

    # Cleanup on exit
    cleanup() {
        echo ""
        echo "[run-all] Shutting down..."
        [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
        [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
        [ -n "$BOT_PID" ] && kill "$BOT_PID" 2>/dev/null || true
        docker compose stop postgres 2>/dev/null || true
        stop_public_tunnel
        echo "[run-all] Done"
    }
    trap cleanup EXIT INT TERM

    echo ""
    echo "✅ Ready!"
    echo ""
    echo "🌍 URLs:"
    echo "  Web:    http://localhost:5173"
    echo "  API:    http://localhost:3001"
    echo "  Health: http://localhost:3001/health"
    echo "  LLM:   ${LOCAL_LLM_URL:-http://localhost:1234/v1}"
    case "${TELEGRAM_WEBAPP_URL:-}" in
        https://*) echo "  MiniApp: $TELEGRAM_WEBAPP_URL" ;;
    esac
    echo ""

    wait
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

case "${1:-start}" in
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    kill)    cmd_stop ;;
    restart) cmd_restart ;;
    logs)    cmd_logs ;;
    clean)   cmd_clean ;;
    reset)   cmd_reset ;;
    dev)     cmd_dev ;;
    help|*)  print_help ;;
esac
