#!/usr/bin/env bash
# Register a new user on the Todoist AI backend.
#
# Executed (not sourced):
#   ./scripts/register.sh [username] [password]
#
# Args fall back to env, then to interactive prompts:
#   TODO_API_URL  backend base URL (default http://localhost:8000)
#   TODO_USER / TODO_PASS, or positional args $1 / $2.
#
# Needs: curl, python3. Backend must be running.
# Next step: source scripts/set_token.sh to log in.

set -euo pipefail

TODO_API_URL="${TODO_API_URL:-http://localhost:8000}"
TODO_API_URL="${TODO_API_URL%/}"

TODO_USER_IN="${1:-${TODO_USER:-}}"
TODO_PASS_IN="${2:-${TODO_PASS:-}}"

if [ -z "$TODO_USER_IN" ]; then
    printf 'new username: '
    read -r TODO_USER_IN < /dev/tty
fi
if [ -z "$TODO_PASS_IN" ]; then
    printf 'new password: '
    stty -echo 2>/dev/null || true
    read -r TODO_PASS_IN < /dev/tty
    stty echo 2>/dev/null || true
    printf '\n'
fi

if [ -z "$TODO_USER_IN" ] || [ -z "$TODO_PASS_IN" ]; then
    echo "register: username and password are required" >&2
    exit 1
fi

PAYLOAD="$(python3 -c \
    'import json, sys; print(json.dumps({"username": sys.argv[1], "password": sys.argv[2]}))' \
    "$TODO_USER_IN" "$TODO_PASS_IN")"

RESPONSE="$(curl -sS -X POST "${TODO_API_URL}/auth/register" \
    -H 'Content-Type: application/json' \
    -d "$PAYLOAD")" || {
    echo "register: backend unreachable at ${TODO_API_URL} — is it running?" >&2
    exit 1
}

echo "$RESPONSE"
