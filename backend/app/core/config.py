from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5443/tractiq"
    APP_NOW: str = "2026-11-11T15:00:00Z"
    APP_ENV: str = "development"
    AUTH_DEV_BYPASS: bool = False
    JWT_SECRET: str = "tractiq-dev-jwt-secret-key-min-32-chars-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SEED_FILE_PATH: str | None = None
    CORS_ORIGINS: str = "http://localhost:3003,http://127.0.0.1:3003"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
