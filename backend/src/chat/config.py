"""LLM provider settings. One env knob per provider, swappable per request.

Active provider/model resolution order:
  1. explicit per-request `provider` / `model` fields on POST /api/chat
  2. env defaults below

Supported providers: "ollama" | "llamacpp" | "openrouter".
Only the active provider's credentials are required — e.g. an ollama-only
deploy needs no OPENROUTER_API_KEY.

This module is a thin facade over `core.settings.get_settings()`; the
names below stay the single import site for tunables. Shared caps
(`MAX_SUGGESTIONS`, `MAX_SUGGESTION_CHARS`, `UI_DATA_MAX_ROWS`,
`HIGHLIGHT_MAX_IDS`) live in `protocol.py` — import them from there.
"""

from core.settings import LlmProvider, get_settings

_settings = get_settings()

VALID_PROVIDERS = tuple(p.value for p in LlmProvider)

# Which provider/model to use when the client doesn't specify one.
LLM_PROVIDER = _settings.llm_provider

# Ollama (default). OLLAMA_MODEL is the only knob to trial a bigger brain.
OLLAMA_MODEL = _settings.ollama_model
OLLAMA_BASE_URL = _settings.ollama_base_url

# llama.cpp server (OpenAI-compatible /v1). Model name is whatever was
# served with `llama serve -m <file.gguf>`; the server mostly ignores it
# but the client still has to send something.
LLAMACPP_URL = _settings.llamacpp_url
LLAMACPP_MODEL = _settings.llamacpp_model
LLAMACPP_API_KEY = _settings.llamacpp_api_key

# OpenRouter (OpenAI-compatible). Paid inference: gated behind
# OPENROUTER_ENABLED (fail-closed default) AND OPENROUTER_API_KEY.
OPENROUTER_ENABLED = _settings.openrouter_enabled
OPENROUTER_API_KEY = _settings.openrouter_api_key
OPENROUTER_MODEL = _settings.openrouter_model
OPENROUTER_BASE_URL = _settings.openrouter_base_url
# Optional attribution headers OpenRouter recommends (pass-through only).
OPENROUTER_SITE_URL = _settings.openrouter_site_url
OPENROUTER_APP_NAME = _settings.openrouter_app_name

# Loop guards.
RECURSION_LIMIT = _settings.chat_recursion_limit
HISTORY_LIMIT = _settings.chat_history_limit
TURN_TIMEOUT_SECONDS = _settings.chat_turn_timeout_seconds

# ask_user caps. Single source of truth for normalize_ask in service.py;
# AskUserArgs in tools.py mirrors these in its Field constraints.
MAX_ASK_OPTIONS = 4
MAX_QUESTION_CHARS = 300


def default_model_for(provider: str) -> str:
    if provider == LlmProvider.LLAMACPP.value:
        return LLAMACPP_MODEL
    if provider == LlmProvider.OPENROUTER.value:
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
    if p == LlmProvider.OPENROUTER.value and not OPENROUTER_ENABLED:
        raise ValueError(
            "OpenRouter provider is disabled (set OPENROUTER_ENABLED=true to enable)."
        )
    return p, model or default_model_for(p)
