from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_anon_key: str = ""
    jwt_secret: str = "placeholder-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    sendgrid_api_key: str = ""
    from_email: str = "noreply@nexus.app"
    from_name: str = "Nexus CRM"

    app_env: str = "development"
    allowed_origins: str = "*"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
