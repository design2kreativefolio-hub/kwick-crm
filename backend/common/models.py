from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    """Abstract base: every model gets UTC created_at / updated_at (spec §0)."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["-created_at"]


class ActivityLog(models.Model):
    """Manager-visible audit trail — who did what, when. Only covers actions
    that affect company/client/project data (task/project/client
    create+edit), not every read or login. Written synchronously via
    common.services.log_activity() from the relevant views."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="activity_logs"
    )
    action = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.action
