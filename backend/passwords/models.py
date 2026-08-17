from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class VaultSettings(TimeStampedModel):
    """Singleton row — shared 4-digit vault PIN (hashed)."""

    pin_hash = models.CharField(max_length=128)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        verbose_name_plural = "Vault settings"

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if obj is None:
            raise cls.DoesNotExist("Vault settings are not initialized.")
        return obj


class PasswordEntry(TimeStampedModel):
    client = models.ForeignKey(
        "sales.Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="password_entries",
    )
    client_name = models.CharField(max_length=200, blank=True, default="")
    platform = models.CharField(max_length=120)
    username = models.CharField(max_length=200, blank=True, default="")
    password_encrypted = models.TextField(blank=True, default="")
    link = models.URLField(blank=True, default="", max_length=500)
    security_question = models.TextField(blank=True, default="")
    start_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    comment = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="password_entries_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="password_entries_updated",
    )

    class Meta:
        ordering = ["-updated_at"]
        verbose_name_plural = "Password entries"

    def display_client(self) -> str:
        if self.client_id and getattr(self, "client", None):
            return self.client.name
        return (self.client_name or "").strip()


class PasswordAccessLog(models.Model):
    class Action(models.TextChoices):
        UNLOCKED = "unlocked", "Unlocked vault"
        LISTED = "listed", "Viewed password list"
        REVEALED = "revealed", "Revealed password"
        CREATED = "created", "Created entry"
        UPDATED = "updated", "Updated entry"
        DELETED = "deleted", "Deleted entry"
        PIN_CHANGED = "pin_changed", "Changed vault PIN"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="password_access_logs",
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    entry = models.ForeignKey(
        PasswordEntry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="access_logs",
    )
    client_label = models.CharField(max_length=200, blank=True, default="")
    platform = models.CharField(max_length=120, blank=True, default="")
    detail = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        who = self.user.full_name if self.user_id and self.user else "Unknown"
        return f"{who}: {self.action}"
