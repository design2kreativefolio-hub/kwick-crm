"""
Django settings for the Kwick internal platform.

Tuned for OVH Cloud VPS-1 (2 vCores / 4 GB RAM). All secrets come from the
environment (see the root .env.example). ASGI-first: Channels is the entrypoint,
DRF+JWT for HTTP, Celery for background work.
"""
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# Load backend/.env if present, then the repo-root .env (docker-compose passes env directly).
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")


def env(key: str, default: str | None = None) -> str | None:
    return os.environ.get(key, default)


def env_bool(key: str, default: bool = False) -> bool:
    return str(os.environ.get(key, "1" if default else "0")).lower() in {"1", "true", "yes", "on"}


def env_list(key: str, default: str = "") -> list[str]:
    raw = os.environ.get(key, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = env("DJANGO_SECRET_KEY", "insecure-dev-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:3000")

AUTH_USER_MODEL = "accounts.User"

INSTALLED_APPS = [
    "daphne",  # must precede django.contrib.staticfiles so runserver uses ASGI
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    "channels",
    "django_celery_beat",
    # local apps
    "common",
    "accounts",
    "hr",
    "sales",
    "projects",
    "tasks",
    "daily_tracker",
    "calendar_app",
    "kanban",
    "messaging",
    "notifications",
    "renewals",
    "dashboard",
    "reports",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Database (Postgres; shared_buffers/max_connections tuned at the pg service)
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "kwick"),
        "USER": env("POSTGRES_USER", "kwick"),
        "PASSWORD": env("POSTGRES_PASSWORD", "kwick"),
        "HOST": env("POSTGRES_HOST", "127.0.0.1"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 60,  # persistent connections, kept modest for max_connections~50
    }
}

# ---------------------------------------------------------------------------
# Channels layer + cache (Redis, maxmemory 256MB / allkeys-lru)
# ---------------------------------------------------------------------------
REDIS_URL = env("REDIS_URL", "redis://127.0.0.1:6379/0")
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

# ---------------------------------------------------------------------------
# Celery
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = env("CELERY_BROKER_URL", "redis://127.0.0.1:6379/1")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/2")
CELERY_TIMEZONE = "UTC"
CELERY_TASK_TRACK_STARTED = True
CELERY_WORKER_CONCURRENCY = int(env("CELERY_WORKER_CONCURRENCY", "2"))
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

# ---------------------------------------------------------------------------
# DRF + JWT
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "common.pagination.DefaultPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(env("JWT_ACCESS_MINUTES", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(env("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Frontend base URL — used to build links embedded in emails (set-password, etc.)
# ---------------------------------------------------------------------------
FRONTEND_URL = env("FRONTEND_URL", "http://localhost:3000")
# Employee set-password links stay valid for 7 days (Django default is 3).
PASSWORD_RESET_TIMEOUT = 60 * 60 * 24 * 7

# ---------------------------------------------------------------------------
# Static / media / storage (OVH Object Storage, S3-compatible)
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "mediafiles"

S3_ENABLED = env_bool("S3_ENABLED", default=False)
if S3_ENABLED:
    # Generated PDFs / artwork files go to Object Storage, never local disk.
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "endpoint_url": env("S3_ENDPOINT_URL"),
            "region_name": env("S3_REGION"),
            "bucket_name": env("S3_BUCKET"),
            "access_key": env("S3_ACCESS_KEY"),
            "secret_key": env("S3_SECRET_KEY"),
            "file_overwrite": False,
            "default_acl": "private",
        },
    }

# ---------------------------------------------------------------------------
# Email (Celery-sent approval / account emails only)
# ---------------------------------------------------------------------------
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if env("EMAIL_HOST")
    else "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", default=True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "Kwick <no-reply@localhost>")

# ---------------------------------------------------------------------------
# Web push (VAPID)
# ---------------------------------------------------------------------------
VAPID_PUBLIC_KEY = env("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = env("VAPID_PRIVATE_KEY", "")
VAPID_ADMIN_EMAIL = env("VAPID_ADMIN_EMAIL", "mailto:admin@localhost")

# ---------------------------------------------------------------------------
# i18n / misc
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Business defaults (spec §19)
LEAVE_ANNUAL_ALLOWANCE_DEFAULT = 30
RENEWAL_LEAD_WINDOWS_DAYS = [30, 14, 7, 1]

# Security (only enforced when not DEBUG)
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
