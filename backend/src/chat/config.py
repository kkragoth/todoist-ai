"""LLM provider settings. One env knob per provider, swappable per request.

Active provider/model resolution order:
  1. explicit per-request `provider` / `model` fields on POST /api/chat
  2. env defaults below

Supported providers: "ollama" | "llamacpp" | "openrouter".
Only the active provider's credentials are required — e.g. an ollama-only
deploy needs no OPENROUTER_API_KEY.
"""

import os

from dotenv import load_dotenv

load_dotenv()

VALID_PROVIDERS = ("ollama", "llamacpp", "openrouter")

# Which provider/model to use when the client doesn't specify one.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").lower()

# Ollama (default). OLLAMA_MODEL is the only knob to trial a bigger brain.
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:31b-cloud")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# llama.cpp server (OpenAI-compatible /v1). Model name is whatever was
# served with `llama serve -m <file.gguf>`; the server mostly ignores it
# but the client still has to send something.
LLAMACPP_URL = os.getenv("LLAMACPP_URL", "http://localhost:8080/v1")
LLAMACPP_MODEL = os.getenv("LLAMACPP_MODEL", "local-model")
LLAMACPP_API_KEY = os.getenv("LLAMACPP_API_KEY", "sk-no-key")

# OpenRouter (OpenAI-compatible). Paid inference: gated behind
# OPENROUTER_ENABLED (fail-closed default) AND OPENROUTER_API_KEY.
OPENROUTER_ENABLED = os.getenv("OPENROUTER_ENABLED", "false").lower() in (
    "1",
    "true",
    "yes",
)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemma-3-27b-it")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
# Optional attribution headers OpenRouter recommends (pass-through only).
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "")
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "todoist-ai")

# Loop guards.
RECURSION_LIMIT = int(os.getenv("CHAT_RECURSION_LIMIT", "25"))
HISTORY_LIMIT = int(os.getenv("CHAT_HISTORY_LIMIT", "30"))
TURN_TIMEOUT_SECONDS = float(os.getenv("CHAT_TURN_TIMEOUT_SECONDS", "180"))


def default_model_for(provider: str) -> str:
    if provider == "llamacpp":
        return LLAMACPP_MODEL
    if provider == "openrouter":
        return OPENROUTER_MODEL
    return OLLAMA_MODEL


def resolve_provider_and_model(
    provider: str | None, model: str | None
) -> tuple[str, str]:
    """Resolve effective (provider, model), validating the provider name."""
    p = (provider or LLM_PROVIDER).lower()
    if p not in VALID_PROVIDERS:
        raise ValueError(
            f"Unknown provider '{provider}'. Choose one of: {', '.join(VALID_PROVIDERS)}."
        )
    if p == "openrouter" and not OPENROUTER_ENABLED:
        raise ValueError(
            "OpenRouter provider is disabled (set OPENROUTER_ENABLED=true to enable)."
        )
    return p, model or default_model_for(p)
