"""Terminal auth helper for the Todoist AI backend (ported from todo-mcp-app)."""

import json
import os
from pathlib import Path

import requests

TOKEN_FILE = Path.home() / ".todoist-ai-cli" / "token.json"
API_BASE_URL = os.environ.get("TODO_API_URL", "http://localhost:8000")


def get_stored_token() -> str | None:
    """Read saved access token from disk."""
    if TOKEN_FILE.exists():
        try:
            data = json.loads(TOKEN_FILE.read_text())
            return data.get("access_token")
        except Exception:
            return None
    return None


def save_token(data: dict):
    """Save token dict to disk."""
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(json.dumps(data))


def register_user(username: str, password: str) -> dict:
    """Register a new user against backend API."""
    res = requests.post(
        f"{API_BASE_URL}/auth/register",
        json={"username": username, "password": password},
    )
    res.raise_for_status()
    return res.json()


def login_user(username: str, password: str) -> str:
    """Obtain access token via username/password."""
    res = requests.post(
        f"{API_BASE_URL}/auth/token",
        data={"username": username, "password": password},
    )
    if res.status_code != 200:
        raise ValueError(f"Login failed ({res.status_code}): {res.text}")

    data = res.json()
    token = data.get("access_token")
    if not token:
        raise ValueError("Backend response did not include 'access_token'")

    save_token(data)
    return token


def get_or_prompt_auth() -> str:
    """Return stored token or prompt terminal user for login/register."""
    token = get_stored_token()
    if token:
        return token

    print("\n🔐 Todoist AI Authentication Required")
    print("1. Login")
    print("2. Register new account")

    choice = input("Select option (1/2) [default: 1]: ").strip() or "1"
    username = input("Username: ").strip()
    password = input("Password: ").strip()

    if choice == "2":
        print("Registering new user...")
        register_user(username, password)
        print("✅ Registration successful. Logging in...")

    token = login_user(username, password)
    print("✅ Authenticated successfully!\n")
    return token
