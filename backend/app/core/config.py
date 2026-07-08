from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://aisolutioncrm:aisolutioncrm_dev_pw@localhost:5432/aisolutioncrm_dev"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    s3_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_bucket: str = "aisolutioncrm-files"
    s3_access_key: str = "dev-access-key"
    s3_secret_key: str = "dev-secret-key"
    s3_public_url_base: str | None = None

    # Internal bot integration (see PROGRESS.md > Decisions, phase 5).
    internal_bot_secret: str = "dev-internal-bot-secret"
    bot_push_url: str | None = None


settings = Settings()
