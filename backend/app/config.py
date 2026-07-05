"""
Application configuration loaded from environment variables.
Maps to the AppSettings model from the Prisma schema.
"""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://rebit:rebit@localhost:5432/rebit"

    # FastAPI
    debug: bool = False
    cors_origins: str = "http://localhost:3000"

    # Sia Storage
    sia_mode: str = "auto"  # "auto" | "demo"
    sia_key_path: str = "/tmp/sia/appkey.hex"
    sia_indexer_url: str = ""
    sia_app_id: str = ""
    sia_app_name: str = "ReBit"
    sia_app_description: str = "Decentralized Video Clipping Engine"

    # OpenRouter (LLM calls)
    openrouter_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Whisper model
    whisper_model: str = "base"
    whisper_device: str = "cpu"

    # File storage
    upload_dir: str = "/tmp/rebit/uploads"
    output_dir: str = "/tmp/rebit/output"

    # Pipeline
    max_upload_size_mb: int = 500

    model_config = {"env_prefix": "", "case_sensitive": False}

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