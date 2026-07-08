from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # aiogram validates token *format* at Bot() construction time even before any
    # network call — this placeholder passes that format check but is not a real
    # bot and will be rejected by Telegram on first API call. Real deployments
    # must set BOT_TOKEN (this service's is @aidatacollector_bot's, from @BotFather).
    bot_token: str = "000000000:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    crm_api_url: str = "http://localhost:8000"


settings = Settings()
