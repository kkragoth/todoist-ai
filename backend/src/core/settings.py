"""Single settings object for the backend (behavior-preserving).

Replaces the repeated `load_dotenv()` + `os.getenv` blocks in
`chat/config.py`, `core/database.py`, `todo/events.py`, and
`auth/utils/security.py`. Those modules keep their public names as a
thin facade over `get_settings()` and still freeze values at import
time — the only change is where the values come from.

`LlmProvider` is the closed provider set; `Settings.llm_provider`
stays a plain `str` on purpose so an invalid value still flows into
`chat/config.py::resolve_provider_and_model` and produces its exact
`ValueError` text per request (a strict enum field would instead crash
at startup with a different error).
"""

from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[2]


class LlmProvider(StrEnum):
    OLLAMA = "ollama"
    LLAMACPP = "llamacpp"
    OPENROUTER = "openrouter"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_BACKEND_DIR / ".env"), extra="ignore")

    # Chat provider selection.
    llm_provider: str = "ollama"

    # Ollama (default).
    ollama_model: str = "gemma4:31b-cloud"
    ollama_base_url: str = "http://localhost:11434"

    # llama.cpp server (OpenAI-compatible /v1).
    llamacpp_url: str = "http://localhost:8080/v1"
    llamacpp_model: str = "local-model"
    llamacpp_api_key: str = "sk-no-key"

    # OpenRouter (OpenAI-compatible, fail-closed).
    openrouter_enabled: bool = False
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemma-3-27b-it"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_site_url: str = ""
    openrouter_app_name: str = "todoist-ai"

    # Loop guards.
    chat_recursion_limit: int = 25
    chat_history_limit: int = 30
    chat_turn_timeout_seconds: float = 180

    # Database.
    database_url: str = "sqlite:///./todos.db"
    db_pool_size: int = 10
    db_max_overflow: int = 10
    db_pool_timeout_seconds: int = 30
    db_connect_timeout_seconds: int = 5

    # Pub/sub fan-out.
    redis_url: str = ""

    # Auth.
    secret_key: str = "SUPER_SECRET_KEY_CHANGE_IN_PRODUCTION"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    # Web.
    frontend_origins: str = "http://localhost:3000,http://localhost:5173"

    @field_validator("llm_provider", mode="before")
    @classmethod
    def _lower_provider(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.lower()
        return value

    @field_validator("openrouter_enabled", mode="before")
    @classmethod
    def _parse_enabled(cls, value: Any) -> Any:
        # Reproduce the historical `os.getenv(...) in ("1", "true", "yes")`
        # check exactly; pydantic's default bool parsing would also accept
        # e.g. "on"/"2", which would silently enable paid inference.
        if isinstance(value, str):
            return value.lower() in ("1", "true", "yes")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
