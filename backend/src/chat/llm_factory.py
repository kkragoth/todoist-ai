"""Swappable chat-model factory. One function, one knob per provider.

Adding a 4th provider later means: one factory below + env defaults in
config.py + one registry entry. Nothing else changes — service.py and
router.py only ever call `make_llm(provider, model)`.
"""

from collections.abc import Callable

from langchain_core.language_models.chat_models import BaseChatModel

from . import config


def _make_llamacpp(model: str) -> BaseChatModel:
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        base_url=config.LLAMACPP_URL,
        api_key=config.LLAMACPP_API_KEY,
        model=model,
        temperature=0,
        streaming=True,
    )


def _make_openrouter(model: str) -> BaseChatModel:
    if not config.OPENROUTER_API_KEY:
        raise RuntimeError(
            "OpenRouter selected but OPENROUTER_API_KEY is not set."
        )
    from langchain_openai import ChatOpenAI

    headers: dict[str, str] = {}
    if config.OPENROUTER_SITE_URL:
        headers["HTTP-Referer"] = config.OPENROUTER_SITE_URL
    if config.OPENROUTER_APP_NAME:
        headers["X-Title"] = config.OPENROUTER_APP_NAME
    kwargs: dict = {
        "base_url": config.OPENROUTER_BASE_URL,
        "api_key": config.OPENROUTER_API_KEY,
        "model": model,
        "temperature": 0,
        "streaming": True,
    }
    if headers:
        kwargs["default_headers"] = headers
    return ChatOpenAI(**kwargs)


def _make_ollama(model: str) -> BaseChatModel:
    from langchain_ollama import ChatOllama

    kwargs: dict = {"model": model, "temperature": 0}
    if config.OLLAMA_BASE_URL:
        kwargs["base_url"] = config.OLLAMA_BASE_URL
    return ChatOllama(**kwargs)


PROVIDER_FACTORIES: dict[str, Callable[[str], BaseChatModel]] = {
    "llamacpp": _make_llamacpp,
    "openrouter": _make_openrouter,
    "ollama": _make_ollama,
}


def make_llm(provider: str | None = None, model: str | None = None):
    """Build the LangChain chat model for the effective provider.

    Raises ValueError for unknown providers, RuntimeError when the
    active provider is missing credentials (OpenRouter without API key).
    """
    active_provider, active_model = config.resolve_provider_and_model(
        provider, model
    )
    # Total: resolve_provider_and_model already rejects unknown providers,
    # and the registry covers every member of VALID_PROVIDERS.
    return PROVIDER_FACTORIES[active_provider](active_model)
