from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # aiogram validates token *format* (digits:35-char-string) at Bot() construction
    # time even before any network call — this placeholder passes that format check
    # but is not a real bot and will be rejected by Telegram on first API call.
    # Real deployments must set BOT_TOKEN from @BotFather.
    bot_token: str = "000000000:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    internal_secret: str = "dev-internal-bot-secret"
    crm_api_url: str = "http://localhost:8000"
    listen_host: str = "0.0.0.0"
    listen_port: int = 8080


settings = Settings()
