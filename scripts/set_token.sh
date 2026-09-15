#!/usr/bin/env bash
# Log in to the Todoist AI backend and export TODOIST_AI_TOKEN for opencode.
#
# Must be SOURCED (not executed) so the export lands in your shell:
#   source scripts/set_token.sh [username] [password]
#
# Args fall back to env, then to interactive prompts:
#   TODO_API_URL  backend base URL (default http://localhost:8000)
#   TODO_USER / TODO_PASS, or positional args $1 / $2.
#
# Needs: curl, python3. Backend must be running (see backend README).

set -u

TODO_API_URL="${TODO_API_URL:-http://localhost:8000}"
TODO_API_URL="${TODO_API_URL%/}"

TODO_USER_IN="${1:-${TODO_USER:-}}"
TODO_PASS_IN="${2:-${TODO_PASS:-}}"

if [ -z "$TODO_USER_IN" ]; then
    printf 'todoist-ai username: '
    read -r TODO_USER_IN < /dev/tty
fi
if [ -z "$TODO_PASS_IN" ]; then
    printf 'todoist-ai password: '
    stty -echo 2>/dev/null || true
    read -r TODO_PASS_IN < /dev/tty
    stty echo 2>/dev/null || true
    printf '\n'
fi

if [ -z "$TODO_USER_IN" ] || [ -z "$TODO_PASS_IN" ]; then
    echo "set_token: username and password are required" >&2
    return 1 2>/dev/null || exit 1
fi

TOKEN_RESPONSE="$(curl -sS -X POST "${TODO_API_URL}/auth/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "username=${TODO_USER_IN}" \
    --data-urlencode "password=${TODO_PASS_IN}")" || {
    echo "set_token: backend unreachable at ${TODO_API_URL} — is it running?" >&2
    return 1 2>/dev/null || exit 1
}

TODOIST_AI_TOKEN="$(printf '%s' "$TOKEN_RESPONSE" | python3 -c \
    'import sys, json; print(json.load(sys.stdin).get("access_token", ""))' 2>/dev/null)"

if [ -z "$TODOIST_AI_TOKEN" ]; then
    echo "set_token: login failed — ${TOKEN_RESPONSE:0:200}" >&2
    return 1 2>/dev/null || exit 1
fi

export TODOIST_AI_TOKEN
echo "TODOIST_AI_TOKEN exported (${#TODOIST_AI_TOKEN} chars) for ${TODO_API_URL}"
echo "Launch opencode from this shell so it picks up {env:TODOIST_AI_TOKEN}."
