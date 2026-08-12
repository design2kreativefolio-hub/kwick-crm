"""
EDITH — OPTIONAL, REMOVABLE MODULE
==================================

To REMOVE later:
  1. Delete backend/ai/
  2. Delete frontend/src/app/(app)/ai/
  3. Remove the "EDITH" nav item in frontend/src/lib/nav.ts
  4. Remove "ai" from INSTALLED_APPS in backend/config/settings.py
  5. Remove path("api/ai/", ...) from backend/config/urls.py
  6. Remove AI_* keys / celery purge task
  7. Rebuild

Chat history older than 15 days is deleted automatically.
"""

from django.apps import AppConfig


class AiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "ai"
    verbose_name = "EDITH (optional)"
