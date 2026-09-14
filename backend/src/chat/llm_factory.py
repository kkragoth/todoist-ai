"""Swappable chat-model factory. One function, one knob per provider.

Adding a 4th provider later means: one `elif` here + env defaults in
config.py. Nothing else changes — service.py and router.py only ever
call `make_llm(provider, model)`.
"""

from . import config


def make_llm(provider: str | None = None, model: str | None = None):
    """Build the LangChain chat model for the effective provider.

    Raises ValueError for unknown providers, RuntimeError when the
    active provider is missing credentials (OpenRouter without API key).
    """
    active_provider, active_model = config.resolve_provider_and_model(
        provider, model
    )

    if active_provider == "llamacpp":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            base_url=config.LLAMACPP_URL,
            api_key=config.LLAMACPP_API_KEY,
            model=active_model,
            temperature=0,
            streaming=True,
        )

    if active_provider == "openrouter":
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
            "model": active_model,
            "temperature": 0,
            "streaming": True,
        }
        if headers:
            kwargs["default_headers"] = headers
        try:
            return ChatOpenAI(**kwargs)
        except TypeError:
            # Older langchain-openai without `default_headers` support.
            kwargs.pop("default_headers", None)
            return ChatOpenAI(**kwargs)

    # Default: ollama.
    from langchain_ollama import ChatOllama

    kwargs = {"model": active_model, "temperature": 0}
    if config.OLLAMA_BASE_URL:
        kwargs["base_url"] = config.OLLAMA_BASE_URL
    return ChatOllama(**kwargs)
