#!/usr/bin/env bash
# Build (if needed) and run the map site in Docker.
# Usage: ./run.sh [--rebuild]      PORT=8088 by default.
# Ctrl+C (or terminating this script) stops the container.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE=mapinfo
CONTAINER=mapinfo
PORT="${PORT:-8088}"

if [[ "${1:-}" == "--rebuild" ]]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker build -t "$IMAGE" .
elif ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    docker build -t "$IMAGE" .
fi

published_port() {
    docker container inspect -f '{{(index (index .HostConfig.PortBindings "80/tcp") 0).HostPort}}' "$CONTAINER" 2>/dev/null
}

# Re-create the container if it uses another port or an outdated image.
if docker container inspect "$CONTAINER" >/dev/null 2>&1 && {
    [[ "$(published_port)" != "$PORT" ]] ||
    [[ "$(docker container inspect -f '{{.Image}}' "$CONTAINER")" != "$(docker image inspect -f '{{.Id}}' "$IMAGE")" ]]
}; then
    docker rm -f "$CONTAINER" >/dev/null
fi

if ! docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    docker create --name "$CONTAINER" -p "$PORT:80" "$IMAGE" >/dev/null
fi

stop() {
    trap - INT TERM EXIT
    echo
    echo "Stopping container $CONTAINER..."
    docker stop "$CONTAINER" >/dev/null 2>&1 || true
}
trap stop INT TERM EXIT

echo "Map is running at http://localhost:$PORT  (Ctrl+C to stop)"
# Run attached in the background and wait, so signal traps fire immediately.
docker start -a "$CONTAINER" &
wait $!
