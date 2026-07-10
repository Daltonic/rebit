"""
Application configuration loaded from environment variables.
Maps to the AppSettings model from the Prisma schema.

All values are sourced from the `.env` file in the backend directory.
No secrets or environment-specific values are hardcoded.
"""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = ""

    # FastAPI
    debug: bool = False
    cors_origins: str = ""

    # Sia Storage
    sia_mode: str = "auto"  # "auto" | "demo"
    sia_key_path: str = ""

    # OpenRouter (LLM calls)
    openrouter_key: str = ""
    openrouter_base_url: str = ""

    # Whisper model
    whisper_model: str = ""
    whisper_device: str = ""

    # File storage
    upload_dir: str = ""
    output_dir: str = ""

    # Pipeline
    max_upload_size_mb: int = 0

    model_config = {
        "env_prefix": "",
        "case_sensitive": False,
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_demo_mode(self) -> bool:
        return self.sia_mode.lower() == "demo"

    @property
    def upload_path(self) -> Path:
        return Path(self.upload_dir)

    @property
    def output_path(self) -> Path:
        return Path(self.output_dir)


settings = Settings()