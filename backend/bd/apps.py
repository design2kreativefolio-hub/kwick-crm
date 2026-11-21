from django.apps import AppConfig


class BdConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "bd"
    verbose_name = "Business Development"

    def ready(self):
        from . import signals  # noqa: F401  (keeps lead scores fresh)
