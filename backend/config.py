from pathlib import Path
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str
    supabase_anon_key: str
    supabase_access_token: str = ""   # management token (opzionale)
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    sendgrid_api_key: str = ""
    from_email: str = "noreply@nexus.app"
    from_name: str = "Nova CRM"

    smtp_host: str = "smtp-relay.brevo.com"
    smtp_port: int = 587
    smtp_email: str = ""
    smtp_password: str = ""

    app_env: str = "development"
    allowed_origins: str = "http://localhost:5500"
    portal_url: str = "https://crm.delocanova.com"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = str(_ENV_FILE)


settings = Settings()
