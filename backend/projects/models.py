from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from common.models import TimeStampedModel


class Project(TimeStampedModel):
    class Status(models.TextChoices):
        ASSIGNED = "assigned", "Assigned"
        STARTED = "started", "Started"
        WAITING_APPROVAL = "waiting_approval", "Waiting for approval"
        COMPLETED = "completed", "Completed"

    name = models.CharField(max_length=200)
    client = models.ForeignKey(
        "sales.Client", on_delete=models.SET_NULL, null=True, blank=True, related_name="projects"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ASSIGNED)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    # Which staff are assigned (drives employee dashboard "ongoing projects", spec §15/§19).
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="projects"
    )

    def __str__(self):
        return self.name


class ProjectClient(TimeStampedModel):
    """Short client token used in artwork IDs (e.g. 'Nevo'). Distinct from sales.Client."""

    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class CategoryCode(TimeStampedModel):
    """Repurposed as the artwork ID's country code (e.g. 'UAE', 'IN') — field
    name kept as-is to avoid a data migration, only the meaning/label changed."""

    code = models.CharField(max_length=10, unique=True)
    label = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return self.code


class ArtworkType(TimeStampedModel):
    """e.g. 'Packaging_Design'."""

    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class ArtworkSequence(TimeStampedModel):
    """Per (year, category_code) running counter. Resets to 1 each calendar year (spec §7)."""

    year = models.PositiveIntegerField()
    category_code = models.CharField(max_length=10)
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("year", "category_code")

    @classmethod
    def next_number(cls, *, year: int, category_code: str) -> int:
        """Atomically increment and return the next sequence number (select_for_update)."""
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(
                year=year, category_code=category_code
            )
            seq.last_number += 1
            seq.save(update_fields=["last_number", "updated_at"])
            return seq.last_number


class Artwork(TimeStampedModel):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="artworks", null=True, blank=True
    )
    # Kept as data fields for record-keeping even though the current ID
    # format (see services.build_artwork_id) no longer embeds them.
    client = models.CharField(max_length=100, blank=True, default="")
    artwork_type = models.CharField(max_length=100, blank=True, default="")
    # brand: now "Product Name" in the UI. category_code: now "Country Code"
    # in the UI. Field names kept to avoid a data migration.
    brand = models.CharField(max_length=100)
    category_code = models.CharField(max_length=10)
    designer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="artworks"
    )
    artwork_id = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.artwork_id
