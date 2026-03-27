from supabase import create_client, Client
from config import settings
import logging

logger = logging.getLogger(__name__)

supabase: Client = None

if settings.supabase_url and settings.supabase_service_key:
    try:
        supabase = create_client(settings.supabase_url, settings.supabase_service_key)
        logger.info("Supabase client initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize Supabase client: %s", e)
else:
    logger.warning(
        "SUPABASE_URL or SUPABASE_SERVICE_KEY not set — "
        "database operations will fail until credentials are configured."
    )
